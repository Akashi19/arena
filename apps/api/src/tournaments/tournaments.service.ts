import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { StorageService } from '../storage/storage.service.js';
import { PlanLimitsService } from '../plans/plans.js';
import { MatchesService } from '../matches/matches.js';
import { refreshPlayerStats, tournamentPlayerIds } from '../players/stats.js';
import { ReputationService } from '../trust/reputation.js';
import { RankingEngineService } from '../rankings/rankings.js';
import { RegistrationPaymentsService } from '../payments/registration-payments.js';
import type { AuthUser } from '../common/decorators/auth.decorators.js';
import { organizerPublicSelect, paginate, slugify, uniqueSlug } from '../common/utils/index.js';
import { assertCanManageOrganizer, levelIndex, requireOwnOrganizer } from '../common/utils/access.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Tournament, TournamentStatus } from '../generated/prisma/client.js';
import {
  CancelTournamentDto,
  ChangeStatusDto,
  CreateTournamentDto,
  DecideRegistrationDto,
  MyTournamentsQuery,
  RegistrationListQuery,
  RequestRegistrationDto,
  TournamentListQuery,
  UpdateTournamentDto,
} from './dto/tournament.dto.js';

/** Selección para tarjetas de partida: siempre incluye la identidad del organizador (logo, insignia, reputación). */
export const tournamentCardSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  category: true,
  status: true,
  startsAt: true,
  registrationDeadline: true,
  maxParticipants: true,
  mode: true,
  format: true,
  isOnline: true,
  location: true,
  country: true,
  city: true,
  entryFee: true,
  currency: true,
  collectOnline: true,
  coverUrl: true,
  platform: true,
  isFeatured: true,
  competition: { select: { name: true } },
  sport: { select: { id: true, name: true, slug: true, iconUrl: true } },
  game: { select: { id: true, name: true, slug: true, logoUrl: true } },
  organizer: { select: organizerPublicSelect },
  _count: { select: { registrations: { where: { status: 'APPROVED' } } } },
} satisfies Prisma.TournamentSelect;

type CardRow = Prisma.TournamentGetPayload<{ select: typeof tournamentCardSelect }>;

export function toCard(row: CardRow) {
  const { _count, ...rest } = row;
  const registered = _count.registrations;
  return { ...rest, registeredCount: registered, spotsLeft: Math.max(0, row.maxParticipants - registered) };
}

