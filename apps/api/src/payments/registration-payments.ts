import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { env } from '../config/env.js';
import { NotificationsService } from '../notifications/notifications.js';
import { AuditService } from '../audit/audit.service.js';
import { PlanLimitsService } from '../plans/plans.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import { assertCanManageOrganizer, requireOwnOrganizer } from '../common/utils/access.js';
import { ProviderError, verifyMercadoPagoSignature } from '../billing/providers.js';
import { Prisma } from '../generated/prisma/client.js';
import type { OrganizerPaymentAccount, RegistrationPayment, Tournament } from '../generated/prisma/client.js';
import {
  authorizeUrl,
  createPreference,
  decryptSecret,
  encryptSecret,
  exchangeCode,
  getPayment,
  marketplaceConfig,
  matchesPayment,
  platformFee,
  refreshTokens,
  refundPayment,
  registrationOutcome,
  signOAuthState,
  verifyOAuthState,
  type PaymentOutcome,
} from './marketplace.js';

const EXPIRY_SCAN_MS = 60_000;
const REFRESH_BEFORE_MS = 7 * 86_400_000;
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

// ------------------------------------------------------------------------------------------- DTO

export class ConnectAccountDto {
  @ApiProperty() @IsString() @Length(4, 512) code: string;
  @ApiProperty() @IsString() @Length(10, 1024) state: string;
}

export class RefundDto {
  @ApiProperty({ description: 'Motivo (queda en la auditoría y se informa al jugador)' })
  @IsString()
  @Length(5, 300)
  reason: string;
}

export class SandboxPaymentDto {
  @ApiProperty() @IsBoolean() approve: boolean;
}

