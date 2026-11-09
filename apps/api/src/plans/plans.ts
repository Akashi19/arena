import {
  Controller,
  ForbiddenException,
  Get,
  Global,
  Injectable,
  Module,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../common/decorators/auth.decorators.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Estados de torneo que cuentan como "activos" para el límite del plan. */
export const ACTIVE_TOURNAMENT_STATUSES = ['DRAFT', 'OPEN', 'IN_PROGRESS'] as const;

/** Estados de suscripción que permiten operar con las capacidades del plan. */
const USABLE_STATUSES = new Set(['TRIAL', 'ACTIVE', 'PAST_DUE']);

export class PlanLimitError extends ForbiddenException {
  constructor(message: string, code: string, details: Record<string, unknown>) {
    super({ statusCode: 403, error: 'PLAN_LIMIT', code, message, ...details });
  }
}

/**
 * Feature flags y límites por suscripción. Toda la validación ocurre en backend:
 * el frontend sólo muestra los mensajes devueltos.
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Plan efectivo del organizador. Si la suscripción no está en un estado usable cae a FREE. */
  async effectivePlan(organizerId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const sub = await db.subscription.findFirst({
      where: { organizerId, isCurrent: true },
      include: { plan: { include: { features: true } } },
    });
    const graceOk = sub?.status !== 'PAST_DUE' || (sub.graceUntil && sub.graceUntil > new Date());
    if (sub && USABLE_STATUSES.has(sub.status) && graceOk) return { plan: sub.plan, subscription: sub };
    const free = await db.subscriptionPlan.findUnique({ where: { code: 'FREE' }, include: { features: true } });
    if (!free) throw new NotFoundException('El plan FREE no está configurado');
    return { plan: free, subscription: sub ?? null };
  }

  async assertCanCreateActiveTournament(organizerId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const { plan } = await this.effectivePlan(organizerId, db);
    if (plan.maxActiveTournaments === null) return;
    const active = await db.tournament.count({
      where: { organizerId, status: { in: [...ACTIVE_TOURNAMENT_STATUSES] } },
    });
    if (active >= plan.maxActiveTournaments) {
      throw new PlanLimitError(
        `Has alcanzado el límite de ${plan.maxActiveTournaments} torneos activos de tu plan ${plan.name}. ` +
          `Actualiza tu suscripción para crear más torneos.`,
        'ACTIVE_TOURNAMENTS_LIMIT',
        { limit: plan.maxActiveTournaments, used: active, plan: plan.code },
      );
    }
  }

  async assertParticipantsWithinPlan(
    organizerId: string,
    maxParticipants: number,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const { plan } = await this.effectivePlan(organizerId, db);
    if (maxParticipants > plan.maxParticipantsPerTournament) {
      throw new PlanLimitError(
        `Tu plan ${plan.name} permite hasta ${plan.maxParticipantsPerTournament} participantes por torneo. ` +
          `Actualiza tu suscripción para ampliar el cupo.`,
        'PARTICIPANTS_LIMIT',
        { limit: plan.maxParticipantsPerTournament, requested: maxParticipants, plan: plan.code },
      );
    }
  }

  async hasFeature(organizerId: string, featureKey: string): Promise<boolean> {
    const { plan } = await this.effectivePlan(organizerId);
    return plan.features.some((f) => f.featureKey === featureKey && f.enabled);
  }

  async assertFeature(organizerId: string, featureKey: string, label: string) {
    if (!(await this.hasFeature(organizerId, featureKey))) {
      const { plan } = await this.effectivePlan(organizerId);
      throw new PlanLimitError(
        `${label} no está incluido en tu plan ${plan.name}. Actualiza tu suscripción para habilitarlo.`,
        'FEATURE_NOT_IN_PLAN',
        { feature: featureKey, plan: plan.code },
      );
    }
  }

  /** Resumen para la sección "Mi suscripción". */
  async usageSummary(organizerId: string) {
    const { plan, subscription } = await this.effectivePlan(organizerId);
    const [activeTournaments, admins, biggest] = await Promise.all([
      this.prisma.tournament.count({ where: { organizerId, status: { in: [...ACTIVE_TOURNAMENT_STATUSES] } } }),
      this.prisma.organizerMember.count({ where: { organizerId } }),
      this.prisma.tournament.findFirst({
        where: { organizerId, status: { in: [...ACTIVE_TOURNAMENT_STATUSES] } },
        orderBy: { maxParticipants: 'desc' },
        select: { maxParticipants: true },
      }),
    ]);
    return {
      plan: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        currency: plan.currency,
        features: plan.features.filter((f) => f.enabled).map((f) => f.featureKey),
      },
      subscription: subscription && {
        id: subscription.id,
        status: subscription.status,
        billingPeriod: subscription.billingPeriod,
        startedAt: subscription.startedAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
      },
      usage: {
        activeTournaments: { used: activeTournaments, limit: plan.maxActiveTournaments },
        participantsPerTournament: { used: biggest?.maxParticipants ?? 0, limit: plan.maxParticipantsPerTournament },
        admins: { used: admins, limit: plan.maxAdmins },
      },
    };
  }
}

@ApiTags('Planes y suscripción')
@Controller()
export class PlansController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('plans')
  plans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      include: { features: { where: { enabled: true }, select: { featureKey: true, limitValue: true } } },
    });
  }
}

@Global()
@Module({ controllers: [PlansController], providers: [PlanLimitsService], exports: [PlanLimitsService] })
export class PlansModule {}
