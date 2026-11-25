import { Controller, Get, Injectable, Module, Param, ParseEnumPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlanLimitsService } from '../plans/plans.js';
import { AuthUser, CurrentUser, Roles } from '../common/decorators/auth.decorators.js';
import { requireOwnOrganizer } from '../common/utils/access.js';
import { EXPORT_KINDS, STATS_MONTHS, StatsService, statsRange, type ExportKind } from './stats.js';

export class StatsQuery {
  @ApiPropertyOptional({ enum: STATS_MONTHS, default: 6, description: 'Meses calendario del periodo (incluye el actual)' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(STATS_MONTHS)
  months?: number;
}

const EXPORT_NAME: Record<ExportKind, string> = { tournaments: 'torneos', registrations: 'inscripciones', matches: 'encuentros' };

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
        // Cuotas de inscripción registradas (aprobadas), agrupadas por moneda
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
  constructor(
    private readonly service: DashboardService,
    private readonly stats: StatsService,
    private readonly limits: PlanLimitsService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles('ORGANIZER')
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.organizer(user);
  }

  /** Estadísticas avanzadas (funcionalidad ADVANCED_STATS: PRO y BUSINESS). */
  @Roles('ORGANIZER')
  @Get('stats')
  async advanced(@CurrentUser() user: AuthUser, @Query() q: StatsQuery) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    await this.limits.assertFeature(organizer.id, 'ADVANCED_STATS', 'Las estadísticas avanzadas');
    const [overview, tournaments, exportable, executive] = await Promise.all([
      this.stats.overview({ organizerId: organizer.id }, q.months ?? 6),
      this.stats.tournaments({ organizerId: organizer.id }, statsRange(q.months ?? 6).from, statsRange(q.months ?? 6).periodEnd),
      this.limits.hasFeature(organizer.id, 'EXPORT_REPORTS'),
      this.limits.hasFeature(organizer.id, 'EXECUTIVE_REPORTS'),
    ]);
    return { ...overview, tournaments, features: { export: exportable, executiveReport: executive } };
  }

  /** Reporte ejecutivo imprimible con comparación de periodos (funcionalidad EXECUTIVE_REPORTS: BUSINESS). */
  @Roles('ORGANIZER')
  @Get('report')
  async report(@CurrentUser() user: AuthUser, @Query() q: StatsQuery) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    await this.limits.assertFeature(organizer.id, 'EXECUTIVE_REPORTS', 'Los reportes ejecutivos');
    const months = q.months ?? 3;
    const { from, periodEnd } = statsRange(months);
    const [overview, tournaments, reputation, ratings, plan] = await Promise.all([
      this.stats.overview({ organizerId: organizer.id }, months),
      this.stats.tournaments({ organizerId: organizer.id }, from, periodEnd, 10),
      this.prisma.organizerReputation.findUnique({ where: { organizerId: organizer.id } }),
      this.prisma.organizerRating.count({ where: { organizerId: organizer.id, createdAt: { gte: from } } }),
      this.limits.usageSummary(organizer.id),
    ]);
    return {
      generatedAt: new Date(),
      organizer: { displayName: organizer.displayName, logoUrl: organizer.logoUrl, verificationStatus: organizer.verificationStatus },
      plan: plan.plan.name,
      reputation: reputation && {
        level: reputation.reputationLevel,
        averageScore: reputation.averageScore,
        totalRatings: reputation.totalRatings,
        ratingsInPeriod: ratings,
      },
      ...overview,
      tournaments,
    };
  }

  /** Exportación CSV de torneos, inscripciones o encuentros (funcionalidad EXPORT_REPORTS: PRO y BUSINESS). */
  @Roles('ORGANIZER')
  @Get('export/:kind')
  @ApiOkResponse({ description: 'Archivo CSV (UTF-8 con BOM)', content: { 'text/csv': {} } })
  async export(
    @CurrentUser() user: AuthUser,
    @Param('kind', new ParseEnumPipe(EXPORT_KINDS)) kind: ExportKind,
    @Query() q: StatsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    await this.limits.assertFeature(organizer.id, 'EXPORT_REPORTS', 'La exportación de reportes');
    const months = q.months ?? 6;
    const csv = await this.stats.exportRows(organizer.id, kind, months);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="arena-${EXPORT_NAME[kind]}-${months}m-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('cache-control', 'no-store');
    return csv;
  }
}

@ApiTags('Administración · Estadísticas')
@ApiBearerAuth()
@Roles('SUPERADMIN')
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly stats: StatsService) {}

  /** Estadísticas globales de la plataforma. */
  @Get()
  platform(@Query() q: StatsQuery) {
    return this.stats.platform(q.months ?? 6);
  }
}

@Module({ controllers: [DashboardController, AdminStatsController], providers: [DashboardService, StatsService] })
export class DashboardModule {}
