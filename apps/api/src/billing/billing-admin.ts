import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser, CurrentUser, Roles } from '../common/decorators/auth.decorators.js';
import { paginate, PaginationQuery } from '../common/utils/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BillingService, BillingWebhooksController, paymentSelect, SubscriptionController } from './billing.js';
import { isFreePlan, round2 } from './pricing.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

/** Funcionalidades conocidas por la plataforma (feature flags). Se pueden agregar sin cambiar el modelo. */
export const FEATURE_KEYS = [
  'BASIC_STATS',
  'ADVANCED_STATS',
  'BASIC_CUSTOMIZATION',
  'FULL_CUSTOMIZATION',
  'ADVANCED_BRANDING',
  'CUSTOM_DOMAIN',
  'MULTIPLE_ADMINS',
  'EXECUTIVE_REPORTS',
  'AUDIT_LOG',
  'EXPORT_REPORTS',
  'VERIFICATION',
  'REPUTATION',
] as const;

// ============================================================================ DTOs

export class PlanFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 40) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100000) priceMonthly?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000000) priceYearly?: number;
  @ApiPropertyOptional({ example: 'USD' }) @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional({ nullable: true, description: 'null = ilimitado (uso razonable)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  maxActiveTournaments?: number | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(100000) maxParticipantsPerTournament?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) maxAdmins?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90) trialDays?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) graceDays?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] }) @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @ApiPropertyOptional({ description: 'Funcionalidades habilitadas (reemplaza la lista)', isArray: true, enum: FEATURE_KEYS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsIn(FEATURE_KEYS, { each: true })
  features?: string[];
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(5, 500) reason?: string;
}

export class CreatePlanDto extends PlanFieldsDto {
  @ApiProperty({ example: 'ENTERPRISE' }) @Transform(upper) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,29}$/) code!: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 40) declare name: string;
  @ApiProperty() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) declare priceMonthly: number;
  @ApiProperty() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) declare priceYearly: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(2) declare maxParticipantsPerTournament: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) declare maxAdmins: number;
}

export class CreatePromoDto {
  @ApiProperty({ example: 'LANZAMIENTO50' }) @Transform(upper) @IsString() @Matches(/^[A-Z0-9_-]{3,40}$/) code!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200) description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) percentOff?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amountOff?: number;
  @ApiPropertyOptional({ description: 'Códigos de plan; vacío = todos los de pago' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[A-Z][A-Z0-9_]{1,29}$/, { each: true })
  appliesToPlans?: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() validFrom?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() validUntil?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) maxRedemptions?: number;
}

export class UpdatePromoDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Type(() => Date) @IsDate() validUntil?: Date | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxRedemptions?: number | null;
}

const SUB_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'] as const;

export class AdminSubscriptionsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: SUB_STATUSES }) @IsOptional() @IsIn(SUB_STATUSES) status?: (typeof SUB_STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @Matches(/^[A-Z][A-Z0-9_]{1,29}$/) plan?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ description: 'Solo cancelaciones programadas' }) @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() scheduledCancel?: boolean;
}

const PAY_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED'] as const;
export class AdminPaymentsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: PAY_STATUSES }) @IsOptional() @IsIn(PAY_STATUSES) status?: (typeof PAY_STATUSES)[number];
}

// ============================================================================ Servicio

