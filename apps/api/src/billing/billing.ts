import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { env } from '../config/env.js';
import { NotificationsService } from '../notifications/notifications.js';
import { AuditService } from '../audit/audit.service.js';
import { PlanLimitsService } from '../plans/plans.js';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import type { Prisma, Subscription, SubscriptionPlan } from '../generated/prisma/client.js';
import { addPeriod, buildQuote, isFreePlan, promoProblem, type Period, type Quote } from './pricing.js';
import {
  billingConfig,
  createCheckout,
  enabledProviders,
  fetchMercadoPagoPayment,
  mercadoPagoOutcome,
  normalizeStripeEvent,
  PROVIDER_NAME,
  ProviderError,
  verifyMercadoPagoSignature,
  verifyStripeSignature,
  type BillingEvent,
  type ProviderCode,
} from './providers.js';

const trimUpper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const PERIODS = ['MONTHLY', 'YEARLY'] as const;
const PERIOD_LABEL: Record<Period, string> = { MONTHLY: 'mensual', YEARLY: 'anual' };
const LIFECYCLE_SCAN_MS = 10 * 60_000;
const CHECKOUT_TTL_MS = 24 * 3600_000;
const NOTICE_DAYS = 7;
const TRIAL_NOTICE_DAYS = 3;
const DAY = 864e5;

// ============================================================================ DTOs

export class QuoteDto {
  @ApiProperty({ example: 'PRO' }) @Transform(trimUpper) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,29}$/) planCode!: string;
  @ApiProperty({ enum: PERIODS }) @IsIn(PERIODS) billingPeriod!: Period;
  @ApiPropertyOptional() @IsOptional() @Transform(trimUpper) @IsString() @Matches(/^[A-Z0-9_-]{3,40}$/, { message: 'Código promocional no válido' }) promoCode?: string;
}

export class CheckoutDto extends QuoteDto {
  @ApiPropertyOptional({ enum: ['STRIPE', 'MERCADOPAGO', 'SANDBOX'] }) @IsOptional() @IsIn(['STRIPE', 'MERCADOPAGO', 'SANDBOX']) provider?: ProviderCode;
  @ApiProperty({ description: 'Clave de idempotencia generada por el cliente: repetir la petición no crea otro cobro' })
  @IsString()
  @Matches(/^[A-Za-z0-9-]{16,64}$/)
  idempotencyKey!: string;
}

export class TrialDto {
  @ApiProperty({ example: 'PRO' }) @Transform(trimUpper) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,29}$/) planCode!: string;
}

export class CancelDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) reason?: string;
}

export class SandboxOutcomeDto {
  @ApiProperty({ enum: ['SUCCEEDED', 'FAILED'] }) @IsIn(['SUCCEEDED', 'FAILED']) outcome!: 'SUCCEEDED' | 'FAILED';
}

export class PaymentListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 20) status?: string;
}

/** Error permanente de un webhook: se registra y se responde 200 para que el proveedor no reintente. */
class IgnoredEvent extends Error {}

type SubWithPlan = Subscription & { plan: SubscriptionPlan & { features?: unknown[] }; pendingPlan?: SubscriptionPlan | null };