export class PaymentListQuery {
  @ApiPropertyOptional({ enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED'])
  status?: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

// ------------------------------------------------------------------------------------------- servicio

const paymentSelect = {
  id: true,
  status: true,
  provider: true,
  amount: true,
  currency: true,
  feePercent: true,
  platformFee: true,
  checkoutUrl: true,
  expiresAt: true,
  paidAt: true,
  refundedAt: true,
  refundReason: true,
  failureReason: true,
  providerPaymentId: true,
  createdAt: true,
  payerId: true,
  tournament: { select: { id: true, name: true, slug: true, status: true, organizerId: true } },
  registration: {
    select: {
      id: true,
      status: true,
      team: { select: { name: true, slug: true } },
      player: { select: { nickname: true } },
    },
  },
  payer: { select: { username: true } },
} satisfies Prisma.RegistrationPaymentSelect;

type PaymentView = Prisma.RegistrationPaymentGetPayload<{ select: typeof paymentSelect }>;

@Injectable()
export class RegistrationPaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RegistrationPaymentsService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly limits: PlanLimitsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit() {
    if (env.isTest) return;
    this.timer = setInterval(() => void this.expirePending().catch((e) => this.logger.error(e)), EXPIRY_SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------------------ cuenta de cobro

  private presentAccount(a: OrganizerPaymentAccount | null) {
    return (
      a && {
        id: a.id,
        provider: a.provider,
        status: a.status,
        externalUserId: a.provider === 'SANDBOX' ? null : a.externalUserId,
        liveMode: a.liveMode,
        connectedAt: a.connectedAt,
        tokenExpiresAt: a.tokenExpiresAt,
        lastError: a.lastError,
      }
    );
  }

  /** Cuenta activa y utilizable para cobrar (según la configuración actual de la plataforma). */
  private usable(a: OrganizerPaymentAccount | null): a is OrganizerPaymentAccount {
    const c = marketplaceConfig();
    return !!a && a.status === 'CONNECTED' && ((a.provider === 'MERCADOPAGO' && c.enabled) || (a.provider === 'SANDBOX' && c.sandbox));
  }

  async account(user: AuthUser) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    const c = marketplaceConfig();
    const [account, { plan }] = await Promise.all([
      this.prisma.organizerPaymentAccount.findUnique({ where: { organizerId: organizer.id } }),
      this.limits.effectivePlan(organizer.id),
    ]);
    return {
      account: this.presentAccount(account),
      canCollect: this.usable(account),
      providers: { mercadopago: c.enabled, sandbox: c.sandbox },
      feePercent: Number(plan.registrationFeePercent),
      plan: plan.name,
      holdMinutes: c.holdMinutes,
    };
  }

  async authorize(user: AuthUser) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    if (!marketplaceConfig().enabled) throw new BadRequestException('El cobro con Mercado Pago no está configurado en esta plataforma');
    return { url: authorizeUrl(signOAuthState(organizer.id, user.id)) };
  }

  async connect(user: AuthUser, dto: ConnectAccountDto) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    if (!marketplaceConfig().enabled) throw new BadRequestException('El cobro con Mercado Pago no está configurado en esta plataforma');
    const state = verifyOAuthState(dto.state);
    if (!state || state.organizerId !== organizer.id || state.userId !== user.id) {
      throw new BadRequestException('La autorización venció o no corresponde a tu cuenta. Vuelve a conectar Mercado Pago.');
    }
    let tokens;
    try {
      tokens = await exchangeCode(dto.code);
    } catch (e) {
      if (e instanceof ProviderError) throw new BadRequestException(`Mercado Pago rechazó la autorización. ${e.message}`);
      throw e;
    }
    const data = {
      provider: 'MERCADOPAGO' as const,
      status: 'CONNECTED' as const,
      externalUserId: String(tokens.user_id),
      publicKey: tokens.public_key ?? null,
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      liveMode: tokens.live_mode ?? false,
      lastError: null,
      connectedById: user.id,
      connectedAt: new Date(),
    };
    const account = await this.prisma.organizerPaymentAccount.upsert({
      where: { organizerId: organizer.id },
      create: { organizerId: organizer.id, ...data },
      update: data,
    });
    await this.audit.log({
      actorId: user.id,
      action: 'PAYMENT_ACCOUNT_CONNECTED',
      entityType: 'OrganizerPaymentAccount',
      entityId: account.id,
      after: { provider: 'MERCADOPAGO', externalUserId: data.externalUserId, liveMode: data.liveMode },
    });
    return this.presentAccount(account);
  }

  /** Cuenta de prueba (sin dinero real), solo con BILLING_SANDBOX. */
  async connectSandbox(user: AuthUser) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    if (!marketplaceConfig().sandbox) throw new BadRequestException('La cuenta de prueba no está disponible en este ambiente');
    const data = {
      provider: 'SANDBOX' as const,
      status: 'CONNECTED' as const,
      externalUserId: `sandbox-${organizer.id}`,
      publicKey: null,
      accessTokenEnc: encryptSecret('sandbox'),
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      liveMode: false,
      lastError: null,
      connectedById: user.id,
      connectedAt: new Date(),
    };
    const account = await this.prisma.organizerPaymentAccount.upsert({
      where: { organizerId: organizer.id },
      create: { organizerId: organizer.id, ...data },
      update: data,
    });
    await this.audit.log({ actorId: user.id, action: 'PAYMENT_ACCOUNT_CONNECTED', entityType: 'OrganizerPaymentAccount', entityId: account.id, after: { provider: 'SANDBOX' } });
    return this.presentAccount(account);
  }