const ALLOWED_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
};

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly storage: StorageService,
    private readonly limits: PlanLimitsService,
    private readonly matches: MatchesService,
    private readonly reputation: ReputationService,
    private readonly rankings: RankingEngineService,
    private readonly payments: RegistrationPaymentsService,
  ) {}

  // =========================================================================== Consulta pública

  async list(q: TournamentListQuery) {
    const and: Prisma.TournamentWhereInput[] = [
      // Los borradores nunca son públicos
      { status: q.status && q.status !== 'DRAFT' ? q.status : { in: ['OPEN', 'IN_PROGRESS'] } },
      { organizer: { user: { status: 'ACTIVE' } } },
    ];
    if (q.q) {
      and.push({
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { competition: { name: { contains: q.q, mode: 'insensitive' } } },
          { organizer: { displayName: { contains: q.q, mode: 'insensitive' } } },
        ],
      });
    }
    if (q.category) and.push({ category: q.category });
    if (q.sport) and.push({ sport: { slug: q.sport } });
    if (q.game) and.push({ game: { slug: q.game } });
    if (q.country) and.push({ country: q.country });
    if (q.city) and.push({ city: { equals: q.city, mode: 'insensitive' } });
    if (q.from) and.push({ startsAt: { gte: q.from } });
    if (q.to) and.push({ startsAt: { lte: q.to } });
    if (q.mode) and.push({ mode: q.mode });
    if (q.format) and.push({ format: q.format });
    if (q.feeMin !== undefined) and.push({ entryFee: { gte: q.feeMin } });
    if (q.feeMax !== undefined) and.push({ entryFee: { lte: q.feeMax } });
    if (q.online) and.push({ isOnline: q.online === 'true' });
    if (q.organizer) and.push({ organizer: { user: { username: q.organizer.toLowerCase() } } });
    if (q.featured) and.push({ isFeatured: true });
    if (q.verifiedOnly) and.push({ organizer: { verificationStatus: 'VERIFIED' } });

    const orderBy: Prisma.TournamentOrderByWithRelationInput[] =
      q.sort === 'recent'
        ? [{ createdAt: 'desc' }]
        : q.sort === 'fee_asc'
          ? [{ entryFee: 'asc' }, { startsAt: 'asc' }]
          : q.sort === 'fee_desc'
            ? [{ entryFee: 'desc' }, { startsAt: 'asc' }]
            : q.sort === 'popular'
              ? [{ registrations: { _count: 'desc' } }, { startsAt: 'asc' }]
              : [{ startsAt: 'asc' }];

    const where: Prisma.TournamentWhereInput = { AND: and };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tournament.findMany({
        where,
        select: tournamentCardSelect,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.tournament.count({ where }),
    ]);
    return paginate(rows.map(toCard), total, q.page, q.pageSize);
  }

  /** Datos para la página principal en una sola llamada. */
  async home() {
    const now = new Date();
    const base: Prisma.TournamentWhereInput = { organizer: { user: { status: 'ACTIVE' } } };
    const [upcoming, recent, featured, organizers, sports, games] = await Promise.all([
      this.prisma.tournament.findMany({
        where: { ...base, status: 'OPEN', startsAt: { gte: now } },
        orderBy: { startsAt: 'asc' },
        take: 8,
        select: tournamentCardSelect,
      }),
      this.prisma.tournament.findMany({
        where: { ...base, status: { in: ['IN_PROGRESS', 'FINISHED'] } },
        orderBy: { startsAt: 'desc' },
        take: 8,
        select: tournamentCardSelect,
      }),
      this.prisma.tournament.findMany({
        where: { ...base, status: { in: ['OPEN', 'IN_PROGRESS'] }, isFeatured: true },
        orderBy: { startsAt: 'asc' },
        take: 4,
        select: tournamentCardSelect,
      }),
      this.prisma.organizerProfile.findMany({
        where: { user: { status: 'ACTIVE' }, OR: [{ isFeatured: true }, { verificationStatus: 'VERIFIED' }] },
        orderBy: [{ isFeatured: 'desc' }, { reputation: { averageScore: 'desc' } }],
        take: 8,
        select: { ...organizerPublicSelect, _count: { select: { tournaments: true } } },
      }),
      this.prisma.sport.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          iconUrl: true,
          _count: { select: { tournaments: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } } } },
        },
      }),
      this.prisma.game.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          category: true,
          _count: { select: { tournaments: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } } } },
        },
      }),
    ]);
    return {
      upcoming: upcoming.map(toCard),
      recent: recent.map(toCard),
      featured: featured.map(toCard),
      organizers,
      sports,
      games,
    };
  }

  async detail(slugOrId: string, viewer?: AuthUser) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
    const t = await this.prisma.tournament.findFirst({
      where: isUuid ? { id: slugOrId } : { slug: slugOrId },
      select: {
        ...tournamentCardSelect,
        rules: true,
        refundPolicy: true,
        endsAt: true,
        groupCount: true,
        qualifiersPerGroup: true,
        minLevel: true,
        maxLevel: true,
        minRankId: true,
        maxRankId: true,
        minRank: { select: { id: true, rankName: true, rankOrder: true } },
        maxRank: { select: { id: true, rankName: true, rankOrder: true } },
        mvp: { select: { id: true, nickname: true, avatarUrl: true, user: { select: { username: true } } } },
        pointsWin: true,
        pointsDraw: true,
        pointsLoss: true,
        cancelledReason: true,
        createdAt: true,
        updatedAt: true,
        organizerId: true,
        organizer: {
          select: {
            ...organizerPublicSelect,
            description: true,
            createdAt: true,
            _count: { select: { tournaments: { where: { status: { not: 'DRAFT' } } } } },
          },
        },
        champion: {
          select: {
            id: true,
            team: { select: { name: true, slug: true, logoUrl: true } },
            player: { select: { nickname: true, avatarUrl: true } },
          },
        },
        registrations: {
          where: { status: 'APPROVED' },
          orderBy: [{ seed: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            seed: true,
            groupLabel: true,
            finalPosition: true,
            team: { select: { id: true, name: true, slug: true, logoUrl: true, country: true } },
            player: {
              select: { id: true, nickname: true, avatarUrl: true, country: true, user: { select: { username: true } } },
            },
          },
        },
      },
    });
    if (!t) throw new NotFoundException('Partida no encontrada');

    let canManage = false;
    if (viewer) {
      try {
        await assertCanManageOrganizer(this.prisma, viewer, t.organizerId);
        canManage = true;
      } catch {
        canManage = false;
      }
    }
    if (t.status === 'DRAFT' && !canManage) throw new NotFoundException('Partida no encontrada');

    let myRegistration: { id: string; status: string; teamId: string | null; pendingPaymentId: string | null } | null = null;
    if (viewer) {
      const reg = await this.prisma.tournamentRegistration.findFirst({
        where: {
          tournamentId: t.id,
          status: { not: 'WITHDRAWN' },
          OR: [{ requestedById: viewer.id }, { player: { userId: viewer.id } }, { team: { ownerId: viewer.id } }],
        },
        select: { id: true, status: true, teamId: true, payments: { where: { status: 'PENDING' }, select: { id: true }, take: 1 } },
      });
      // Con un pago en curso el jugador puede retomarlo desde la página de la partida
      myRegistration = reg && { id: reg.id, status: reg.status, teamId: reg.teamId, pendingPaymentId: reg.payments[0]?.id ?? null };
    }

    // Historial del organizador para la pantalla de confianza previa a la inscripción
    const organizerHistory = await this.prisma.tournament.groupBy({
      by: ['status'],
      where: { organizerId: t.organizerId, status: { in: ['FINISHED', 'CANCELLED'] } },
      _count: true,
    });

    const { _count, organizerId: _orgId, ...rest } = t;
    return {
      ...rest,
      registeredCount: _count.registrations,
      spotsLeft: Math.max(0, t.maxParticipants - _count.registrations),
      registrationOpen: t.status === 'OPEN' && t.registrationDeadline > new Date() && _count.registrations < t.maxParticipants,
      organizerHistory: Object.fromEntries(organizerHistory.map((h) => [h.status, h._count])),
      viewer: viewer ? { canManage, myRegistration } : null,
    };
  }

  // =========================================================================== Gestión (organizador)

  async mine(user: AuthUser, q: MyTournamentsQuery) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    const where: Prisma.TournamentWhereInput = {
      organizerId: organizer.id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tournament.findMany({
        where,
        select: {
          ...tournamentCardSelect,
          _count: {
            select: {
              registrations: { where: { status: 'APPROVED' } },
            },
          },
        },
        orderBy: [{ startsAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.tournament.count({ where }),
    ]);
    const pending = await this.prisma.tournamentRegistration.groupBy({
      by: ['tournamentId'],
      where: { tournamentId: { in: rows.map((r) => r.id) }, status: 'PENDING' },
      _count: true,
    });
    const pendingMap = new Map(pending.map((p) => [p.tournamentId, p._count]));
    return paginate(
      rows.map((r) => ({ ...toCard(r), pendingRegistrations: pendingMap.get(r.id) ?? 0 })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async create(user: AuthUser, dto: CreateTournamentDto) {
    const organizer = await requireOwnOrganizer(this.prisma, user.id);
    await this.validateDiscipline(dto.category, dto.sportId, dto.gameId);
    this.validateSchedule(dto.startsAt, dto.registrationDeadline, true);
    this.validateFormat(dto.format, dto.maxParticipants, dto.groupCount, dto.qualifiersPerGroup);
    this.validateLevels(dto.minLevel, dto.maxLevel);
    await this.validateRanks(dto.category === 'ESPORT' ? dto.gameId : undefined, dto.minRankId, dto.maxRankId);
    if (!dto.isOnline && !dto.location) throw new BadRequestException('Indica la ubicación o marca la partida como online');
    await this.validateOnlineCollection(organizer.id, dto.collectOnline, dto.entryFee ?? 0);

    const created = await this.prisma.$transaction(
      async (tx) => {
        // Límites del plan validados en backend dentro de la misma transacción
        await this.limits.assertCanCreateActiveTournament(organizer.id, tx);
        await this.limits.assertParticipantsWithinPlan(organizer.id, dto.maxParticipants, tx);

        let competitionId: string | undefined;
        if (dto.competitionName) {
          const slug = slugify(dto.competitionName);
          const competition = await tx.competition.upsert({
            where: { organizerId_slug: { organizerId: organizer.id, slug } },
            update: {},
            create: { organizerId: organizer.id, name: dto.competitionName, slug },
          });
          competitionId = competition.id;
        }

        const { competitionName: _c, draft, ...data } = dto;
        const tournament = await tx.tournament.create({
          data: {
            ...data,
            organizerId: organizer.id,
            competitionId,
            slug: uniqueSlug(dto.name),
            status: draft ? 'DRAFT' : 'OPEN',
            sportId: dto.category === 'SPORT' ? dto.sportId : null,
            gameId: dto.category === 'ESPORT' ? dto.gameId : null,
            currency: dto.currency ?? 'USD',
            entryFee: dto.entryFee ?? 0,
            country: dto.country ?? (dto.isOnline ? null : organizer.country),
            city: dto.city ?? (dto.isOnline ? null : organizer.city),
          },
        });
        await this.audit.log(
          { actorId: user.id, action: 'TOURNAMENT_CREATED', entityType: 'Tournament', entityId: tournament.id, after: tournament },
          tx,
        );
        return tournament;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateTournamentDto) {
    const current = await this.getManaged(user, id);
    if (current.status === 'FINISHED' || current.status === 'CANCELLED') {
      throw new BadRequestException('No se puede editar una partida finalizada o cancelada');
    }
    const approved = await this.prisma.tournamentRegistration.count({ where: { tournamentId: id, status: 'APPROVED' } });
    const lockedAfterStart = current.status === 'IN_PROGRESS';
    if (lockedAfterStart && (dto.format || dto.mode || dto.category || dto.sportId || dto.gameId)) {
      throw new BadRequestException('No se puede cambiar disciplina, modalidad o formato con la partida en curso');
    }
    if (approved > 0 && dto.mode && dto.mode !== current.mode) {
      throw new BadRequestException('No se puede cambiar la modalidad con inscripciones aprobadas');
    }

    const category = dto.category ?? current.category;
    const sportId = dto.sportId ?? (category === 'SPORT' ? current.sportId : undefined) ?? undefined;
    const gameId = dto.gameId ?? (category === 'ESPORT' ? current.gameId : undefined) ?? undefined;
    if (dto.category || dto.sportId || dto.gameId) await this.validateDiscipline(category, sportId, gameId);

    const startsAt = dto.startsAt ?? current.startsAt;
    const deadline = dto.registrationDeadline ?? current.registrationDeadline;
    if (dto.startsAt || dto.registrationDeadline) this.validateSchedule(startsAt, deadline, current.status === 'OPEN' || current.status === 'DRAFT');

    const maxParticipants = dto.maxParticipants ?? current.maxParticipants;
    if (maxParticipants < approved) {
      throw new BadRequestException(`Ya hay ${approved} inscripciones aprobadas; el cupo no puede ser menor`);
    }
    if (dto.maxParticipants && dto.maxParticipants > current.maxParticipants) {
      await this.limits.assertParticipantsWithinPlan(current.organizerId, dto.maxParticipants);
    }
    this.validateFormat(
      dto.format ?? current.format,
      maxParticipants,
      dto.groupCount ?? current.groupCount ?? undefined,
      dto.qualifiersPerGroup ?? current.qualifiersPerGroup ?? undefined,
    );
    this.validateLevels(dto.minLevel ?? current.minLevel ?? undefined, dto.maxLevel ?? current.maxLevel ?? undefined);
    // Los rangos pertenecen al catálogo del videojuego: si cambia el juego, los anteriores dejan de valer
    const gameChanged = category !== 'ESPORT' || (dto.gameId !== undefined && dto.gameId !== current.gameId);
    const minRankId = dto.minRankId !== undefined ? dto.minRankId : gameChanged ? null : current.minRankId;
    const maxRankId = dto.maxRankId !== undefined ? dto.maxRankId : gameChanged ? null : current.maxRankId;
    await this.validateRanks(category === 'ESPORT' ? gameId : undefined, minRankId, maxRankId);

    if (dto.collectOnline !== undefined || dto.entryFee !== undefined || dto.currency !== undefined) {
      const collect = dto.collectOnline ?? current.collectOnline;
      await this.validateOnlineCollection(current.organizerId, collect, dto.entryFee ?? Number(current.entryFee));
      const pending = await this.prisma.tournamentRegistration.count({ where: { tournamentId: id, status: 'PAYMENT_PENDING' } });
      const feeChanged =
        (dto.entryFee !== undefined && dto.entryFee !== Number(current.entryFee)) ||
        (dto.currency !== undefined && dto.currency !== current.currency) ||
        (dto.collectOnline === false && current.collectOnline);
      if (pending && feeChanged) {
        throw new BadRequestException(`Hay ${pending} pagos de inscripción en curso: espera a que se completen o venzan para cambiar la cuota`);
      }
    }

    const { competitionName, changeReason, ...data } = dto;
    let competitionId: string | null | undefined;
    if (competitionName !== undefined) {
      if (!competitionName) competitionId = null;
      else {
        const slug = slugify(competitionName);
        competitionId = (
          await this.prisma.competition.upsert({
            where: { organizerId_slug: { organizerId: current.organizerId, slug } },
            update: {},
            create: { organizerId: current.organizerId, name: competitionName, slug },
          })
        ).id;
      }
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: {
        ...data,
        competitionId,
        sportId: category === 'SPORT' ? sportId : null,
        gameId: category === 'ESPORT' ? gameId : null,
        minRankId,
        maxRankId,
      },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'TOURNAMENT_UPDATED',
      entityType: 'Tournament',
      entityId: id,
      before: current,
      after: updated,
      reason: changeReason,
    });

    if (dto.startsAt && dto.startsAt.getTime() !== current.startsAt.getTime()) {
      await this.notifyParticipants(id, {
        type: 'SCHEDULE_CHANGED',
        title: `Cambio de horario: ${updated.name}`,
        body:
          `La partida ahora inicia el ${updated.startsAt.toISOString()}.` + (changeReason ? ` Motivo: ${changeReason}` : ''),
        link: `/torneos/${updated.slug}`,
        data: { previous: current.startsAt.toISOString(), next: updated.startsAt.toISOString() },
      });
    }
    this.realtime.emitToTournament(id, 'tournament:updated', { id });
    return updated;
  }

  async changeStatus(user: AuthUser, id: string, dto: ChangeStatusDto) {
    const current = await this.getManaged(user, id);
    if (!ALLOWED_TRANSITIONS[current.status].includes(dto.status)) {
      throw new BadRequestException(`No se puede pasar de ${current.status} a ${dto.status}`);
    }
    if (dto.status === 'IN_PROGRESS') {
      const approved = await this.prisma.tournamentRegistration.count({ where: { tournamentId: id, status: 'APPROVED' } });
      if (approved < 2) throw new BadRequestException('Se necesitan al menos 2 participantes aprobados para iniciar');
    }
    const updated = await this.prisma.$transaction(
      async (tx) => {
        // Al finalizar: fixture completo, campeón y posiciones finales
        if (dto.status === 'FINISHED') await this.matches.finalize(tx, current);
        const saved = await tx.tournament.update({
          where: { id },
          data: { status: dto.status, ...(dto.status === 'FINISHED' ? { endsAt: new Date() } : {}) },
        });
        // Estadísticas oficiales y logros: solo cuentan torneos finalizados (ya lo está dentro de la transacción)
        if (dto.status === 'FINISHED') await refreshPlayerStats(tx, await tournamentPlayerIds(tx, id));
        return saved;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
    );
    await this.audit.log({
      actorId: user.id,
      action: 'TOURNAMENT_STATUS_CHANGED',
      entityType: 'Tournament',
      entityId: id,
      before: { status: current.status },
      after: { status: updated.status },
    });
    const labels: Record<string, string> = { OPEN: 'publicada', IN_PROGRESS: 'en curso', FINISHED: 'finalizada' };
    if (dto.status !== 'OPEN') {
      await this.notifyParticipants(id, {
        type: 'TOURNAMENT_STATUS',
        title: `${updated.name} está ${labels[dto.status]}`,
        body: `El organizador cambió el estado de la partida a ${labels[dto.status]}.`,
        link: `/torneos/${updated.slug}`,
      });
    }
    if (dto.status === 'FINISHED') {
      await this.reputation.recalculateSafe(current.organizerId, 'Partida finalizada');
      // Ranking global: los resultados validados del torneo generan puntos (idempotente)
      await this.rankings.processTournament(id);
    }
    this.realtime.emitToTournament(id, 'tournament:status', { id, status: updated.status });
    return updated;
  }

  async cancel(user: AuthUser, id: string, dto: CancelTournamentDto) {
    const current = await this.getManaged(user, id);
    if (!ALLOWED_TRANSITIONS[current.status].includes('CANCELLED')) {
      throw new BadRequestException('La partida ya está finalizada o cancelada');
    }
    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledReason: dto.reason },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'TOURNAMENT_CANCELLED',
      entityType: 'Tournament',
      entityId: id,
      before: { status: current.status },
      after: { status: 'CANCELLED' },
      reason: dto.reason,
    });
    await this.notifyParticipants(
      id,
      {
        type: 'TOURNAMENT_CANCELLED',
        title: `Partida cancelada: ${updated.name}`,
        body: `Motivo: ${dto.reason}`,
        link: `/torneos/${updated.slug}`,
      },
      ['APPROVED', 'PENDING'],
    );
    await this.reputation.recalculateSafe(current.organizerId, 'Partida cancelada');
    this.realtime.emitToTournament(id, 'tournament:status', { id, status: 'CANCELLED' });
    return updated;
  }

  async uploadCover(user: AuthUser, id: string, file: Express.Multer.File | undefined) {
    const current = await this.getManaged(user, id);
    const url = await this.storage.uploadPublicImage(file, `tournaments/${id}`);
    await this.prisma.tournament.update({ where: { id }, data: { coverUrl: url } });
    await this.storage.deletePublicByUrl(current.coverUrl);
    return { coverUrl: url };
  }

  // =========================================================================== Inscripciones

  async requestRegistration(user: AuthUser, tournamentId: string, dto: RequestRegistrationDto) {
    if (!dto.acceptRules) throw new BadRequestException('Debes aceptar el reglamento y las condiciones de la partida');
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        organizer: { select: { userId: true } },
        minRank: { select: { rankOrder: true, rankName: true } },
        maxRank: { select: { rankOrder: true, rankName: true } },
      },
    });
    if (!t || t.status === 'DRAFT') throw new NotFoundException('Partida no encontrada');
    const hasRequirements = !!(t.gameId && (t.minLevel || t.maxLevel || t.minRankId || t.maxRankId));
    if (t.status !== 'OPEN') throw new BadRequestException('La inscripción para esta partida no está abierta');
    if (t.registrationDeadline < new Date()) throw new BadRequestException('La fecha límite de inscripción ya pasó');
    if (t.organizer.userId === user.id) throw new ForbiddenException('No puedes inscribirte en tu propia partida');

    let teamId: string | null = null;
    let playerId: string | null = null;
    if (t.mode === 'TEAM') {
      if (!dto.teamId) throw new BadRequestException('Esta partida es por equipos: selecciona un equipo');
      const team = await this.prisma.team.findUnique({
        where: { id: dto.teamId },
        include: { captain: { select: { userId: true } }, _count: { select: { members: { where: { leftAt: null } } } } },
      });
      if (!team || !team.isActive) throw new NotFoundException('Equipo no encontrado');
      if (team.ownerId !== user.id && team.captain?.userId !== user.id) {
        throw new ForbiddenException('Solo el dueño o capitán del equipo puede inscribirlo');
      }
      if (team._count.members < 1) throw new BadRequestException('El equipo no tiene integrantes');
      if (t.category === 'ESPORT' && team.gameId && team.gameId !== t.gameId) {
        throw new BadRequestException('El equipo está registrado para otro videojuego');
      }
      if (hasRequirements) {
        // Todos los integrantes actuales deben cumplir los requisitos de nivel/rango
        const members = await this.prisma.teamPlayer.findMany({
          where: { teamId: team.id, leftAt: null },
          select: {
            player: {
              select: {
                nickname: true,
                gameProfiles: { where: { gameId: t.gameId! }, select: { isActive: true, competitiveLevel: true, rank: { select: { rankOrder: true } } } },
              },
            },
          },
        });
        const failing = members
          .map((m) => ({ nick: m.player.nickname, problem: this.levelProblem(t, m.player.gameProfiles[0]) }))
          .filter((m) => m.problem);
        if (failing.length) {
          throw new BadRequestException(
            `Integrantes que no cumplen los requisitos: ${failing.map((f) => `${f.nick} (${f.problem})`).join('; ')}`,
          );
        }
      }
      teamId = team.id;
    } else {
      const player = await this.prisma.player.findUnique({ where: { userId: user.id } });
      if (!player) throw new BadRequestException('Tu cuenta no tiene ficha de jugador');
      if (player.isSuspended) throw new ForbiddenException('Tu ficha de jugador está suspendida');
      if (hasRequirements) {
        const profile = await this.prisma.playerGameProfile.findUnique({
          where: { playerId_gameId: { playerId: player.id, gameId: t.gameId! } },
          select: { isActive: true, competitiveLevel: true, rank: { select: { rankOrder: true } } },
        });
        if (!profile?.isActive) throw new BadRequestException('Agrega este videojuego a tu perfil gamer para inscribirte');
        const problem = this.levelProblem(t, profile);
        if (problem) throw new BadRequestException(`No cumples los requisitos de esta partida: ${problem}`);
      }
      playerId = player.id;
    }

    // Cuota cobrada en línea: se reserva el cupo y se abre el pago en la cuenta del organizador
    if (t.collectOnline && Number(t.entryFee) > 0) {
      return this.payments.registerWithPayment(user, t, { teamId, playerId, notes: dto.notes });
    }

    const existing = await this.prisma.tournamentRegistration.findFirst({
      where: { tournamentId, ...(teamId ? { teamId } : { playerId }) },
    });
    if (existing && existing.status !== 'WITHDRAWN' && existing.status !== 'REJECTED') {
      throw new ConflictException('Ya existe una solicitud de inscripción para esta partida');
    }
    // Los cupos reservados por pagos en curso también cuentan
    const approved = await this.prisma.tournamentRegistration.count({
      where: { tournamentId, status: { in: ['APPROVED', 'PAYMENT_PENDING'] } },
    });
    if (approved >= t.maxParticipants) throw new BadRequestException('No quedan cupos disponibles');

    const data = {
      status: 'PENDING' as const,
      requestedById: user.id,
      notes: dto.notes,
      feeAmount: t.entryFee,
      feeCurrency: t.currency,
    };
    const registration = existing
      ? await this.prisma.tournamentRegistration.update({ where: { id: existing.id }, data })
      : await this.prisma.tournamentRegistration.create({ data: { ...data, tournamentId, teamId, playerId } });

    await this.audit.log({
      actorId: user.id,
      action: 'REGISTRATION_REQUESTED',
      entityType: 'TournamentRegistration',
      entityId: registration.id,
    });
    await this.notifications.notify([
      {
        userId: t.organizer.userId,
        type: 'REGISTRATION_RECEIVED',
        title: `Nueva solicitud de inscripción`,
        body: `@${user.username} solicitó inscribirse en ${t.name}.`,
        link: `/dashboard/torneos/${t.id}`,
      },
      {
        userId: user.id,
        type: 'REGISTRATION_SUBMITTED',
        title: 'Solicitud enviada',
        body: `Tu solicitud para ${t.name} está pendiente de aprobación del organizador.`,
        link: `/torneos/${t.slug}`,
      },
    ]);
    this.realtime.emitToTournament(tournamentId, 'registration:changed', { tournamentId });
    return registration;
  }

  async withdraw(user: AuthUser, registrationId: string) {
    const reg = await this.prisma.tournamentRegistration.findUnique({
      where: { id: registrationId },
      include: { tournament: true, team: true },
    });
    if (!reg) throw new NotFoundException('Inscripción no encontrada');
    if (reg.requestedById !== user.id && reg.team?.ownerId !== user.id) {
      throw new ForbiddenException('No puedes retirar esta inscripción');
    }
    if (reg.tournament.status !== 'OPEN') throw new BadRequestException('Ya no es posible retirarse de esta partida');
    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registrationId },
      data: { status: 'WITHDRAWN' },
    });
    // Un pago en curso se anula; un pago ya confirmado se reembolsa según la política del organizador
    if (reg.status === 'PAYMENT_PENDING') await this.payments.cancelPending(registrationId, 'El participante retiró la inscripción');
    await this.audit.log({ actorId: user.id, action: 'REGISTRATION_WITHDRAWN', entityType: 'TournamentRegistration', entityId: reg.id });
    this.realtime.emitToTournament(reg.tournamentId, 'registration:changed', { tournamentId: reg.tournamentId });
    return updated;
  }

  async registrations(user: AuthUser, tournamentId: string, q: RegistrationListQuery) {
    const t = await this.getManaged(user, tournamentId);
    const where: Prisma.TournamentRegistrationWhereInput = {
      tournamentId,
      ...(q.status ? { status: q.status } : {}),
      // Filtro por nivel: solo inscripciones individuales con perfil activo del juego de la partida
      ...(q.level && t.gameId
        ? { player: { gameProfiles: { some: { gameId: t.gameId, isActive: true, competitiveLevel: q.level } } } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tournamentRegistration.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          requestedBy: { select: { username: true } },
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              country: true,
              _count: { select: { members: { where: { leftAt: null } } } },
            },
          },
          player: {
            select: {
              id: true,
              nickname: true,
              fullName: true,
              avatarUrl: true,
              country: true,
              // Solo el perfil gamer del videojuego de esta partida
              gameProfiles: {
                where: { gameId: t.gameId ?? '00000000-0000-0000-0000-000000000000', isActive: true },
                select: {
                  gameId: true,
                  competitiveLevel: true,
                  gamerTag: true,
                  platform: true,
                  verificationType: true,
                  verificationSource: true,
                  rank: { select: { rankName: true, rankOrder: true } },
                },
              },
              user: { select: { username: true } },
              statistics: {
                where: { gameId: t.gameId ?? '00000000-0000-0000-0000-000000000000' },
                select: { matchesPlayed: true, wins: true, winRate: true, tournamentsPlayed: true, tournamentsWon: true },
              },
            },
          },
        },
      }),
      this.prisma.tournamentRegistration.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  async decide(user: AuthUser, registrationId: string, dto: DecideRegistrationDto) {
    const reg = await this.prisma.tournamentRegistration.findUnique({
      where: { id: registrationId },
      include: { tournament: true },
    });
    if (!reg) throw new NotFoundException('Inscripción no encontrada');
    await assertCanManageOrganizer(this.prisma, user, reg.tournament.organizerId);
    if (reg.status === dto.status) return reg;
    if (reg.status === 'WITHDRAWN') throw new BadRequestException('El participante retiró su inscripción');
    if (reg.tournament.status !== 'OPEN' && dto.status === 'APPROVED') {
      throw new BadRequestException('Solo se aprueban inscripciones con la partida abierta');
    }
    // Rechazar una inscripción pagada devuelve el dinero antes de cambiar su estado
    let refunded = false;
    if (dto.status === 'REJECTED') {
      refunded = await this.payments.refundForRegistration(registrationId, dto.note ?? 'Inscripción rechazada por el organizador', user.id);
    }
    if (reg.status === 'PAYMENT_PENDING') {
      await this.payments.cancelPending(
        registrationId,
        dto.status === 'APPROVED' ? 'Aprobada por el organizador sin pago en línea' : 'Inscripción rechazada por el organizador',
      );
    }

    const updated = await this.prisma.$transaction(
      async (tx) => {
        if (dto.status === 'APPROVED') {
          const approved = await tx.tournamentRegistration.count({
            where: { tournamentId: reg.tournamentId, status: { in: ['APPROVED', 'PAYMENT_PENDING'] }, id: { not: registrationId } },
          });
          if (approved >= reg.tournament.maxParticipants) throw new BadRequestException('El cupo está completo');
        }
        return tx.tournamentRegistration.update({
          where: { id: registrationId },
          data: { status: dto.status, notes: dto.note ?? reg.notes },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      actorId: user.id,
      action: dto.status === 'APPROVED' ? 'REGISTRATION_APPROVED' : 'REGISTRATION_REJECTED',
      entityType: 'TournamentRegistration',
      entityId: registrationId,
      before: { status: reg.status },
      after: { status: dto.status },
      reason: dto.note,
    });
    await this.notifications.notify({
      userId: reg.requestedById,
      type: dto.status === 'APPROVED' ? 'REGISTRATION_APPROVED' : 'REGISTRATION_REJECTED',
      title: dto.status === 'APPROVED' ? '¡Inscripción aprobada!' : 'Inscripción rechazada',
      body:
        dto.status === 'APPROVED'
          ? `Ya estás dentro de ${reg.tournament.name}.`
          : `Tu solicitud para ${reg.tournament.name} fue rechazada.${refunded ? ' Se reembolsó tu pago.' : ''}${dto.note ? ` Motivo: ${dto.note}` : ''}`,
      link: `/torneos/${reg.tournament.slug}`,
    });
    this.realtime.emitToTournament(reg.tournamentId, 'registration:changed', { tournamentId: reg.tournamentId });
    return updated;
  }

  async myRegistrations(user: AuthUser) {
    return this.prisma.tournamentRegistration.findMany({
      where: {
        status: { not: 'WITHDRAWN' },
        OR: [{ requestedById: user.id }, { player: { userId: user.id } }, { team: { members: { some: { leftAt: null, player: { userId: user.id } } } } }],
      },
      orderBy: { tournament: { startsAt: 'desc' } },
      take: 100,
      select: {
        id: true,
        status: true,
        createdAt: true,
        team: { select: { name: true, slug: true, logoUrl: true } },
        payments: { where: { status: 'PENDING' }, select: { id: true, expiresAt: true }, take: 1 },
        tournament: { select: tournamentCardSelect },
      },
    }).then((rows) => rows.map((r) => ({ ...r, tournament: toCard(r.tournament) })));
  }

  // =========================================================================== Helpers

  /** Cobro en línea: requiere cuota mayor que cero y la cuenta de Mercado Pago conectada. */
  private async validateOnlineCollection(organizerId: string, collect: boolean | undefined, fee: number) {
    if (!collect) return;
    if (!(fee > 0)) throw new BadRequestException('Para cobrar en línea la cuota de inscripción debe ser mayor que cero');
    await this.payments.assertCanCollect(organizerId);
  }

  private async getManaged(user: AuthUser, id: string): Promise<Tournament> {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Partida no encontrada');
    await assertCanManageOrganizer(this.prisma, user, t.organizerId);
    return t;
  }

  private async validateDiscipline(category: string, sportId?: string | null, gameId?: string | null) {
    if (category === 'SPORT') {
      if (!sportId) throw new BadRequestException('Selecciona un deporte');
      const sport = await this.prisma.sport.findFirst({ where: { id: sportId, status: 'ACTIVE' } });
      if (!sport) throw new BadRequestException('Deporte no disponible');
    } else {
      if (!gameId) throw new BadRequestException('Selecciona un videojuego');
      const game = await this.prisma.game.findFirst({ where: { id: gameId, status: 'ACTIVE' } });
      if (!game) throw new BadRequestException('Videojuego no disponible');
    }
  }

  private validateSchedule(startsAt: Date, deadline: Date, mustBeFuture: boolean) {
    if (deadline > startsAt) throw new BadRequestException('La fecha límite de inscripción debe ser anterior al inicio');
    if (mustBeFuture && startsAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('La fecha de inicio debe ser futura');
    }
  }

  private validateFormat(format: string, max: number, groupCount?: number, qualifiers?: number) {
    if (format === 'GROUPS' || format === 'GROUPS_PLAYOFFS') {
      if (!groupCount) throw new BadRequestException('Indica el número de grupos');
      if (max < groupCount * 2) throw new BadRequestException('Cada grupo necesita al menos 2 participantes');
      if (format === 'GROUPS_PLAYOFFS' && !qualifiers) {
        throw new BadRequestException('Indica cuántos clasifican por grupo a los playoffs');
      }
    }
  }

  private validateLevels(min?: string, max?: string) {
    if (min && max && levelIndex(min) > levelIndex(max)) {
      throw new BadRequestException('El nivel mínimo no puede ser superior al máximo');
    }
  }

  /** Los rangos solo se comparan dentro del catálogo del videojuego de la partida. */
  private async validateRanks(gameId: string | undefined, minRankId?: string | null, maxRankId?: string | null) {
    if (!minRankId && !maxRankId) return;
    if (!gameId) throw new BadRequestException('Los requisitos de rango solo aplican a partidas de videojuegos');
    const ids = [minRankId, maxRankId].filter((x): x is string => !!x);
    const ranks = await this.prisma.gameRank.findMany({ where: { id: { in: ids }, gameId, status: 'ACTIVE' } });
    if (ranks.length !== new Set(ids).size) throw new BadRequestException('El rango no corresponde a este videojuego');
    const min = ranks.find((r) => r.id === minRankId);
    const max = ranks.find((r) => r.id === maxRankId);
    if (min && max && min.rankOrder > max.rankOrder) {
      throw new BadRequestException('El rango mínimo no puede ser superior al máximo');
    }
  }

  /**
   * Requisitos de nivel y rango de la partida para un jugador. Devuelve el motivo de incumplimiento o null.
   * Se evalúa sobre el perfil gamer activo del videojuego de la partida.
   */
  private levelProblem(
    t: { minLevel: string | null; maxLevel: string | null; minRank: { rankOrder: number; rankName: string } | null; maxRank: { rankOrder: number; rankName: string } | null },
    profile: { isActive: boolean; competitiveLevel: string; rank: { rankOrder: number } | null } | null | undefined,
  ): string | null {
    if (!profile?.isActive) return 'no tiene este videojuego en su perfil gamer';
    const lvl = levelIndex(profile.competitiveLevel);
    if ((t.minLevel && lvl < levelIndex(t.minLevel)) || (t.maxLevel && lvl > levelIndex(t.maxLevel))) {
      return 'su nivel competitivo no cumple los requisitos';
    }
    if (t.minRank || t.maxRank) {
      if (!profile.rank) return 'no declaró su rango en este videojuego';
      if (t.minRank && profile.rank.rankOrder < t.minRank.rankOrder) return `su rango es inferior a ${t.minRank.rankName}`;
      if (t.maxRank && profile.rank.rankOrder > t.maxRank.rankOrder) return `su rango supera ${t.maxRank.rankName}`;
    }
    return null;
  }

  // =========================================================================== Jugador destacado (MVP)

  /**
   * El organizador elige al jugador destacado de una partida finalizada. Genera el logro MVP por evento
   * (no por declaración del jugador) y lo retira si se corrige la elección y ya no lo respalda otra partida.
   */
  async setMvp(user: AuthUser, id: string, playerId: string | null | undefined) {
    const t = await this.getManaged(user, id);
    if (t.status !== 'FINISHED') throw new BadRequestException('El jugador destacado se elige al finalizar la partida');
    const next = playerId ?? null;
    if (next === t.mvpPlayerId) return { mvpPlayerId: next };
    if (next) {
      const ids = await tournamentPlayerIds(this.prisma, id);
      if (!ids.includes(next)) throw new BadRequestException('El jugador destacado debe haber participado en la partida');
    }
    const mvp = await this.prisma.achievement.findUnique({ where: { code: 'MVP' } });

    await this.prisma.$transaction(async (tx) => {
      await tx.tournament.update({ where: { id }, data: { mvpPlayerId: next } });
      if (!mvp) return;
      if (t.mvpPlayerId) {
        // Si el logro del anterior se originó en esta partida, se reasigna a otra en la que fue MVP o se retira
        const prev = await tx.playerAchievement.findFirst({ where: { playerId: t.mvpPlayerId, achievementId: mvp.id, gameId: null } });
        if (prev?.sourceRef === id) {
          const other = await tx.tournament.findFirst({ where: { mvpPlayerId: t.mvpPlayerId, id: { not: id }, status: 'FINISHED' } });
          if (other) await tx.playerAchievement.update({ where: { id: prev.id }, data: { sourceRef: other.id } });
          else await tx.playerAchievement.delete({ where: { id: prev.id } });
        }
      }
      if (next) {
        const has = await tx.playerAchievement.findFirst({ where: { playerId: next, achievementId: mvp.id, gameId: null } });
        if (!has) await tx.playerAchievement.create({ data: { playerId: next, achievementId: mvp.id, gameId: null, sourceRef: id } });
      }
      await this.audit.log(
        { actorId: user.id, action: 'TOURNAMENT_MVP_SET', entityType: 'Tournament', entityId: id, before: { mvpPlayerId: t.mvpPlayerId }, after: { mvpPlayerId: next } },
        tx,
      );
    });

    if (next) {
      const player = await this.prisma.player.findUnique({ where: { id: next }, select: { userId: true } });
      if (player?.userId) {
        await this.notifications.notify({
          userId: player.userId,
          type: 'TOURNAMENT_MVP',
          title: '¡Jugador destacado!',
          body: `El organizador te eligió jugador destacado de ${t.name}.`,
          link: `/torneos/${t.slug}`,
        });
      }
    }
    this.realtime.emitToTournament(id, 'tournament:status', { id, status: t.status });
    return { mvpPlayerId: next };
  }

  private async notifyParticipants(
    tournamentId: string,
    payload: { type: string; title: string; body: string; link?: string; data?: Prisma.InputJsonValue },
    statuses: ('APPROVED' | 'PENDING')[] = ['APPROVED'],
  ) {
    const regs = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId, status: { in: statuses } },
      select: { requestedById: true, player: { select: { userId: true } } },
    });
    const userIds = new Set<string>();
    for (const r of regs) {
      userIds.add(r.requestedById);
      if (r.player?.userId) userIds.add(r.player.userId);
    }
    await this.notifications.notify([...userIds].map((userId) => ({ userId, ...payload })));
  }
}