// ============================================================================ Servicio

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly limits: PlanLimitsService,
  ) {}

  onModuleInit() {
    if (env.isTest) return;
    this.timer = setInterval(() => void this.runLifecycle().catch((e) => this.logger.error(e)), LIFECYCLE_SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // -------------------------------------------------------------------------- utilidades

  private async organizerOf(userId: string) {
    const organizer = await this.prisma.organizerProfile.findUnique({
      where: { userId },
      select: { id: true, displayName: true, userId: true, user: { select: { email: true } } },
    });
    if (!organizer) throw new NotFoundException('No tienes un perfil de organizador');
    return organizer;
  }

  private currentSub(organizerId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    return db.subscription.findFirst({
      where: { organizerId, isCurrent: true },
      include: { plan: true, pendingPlan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Serializa las operaciones de facturación de un organizador (checkout, webhooks y ciclo de vida). */
  private lock(tx: Prisma.TransactionClient, organizerId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'billing:' + organizerId}))`;
  }

  private async freePlan(db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const free = await db.subscriptionPlan.findUnique({ where: { code: 'FREE' } });
    if (!free) throw new NotFoundException('El plan FREE no está configurado');
    return free;
  }

  private async paidForPeriod(sub: Subscription, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const last = await db.subscriptionPayment.findFirst({
      where: { subscriptionId: sub.id, status: 'SUCCEEDED', planId: sub.planId, periodStart: sub.currentPeriodStart },
      orderBy: { paidAt: 'desc' },
      select: { amount: true },
    });
    return last ? Number(last.amount) : 0;
  }

  private async promoFor(code: string | undefined, planCode: string, now: Date, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (!code) return null;
    const promo = await db.promotionalCode.findUnique({ where: { code } });
    const problem = promoProblem(promo, planCode, now);
    if (problem) throw new BadRequestException(problem);
    return promo;
  }

  private async quoteFor(organizerId: string, dto: QuoteDto, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const now = new Date();
    const target = await db.subscriptionPlan.findUnique({ where: { code: dto.planCode } });
    if (!target || target.status !== 'ACTIVE') throw new NotFoundException('El plan no existe o no está disponible');
    const sub = await this.currentSub(organizerId, db);
    if (!sub) throw new NotFoundException('No tienes una suscripción vigente');
    const promo = await this.promoFor(dto.promoCode, target.code, now, db);
    const quote = buildQuote({
      current: sub,
      target,
      period: dto.billingPeriod,
      now,
      promo,
      paidForCurrentPeriod: await this.paidForPeriod(sub, db),
    });
    return { quote, sub, target, promo };
  }

  private presentQuote(q: Quote, sub: SubWithPlan) {
    const messages: Record<Quote['change'], string> = {
      CURRENT: 'Ya tienes este plan con este periodo de facturación.',
      IMMEDIATE:
        q.kind === 'RENEWAL'
          ? 'Renuevas tu plan y se regulariza el pago pendiente.'
          : q.creditAmount > 0
            ? 'El cambio es inmediato y se descuenta el saldo no usado de tu periodo actual.'
            : 'El cambio es inmediato al confirmarse el pago.',
      SCHEDULED: 'El cambio se aplicará al final de tu periodo pagado; hasta entonces conservas tu plan actual.',
      TO_FREE: 'Tu plan de pago seguirá activo hasta el final del periodo pagado y luego pasarás a Free.',
    };
    return { ...q, currentPlan: { code: sub.plan.code, name: sub.plan.name }, message: messages[q.change] };
  }

  private notifyOwner(userId: string, type: string, title: string, body: string, data?: Prisma.InputJsonValue) {
    return this.notifications.notify({ userId, type, title, body, link: '/dashboard/suscripcion', data }).catch((e) => this.logger.error(e));
  }

  // -------------------------------------------------------------------------- organizador

  async summary(userId: string) {
    const organizer = await this.organizerOf(userId);
    const base = await this.limits.usageSummary(organizer.id);
    const sub = await this.currentSub(organizer.id);
    const [hadTrial, pending] = await Promise.all([
      this.prisma.subscriptionHistory.count({ where: { subscription: { organizerId: organizer.id }, toStatus: 'TRIAL' } }),
      this.prisma.subscriptionPayment.findFirst({
        where: { subscription: { organizerId: organizer.id }, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, amount: true, currency: true, provider: true, checkoutUrl: true, createdAt: true, kind: true, billingPeriod: true, plan: { select: { code: true, name: true } } },
      }),
    ]);
    return {
      ...base,
      subscription: sub && {
        ...base.subscription,
        plan: { code: sub.plan.code, name: sub.plan.name, priceMonthly: sub.plan.priceMonthly, priceYearly: sub.plan.priceYearly, currency: sub.plan.currency },
        currentPeriodStart: sub.currentPeriodStart,
        graceUntil: sub.graceUntil,
        provider: sub.provider,
        isFree: isFreePlan(sub.plan),
        pendingPlan: sub.pendingPlan && { code: sub.pendingPlan.code, name: sub.pendingPlan.name },
        pendingBillingPeriod: sub.pendingBillingPeriod,
      },
      trialAvailable: hadTrial === 0 && !!sub && isFreePlan(sub.plan) && sub.status === 'ACTIVE',
      pendingPayment: pending,
      providers: enabledProviders().map((code) => ({ code, name: PROVIDER_NAME[code] })),
    };
  }

  async quote(userId: string, dto: QuoteDto) {
    const organizer = await this.organizerOf(userId);
    const { quote, sub } = await this.quoteFor(organizer.id, dto);
    return this.presentQuote(quote, sub);
  }

  async checkout(user: AuthUser, dto: CheckoutDto) {
    const organizer = await this.organizerOf(user.id);
    const idempotencyKey = `${organizer.id}:${dto.idempotencyKey}`;
    const existing = await this.prisma.subscriptionPayment.findUnique({ where: { idempotencyKey } });
    if (existing) return this.checkoutResult(existing);

    const providers = enabledProviders();
    const provider = dto.provider ?? providers[0];

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizer.id);
      const again = await tx.subscriptionPayment.findUnique({ where: { idempotencyKey } });
      if (again) return { payment: again, quote: null, scheduled: null };
      const { quote, sub, target, promo } = await this.quoteFor(organizer.id, dto, tx);

      if (quote.change === 'CURRENT') throw new ConflictException('Ya tienes este plan con este periodo de facturación');

      if (quote.change === 'TO_FREE' || quote.change === 'SCHEDULED') {
        const toFree = quote.change === 'TO_FREE';
        await tx.subscriptionPayment.updateMany({
          where: { subscription: { organizerId: organizer.id }, status: 'PENDING' },
          data: { status: 'CANCELLED', failureReason: toFree ? 'Suscripción cancelada' : 'Reemplazado por un cambio de plan programado' },
        });
        await tx.subscription.update({
          where: { id: sub.id },
          data: toFree
            ? { cancelAtPeriodEnd: true, pendingPlanId: null, pendingBillingPeriod: null }
            : { pendingPlanId: target.id, pendingBillingPeriod: dto.billingPeriod, cancelAtPeriodEnd: false },
        });
        await tx.subscriptionHistory.create({
          data: {
            subscriptionId: sub.id,
            fromPlanId: sub.planId,
            toPlanId: sub.planId,
            fromStatus: sub.status,
            toStatus: sub.status,
            changedById: user.id,
            reason: toFree
              ? 'Cancelación programada al final del periodo (pasa a Free)'
              : `Cambio programado a ${target.name} ${PERIOD_LABEL[dto.billingPeriod]} al final del periodo`,
          },
        });
        await this.audit.log(
          { actorId: user.id, action: 'SUBSCRIPTION_CHANGE_SCHEDULED', entityType: 'Subscription', entityId: sub.id, after: { plan: target.code, period: dto.billingPeriod } },
          tx,
        );
        return { payment: null, quote, scheduled: sub };
      }

      // Cambio inmediato: un único pago pendiente por organizador
      if (quote.amount > 0 && (!provider || !providers.includes(provider))) {
        throw new ServiceUnavailableException('No hay un medio de pago disponible en este momento. Inténtalo más tarde.');
      }
      await tx.subscriptionPayment.updateMany({
        where: { subscription: { organizerId: organizer.id }, status: 'PENDING' },
        data: { status: 'CANCELLED', failureReason: 'Reemplazado por un nuevo intento de pago' },
      });
      const payment = await tx.subscriptionPayment.create({
        data: {
          subscriptionId: sub.id,
          planId: target.id,
          billingPeriod: dto.billingPeriod,
          kind: quote.kind,
          listAmount: quote.listAmount,
          discountAmount: quote.discountAmount,
          creditAmount: quote.creditAmount,
          amount: quote.amount,
          currency: quote.currency,
          provider: quote.amount > 0 ? provider! : 'MANUAL',
          promoCodeId: promo?.id,
          createdById: user.id,
          idempotencyKey,
        },
      });
      return { payment, quote, scheduled: null };
    });

    if (result.scheduled) {
      return { result: 'SCHEDULED' as const, quote: this.presentQuote(result.quote!, result.scheduled) };
    }
    const payment = result.payment!;
    if (!result.quote) return this.checkoutResult(payment);

    // Importe cero (cupón del 100 % o crédito suficiente): se aplica sin pasar por un proveedor
    if (Number(payment.amount) === 0) {
      await this.applySuccess(payment.id, { providerPaymentId: `manual:${payment.id}` });
      return { result: 'PAID' as const, paymentId: payment.id };
    }

    try {
      const plan = result.quote.plan;
      const { url, providerRef } = await createCheckout(payment.provider as ProviderCode, {
        paymentId: payment.id,
        idempotencyKey: payment.idempotencyKey,
        amount: Number(payment.amount),
        currency: payment.currency,
        description: `Arena ${plan.name} · plan ${PERIOD_LABEL[payment.billingPeriod as Period]}`,
        customerEmail: organizer.user.email,
      });
      const updated = await this.prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { checkoutUrl: url, ...(providerRef && payment.provider !== 'SANDBOX' ? { failureReason: null } : {}) },
      });
      return this.checkoutResult(updated);
    } catch (e) {
      const reason = e instanceof ProviderError ? e.message : 'No se pudo contactar al proveedor de pagos';
      await this.prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: reason.slice(0, 300) } });
      this.logger.error(`Checkout ${payment.provider} falló: ${(e as Error).message}`);
      throw new BadGatewayException('No se pudo iniciar el pago con el proveedor. Inténtalo nuevamente.');
    }
  }

  private checkoutResult(p: { id: string; status: string; checkoutUrl: string | null }) {
    if (p.status === 'SUCCEEDED') return { result: 'PAID' as const, paymentId: p.id };
    if (p.status === 'PENDING' && p.checkoutUrl) return { result: 'CHECKOUT' as const, paymentId: p.id, checkoutUrl: p.checkoutUrl };
    throw new ConflictException('Este intento de pago ya no está disponible. Vuelve a elegir el plan.');
  }

  async startTrial(user: AuthUser, dto: TrialDto) {
    const organizer = await this.organizerOf(user.id);
    const now = new Date();
    const sub = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizer.id);
      const plan = await tx.subscriptionPlan.findUnique({ where: { code: dto.planCode } });
      if (!plan || plan.status !== 'ACTIVE' || isFreePlan(plan) || plan.trialDays <= 0) {
        throw new BadRequestException('Este plan no ofrece periodo de prueba');
      }
      const current = await this.currentSub(organizer.id, tx);
      if (!current || !isFreePlan(current.plan) || current.status !== 'ACTIVE') {
        throw new ConflictException('La prueba gratuita solo está disponible desde el plan Free');
      }
      const hadTrial = await tx.subscriptionHistory.count({ where: { subscription: { organizerId: organizer.id }, toStatus: 'TRIAL' } });
      if (hadTrial) throw new ConflictException('Ya usaste tu periodo de prueba');
      const trialEndsAt = new Date(now.getTime() + plan.trialDays * DAY);
      const updated = await tx.subscription.update({
        where: { id: current.id },
        data: {
          planId: plan.id,
          status: 'TRIAL',
          billingPeriod: 'MONTHLY',
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
          trialEndsAt,
          expiryNoticeAt: null,
          cancelAtPeriodEnd: false,
        },
      });
      await tx.subscriptionHistory.create({
        data: { subscriptionId: current.id, fromPlanId: current.planId, toPlanId: plan.id, fromStatus: current.status, toStatus: 'TRIAL', changedById: user.id, reason: `Prueba gratuita de ${plan.trialDays} días` },
      });
      await this.audit.log({ actorId: user.id, action: 'SUBSCRIPTION_TRIAL_STARTED', entityType: 'Subscription', entityId: current.id, after: { plan: plan.code, trialEndsAt } }, tx);
      return updated;
    });
    return { ok: true, trialEndsAt: sub.trialEndsAt };
  }

  async cancel(user: AuthUser, dto: CancelDto) {
    const organizer = await this.organizerOf(user.id);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizer.id);
      const sub = await this.currentSub(organizer.id, tx);
      if (!sub || isFreePlan(sub.plan)) throw new BadRequestException('Tu plan Free no requiere cancelación');
      const reason = dto.reason ? `Cancelada por el organizador: ${dto.reason}` : 'Cancelada por el organizador';
      // Prueba o pago vencido: no hay periodo pagado que respetar, se pasa a Free de inmediato
      if (sub.status === 'TRIAL' || sub.status === 'PAST_DUE') {
        await this.closeToFree(tx, sub, 'CANCELLED', reason, user.id);
        return 'NOW' as const;
      }
      if (sub.cancelAtPeriodEnd) throw new ConflictException('La cancelación ya está programada');
      await tx.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true, pendingPlanId: null, pendingBillingPeriod: null } });
      await tx.subscriptionPayment.updateMany({ where: { subscriptionId: sub.id, status: 'PENDING' }, data: { status: 'CANCELLED', failureReason: 'Suscripción cancelada' } });
      await tx.subscriptionHistory.create({
        data: { subscriptionId: sub.id, fromPlanId: sub.planId, toPlanId: sub.planId, fromStatus: sub.status, toStatus: sub.status, changedById: user.id, reason: `${reason} (al final del periodo)` },
      });
      await this.audit.log({ actorId: user.id, action: 'SUBSCRIPTION_CANCEL_SCHEDULED', entityType: 'Subscription', entityId: sub.id, reason: dto.reason }, tx);
      return 'AT_PERIOD_END' as const;
    });
    return { ok: true, effective: outcome };
  }

  /** Deshace una cancelación o un cambio de plan programados. */
  async resume(user: AuthUser) {
    const organizer = await this.organizerOf(user.id);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizer.id);
      const sub = await this.currentSub(organizer.id, tx);
      if (!sub || (!sub.cancelAtPeriodEnd && !sub.pendingPlanId)) throw new ConflictException('No hay cambios programados');
      await tx.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false, pendingPlanId: null, pendingBillingPeriod: null } });
      await tx.subscriptionHistory.create({
        data: { subscriptionId: sub.id, fromPlanId: sub.planId, toPlanId: sub.planId, fromStatus: sub.status, toStatus: sub.status, changedById: user.id, reason: sub.cancelAtPeriodEnd ? 'Cancelación revertida' : 'Cambio de plan programado revertido' },
      });
      await this.audit.log({ actorId: user.id, action: 'SUBSCRIPTION_RESUMED', entityType: 'Subscription', entityId: sub.id }, tx);
    });
    return { ok: true };
  }

  async payments(userId: string, q: PaymentListQuery) {
    const organizer = await this.organizerOf(userId);
    return this.prisma.subscriptionPayment.findMany({
      where: { subscription: { organizerId: organizer.id }, ...(q.status ? { status: q.status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: paymentSelect,
    });
  }

  async payment(userId: string, id: string) {
    const organizer = await this.organizerOf(userId);
    const p = await this.prisma.subscriptionPayment.findFirst({ where: { id, subscription: { organizerId: organizer.id } }, select: paymentSelect });
    if (!p) throw new NotFoundException('Pago no encontrado');
    return { ...p, sandboxAvailable: p.provider === 'SANDBOX' && p.status === 'PENDING' && billingConfig().sandbox };
  }

  async history(userId: string) {
    const organizer = await this.organizerOf(userId);
    return this.prisma.subscriptionHistory.findMany({
      where: { subscription: { organizerId: organizer.id } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        reason: true,
        createdAt: true,
        fromPlan: { select: { code: true, name: true } },
        toPlan: { select: { code: true, name: true } },
        changedBy: { select: { username: true, role: true } },
      },
    });
  }

  async invoice(user: AuthUser, id: string) {
    const inv = await this.prisma.subscriptionInvoice.findUnique({
      where: { id },
      include: {
        payment: { select: { ...paymentSelect } },
        subscription: {
          select: {
            organizer: { select: { id: true, userId: true, displayName: true, country: true, city: true, user: { select: { email: true } } } },
          },
        },
      },
    });
    if (!inv || (inv.subscription.organizer.userId !== user.id && user.role !== 'SUPERADMIN')) throw new NotFoundException('Comprobante no encontrado');
    return inv;
  }

  /** Completa un pago de prueba (solo proveedor SANDBOX y fuera de producción salvo que se habilite). */
  async completeSandbox(userId: string, id: string, dto: SandboxOutcomeDto) {
    if (!billingConfig().sandbox) throw new ForbiddenException('El pago de prueba no está habilitado');
    const organizer = await this.organizerOf(userId);
    const p = await this.prisma.subscriptionPayment.findFirst({ where: { id, subscription: { organizerId: organizer.id } } });
    if (!p || p.provider !== 'SANDBOX') throw new NotFoundException('Pago no encontrado');
    if (p.status !== 'PENDING') throw new ConflictException('Este pago ya fue procesado');
    await this.processEvent({
      provider: 'SANDBOX',
      eventId: `sandbox:${p.id}:${dto.outcome}`,
      type: `sandbox.payment.${dto.outcome.toLowerCase()}`,
      paymentId: p.id,
      outcome: dto.outcome,
      amount: Number(p.amount),
      currency: p.currency,
      providerPaymentId: `sandbox_${p.id}`,
      failureReason: dto.outcome === 'FAILED' ? 'Pago de prueba rechazado' : undefined,
      payload: { simulated: true },
    });
    return this.payment(userId, id);
  }

  // -------------------------------------------------------------------------- webhooks

  async stripeWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const c = billingConfig();
    if (!c.stripeWebhookSecret) throw new ServiceUnavailableException('Stripe no está configurado');
    const raw = rawBody?.toString('utf8') ?? '';
    if (!verifyStripeSignature(raw, signature, c.stripeWebhookSecret)) throw new UnauthorizedException('Firma de Stripe no válida');
    let event: Parameters<typeof normalizeStripeEvent>[0];
    try {
      event = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Evento no válido');
    }
    if (!event?.id || !event.type) throw new BadRequestException('Evento no válido');
    return this.processEvent(normalizeStripeEvent(event));
  }

  async mercadoPagoWebhook(query: Record<string, unknown>, body: Record<string, unknown> | undefined, headers: { signature?: string; requestId?: string }) {
    const c = billingConfig();
    if (!c.mercadoPagoWebhookSecret || !c.mercadoPagoToken) throw new ServiceUnavailableException('Mercado Pago no está configurado');
    const data = (body?.data ?? {}) as { id?: unknown };
    const dataId = String(query['data.id'] ?? data.id ?? '');
    const type = String(query.type ?? body?.type ?? '');
    if (!verifyMercadoPagoSignature({ dataId, requestId: headers.requestId, signature: headers.signature }, c.mercadoPagoWebhookSecret)) {
      throw new UnauthorizedException('Firma de Mercado Pago no válida');
    }
    if (type !== 'payment' || !/^\d{1,30}$/.test(dataId)) return { ok: true, ignored: true };
    // La notificación solo trae el id: el estado, el importe y la referencia se leen de la API
    const mp = await fetchMercadoPagoPayment(dataId);
    const outcome = mercadoPagoOutcome(mp.status);
    return this.processEvent({
      provider: 'MERCADOPAGO',
      eventId: `${mp.id}:${mp.status}`,
      type: `payment.${mp.status}`,
      paymentId: mp.external_reference ?? null,
      outcome,
      amount: mp.transaction_amount,
      currency: mp.currency_id,
      providerPaymentId: String(mp.id),
      failureReason: outcome === 'FAILED' ? `Pago rechazado (${mp.status_detail ?? 'sin detalle'})` : undefined,
      payload: mp,
    });
  }

  /** Procesa un evento una sola vez (idempotencia por proveedor + id de evento). */
  async processEvent(e: BillingEvent) {
    const payload = JSON.parse(JSON.stringify(e.payload ?? {})) as Prisma.InputJsonValue;
    let row = await this.prisma.paymentWebhookEvent.findUnique({ where: { provider_eventId: { provider: e.provider, eventId: e.eventId } } });
    if (row?.processedAt) return { ok: true, duplicate: true };
    if (!row) {
      try {
        row = await this.prisma.paymentWebhookEvent.create({ data: { provider: e.provider, eventId: e.eventId, type: e.type, payload } });
      } catch {
        // Entrega concurrente del mismo evento
        return { ok: true, duplicate: true };
      }
    }
    try {
      await this.applyEvent(e);
      await this.prisma.paymentWebhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date(), error: null } });
      return { ok: true };
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      if (err instanceof IgnoredEvent) {
        await this.prisma.paymentWebhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date(), error: message } });
        this.logger.warn(`Evento ${e.provider} ${e.eventId} ignorado: ${message}`);
        return { ok: true, ignored: true, reason: message };
      }
      await this.prisma.paymentWebhookEvent.update({ where: { id: row.id }, data: { error: message } });
      throw err;
    }
  }

  private async applyEvent(e: BillingEvent) {
    if (!e.outcome) throw new IgnoredEvent(`Tipo de evento sin efecto: ${e.type}`);
    if (!e.paymentId || !/^[0-9a-f-]{36}$/i.test(e.paymentId)) throw new IgnoredEvent('El evento no identifica un pago de Arena');
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id: e.paymentId },
      include: { subscription: { select: { organizer: { select: { userId: true } } } } },
    });
    if (!payment) throw new IgnoredEvent('Pago no encontrado');
    if (payment.provider !== e.provider) throw new IgnoredEvent('El proveedor del evento no coincide con el del pago');

    if (e.outcome === 'SUCCEEDED') {
      if (e.amount !== undefined && Math.abs(e.amount - Number(payment.amount)) > 0.009) {
        throw new IgnoredEvent(`Importe recibido ${e.amount} distinto del esperado ${payment.amount}`);
      }
      if (e.currency && e.currency.toUpperCase() !== payment.currency) throw new IgnoredEvent('La moneda del pago no coincide');
      await this.applySuccess(payment.id, { providerPaymentId: e.providerPaymentId });
      return;
    }

    const status = e.outcome === 'FAILED' ? 'FAILED' : 'CANCELLED';
    const { count } = await this.prisma.subscriptionPayment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status, failureReason: e.failureReason ?? (status === 'FAILED' ? 'Pago rechazado' : 'Pago cancelado') },
    });
    if (count && status === 'FAILED') {
      await this.notifyOwner(
        payment.subscription.organizer.userId,
        'PAYMENT_FAILED',
        'No se pudo procesar tu pago',
        'El proveedor rechazó el pago de tu suscripción. Puedes intentarlo nuevamente desde «Mi suscripción».',
        { paymentId: payment.id },
      );
    }
  }

  /** Confirma un pago y actualiza la suscripción del organizador. Idempotente. */
  async applySuccess(paymentId: string, opts: { providerPaymentId?: string }) {
    const now = new Date();
    const done = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.subscriptionPayment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { plan: true, subscription: { select: { organizerId: true, organizer: { select: { userId: true } } } } },
      });
      const organizerId = payment.subscription.organizerId;
      await this.lock(tx, organizerId);
      const { count } = await tx.subscriptionPayment.updateMany({
        where: { id: paymentId, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } },
        data: { status: 'SUCCEEDED', paidAt: now, providerPaymentId: opts.providerPaymentId ?? null, failureReason: null },
      });
      if (!count) return null; // ya procesado

      // Se aplica sobre la suscripción vigente (pudo cambiar desde que se inició el pago)
      const sub = (await this.currentSub(organizerId, tx)) ?? (await tx.subscription.findUniqueOrThrow({ where: { id: payment.subscriptionId }, include: { plan: true, pendingPlan: true } }));
      const period = payment.billingPeriod as Period;
      const renewal = payment.kind === 'RENEWAL' && sub.planId === payment.planId && sub.billingPeriod === period && sub.currentPeriodEnd;
      const start = renewal && sub.status === 'PAST_DUE' ? sub.currentPeriodEnd! : renewal && sub.currentPeriodEnd! > now ? sub.currentPeriodEnd! : now;
      const end = addPeriod(start, period);

      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          planId: payment.planId,
          billingPeriod: period,
          status: 'ACTIVE',
          isCurrent: true,
          ...(isFreePlan(sub.plan) || sub.status === 'TRIAL' ? { startedAt: now } : {}),
          currentPeriodStart: start,
          currentPeriodEnd: end,
          trialEndsAt: null,
          graceUntil: null,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          pendingPlanId: null,
          pendingBillingPeriod: null,
          expiryNoticeAt: null,
          provider: payment.provider,
          promoCodeId: payment.promoCodeId ?? sub.promoCodeId,
        },
      });
      await tx.subscriptionPayment.update({ where: { id: paymentId }, data: { subscriptionId: sub.id, periodStart: start, periodEnd: end } });
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: sub.id,
          fromPlanId: sub.planId,
          toPlanId: payment.planId,
          fromStatus: sub.status,
          toStatus: 'ACTIVE',
          changedById: null,
          reason: `Pago confirmado (${PROVIDER_NAME[payment.provider] ?? payment.provider}): ${payment.plan.name} ${PERIOD_LABEL[period]}`,
        },
      });
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('subscription_invoice_number_seq') AS n`;
      await tx.subscriptionInvoice.create({
        data: {
          subscriptionId: sub.id,
          paymentId,
          number: `ARN-${now.getUTCFullYear()}-${String(n).padStart(6, '0')}`,
          amount: payment.amount,
          currency: payment.currency,
          issuedAt: now,
        },
      });
      if (payment.promoCodeId) {
        await tx.promotionalCode.update({ where: { id: payment.promoCodeId }, data: { redemptions: { increment: 1 } } });
      }
      await this.audit.log(
        {
          actorId: null,
          action: 'SUBSCRIPTION_PAYMENT_SUCCEEDED',
          entityType: 'Subscription',
          entityId: sub.id,
          before: { plan: sub.plan.code, status: sub.status },
          after: { plan: payment.plan.code, period, amount: payment.amount, provider: payment.provider, periodEnd: end },
        },
        tx,
      );
      return { userId: payment.subscription.organizer.userId, plan: payment.plan.name, end, amount: Number(payment.amount), currency: payment.currency };
    });
    if (done) {
      await this.notifyOwner(
        done.userId,
        'PAYMENT_SUCCEEDED',
        `Plan ${done.plan} activo`,
        done.amount > 0 ? `Recibimos tu pago. Tu plan ${done.plan} está activo hasta el ${done.end.toISOString().slice(0, 10)}.` : `Tu plan ${done.plan} está activo hasta el ${done.end.toISOString().slice(0, 10)}.`,
      );
    }
    return done;
  }

  // -------------------------------------------------------------------------- ciclo de vida

  /** Cierra la suscripción de pago y abre una FREE vigente (el historial queda en la fila cerrada). */
  private async closeToFree(tx: Prisma.TransactionClient, sub: SubWithPlan, status: 'CANCELLED' | 'EXPIRED', reason: string, actorId: string | null) {
    const now = new Date();
    const free = await this.freePlan(tx);
    await tx.subscription.update({
      where: { id: sub.id },
      data: { isCurrent: false, status, cancelledAt: now, cancelAtPeriodEnd: false, pendingPlanId: null, pendingBillingPeriod: null, graceUntil: null },
    });
    await tx.subscriptionPayment.updateMany({ where: { subscriptionId: sub.id, status: 'PENDING' }, data: { status: 'CANCELLED', failureReason: 'La suscripción terminó' } });
    await tx.subscriptionHistory.create({
      data: { subscriptionId: sub.id, fromPlanId: sub.planId, toPlanId: sub.planId, fromStatus: sub.status, toStatus: status, changedById: actorId, reason },
    });
    const next = await tx.subscription.create({
      data: { organizerId: sub.organizerId, planId: free.id, status: 'ACTIVE', billingPeriod: 'MONTHLY', currentPeriodStart: now, currentPeriodEnd: null, provider: 'MANUAL' },
    });
    await tx.subscriptionHistory.create({
      data: { subscriptionId: next.id, fromPlanId: sub.planId, toPlanId: free.id, fromStatus: status, toStatus: 'ACTIVE', changedById: actorId, reason: 'Pasa al plan Free' },
    });
    await this.audit.log({ actorId, action: `SUBSCRIPTION_${status}`, entityType: 'Subscription', entityId: sub.id, before: { plan: sub.plan.code, status: sub.status }, reason }, tx);
    return next;
  }

  /**
   * Revisión periódica: avisos de vencimiento, fin de periodo (cancelación, cambio programado,
   * fin de la prueba o paso a pago pendiente con gracia) y vencimiento tras la gracia.
   */
  async runLifecycle(now = new Date()) {
    const stats = { checkoutsExpired: 0, notices: 0, ended: 0, pastDue: 0, expired: 0 };

    const stale = await this.prisma.subscriptionPayment.updateMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - CHECKOUT_TTL_MS) } },
      data: { status: 'CANCELLED', failureReason: 'El pago no se completó dentro de 24 horas' },
    });
    stats.checkoutsExpired = stale.count;

    // Avisos de vencimiento (uno por periodo)
    const upcoming = await this.prisma.subscription.findMany({
      where: {
        isCurrent: true,
        expiryNoticeAt: null,
        OR: [
          { status: 'ACTIVE', currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + NOTICE_DAYS * DAY) } },
          { status: 'TRIAL', currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + TRIAL_NOTICE_DAYS * DAY) } },
        ],
      },
      include: { plan: true, pendingPlan: true, organizer: { select: { userId: true } } },
    });
    for (const s of upcoming) {
      const { count } = await this.prisma.subscription.updateMany({ where: { id: s.id, expiryNoticeAt: null }, data: { expiryNoticeAt: now } });
      if (!count) continue;
      const date = s.currentPeriodEnd!.toISOString().slice(0, 10);
      const [title, body] =
        s.status === 'TRIAL'
          ? [`Tu prueba de ${s.plan.name} termina pronto`, `La prueba termina el ${date}. Contrata el plan para conservar sus funcionalidades; si no, pasarás a Free.`]
          : s.cancelAtPeriodEnd
            ? [`Tu plan ${s.plan.name} termina el ${date}`, 'Cancelaste la suscripción: después de esa fecha pasarás a Free. Puedes revertirlo desde «Mi suscripción».']
            : s.pendingPlan
              ? [`Tu cambio a ${s.pendingPlan.name} se aplica el ${date}`, `Ese día tu plan pasará a ${s.pendingPlan.name} y deberás pagar el nuevo periodo.`]
              : [`Tu plan ${s.plan.name} vence el ${date}`, 'Renueva tu suscripción para no perder las funcionalidades de tu plan.'];
      await this.notifyOwner(s.organizer.userId, 'SUBSCRIPTION_EXPIRING', title, body, { subscriptionId: s.id });
      stats.notices++;
    }

    // Fin del periodo pagado o de la prueba
    const ended = await this.prisma.subscription.findMany({
      where: { isCurrent: true, status: { in: ['ACTIVE', 'TRIAL'] }, currentPeriodEnd: { lte: now } },
      select: { id: true, organizerId: true },
    });
    for (const { id, organizerId } of ended) {
      const r = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, organizerId);
        const s = await tx.subscription.findUnique({ where: { id }, include: { plan: true, pendingPlan: true, organizer: { select: { userId: true } } } });
        if (!s || !s.isCurrent || !['ACTIVE', 'TRIAL'].includes(s.status) || !s.currentPeriodEnd || s.currentPeriodEnd > now) return null;
        if (isFreePlan(s.plan)) {
          await tx.subscription.update({ where: { id }, data: { currentPeriodEnd: null } });
          return null;
        }
        if (s.status === 'TRIAL') {
          await this.closeToFree(tx, s, 'EXPIRED', 'Terminó la prueba gratuita sin contratar el plan', null);
          return { userId: s.organizer.userId, type: 'SUBSCRIPTION_EXPIRED', title: `Terminó tu prueba de ${s.plan.name}`, body: 'Ahora estás en el plan Free. Puedes contratar un plan cuando quieras.' };
        }
        if (s.cancelAtPeriodEnd || (s.pendingPlan && isFreePlan(s.pendingPlan))) {
          await this.closeToFree(tx, s, 'CANCELLED', 'Fin del periodo pagado tras la cancelación', null);
          return { userId: s.organizer.userId, type: 'SUBSCRIPTION_CANCELLED', title: `Tu plan ${s.plan.name} terminó`, body: 'La cancelación se hizo efectiva y ahora estás en el plan Free.' };
        }
        let plan = s.plan;
        let period = s.billingPeriod;
        if (s.pendingPlan) {
          plan = s.pendingPlan;
          period = s.pendingBillingPeriod ?? s.billingPeriod;
          await tx.subscriptionHistory.create({
            data: { subscriptionId: id, fromPlanId: s.planId, toPlanId: plan.id, fromStatus: s.status, toStatus: 'PAST_DUE', reason: `Se aplica el cambio programado a ${plan.name} ${PERIOD_LABEL[period]}` },
          });
        } else {
          await tx.subscriptionHistory.create({
            data: { subscriptionId: id, fromPlanId: s.planId, toPlanId: s.planId, fromStatus: s.status, toStatus: 'PAST_DUE', reason: `Fin del periodo: pago de renovación pendiente (${plan.graceDays} días de gracia)` },
          });
        }
        const graceUntil = new Date(s.currentPeriodEnd.getTime() + plan.graceDays * DAY);
        await tx.subscription.update({
          where: { id },
          data: { planId: plan.id, billingPeriod: period, status: 'PAST_DUE', graceUntil, pendingPlanId: null, pendingBillingPeriod: null },
        });
        return {
          userId: s.organizer.userId,
          type: 'SUBSCRIPTION_PAYMENT_DUE',
          title: `Renueva tu plan ${plan.name}`,
          body: `Tu periodo terminó. Tienes hasta el ${graceUntil.toISOString().slice(0, 10)} para pagar la renovación antes de pasar a Free.`,
          pastDue: true,
        };
      });
      if (r) {
        if ('pastDue' in r) stats.pastDue++;
        else stats.ended++;
        await this.notifyOwner(r.userId, r.type, r.title, r.body);
      }
    }

    // Vencimiento tras el periodo de gracia
    const overdue = await this.prisma.subscription.findMany({
      where: { isCurrent: true, status: 'PAST_DUE', graceUntil: { lte: now } },
      select: { id: true, organizerId: true },
    });
    for (const { id, organizerId } of overdue) {
      const r = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, organizerId);
        const s = await tx.subscription.findUnique({ where: { id }, include: { plan: true, pendingPlan: true, organizer: { select: { userId: true } } } });
        if (!s || !s.isCurrent || s.status !== 'PAST_DUE' || !s.graceUntil || s.graceUntil > now) return null;
        await this.closeToFree(tx, s, 'EXPIRED', 'Venció el periodo de gracia sin pago', null);
        return { userId: s.organizer.userId, plan: s.plan.name };
      });
      if (r) {
        stats.expired++;
        await this.notifyOwner(r.userId, 'SUBSCRIPTION_EXPIRED', `Tu plan ${r.plan} venció`, 'No recibimos el pago de la renovación y ahora estás en el plan Free. Puedes volver a contratarlo cuando quieras.');
      }
    }
    return stats;
  }
}