  async disconnect(user: AuthUser) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    const account = await this.prisma.organizerPaymentAccount.findUnique({ where: { organizerId: organizer.id } });
    if (!account || account.status === 'DISCONNECTED') return this.presentAccount(account);
    const updated = await this.prisma.organizerPaymentAccount.update({
      where: { id: account.id },
      data: { status: 'DISCONNECTED', accessTokenEnc: encryptSecret(''), refreshTokenEnc: null, tokenExpiresAt: null },
    });
    // Las partidas dejan de cobrar en línea: sus cuotas vuelven a ser informativas
    await this.prisma.tournament.updateMany({ where: { organizerId: organizer.id, collectOnline: true }, data: { collectOnline: false } });
    await this.audit.log({ actorId: user.id, action: 'PAYMENT_ACCOUNT_DISCONNECTED', entityType: 'OrganizerPaymentAccount', entityId: account.id });
    return this.presentAccount(updated);
  }

  /** Usado al crear o editar una partida que cobra en línea. */
  async assertCanCollect(organizerId: string) {
    const account = await this.prisma.organizerPaymentAccount.findUnique({ where: { organizerId } });
    if (!this.usable(account)) {
      throw new BadRequestException('Conecta tu cuenta de Mercado Pago en «Cobros» para cobrar las inscripciones en línea');
    }
  }

  /** Token del vendedor; se renueva si vence en menos de 7 días. */
  private async sellerToken(account: OrganizerPaymentAccount) {
    if (account.provider === 'SANDBOX') return 'sandbox';
    if (account.status !== 'CONNECTED') throw new BadRequestException('El organizador debe volver a conectar su cuenta de Mercado Pago');
    if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < REFRESH_BEFORE_MS && account.refreshTokenEnc) {
      try {
        const t = await refreshTokens(decryptSecret(account.refreshTokenEnc));
        await this.prisma.organizerPaymentAccount.update({
          where: { id: account.id },
          data: {
            accessTokenEnc: encryptSecret(t.access_token),
            refreshTokenEnc: t.refresh_token ? encryptSecret(t.refresh_token) : account.refreshTokenEnc,
            tokenExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
            lastError: null,
          },
        });
        return t.access_token;
      } catch (e) {
        if (account.tokenExpiresAt.getTime() < Date.now()) {
          await this.markReconnect(account, e);
          throw new BadRequestException('La conexión con Mercado Pago del organizador venció');
        }
        this.logger.warn(`No se pudo renovar el token de ${account.organizerId}: ${(e as Error).message}`);
      }
    }
    return decryptSecret(account.accessTokenEnc);
  }

  private async markReconnect(account: OrganizerPaymentAccount, e: unknown) {
    await this.prisma.organizerPaymentAccount.update({
      where: { id: account.id },
      data: { status: 'NEEDS_RECONNECT', lastError: String((e as Error)?.message ?? e).slice(0, 300) },
    });
    const organizer = await this.prisma.organizerProfile.findUnique({ where: { id: account.organizerId }, select: { userId: true } });
    if (organizer) {
      await this.notifications.notify({
        userId: organizer.userId,
        type: 'PAYMENT_ACCOUNT_RECONNECT',
        title: 'Vuelve a conectar Mercado Pago',
        body: 'La conexión con tu cuenta de Mercado Pago venció o fue revocada. Mientras tanto no se pueden cobrar inscripciones en línea.',
        link: '/dashboard/cobros',
      });
    }
  }

  // ------------------------------------------------------------------------ inscripción con pago

  /**
   * Reserva el cupo (inscripción PAYMENT_PENDING) y abre el checkout en la cuenta del organizador.
   * Repetir la solicitud mientras el pago sigue vigente devuelve el mismo enlace.
   */
  async registerWithPayment(
    user: AuthUser,
    t: Tournament & { organizer: { userId: string } },
    target: { teamId: string | null; playerId: string | null; notes?: string },
  ) {
    const c = marketplaceConfig();
    const account = await this.prisma.organizerPaymentAccount.findUnique({ where: { organizerId: t.organizerId } });
    if (!this.usable(account)) {
      throw new BadRequestException('El organizador todavía no tiene activo el cobro en línea. Inténtalo más tarde o contáctalo.');
    }
    const { plan } = await this.limits.effectivePlan(t.organizerId);
    const amount = Number(t.entryFee);
    const feePercent = Number(plan.registrationFeePercent);
    const fee = platformFee(amount, feePercent);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + c.holdMinutes * 60_000);
    const who = target.teamId ? { teamId: target.teamId } : { playerId: target.playerId };

    const { registration, payment, resumed } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`registration:${t.id}`}))`;
        const existing = await tx.tournamentRegistration.findFirst({
          where: { tournamentId: t.id, ...who },
          include: { payments: { where: { status: 'PENDING' }, take: 1 } },
        });
        const open = existing?.payments[0];
        if (existing?.status === 'PAYMENT_PENDING' && open && open.expiresAt > now && open.checkoutUrl) {
          return { registration: existing, payment: open, resumed: true };
        }
        if (existing && !['WITHDRAWN', 'REJECTED', 'PAYMENT_PENDING'].includes(existing.status)) {
          throw new ConflictException('Ya existe una solicitud de inscripción para esta partida');
        }
        if (existing) {
          await tx.registrationPayment.updateMany({
            where: { registrationId: existing.id, status: 'PENDING' },
            data: { status: 'CANCELLED', failureReason: 'Reemplazado por un nuevo intento de pago' },
          });
        }
        const taken = await tx.tournamentRegistration.count({
          where: { tournamentId: t.id, status: { in: ['APPROVED', 'PAYMENT_PENDING'] }, ...(existing ? { id: { not: existing.id } } : {}) },
        });
        if (taken >= t.maxParticipants) throw new BadRequestException('No quedan cupos disponibles');
        const data = {
          status: 'PAYMENT_PENDING' as const,
          requestedById: user.id,
          notes: target.notes,
          feeAmount: t.entryFee,
          feeCurrency: t.currency,
        };
        const registration = existing
          ? await tx.tournamentRegistration.update({ where: { id: existing.id }, data })
          : await tx.tournamentRegistration.create({ data: { ...data, tournamentId: t.id, ...who } });
        const payment = await tx.registrationPayment.create({
          data: {
            registrationId: registration.id,
            tournamentId: t.id,
            organizerId: t.organizerId,
            accountId: account.id,
            payerId: user.id,
            provider: account.provider,
            amount,
            currency: t.currency,
            feePercent,
            platformFee: fee,
            idempotencyKey: randomUUID(),
            expiresAt,
          },
        });
        return { registration, payment, resumed: false };
      },
      { timeout: 15_000 },
    );
    if (resumed) return { ...registration, payment: { id: payment.id, checkoutUrl: payment.checkoutUrl, expiresAt: payment.expiresAt } };

    try {
      let checkoutUrl: string;
      let providerPreferenceId: string | null = null;
      if (account.provider === 'SANDBOX') {
        checkoutUrl = `${c.publicWebUrl}/inscripciones/pago/${payment.id}`;
      } else {
        const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
        const pref = await createPreference(await this.sellerToken(account), {
          paymentId: payment.id,
          title: `Inscripción: ${t.name}`,
          tournamentId: t.id,
          amount,
          currency: t.currency,
          fee,
          expiresAt,
          payerEmail: me?.email,
        });
        checkoutUrl = pref.init_point;
        providerPreferenceId = pref.id;
      }
      const saved = await this.prisma.registrationPayment.update({ where: { id: payment.id }, data: { checkoutUrl, providerPreferenceId } });
      await this.audit.log({
        actorId: user.id,
        action: 'REGISTRATION_PAYMENT_STARTED',
        entityType: 'RegistrationPayment',
        entityId: payment.id,
        after: { registrationId: registration.id, amount, currency: t.currency, platformFee: fee, provider: account.provider },
      });
      this.realtime.emitToTournament(t.id, 'registration:changed', { tournamentId: t.id });
      return { ...registration, payment: { id: saved.id, checkoutUrl: saved.checkoutUrl, expiresAt: saved.expiresAt } };
    } catch (e) {
      await this.prisma.$transaction([
        this.prisma.registrationPayment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: String((e as Error).message).slice(0, 300) } }),
        this.prisma.tournamentRegistration.update({ where: { id: registration.id }, data: { status: 'WITHDRAWN' } }),
      ]);
      if (e instanceof ProviderError) {
        if ((e as ProviderError & { status?: number }).status === 401) await this.markReconnect(account, e);
        throw new BadRequestException('No se pudo iniciar el pago con Mercado Pago. Inténtalo de nuevo en unos minutos.');
      }
      throw e;
    }
  }

  /** Anula los pagos pendientes de una inscripción (retiro, rechazo o aprobación manual del organizador). */
  async cancelPending(registrationId: string, reason: string) {
    await this.prisma.registrationPayment.updateMany({ where: { registrationId, status: 'PENDING' }, data: { status: 'CANCELLED', failureReason: reason } });
  }

  /** Reembolsa el pago confirmado de una inscripción (si existe). Devuelve true si había algo que reembolsar. */
  async refundForRegistration(registrationId: string, reason: string, actorId: string | null) {
    const paid = await this.prisma.registrationPayment.findFirst({ where: { registrationId, status: 'SUCCEEDED' } });
    if (!paid) return false;
    await this.executeRefund(paid, reason, actorId);
    return true;
  }

  private async executeRefund(p: RegistrationPayment, reason: string, actorId: string | null) {
    if (p.provider === 'MERCADOPAGO') {
      const account = p.accountId ? await this.prisma.organizerPaymentAccount.findUnique({ where: { id: p.accountId } }) : null;
      if (!account || !p.providerPaymentId) throw new BadRequestException('No se encontró el pago en Mercado Pago para reembolsarlo');
      try {
        await refundPayment(await this.sellerToken(account), p.providerPaymentId, `refund-${p.id}`);
      } catch (e) {
        if (e instanceof ProviderError) throw new BadRequestException(`Mercado Pago no permitió el reembolso. ${e.message}`);
        throw e;
      }
    }
    await this.apply(p.id, 'REFUNDED', { reason });
    await this.audit.log({ actorId, action: 'REGISTRATION_PAYMENT_REFUNDED', entityType: 'RegistrationPayment', entityId: p.id, reason });
  }

  // ------------------------------------------------------------------------ resultado del pago

  /**
   * Aplica el resultado de un pago con candado por partida. Un pago confirmado aprueba la inscripción;
   * si llegó tarde y ya no hay cupo, se reembolsa automáticamente.
   */
  async apply(paymentId: string, outcome: PaymentOutcome, extra: { providerPaymentId?: string; reason?: string } = {}) {
    if (!outcome) return 'ignored';
    const result = await this.prisma.$transaction(
      async (tx) => {
        const p = await tx.registrationPayment.findUnique({ where: { id: paymentId }, include: { registration: true, tournament: true } });
        if (!p) return { action: 'missing' as const };
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`registration:${p.tournamentId}`}))`;
        const reg = p.registration;

        if (outcome === 'FAILED') {
          // El jugador puede reintentar con otro medio mientras la reserva siga vigente
          if (p.status !== 'PENDING') return { action: 'noop' as const };
          await tx.registrationPayment.update({ where: { id: p.id }, data: { failureReason: extra.reason ?? 'Pago rechazado' } });
          return { action: 'failed' as const, p };
        }

        if (outcome === 'REFUNDED') {
          if (p.status === 'REFUNDED') return { action: 'noop' as const };
          await tx.registrationPayment.update({
            where: { id: p.id },
            data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: extra.reason ?? 'Reembolsado en Mercado Pago' },
          });
          const withdraw = p.tournament.status === 'OPEN' && ['APPROVED', 'PAYMENT_PENDING'].includes(reg.status);
          if (withdraw) await tx.tournamentRegistration.update({ where: { id: reg.id }, data: { status: 'WITHDRAWN' } });
          return { action: 'refunded' as const, p, withdraw };
        }

        // SUCCEEDED
        if (p.status === 'SUCCEEDED' || p.status === 'REFUNDED') return { action: 'noop' as const };
        let approve = p.status === 'PENDING' && reg.status === 'PAYMENT_PENDING';
        if (!approve) {
          // Pago tardío (la reserva venció o se canceló): se aprueba solo si todavía hay cupo
          const other = await tx.registrationPayment.count({ where: { registrationId: reg.id, status: 'SUCCEEDED' } });
          const taken = await tx.tournamentRegistration.count({
            where: { tournamentId: p.tournamentId, status: { in: ['APPROVED', 'PAYMENT_PENDING'] }, id: { not: reg.id } },
          });
          approve =
            other === 0 &&
            p.tournament.status === 'OPEN' &&
            ['PAYMENT_PENDING', 'WITHDRAWN'].includes(reg.status) &&
            taken < p.tournament.maxParticipants;
        }
        await tx.registrationPayment.update({
          where: { id: p.id },
          data: { status: 'SUCCEEDED', paidAt: new Date(), providerPaymentId: extra.providerPaymentId ?? p.providerPaymentId, failureReason: null },
        });
        if (approve) {
          await tx.tournamentRegistration.update({ where: { id: reg.id }, data: { status: 'APPROVED' } });
          await tx.registrationPayment.updateMany({
            where: { registrationId: reg.id, status: 'PENDING', id: { not: p.id } },
            data: { status: 'CANCELLED', failureReason: 'Otro pago de la inscripción fue confirmado' },
          });
        }
        return { action: approve ? ('approved' as const) : ('late' as const), p };
      },
      { timeout: 15_000 },
    );

    if (result.action === 'approved') {
      const { p } = result;
      const organizer = await this.prisma.organizerProfile.findUnique({ where: { id: p.organizerId }, select: { userId: true } });
      await this.notifications.notify([
        {
          userId: p.payerId,
          type: 'REGISTRATION_APPROVED',
          title: '¡Pago confirmado e inscripción aprobada!',
          body: `Ya estás dentro de ${p.tournament.name}.`,
          link: `/torneos/${p.tournament.slug}`,
        },
        ...(organizer
          ? [
              {
                userId: organizer.userId,
                type: 'REGISTRATION_PAID',
                title: 'Nueva inscripción pagada',
                body: `Se confirmó un pago de ${p.currency} ${Number(p.amount).toFixed(2)} en ${p.tournament.name}.`,
                link: `/dashboard/torneos/${p.tournamentId}`,
              },
            ]
          : []),
      ]);
      this.realtime.emitToTournament(p.tournamentId, 'registration:changed', { tournamentId: p.tournamentId });
    } else if (result.action === 'late') {
      // Sin cupo para un pago tardío: se devuelve el dinero
      const fresh = await this.prisma.registrationPayment.findUniqueOrThrow({ where: { id: result.p.id } });
      try {
        await this.executeRefund(fresh, 'El pago llegó después de vencer la reserva y ya no había cupo', null);
        await this.notifications.notify({
          userId: fresh.payerId,
          type: 'REGISTRATION_PAYMENT_REFUNDED',
          title: 'Pago reembolsado',
          body: `Tu pago para ${result.p.tournament.name} llegó cuando la reserva ya había vencido y no quedaban cupos. Se reembolsó el importe.`,
          link: `/inscripciones/pago/${fresh.id}`,
        });
      } catch (e) {
        this.logger.error(`No se pudo reembolsar el pago tardío ${fresh.id}: ${(e as Error).message}`);
      }
    } else if (result.action === 'refunded') {
      const { p } = result;
      await this.notifications.notify({
        userId: p.payerId,
        type: 'REGISTRATION_PAYMENT_REFUNDED',
        title: 'Inscripción reembolsada',
        body: `Se reembolsó tu pago de ${p.tournament.name}.${extra.reason ? ` Motivo: ${extra.reason}` : ''}`,
        link: `/inscripciones/pago/${p.id}`,
      });
      this.realtime.emitToTournament(p.tournamentId, 'registration:changed', { tournamentId: p.tournamentId });
    }
    return result.action;
  }

  /** Reservas vencidas: el pago se anula y la inscripción se libera. */
  async expirePending(now = new Date()) {
    const due = await this.prisma.registrationPayment.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      take: 200,
      select: { id: true, registrationId: true, tournamentId: true, payerId: true, tournament: { select: { name: true, slug: true } } },
    });
    for (const p of due) {
      const released = await this.prisma.$transaction(async (tx) => {
        const n = await tx.registrationPayment.updateMany({
          where: { id: p.id, status: 'PENDING' },
          data: { status: 'CANCELLED', failureReason: 'El pago no se completó a tiempo' },
        });
        if (!n.count) return false;
        const r = await tx.tournamentRegistration.updateMany({ where: { id: p.registrationId, status: 'PAYMENT_PENDING' }, data: { status: 'WITHDRAWN' } });
        return r.count > 0;
      });
      if (released) {
        await this.notifications.notify({
          userId: p.payerId,
          type: 'REGISTRATION_PAYMENT_EXPIRED',
          title: 'Tu reserva de cupo venció',
          body: `No se completó el pago de ${p.tournament.name} a tiempo. Si aún hay cupos, puedes volver a inscribirte.`,
          link: `/torneos/${p.tournament.slug}`,
        });
        this.realtime.emitToTournament(p.tournamentId, 'registration:changed', { tournamentId: p.tournamentId });
      }
    }
    return due.length;
  }

  // ------------------------------------------------------------------------ consultas

  private present(p: PaymentView, viewerId: string) {
    return {
      ...p,
      amount: Number(p.amount),
      platformFee: Number(p.platformFee),
      feePercent: Number(p.feePercent),
      // El enlace de pago solo lo ve quien paga y solo mientras está pendiente
      checkoutUrl: p.status === 'PENDING' && p.payerId === viewerId ? p.checkoutUrl : null,
      participant: p.registration.team?.name ?? p.registration.player?.nickname ?? null,
      // Reserva vencida a la espera de que el proceso periódico la anule
      expired: p.status === 'PENDING' && p.expiresAt.getTime() < Date.now(),
    };
  }

  async payment(user: AuthUser, id: string) {
    const p = await this.prisma.registrationPayment.findUnique({ where: { id }, select: paymentSelect });
    if (!p) throw new NotFoundException('Pago no encontrado');
    if (p.payerId !== user.id) {
      if (user.role !== 'SUPERADMIN') await assertCanManageOrganizer(this.prisma, user, p.tournament.organizerId);
    }
    return { ...this.present(p, user.id), sandbox: p.provider === 'SANDBOX' && marketplaceConfig().sandbox };
  }

  async completeSandbox(user: AuthUser, id: string, dto: SandboxPaymentDto) {
    const p = await this.prisma.registrationPayment.findUnique({ where: { id } });
    if (!p || p.payerId !== user.id) throw new NotFoundException('Pago no encontrado');
    if (p.provider !== 'SANDBOX' || !marketplaceConfig().sandbox) throw new ForbiddenException('Este pago no es de prueba');
    if (p.status !== 'PENDING') throw new BadRequestException('Este pago ya no está pendiente');
    if (p.expiresAt < new Date()) throw new BadRequestException('La reserva venció');
    await this.apply(p.id, dto.approve ? 'SUCCEEDED' : 'FAILED', { providerPaymentId: `sandbox-${p.id}`, reason: 'Pago de prueba rechazado' });
    return this.payment(user, id);
  }

  async organizerPayments(user: AuthUser, q: PaymentListQuery) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    return this.list({ organizerId: organizer.id }, q, user.id);
  }

  async adminPayments(user: AuthUser, q: PaymentListQuery) {
    return this.list({}, q, user.id);
  }

  private async list(scope: { organizerId?: string }, q: PaymentListQuery, viewerId: string) {
    const where: Prisma.RegistrationPaymentWhereInput = {
      ...scope,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { tournament: { name: { contains: q.q, mode: 'insensitive' } } },
              { payer: { username: { contains: q.q, mode: 'insensitive' } } },
              { organizer: { displayName: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total, totals] = await Promise.all([
      this.prisma.registrationPayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { ...paymentSelect, organizer: { select: { displayName: true } } },
      }),
      this.prisma.registrationPayment.count({ where }),
      this.prisma.registrationPayment.groupBy({
        by: ['currency'],
        where: { ...scope, status: 'SUCCEEDED' },
        _sum: { amount: true, platformFee: true },
        _count: true,
      }),
    ]);
    return {
      items: items.map((p) => ({ ...this.present(p, viewerId), organizer: p.organizer })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      // Cobrado (pagos confirmados vigentes) por moneda: bruto, comisión de Arena y neto del organizador
      totals: totals.map((t) => {
        const gross = Number(t._sum.amount ?? 0);
        const fee = Number(t._sum.platformFee ?? 0);
        return { currency: t.currency, payments: t._count, gross, fee, net: Math.round((gross - fee) * 100) / 100 };
      }),
    };
  }

  async refund(user: AuthUser, id: string, dto: RefundDto) {
    const p = await this.prisma.registrationPayment.findUnique({ where: { id }, include: { tournament: { select: { organizerId: true } } } });
    if (!p) throw new NotFoundException('Pago no encontrado');
    await assertCanManageOrganizer(this.prisma, user, p.tournament.organizerId);
    if (p.status !== 'SUCCEEDED') throw new BadRequestException('Solo se reembolsan pagos confirmados');
    await this.executeRefund(p, dto.reason, user.id);
    return this.payment(user, id);
  }

  // ------------------------------------------------------------------------ webhook

  async webhook(query: Record<string, unknown>, body: Record<string, unknown>, headers: { signature?: string; requestId?: string }) {
    const c = marketplaceConfig();
    const data = (body?.data ?? {}) as { id?: unknown };
    const dataId = String(query['data.id'] ?? data.id ?? '');
    const type = String(query.type ?? body?.type ?? query.topic ?? '');
    if (type !== 'payment' || !dataId) return { ok: true, ignored: true };
    if (!c.enabled || !verifyMercadoPagoSignature({ dataId, requestId: headers.requestId, signature: headers.signature }, c.webhookSecret)) {
      throw new UnauthorizedException('Firma inválida');
    }
    const ref = query.ref;
    if (!isUuid(ref)) return { ok: true, ignored: true };
    const p = await this.prisma.registrationPayment.findUnique({ where: { id: ref } });
    if (!p || p.provider !== 'MERCADOPAGO' || !p.accountId) return { ok: true, ignored: true };
    const account = await this.prisma.organizerPaymentAccount.findUnique({ where: { id: p.accountId } });
    if (!account) return { ok: true, ignored: true };

    // Se consulta el pago real con el token del organizador (no se confía en el cuerpo de la notificación)
    const mpPayment = await getPayment(await this.sellerToken(account), dataId);
    const eventId = `reg:${mpPayment.id}:${mpPayment.status}`;
    try {
      await this.prisma.paymentWebhookEvent.create({
        data: { provider: 'MERCADOPAGO', eventId, type: `registration.${mpPayment.status}`, payload: { query, body } as Prisma.InputJsonValue },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, duplicate: true };
      throw e;
    }
    if (!matchesPayment(mpPayment, { id: p.id, amount: Number(p.amount), currency: p.currency })) {
      await this.prisma.paymentWebhookEvent.update({
        where: { provider_eventId: { provider: 'MERCADOPAGO', eventId } },
        data: { error: 'La referencia, el importe o la moneda no coinciden con el pago registrado' },
      });
      return { ok: true, ignored: true };
    }
    const action = await this.apply(p.id, registrationOutcome(mpPayment.status), {
      providerPaymentId: String(mpPayment.id),
      reason: mpPayment.status_detail,
    });
    await this.prisma.paymentWebhookEvent.update({ where: { provider_eventId: { provider: 'MERCADOPAGO', eventId } }, data: { processedAt: new Date() } });
    return { ok: true, action };
  }
}

// ------------------------------------------------------------------------------------------- controladores

@ApiTags('Cobro de inscripciones')
@ApiBearerAuth()
@Controller()
export class RegistrationPaymentsController {
  constructor(private readonly service: RegistrationPaymentsService) {}

  @Roles('ORGANIZER')
  @Get('me/payment-account')
  account(@CurrentUser() user: AuthUser) {
    return this.service.account(user);
  }

  @Roles('ORGANIZER')
  @Post('me/payment-account/mercadopago/authorize')
  authorize(@CurrentUser() user: AuthUser) {
    return this.service.authorize(user);
  }

  @Roles('ORGANIZER')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('me/payment-account/mercadopago/connect')
  connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectAccountDto) {
    return this.service.connect(user, dto);
  }

  @Roles('ORGANIZER')
  @Post('me/payment-account/sandbox')
  sandbox(@CurrentUser() user: AuthUser) {
    return this.service.connectSandbox(user);
  }

  @Roles('ORGANIZER')
  @Delete('me/payment-account')
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user);
  }

  @Roles('ORGANIZER')
  @Get('me/registration-payments')
  mine(@CurrentUser() user: AuthUser, @Query() q: PaymentListQuery) {
    return this.service.organizerPayments(user, q);
  }

  @Roles('SUPERADMIN')
  @Get('admin/registration-payments')
  admin(@CurrentUser() user: AuthUser, @Query() q: PaymentListQuery) {
    return this.service.adminPayments(user, q);
  }

  @Get('registration-payments/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.payment(user, id);
  }

  @Post('registration-payments/:id/sandbox')
  completeSandbox(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SandboxPaymentDto) {
    return this.service.completeSandbox(user, id, dto);
  }

  @Roles('ORGANIZER')
  @Post('registration-payments/:id/refund')
  refund(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto) {
    return this.service.refund(user, id, dto);
  }
}

/** Notificaciones de Mercado Pago de los cobros de inscripción: públicas y validadas por firma. */
@ApiTags('Cobro de inscripciones')
@Public()
@SkipThrottle()
@Controller('registration-payments/webhooks')
export class RegistrationPaymentsWebhookController {
  constructor(private readonly service: RegistrationPaymentsService) {}

  @Post('mercadopago')
  @HttpCode(200)
  mercadoPago(@Req() req: Request, @Headers('x-signature') signature?: string, @Headers('x-request-id') requestId?: string) {
    return this.service.webhook(req.query as Record<string, unknown>, req.body as Record<string, unknown>, { signature, requestId });
  }
}

@Module({
  controllers: [RegistrationPaymentsController, RegistrationPaymentsWebhookController],
  providers: [RegistrationPaymentsService],
  exports: [RegistrationPaymentsService],
})
export class RegistrationPaymentsModule {}