@Injectable()
export class BillingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  plans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        features: { orderBy: { featureKey: 'asc' } },
        _count: { select: { subscriptions: { where: { isCurrent: true } } } },
      },
    });
  }

  private validatePlan(code: string, data: PlanFieldsDto, existing?: { priceMonthly: unknown; priceYearly: unknown }) {
    const monthly = data.priceMonthly ?? Number(existing?.priceMonthly ?? 0);
    const yearly = data.priceYearly ?? Number(existing?.priceYearly ?? 0);
    if (code === 'FREE') {
      if (monthly !== 0 || yearly !== 0) throw new BadRequestException('El plan Free no puede tener precio');
      if (data.status === 'INACTIVE') throw new BadRequestException('El plan Free no se puede desactivar: es el plan de respaldo');
      if (data.trialDays) throw new BadRequestException('El plan Free no tiene periodo de prueba');
    } else if (monthly === 0 && yearly === 0) {
      throw new BadRequestException('Un plan de pago necesita precio mensual o anual');
    } else if ((monthly === 0) !== (yearly === 0)) {
      throw new BadRequestException('Indica precio mensual y anual (ambos mayores que cero)');
    }
  }

  async createPlan(actor: AuthUser, dto: CreatePlanDto) {
    this.validatePlan(dto.code, dto);
    if (await this.prisma.subscriptionPlan.findUnique({ where: { code: dto.code } })) throw new ConflictException('Ya existe un plan con ese código');
    const { features = [], reason, ...data } = dto;
    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscriptionPlan.create({
        data: { ...data, maxActiveTournaments: data.maxActiveTournaments ?? null, features: { create: [...new Set(features)].map((featureKey) => ({ featureKey })) } },
        include: { features: true },
      });
      await this.audit.log({ actorId: actor.id, action: 'PLAN_CREATED', entityType: 'SubscriptionPlan', entityId: created.id, after: created, reason }, tx);
      return created;
    });
    return plan;
  }

  async updatePlan(actor: AuthUser, id: string, dto: PlanFieldsDto) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id }, include: { features: true } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    this.validatePlan(plan.code, dto, plan);
    const { features, reason, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscriptionPlan.update({ where: { id }, data });
      if (features) {
        const wanted = new Set(features);
        for (const key of new Set([...wanted, ...plan.features.map((f) => f.featureKey)])) {
          await tx.planFeature.upsert({
            where: { planId_featureKey: { planId: id, featureKey: key } },
            update: { enabled: wanted.has(key) },
            create: { planId: id, featureKey: key, enabled: wanted.has(key) },
          });
        }
      }
      await this.audit.log(
        {
          actorId: actor.id,
          action: 'PLAN_UPDATED',
          entityType: 'SubscriptionPlan',
          entityId: id,
          before: { ...plan, features: plan.features.filter((f) => f.enabled).map((f) => f.featureKey) },
          after: { ...updated, features: features ?? undefined },
          reason,
        },
        tx,
      );
      return tx.subscriptionPlan.findUniqueOrThrow({ where: { id }, include: { features: { orderBy: { featureKey: 'asc' } } } });
    });
  }

  promotions() {
    return this.prisma.promotionalCode.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async createPromotion(actor: AuthUser, dto: CreatePromoDto) {
    if (!dto.percentOff === !dto.amountOff) throw new BadRequestException('Indica un porcentaje o un monto de descuento (solo uno)');
    if (dto.validUntil && dto.validFrom && dto.validUntil <= dto.validFrom) throw new BadRequestException('La fecha de fin debe ser posterior al inicio');
    if (await this.prisma.promotionalCode.findUnique({ where: { code: dto.code } })) throw new ConflictException('Ya existe un código con ese nombre');
    if (dto.appliesToPlans?.length) {
      const plans = await this.prisma.subscriptionPlan.findMany({ where: { code: { in: dto.appliesToPlans } } });
      if (plans.length !== new Set(dto.appliesToPlans).size) throw new BadRequestException('Algún plan indicado no existe');
      if (plans.some((p) => isFreePlan(p))) throw new BadRequestException('Las promociones solo aplican a planes de pago');
    }
    const promo = await this.prisma.promotionalCode.create({
      data: {
        code: dto.code,
        description: dto.description,
        percentOff: dto.percentOff ?? null,
        amountOff: dto.amountOff ?? null,
        appliesToPlans: [...new Set(dto.appliesToPlans ?? [])],
        validFrom: dto.validFrom ?? new Date(),
        validUntil: dto.validUntil ?? null,
        maxRedemptions: dto.maxRedemptions ?? null,
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'PROMO_CREATED', entityType: 'PromotionalCode', entityId: promo.id, after: promo });
    return promo;
  }

  async updatePromotion(actor: AuthUser, id: string, dto: UpdatePromoDto) {
    const promo = await this.prisma.promotionalCode.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException('Código no encontrado');
    const updated = await this.prisma.promotionalCode.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: actor.id, action: 'PROMO_UPDATED', entityType: 'PromotionalCode', entityId: id, before: promo, after: updated });
    return updated;
  }

  async subscriptions(q: AdminSubscriptionsQuery) {
    const closed = q.status === 'CANCELLED' || q.status === 'EXPIRED';
    const where: Prisma.SubscriptionWhereInput = {
      ...(closed ? {} : { isCurrent: true }),
      ...(q.status ? { status: q.status } : {}),
      ...(q.plan ? { plan: { code: q.plan } } : {}),
      ...(q.scheduledCancel ? { cancelAtPeriodEnd: true, isCurrent: true } : {}),
      ...(q.q
        ? { organizer: { OR: [{ displayName: { contains: q.q, mode: 'insensitive' } }, { user: { username: { contains: q.q, mode: 'insensitive' } } }] } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        orderBy: closed ? { cancelledAt: 'desc' } : { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          status: true,
          billingPeriod: true,
          startedAt: true,
          currentPeriodEnd: true,
          graceUntil: true,
          cancelAtPeriodEnd: true,
          cancelledAt: true,
          isCurrent: true,
          provider: true,
          plan: { select: { code: true, name: true, currency: true } },
          pendingPlan: { select: { code: true, name: true } },
          promoCode: { select: { code: true } },
          organizer: { select: { id: true, displayName: true, user: { select: { username: true, email: true } } } },
          payments: { where: { status: 'SUCCEEDED' }, orderBy: { paidAt: 'desc' }, take: 1, select: { amount: true, currency: true, paidAt: true } },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  async payments(q: AdminPaymentsQuery) {
    const where: Prisma.SubscriptionPaymentWhereInput = q.status ? { status: q.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subscriptionPayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { ...paymentSelect, subscription: { select: { organizer: { select: { displayName: true, user: { select: { username: true } } } } } } },
      }),
      this.prisma.subscriptionPayment.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  /** Indicadores SaaS. Los importes se agrupan por moneda (no se convierten). */
  async metrics(now = new Date()) {
    const subs = await this.prisma.subscription.findMany({
      where: { isCurrent: true },
      select: {
        id: true,
        status: true,
        billingPeriod: true,
        graceUntil: true,
        cancelAtPeriodEnd: true,
        planId: true,
        plan: { select: { code: true, name: true, priceMonthly: true, priceYearly: true, currency: true, sortOrder: true } },
      },
    });
    const paying = subs.filter(
      (s) => !isFreePlan(s.plan as never) && (s.status === 'ACTIVE' || (s.status === 'PAST_DUE' && s.graceUntil && s.graceUntil > now)),
    );
    const lastPaid = await this.prisma.subscriptionPayment.findMany({
      where: { subscriptionId: { in: paying.map((s) => s.id) }, status: 'SUCCEEDED' },
      orderBy: { paidAt: 'desc' },
      select: { subscriptionId: true, planId: true, billingPeriod: true, amount: true },
    });

    const mrr = new Map<string, number>();
    for (const s of paying) {
      const p = lastPaid.find((x) => x.subscriptionId === s.id && x.planId === s.planId && x.billingPeriod === s.billingPeriod);
      // Lo efectivamente cobrado (con descuentos); sin pagos registrados, el precio de lista
      const value = p ? Number(p.amount) : Number(s.billingPeriod === 'YEARLY' ? s.plan.priceYearly : s.plan.priceMonthly);
      const monthly = s.billingPeriod === 'YEARLY' ? value / 12 : value;
      mrr.set(s.plan.currency, (mrr.get(s.plan.currency) ?? 0) + monthly);
    }

    const byPlan = new Map<string, { code: string; name: string; sortOrder: number; total: number; active: number; trial: number; pastDue: number }>();
    for (const s of subs) {
      const row = byPlan.get(s.plan.code) ?? { code: s.plan.code, name: s.plan.name, sortOrder: s.plan.sortOrder, total: 0, active: 0, trial: 0, pastDue: 0 };
      row.total++;
      if (s.status === 'ACTIVE') row.active++;
      if (s.status === 'TRIAL') row.trial++;
      if (s.status === 'PAST_DUE') row.pastDue++;
      byPlan.set(s.plan.code, row);
    }

    const since = new Date(now.getTime() - 30 * 864e5);
    const churnRows = await this.prisma.subscriptionHistory.findMany({
      where: { createdAt: { gte: since }, toStatus: { in: ['CANCELLED', 'EXPIRED'] }, fromStatus: { in: ['ACTIVE', 'PAST_DUE'] } },
      select: { subscription: { select: { organizerId: true } }, fromPlan: { select: { priceMonthly: true, priceYearly: true } } },
    });
    const churned = new Set(churnRows.filter((r) => r.fromPlan && !isFreePlan(r.fromPlan as never)).map((r) => r.subscription.organizerId)).size;

    const conv = async (from: string, to: string) => {
      const rows = await this.prisma.subscriptionHistory.findMany({
        where: { fromPlan: { code: from }, toPlan: { code: to }, toStatus: 'ACTIVE' },
        select: { subscription: { select: { organizerId: true } } },
      });
      return new Set(rows.map((r) => r.subscription.organizerId)).size;
    };
    const everOn = async (code: string) => {
      const rows = await this.prisma.subscriptionHistory.findMany({
        where: { toPlan: { code }, toStatus: 'ACTIVE' },
        select: { subscription: { select: { organizerId: true } } },
      });
      return new Set(rows.map((r) => r.subscription.organizerId)).size;
    };
    const [organizers, freeToPro, proToBusiness, everPro] = await Promise.all([
      this.prisma.organizerProfile.count(),
      conv('FREE', 'PRO'),
      conv('PRO', 'BUSINESS'),
      everOn('PRO'),
    ]);

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const seriesStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const [monthRev, yearRev, series, pendingPayments, pastDue, scheduledCancels] = await Promise.all([
      this.prisma.subscriptionPayment.groupBy({ by: ['currency'], where: { status: 'SUCCEEDED', paidAt: { gte: monthStart } }, _sum: { amount: true } }),
      this.prisma.subscriptionPayment.groupBy({ by: ['currency'], where: { status: 'SUCCEEDED', paidAt: { gte: yearStart } }, _sum: { amount: true } }),
      this.prisma.$queryRaw<{ month: Date; currency: string; total: string }[]>`
        SELECT date_trunc('month', paid_at) AS month, currency, SUM(amount)::text AS total
        FROM subscription_payments
        WHERE status = 'SUCCEEDED' AND paid_at >= ${seriesStart}
        GROUP BY 1, 2 ORDER BY 1`,
      this.prisma.subscriptionPayment.count({ where: { status: 'PENDING' } }),
      this.prisma.subscription.count({ where: { isCurrent: true, status: 'PAST_DUE' } }),
      this.prisma.subscription.count({ where: { isCurrent: true, cancelAtPeriodEnd: true } }),
    ]);

    const currencies = [...new Set([...mrr.keys(), ...monthRev.map((r) => r.currency), ...yearRev.map((r) => r.currency), ...subs.map((s) => s.plan.currency)])];
    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(seriesStart.getUTCFullYear(), seriesStart.getUTCMonth() + i, 1)));
    return {
      generatedAt: now,
      organizers,
      subscribers: subs.length,
      paying: paying.length,
      byPlan: [...byPlan.values()].sort((a, b) => a.sortOrder - b.sortOrder),
      revenue: currencies.map((currency) => {
        const m = round2(mrr.get(currency) ?? 0);
        return {
          currency,
          mrr: m,
          arr: round2(m * 12),
          arpu: subs.length ? round2(m / subs.length) : 0,
          month: round2(Number(monthRev.find((r) => r.currency === currency)?._sum.amount ?? 0)),
          year: round2(Number(yearRev.find((r) => r.currency === currency)?._sum.amount ?? 0)),
          series: months.map((d) => ({
            month: d.toISOString().slice(0, 7),
            total: round2(Number(series.find((r) => r.currency === currency && new Date(r.month).toISOString().slice(0, 7) === d.toISOString().slice(0, 7))?.total ?? 0)),
          })),
        };
      }),
      churn: { last30Days: churned, rate: paying.length + churned ? round2((churned / (paying.length + churned)) * 100) : 0 },
      conversion: {
        freeToPro: { count: freeToPro, base: organizers, rate: organizers ? round2((freeToPro / organizers) * 100) : 0 },
        proToBusiness: { count: proToBusiness, base: everPro, rate: everPro ? round2((proToBusiness / everPro) * 100) : 0 },
      },
      pendingPayments,
      pastDue,
      scheduledCancels,
    };
  }
}

@ApiTags('Administración · Suscripciones')
@ApiBearerAuth()
@Roles('SUPERADMIN')
@Controller('admin/billing')
export class BillingAdminController {
  constructor(
    private readonly admin: BillingAdminService,
    private readonly billing: BillingService,
  ) {}

  @Get('metrics')
  metrics() {
    return this.admin.metrics();
  }

  @Get('plans')
  plans() {
    return this.admin.plans();
  }

  @Post('plans')
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: CreatePlanDto) {
    return this.admin.createPlan(user, dto);
  }

  @Patch('plans/:id')
  updatePlan(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanFieldsDto) {
    return this.admin.updatePlan(user, id, dto);
  }

  @Get('promotions')
  promotions() {
    return this.admin.promotions();
  }

  @Post('promotions')
  createPromotion(@CurrentUser() user: AuthUser, @Body() dto: CreatePromoDto) {
    return this.admin.createPromotion(user, dto);
  }

  @Patch('promotions/:id')
  updatePromotion(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromoDto) {
    return this.admin.updatePromotion(user, id, dto);
  }

  @Get('subscriptions')
  subscriptions(@Query() q: AdminSubscriptionsQuery) {
    return this.admin.subscriptions(q);
  }

  @Get('payments')
  payments(@Query() q: AdminPaymentsQuery) {
    return this.admin.payments(q);
  }

  /** Ejecuta la revisión de vencimientos sin esperar al temporizador. */
  @Post('lifecycle/run')
  @HttpCode(200)
  runLifecycle() {
    return this.billing.runLifecycle();
  }
}

@Module({
  controllers: [SubscriptionController, BillingWebhooksController, BillingAdminController],
  providers: [BillingService, BillingAdminService],
  exports: [BillingService],
})
export class BillingModule {}