export const paymentSelect = {
  id: true,
  status: true,
  kind: true,
  provider: true,
  billingPeriod: true,
  listAmount: true,
  discountAmount: true,
  creditAmount: true,
  amount: true,
  currency: true,
  periodStart: true,
  periodEnd: true,
  paidAt: true,
  failureReason: true,
  checkoutUrl: true,
  createdAt: true,
  plan: { select: { code: true, name: true } },
  promoCode: { select: { code: true } },
  invoice: { select: { id: true, number: true } },
} satisfies Prisma.SubscriptionPaymentSelect;

// ============================================================================ Controladores

@ApiTags('Planes y suscripción')
@ApiBearerAuth()
@Roles('ORGANIZER')
@Controller('me/subscription')
export class SubscriptionController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  summary(@CurrentUser() user: AuthUser) {
    return this.billing.summary(user.id);
  }

  @Post('quote')
  @HttpCode(200)
  quote(@CurrentUser() user: AuthUser, @Body() dto: QuoteDto) {
    return this.billing.quote(user.id, dto);
  }

  @Post('checkout')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.billing.checkout(user, dto);
  }

  @Post('trial')
  @HttpCode(200)
  trial(@CurrentUser() user: AuthUser, @Body() dto: TrialDto) {
    return this.billing.startTrial(user, dto);
  }

  @Post('cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Body() dto: CancelDto) {
    return this.billing.cancel(user, dto);
  }

  @Post('resume')
  @HttpCode(200)
  resume(@CurrentUser() user: AuthUser) {
    return this.billing.resume(user);
  }

  @Get('payments')
  payments(@CurrentUser() user: AuthUser, @Query() q: PaymentListQuery) {
    return this.billing.payments(user.id, q);
  }

  @Get('payments/:id')
  payment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.payment(user.id, id);
  }

  @Post('payments/:id/sandbox')
  @HttpCode(200)
  sandbox(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SandboxOutcomeDto) {
    return this.billing.completeSandbox(user.id, id, dto);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.billing.history(user.id);
  }

  @Get('invoices/:id')
  invoice(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.invoice(user, id);
  }
}

/** Notificaciones de los proveedores: públicas, sin límite de peticiones y validadas por firma. */
@ApiTags('Planes y suscripción')
@Public()
@SkipThrottle()
@Controller('billing/webhooks')
export class BillingWebhooksController {
  constructor(private readonly billing: BillingService) {}

  @Post('stripe')
  @HttpCode(200)
  stripe(@Req() req: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    return this.billing.stripeWebhook(req.rawBody, signature);
  }

  @Post('mercadopago')
  @HttpCode(200)
  mercadoPago(
    @Req() req: Request,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.billing.mercadoPagoWebhook(req.query as Record<string, unknown>, req.body as Record<string, unknown>, { signature, requestId });
  }
}
