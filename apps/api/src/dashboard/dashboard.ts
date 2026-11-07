import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlanLimitsService } from '../plans/plans.js';
import { AuthUser, CurrentUser, Roles } from '../common/decorators/auth.decorators.js';
import { requireOwnOrganizer } from '../common/utils/access.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: PlanLimitsService,
  ) {}

  /** Indicadores del panel del organizador (solo sus propias competiciones). */
  async organizer(user: AuthUser) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    const orgFilter = { tournament: { organizerId: organizer.id } };

    const [byStatus, regsByStatus, teams, players, capacity, fees, upcoming, monthly, reputation, subscription] =
      await Promise.all([
        this.prisma.tournament.groupBy({ by: ['status'], where: { organizerId: organizer.id }, _count: true }),
        this.prisma.tournamentRegistration.groupBy({ by: ['status'], where: orgFilter, _count: true }),
        this.prisma.tournamentRegistration.findMany({
          where: { ...orgFilter, status: 'APPROVED', teamId: { not: null } },
          distinct: ['teamId'],
          select: { teamId: true },
        }),
        this.prisma.tournamentRegistration.findMany({
          where: { ...orgFilter, status: 'APPROVED', playerId: { not: null } },
          distinct: ['playerId'],
          select: { playerId: true },
        }),
        this.prisma.tournament.aggregate({
          where: { organizerId: organizer.id, status: 'OPEN' },
          _sum: { maxParticipants: true },
        }),
        // Cuotas de inscripción informativas registradas (aprobadas), agrupadas por moneda
        this.prisma.tournamentRegistration.groupBy({
          by: ['feeCurrency'],
          where: { ...orgFilter, status: 'APPROVED' },
          _sum: { feeAmount: true },
        }),
        this.prisma.tournament.findMany({
          where: { organizerId: organizer.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
          orderBy: { startsAt: 'asc' },
          take: 5,
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            startsAt: true,
            maxParticipants: true,
            _count: { select: { registrations: { where: { status: 'APPROVED' } } } },
          },
        }),
        this.prisma.$queryRaw<{ month: string; registrations: bigint }[]>`
          SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month, count(*) AS registrations
          FROM tournament_registrations r
          JOIN tournaments t ON t.id = r.tournament_id
          WHERE t.organizer_id = ${organizer.id}::uuid AND r.created_at > now() - interval '12 months'
          GROUP BY 1 ORDER BY 1`,
        this.prisma.organizerReputation.findUnique({ where: { organizerId: organizer.id } }),
        this.limits.usageSummary(organizer.id),
      ]);

    const t = Object.fromEntries(byStatus.map((s) => [s.status, s._count])) as Record<string, number>;
    const r = Object.fromEntries(regsByStatus.map((s) => [s.status, s._count])) as Record<string, number>;
    const approvedInOpen = await this.prisma.tournamentRegistration.count({
      where: { tournament: { organizerId: organizer.id, status: 'OPEN' }, status: 'APPROVED' },
    });

    return {
      organizer: {
        id: organizer.id,
        displayName: organizer.displayName,
        logoUrl: organizer.logoUrl,
        verificationStatus: organizer.verificationStatus,
      },
      kpis: {
        totalTournaments: byStatus.reduce((a, s) => a + s._count, 0),
        activeTournaments: (t.OPEN ?? 0) + (t.IN_PROGRESS ?? 0),
        draftTournaments: t.DRAFT ?? 0,
        finishedTournaments: t.FINISHED ?? 0,
        cancelledTournaments: t.CANCELLED ?? 0,
        teams: teams.length,
        players: players.length,
        registrationsReceived: Object.values(r).reduce((a, n) => a + n, 0),
        registrationsPending: r.PENDING ?? 0,
        registrationsApproved: r.APPROVED ?? 0,
        spotsAvailable: Math.max(0, (capacity._sum.maxParticipants ?? 0) - approvedInOpen),
        entryFeesRegistered: fees.map((f) => ({ currency: f.feeCurrency, total: f._sum.feeAmount ?? 0 })),
      },
      tournamentsByStatus: t,
      registrationsByMonth: monthly.map((m) => ({ month: m.month, registrations: Number(m.registrations) })),
      upcoming: upcoming.map(({ _count, ...u }) => ({ ...u, registeredCount: _count.registrations })),
      reputation,
      subscription,
    };
  }
}

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('me/dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Roles('ORGANIZER')
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.organizer(user);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
