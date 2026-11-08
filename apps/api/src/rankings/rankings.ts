import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Global,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { NotificationsService } from '../notifications/notifications.js';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import { paginate, PaginationQuery } from '../common/utils/index.js';
import { env } from '../config/env.js';
import { Platform, RankingType, ResultReportStatus, RuleStatus, SeasonStatus, TournamentMode } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import { isRankingSuspended, recomputeGame, ruleFor, scoringErrors, snapshotDay, syncTournament, trendOf, type TrendStatus } from './engine.js';

type Tx = Prisma.TransactionClient;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const csv = ({ value }: { value: unknown }) =>
  (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
    .map((v) => String(v).trim())
    .filter(Boolean);

export const REPORT_WINDOW_DAYS = 30;
const SNAPSHOT_INTERVAL_MS = 6 * 3_600_000;
const SEASON_TRANSITIONS: Record<SeasonStatus, SeasonStatus[]> = {
  DRAFT: ['SCHEDULED', 'ACTIVE'],
  SCHEDULED: ['DRAFT', 'ACTIVE'],
  ACTIVE: ['COMPLETED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

// =========================================================================== DTOs

export class RankingQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() game?: string;
  @ApiPropertyOptional({ enum: RankingType }) @IsOptional() @IsEnum(RankingType) type: RankingType = 'PLAYER';
  @ApiPropertyOptional({ description: 'ISO 3166-1 alfa-2' }) @IsOptional() @Transform(upper) @IsISO31661Alpha2() country?: string;
  @ApiPropertyOptional({ description: 'Temporada; sin ella, histórico acumulado' }) @IsOptional() @IsUUID() season?: string;
  @ApiPropertyOptional({ enum: Platform, description: 'Solo ranking individual' }) @IsOptional() @IsEnum(Platform) platform?: Platform;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) override pageSize: number = 25;
}

export class SeasonListQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() game?: string;
}

export class HistoryQuery {
  @ApiPropertyOptional({ enum: RankingType }) @IsOptional() @IsEnum(RankingType) type: RankingType = 'PLAYER';
  @ApiProperty() @IsUUID() game!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() season?: string;
}

export class CompareRankingQuery {
  @ApiPropertyOptional({ enum: RankingType }) @IsOptional() @IsEnum(RankingType) type: RankingType = 'PLAYER';
  @ApiProperty() @IsUUID() game!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() season?: string;
  @ApiProperty({ description: 'IDs separados por coma (2-4)', type: String })
  @Transform(csv)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class ResultReportDto {
  @ApiProperty() @IsUUID() matchId!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class SeasonDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(3, 80) name!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;
  @ApiProperty() @IsUUID() gameId!: string;
  @ApiPropertyOptional({ description: 'Vacío = global' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.toUpperCase() : value))
  @ValidateIf((_, v) => v !== null)
  @IsISO31661Alpha2()
  countryCode?: string | null;
  @ApiProperty() @Type(() => Date) @IsDate() startDate!: Date;
  @ApiProperty() @Type(() => Date) @IsDate() endDate!: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500) minimumMatches?: number;
  @ApiPropertyOptional({ enum: ['DRAFT', 'SCHEDULED'] }) @IsOptional() @IsIn(['DRAFT', 'SCHEDULED']) status?: 'DRAFT' | 'SCHEDULED';
}

export class UpdateSeasonDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(3, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() startDate?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() endDate?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500) minimumMatches?: number;
  @ApiPropertyOptional({ enum: SeasonStatus }) @IsOptional() @IsEnum(SeasonStatus) status?: SeasonStatus;
  @ApiProperty({ description: 'Justificación (auditoría)' }) @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class RuleDto {
  @ApiProperty() @IsUUID() gameId!: string;
  @ApiProperty({ enum: TournamentMode }) @IsEnum(TournamentMode) competitionType!: TournamentMode;
  @ApiProperty({ description: '{ win, draw, loss, participation, placement, tierMultiplier, maxPerTournament }' })
  @IsObject()
  scoringConfiguration!: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500) minimumMatches?: number;
  @ApiProperty() @Type(() => Date) @IsDate() effectiveFrom!: Date;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class UpdateRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsObject() scoringConfiguration?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500) minimumMatches?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() effectiveFrom?: Date;
  @ApiPropertyOptional({ enum: RuleStatus }) @IsOptional() @IsEnum(RuleStatus) status?: RuleStatus;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class RecalculateDto {
  @ApiPropertyOptional({ description: 'Sin juego: todos' }) @IsOptional() @IsUUID() gameId?: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class AuditQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) override pageSize: number = 25;
}

export class EventQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() game?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() participant?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() tournament?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) override pageSize: number = 30;
}

export class ReasonDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class AdjustmentDto {
  @ApiProperty({ enum: RankingType }) @IsEnum(RankingType) rankingType!: RankingType;
  @ApiProperty() @IsUUID() participantId!: string;
  @ApiProperty() @IsUUID() gameId!: string;
  @ApiProperty({ description: 'Puntos a sumar (negativo para restar)' }) @Type(() => Number) @IsInt() @Min(-10_000) @Max(10_000) points!: number;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class SuspensionDto {
  @ApiProperty({ enum: RankingType }) @IsEnum(RankingType) rankingType!: RankingType;
  @ApiProperty() @IsUUID() participantId!: string;
  @ApiProperty({ nullable: true, description: 'Hasta cuándo (null = levantar la suspensión)' })
  @Transform(({ value }) => (value === null || value === '' ? null : new Date(value as string)))
  @ValidateIf((_, v) => v !== null)
  @IsDate()
  until!: Date | null;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class TournamentRankingDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) tier?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRanked?: boolean;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class AdminTournamentQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() game?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
}

export class ReportQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ResultReportStatus }) @IsOptional() @IsEnum(ResultReportStatus) status?: ResultReportStatus;
}

export class ReviewReportDto {
  @ApiProperty({ enum: ['UPHELD', 'DISMISSED'] }) @IsIn(['UPHELD', 'DISMISSED']) decision!: 'UPHELD' | 'DISMISSED';
  @ApiProperty() @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) resolution!: string;
}

export class AnomalyQuery {
  @ApiProperty() @IsUUID() game!: string;
}

// =========================================================================== Motor (servicio)

/**
 * RankingEngineService: recibe torneos finalizados (resultados validados), genera eventos idempotentes,
 * recalcula posiciones globales/nacionales y de temporada, guarda snapshots y publica `ranking:updated`.
 * El cálculo corre tras confirmar el cierre del torneo, en su propia transacción con un bloqueo por juego;
 * un fallo no revierte el cierre: lo corrige cualquier recálculo posterior (idempotente).
 */
@Injectable()
export class RankingEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RankingEngineService.name);
  private timer?: ReturnType<typeof setInterval>;
  private warmup?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit() {
    if (env.isTest) return;
    // Snapshots periódicos: garantiza uno por día aunque no haya resultados nuevos (evolución semanal)
    this.warmup = setTimeout(() => void this.dailySnapshots(), 15_000);
    this.timer = setInterval(() => void this.dailySnapshots(), SNAPSHOT_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearTimeout(this.warmup);
    clearInterval(this.timer);
  }

  private async lock(tx: Tx, gameId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ranking:${gameId}`}))`;
  }

  /** Recalcula un juego dentro de una transacción con bloqueo (evita filas duplicadas por concurrencia). */
  async recompute(gameId: string, includeSeasons: string[] = [], before?: (tx: Tx) => Promise<unknown>) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, gameId);
        if (before) await before(tx);
        await recomputeGame(tx, gameId, includeSeasons);
      },
      { timeout: 120_000 },
    );
    this.realtime.broadcast('ranking:updated', { gameId });
  }

  /** Llamado al finalizar un torneo. Nunca lanza: el cierre del torneo ya está confirmado. */
  async processTournament(tournamentId: string) {
    try {
      const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId }, select: { gameId: true } });
      if (!t?.gameId) return;
      let changed = false;
      await this.recompute(t.gameId, [], async (tx) => {
        const r = await syncTournament(tx, tournamentId);
        changed = r.created + r.reverted + r.restored > 0;
      });
      if (changed) this.logger.log(`Ranking actualizado por el torneo ${tournamentId}`);
    } catch (e) {
      this.logger.error(`No se pudo actualizar el ranking del torneo ${tournamentId}: ${(e as Error).message}`);
    }
  }

  /** Reprocesa todos los torneos finalizados de los juegos indicados con las reglas vigentes. */
  async recalculate(gameIds: string[]) {
    const summary = { games: 0, tournaments: 0, created: 0, reverted: 0, restored: 0 };
    for (const gameId of gameIds) {
      await this.recompute(gameId, [], async (tx) => {
        const tournaments = await tx.tournament.findMany({ where: { gameId, status: 'FINISHED' }, select: { id: true } });
        for (const t of tournaments) {
          const r = await syncTournament(tx, t.id);
          summary.tournaments++;
          summary.created += r.created;
          summary.reverted += r.reverted;
          summary.restored += r.restored;
        }
      });
      summary.games++;
    }
    return summary;
  }

  async dailySnapshots() {
    try {
      const games = await this.prisma.game.findMany({ where: { rankingEvents: { some: {} } }, select: { id: true } });
      const today = snapshotDay();
      for (const g of games) {
        const has = await this.prisma.rankingSnapshot.count({ where: { gameId: g.id, snapshotDate: today } });
        if (!has) await this.recompute(g.id);
      }
    } catch (e) {
      this.logger.warn(`Snapshots diarios: ${(e as Error).message}`);
    }
  }
}

// =========================================================================== Consultas y administración

type Participant = {
  id: string;
  name: string;
  avatarUrl: string | null;
  country: string | null;
  username: string | null;
  slug: string | null;
  tag: string | null;
};

type Row = {
  participantId: string;
  countryCode: string | null;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  isProvisional: boolean;
  positionGlobal: number | null;
  positionCountry: number | null;
  lastCalculatedAt: Date;
};

const rowSelect = {
  countryCode: true,
  points: true,
  wins: true,
  losses: true,
  draws: true,
  matchesPlayed: true,
  tournamentsPlayed: true,
  tournamentsWon: true,
  isProvisional: true,
  positionGlobal: true,
  positionCountry: true,
  lastCalculatedAt: true,
} as const;

const METRICS = ['points', 'wins', 'tournamentsWon', 'tournamentsPlayed', 'matchesPlayed'] as const;

@Injectable()
export class RankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RankingEngineService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ helpers

  private async participants(type: RankingType, ids: string[]): Promise<Map<string, Participant>> {
    if (!ids.length) return new Map();
    if (type === 'PLAYER') {
      const list = await this.prisma.player.findMany({
        where: { id: { in: ids } },
        select: { id: true, nickname: true, avatarUrl: true, country: true, user: { select: { username: true } } },
      });
      return new Map(list.map((p) => [p.id, { id: p.id, name: p.nickname, avatarUrl: p.avatarUrl, country: p.country, username: p.user?.username ?? null, slug: null, tag: null }]));
    }
    const list = await this.prisma.team.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, logoUrl: true, country: true, slug: true, tag: true },
    });
    return new Map(list.map((t) => [t.id, { id: t.id, name: t.name, avatarUrl: t.logoUrl, country: t.country, username: null, slug: t.slug, tag: t.tag }]));
  }

  private async rows(type: RankingType, where: Prisma.PlayerRankingWhereInput, extra: { orderBy?: object[]; skip?: number; take?: number } = {}) {
    if (type === 'PLAYER') {
      const list = await this.prisma.playerRanking.findMany({ where, select: { ...rowSelect, playerId: true }, ...extra });
      return list.map(({ playerId, ...r }) => ({ ...r, participantId: playerId })) as Row[];
    }
    const { player: _ignored, ...teamWhere } = where as Prisma.PlayerRankingWhereInput;
    const list = await this.prisma.teamRanking.findMany({ where: teamWhere as Prisma.TeamRankingWhereInput, select: { ...rowSelect, teamId: true }, ...extra });
    return list.map(({ teamId, ...r }) => ({ ...r, participantId: teamId })) as Row[];
  }

  private count(type: RankingType, where: Prisma.PlayerRankingWhereInput) {
    if (type === 'PLAYER') return this.prisma.playerRanking.count({ where });
    const { player: _ignored, ...teamWhere } = where;
    return this.prisma.teamRanking.count({ where: teamWhere as Prisma.TeamRankingWhereInput });
  }

  /**
   * Evolución comparando snapshots: el último snapshot anterior a hoy frente a la posición actual.
   * En vista nacional, la posición previa es la del participante entre los de su país en ese snapshot.
   */
  private async trends(type: RankingType, gameId: string, seasonId: string | null, country: string | null, current: Row[]) {
    const out = new Map<string, { status: TrendStatus; delta: number }>();
    const prev = await this.prisma.rankingSnapshot.findFirst({
      where: { rankingType: type, gameId, seasonId, snapshotDate: { lt: snapshotDay() } },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });
    let previous = new Map<string, number>();
    if (prev) {
      const snaps = await this.prisma.rankingSnapshot.findMany({
        where: {
          rankingType: type,
          gameId,
          seasonId,
          snapshotDate: prev.snapshotDate,
          ...(country ? { countryCode: country } : { participantId: { in: current.map((r) => r.participantId) } }),
        },
        orderBy: { position: 'asc' },
        select: { participantId: true, position: true },
      });
      if (country) {
        // Posición nacional en el snapshot (mismo criterio de empates: igual posición global = igual puesto)
        let last = 0;
        let pos = 0;
        snaps.forEach((s, i) => {
          if (s.position !== last) pos = i + 1;
          last = s.position;
          previous.set(s.participantId, pos);
        });
      } else previous = new Map(snaps.map((s) => [s.participantId, s.position]));
    }
    for (const r of current) {
      out.set(r.participantId, trendOf(prev ? (previous.get(r.participantId) ?? null) : null, country ? r.positionCountry : r.positionGlobal));
    }
    return out;
  }

  private async resolveGame(gameId?: string) {
    if (gameId) {
      const g = await this.prisma.game.findUnique({ where: { id: gameId }, select: { id: true, name: true, slug: true, logoUrl: true } });
      if (!g) throw new NotFoundException('Videojuego no encontrado');
      return g;
    }
    // Por defecto: el primer juego (orden del catálogo) que ya tiene ranking
    const g =
      (await this.prisma.game.findFirst({
        where: { status: 'ACTIVE', OR: [{ playerRankings: { some: {} } }, { teamRankings: { some: {} } }] },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, slug: true, logoUrl: true },
      })) ?? (await this.prisma.game.findFirst({ where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true, logoUrl: true } }));
    if (!g) throw new NotFoundException('No hay videojuegos configurados');
    return g;
  }

  private async champions(season: { championPlayerId: string | null; championTeamId: string | null }) {
    const [p, t] = await Promise.all([
      this.participants('PLAYER', season.championPlayerId ? [season.championPlayerId] : []),
      this.participants('TEAM', season.championTeamId ? [season.championTeamId] : []),
    ]);
    return { player: season.championPlayerId ? (p.get(season.championPlayerId) ?? null) : null, team: season.championTeamId ? (t.get(season.championTeamId) ?? null) : null };
  }

  // ------------------------------------------------------------------ tabla pública

  async table(q: RankingQuery, fixed: { game?: string; country?: string | null; season?: string } = {}) {
    const seasonId = fixed.season ?? q.season ?? null;
    const season = seasonId ? await this.prisma.rankingSeason.findUnique({ where: { id: seasonId } }) : null;
    if (seasonId && (!season || season.status === 'DRAFT')) throw new NotFoundException('Temporada no encontrada');
    // En /rankings/seasons/{id} el juego es el de la temporada
    const game = await this.resolveGame(fixed.game ?? (fixed.season ? season!.gameId : q.game));
    if (season && season.gameId !== game.id) throw new BadRequestException('La temporada pertenece a otro videojuego');
    const country = fixed.country === null ? null : (fixed.country ?? q.country ?? null);
    const type = q.type;
    const platformFilter: Prisma.PlayerRankingWhereInput =
      type === 'PLAYER' && q.platform ? { player: { gameProfiles: { some: { gameId: game.id, platform: q.platform, isActive: true } } } } : {};
    const where: Prisma.PlayerRankingWhereInput = {
      gameId: game.id,
      seasonId,
      isProvisional: false,
      ...(country ? { countryCode: country } : {}),
      ...platformFilter,
    };
    const orderBy = [country ? { positionCountry: 'asc' } : { positionGlobal: 'asc' }, { points: 'desc' }];
    const [items, total, provisionalRows, latest] = await Promise.all([
      this.rows(type, where, { orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.count(type, where),
      q.page === 1 ? this.rows(type, { ...where, isProvisional: true }, { orderBy: [{ points: 'desc' }, { matchesPlayed: 'desc' }], take: 30 }) : Promise.resolve([] as Row[]),
      this.rows(type, { gameId: game.id, seasonId }, { orderBy: [{ lastCalculatedAt: 'desc' }], take: 1 }),
    ]);
    const info = await this.participants(type, [...items, ...provisionalRows].map((r) => r.participantId));
    const trends = await this.trends(type, game.id, seasonId, country, items);
    const minimum = season ? season.minimumMatches : (await ruleFor(this.prisma, game.id, type === 'PLAYER' ? 'INDIVIDUAL' : 'TEAM', new Date())).minimumMatches;
    // Los suspendidos no aparecen ni como provisionales
    const suspended = await this.suspendedIds(type, provisionalRows.map((r) => r.participantId));
    const shape = (r: Row) => ({
      position: country ? r.positionCountry : r.positionGlobal,
      ...r,
      participant: info.get(r.participantId) ?? null,
      trend: trends.get(r.participantId) ?? null,
    });
    return {
      game,
      type,
      country,
      season: season ? { ...season, champions: await this.champions(season) } : null,
      minimumMatches: minimum,
      updatedAt: latest[0]?.lastCalculatedAt ?? null,
      ...paginate(items.map(shape), total, q.page, q.pageSize),
      provisional: provisionalRows.filter((r) => !suspended.has(r.participantId)).map(shape),
    };
  }

  private async suspendedIds(type: RankingType, ids: string[]) {
    if (!ids.length) return new Set<string>();
    const now = new Date();
    if (type === 'PLAYER') {
      const list = await this.prisma.player.findMany({
        where: { id: { in: ids }, OR: [{ isSuspended: true }, { rankingSuspendedUntil: { gt: now } }, { user: { status: 'SUSPENDED' } }] },
        select: { id: true },
      });
      return new Set(list.map((p) => p.id));
    }
    const list = await this.prisma.team.findMany({ where: { id: { in: ids }, OR: [{ isActive: false }, { rankingSuspendedUntil: { gt: now } }] }, select: { id: true } });
    return new Set(list.map((t) => t.id));
  }

  async seasons(q: SeasonListQuery) {
    const list = await this.prisma.rankingSeason.findMany({
      where: { status: { not: 'DRAFT' }, ...(q.game ? { gameId: q.game } : {}) },
      orderBy: [{ startDate: 'desc' }],
      include: { game: { select: { id: true, name: true, slug: true } } },
    });
    return Promise.all(list.map(async (s) => ({ ...s, champions: await this.champions(s) })));
  }

  async rules(gameId?: string) {
    return this.prisma.rankingRule.findMany({
      where: { status: 'ACTIVE', ...(gameId ? { gameId } : {}) },
      orderBy: [{ gameId: 'asc' }, { competitionType: 'asc' }, { effectiveFrom: 'desc' }],
      include: { game: { select: { id: true, name: true } } },
    });
  }

  // ------------------------------------------------------------------ perfiles competitivos

  private async competitiveProfile(type: RankingType, id: string, country: string | null) {
    const rows =
      type === 'PLAYER'
        ? (await this.prisma.playerRanking.findMany({ where: { playerId: id }, select: { ...rowSelect, gameId: true, seasonId: true, playerId: true } })).map(({ playerId, ...r }) => ({ ...r, participantId: playerId }))
        : (await this.prisma.teamRanking.findMany({ where: { teamId: id }, select: { ...rowSelect, gameId: true, seasonId: true, teamId: true } })).map(({ teamId, ...r }) => ({ ...r, participantId: teamId }));
    const gameIds = [...new Set(rows.map((r) => r.gameId))];
    const seasonIds = rows.map((r) => r.seasonId).filter((s): s is string => !!s);
    const [games, seasons] = await Promise.all([
      this.prisma.game.findMany({ where: { id: { in: gameIds } }, select: { id: true, name: true, slug: true, logoUrl: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.rankingSeason.findMany({ where: { id: { in: seasonIds } }, orderBy: { startDate: 'desc' } }),
    ]);
    const out = [];
    for (const game of games) {
      const historic = rows.find((r) => r.gameId === game.id && r.seasonId === null) ?? null;
      const seasonRows = seasons
        .filter((s) => s.gameId === game.id)
        .map((s) => ({ season: s, row: rows.find((r) => r.seasonId === s.id)!, isChampion: (type === 'PLAYER' ? s.championPlayerId : s.championTeamId) === id }));
      // Temporada actual: la ACTIVE global o la de su país
      const current = seasonRows.find((s) => s.season.status === 'ACTIVE' && !s.season.countryCode) ?? seasonRows.find((s) => s.season.status === 'ACTIVE' && s.season.countryCode === country) ?? null;
      const trend = historic ? (await this.trends(type, game.id, null, null, [historic as Row])).get(id) : null;
      out.push({ game, historic, trend: trend ?? null, currentSeason: current, seasons: seasonRows.filter((s) => s.season.status !== 'DRAFT') });
    }
    const events = await this.prisma.rankingEvent.findMany({
      where: { rankingType: type, participantId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        eventType: true,
        pointsAwarded: true,
        placement: true,
        isReverted: true,
        revertReason: true,
        matchId: true,
        createdAt: true,
        game: { select: { id: true, name: true } },
        tournament: { select: { id: true, name: true, slug: true, endsAt: true } },
      },
    });
    return { games: out, events };
  }

  async playerProfile(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        country: true,
        rankingSuspendedUntil: true,
        user: { select: { username: true } },
        gameProfiles: { where: { isActive: true }, select: { game: { select: { id: true, name: true, slug: true } }, platform: true } },
      },
    });
    if (!player) throw new NotFoundException('Jugador no encontrado');
    const { rankingSuspendedUntil, ...rest } = player;
    return {
      player: { ...rest, username: player.user?.username ?? null, rankingSuspended: isRankingSuspended(rankingSuspendedUntil) },
      ...(await this.competitiveProfile('PLAYER', playerId, player.country)),
    };
  }

  async teamProfile(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        slug: true,
        tag: true,
        logoUrl: true,
        country: true,
        isActive: true,
        rankingSuspendedUntil: true,
        game: { select: { id: true, name: true } },
        members: {
          orderBy: { joinedAt: 'asc' },
          select: { joinedAt: true, leftAt: true, role: true, player: { select: { id: true, nickname: true, avatarUrl: true, user: { select: { username: true } } } } },
        },
        identityLog: { orderBy: { createdAt: 'desc' }, take: 20, select: { field: true, oldValue: true, newValue: true, createdAt: true } },
      },
    });
    if (!team) throw new NotFoundException('Equipo no encontrado');
    const { members, identityLog, rankingSuspendedUntil, ...rest } = team;
    return {
      team: { ...rest, rankingSuspended: isRankingSuspended(rankingSuspendedUntil) },
      currentMembers: members.filter((m) => !m.leftAt),
      formerMembers: members.filter((m) => m.leftAt),
      identityHistory: identityLog,
      ...(await this.competitiveProfile('TEAM', teamId, team.country)),
    };
  }

  /** Serie de snapshots (posición y puntos), resumen semanal y posición final por temporada. */
  async history(participantId: string, q: HistoryQuery) {
    const snaps = await this.prisma.rankingSnapshot.findMany({
      where: { rankingType: q.type, participantId, gameId: q.game, seasonId: q.season ?? null },
      orderBy: { snapshotDate: 'desc' },
      take: 366,
      select: { snapshotDate: true, points: true, position: true },
    });
    snaps.reverse();
    const weekly = new Map<string, { week: string; points: number; position: number }>();
    for (const s of snaps) {
      const d = new Date(s.snapshotDate);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // lunes de esa semana
      const week = d.toISOString().slice(0, 10);
      weekly.set(week, { week, points: s.points, position: s.position });
    }
    const seasonRows =
      q.type === 'PLAYER'
        ? await this.prisma.playerRanking.findMany({ where: { playerId: participantId, gameId: q.game, seasonId: { not: null } }, select: { ...rowSelect, season: true } })
        : await this.prisma.teamRanking.findMany({ where: { teamId: participantId, gameId: q.game, seasonId: { not: null } }, select: { ...rowSelect, season: true } });
    return {
      snapshots: snaps.map((s) => ({ date: s.snapshotDate.toISOString().slice(0, 10), points: s.points, position: s.position })),
      weekly: [...weekly.values()],
      seasons: seasonRows
        .filter((r) => r.season && r.season.status !== 'DRAFT')
        .sort((a, b) => a.season!.startDate.getTime() - b.season!.startDate.getTime())
        .map((r) => ({ season: { id: r.season!.id, name: r.season!.name, status: r.season!.status, countryCode: r.season!.countryCode }, position: r.positionGlobal, points: r.points, isProvisional: r.isProvisional })),
    };
  }

  async compare(q: CompareRankingQuery) {
    const ids = [...new Set(q.ids)];
    if (ids.length < 2 || ids.length > 4) throw new BadRequestException('Compara entre 2 y 4 participantes');
    const game = await this.resolveGame(q.game);
    const seasonId = q.season ?? null;
    const rows = await this.rows(q.type, { gameId: game.id, seasonId, ...(q.type === 'PLAYER' ? { playerId: { in: ids } } : { teamId: { in: ids } }) } as Prisma.PlayerRankingWhereInput);
    const info = await this.participants(q.type, ids);
    const missing = ids.filter((id) => !info.has(id));
    if (missing.length) throw new NotFoundException('Algún participante no existe');
    const items = await Promise.all(
      ids.map(async (id) => ({
        participant: info.get(id)!,
        row: rows.find((r) => r.participantId === id) ?? null,
        history: (await this.history(id, { type: q.type, game: game.id, season: q.season })).weekly,
      })),
    );
    const leaders: Record<string, string[]> = {};
    for (const m of METRICS) {
      const best = Math.max(...items.map((i) => i.row?.[m] ?? 0));
      leaders[m] = best > 0 ? items.filter((i) => (i.row?.[m] ?? 0) === best).map((i) => i.participant.id) : [];
    }
    const positions = items.map((i) => i.row?.positionGlobal).filter((p): p is number => typeof p === 'number');
    leaders.position = positions.length ? items.filter((i) => i.row?.positionGlobal === Math.min(...positions)).map((i) => i.participant.id) : [];
    return { game, type: q.type, seasonId, items, leaders };
  }

  // ------------------------------------------------------------------ reportes de resultados

  async report(user: AuthUser, dto: ResultReportDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
      select: {
        id: true,
        tournament: { select: { id: true, name: true, status: true, isRanked: true, gameId: true, endsAt: true } },
        participants: { select: { registration: { select: { playerId: true, team: { select: { ownerId: true } } } } } },
        lineups: { select: { player: { select: { userId: true } } } },
      },
    });
    if (!match) throw new NotFoundException('Encuentro no encontrado');
    const t = match.tournament;
    if (t.status !== 'FINISHED' || !t.isRanked || !t.gameId) throw new BadRequestException('Solo se revisan resultados de torneos finalizados que puntúan en el ranking');
    if (t.endsAt && Date.now() - t.endsAt.getTime() > REPORT_WINDOW_DAYS * 864e5) {
      throw new BadRequestException(`El plazo para reportar resultados es de ${REPORT_WINDOW_DAYS} días desde el cierre del torneo`);
    }
    const player = await this.prisma.player.findUnique({ where: { userId: user.id }, select: { id: true } });
    const involved =
      match.participants.some((p) => (player && p.registration.playerId === player.id) || p.registration.team?.ownerId === user.id) ||
      match.lineups.some((l) => l.player.userId === user.id);
    if (!involved) throw new ForbiddenException('Solo los participantes del encuentro pueden reportar su resultado');
    const open = await this.prisma.rankingResultReport.count({ where: { matchId: match.id, reporterId: user.id, status: 'OPEN' } });
    if (open) throw new ConflictException('Ya tienes un reporte en revisión para este encuentro');
    const created = await this.prisma.rankingResultReport.create({ data: { matchId: match.id, reporterId: user.id, reason: dto.reason } });
    const admins = await this.prisma.user.findMany({ where: { role: 'SUPERADMIN', status: 'ACTIVE' }, select: { id: true } });
    await this.notifications.notify(
      admins.map((a) => ({
        userId: a.id,
        type: 'RANKING_REPORT',
        title: 'Resultado reportado para revisión',
        body: `${user.username} reportó un resultado de ${t.name}.`,
        link: '/admin/rankings/revision',
      })),
    );
    return created;
  }

  myReports(user: AuthUser) {
    return this.prisma.rankingResultReport.findMany({
      where: { reporterId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { match: { select: { id: true, round: true, tournament: { select: { name: true, slug: true } } } } },
    });
  }

  // ------------------------------------------------------------------ administración

  private auditLog(tx: Tx | PrismaService, adminId: string, action: string, entityType: string, entityId: string, previousValue: unknown, newValue: unknown, reason: string) {
    return tx.rankingAuditLog.create({
      data: {
        administratorId: adminId,
        action,
        entityType,
        entityId,
        previousValue: previousValue === undefined || previousValue === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(previousValue)) as Prisma.InputJsonValue),
        newValue: newValue === undefined || newValue === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(newValue)) as Prisma.InputJsonValue),
        reason,
      },
    });
  }

  async adminSeasons(q: SeasonListQuery) {
    const list = await this.prisma.rankingSeason.findMany({
      where: q.game ? { gameId: q.game } : {},
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      include: { game: { select: { id: true, name: true } }, _count: { select: { playerRankings: true, teamRankings: true } } },
    });
    return Promise.all(list.map(async (s) => ({ ...s, champions: await this.champions(s) })));
  }

  private async assertNoActiveOverlap(gameId: string, countryCode: string | null, exceptId?: string) {
    const other = await this.prisma.rankingSeason.findFirst({
      where: { gameId, countryCode, status: 'ACTIVE', ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { name: true },
    });
    if (other) throw new ConflictException(`Ya hay una temporada activa con el mismo alcance: ${other.name}. Ciérrala antes de activar otra`);
  }

  async createSeason(admin: AuthUser, dto: SeasonDto) {
    if (dto.endDate <= dto.startDate) throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio');
    const game = await this.prisma.game.findUnique({ where: { id: dto.gameId }, select: { id: true } });
    if (!game) throw new NotFoundException('Videojuego no encontrado');
    const rule = await ruleFor(this.prisma, dto.gameId, 'INDIVIDUAL', dto.startDate);
    const season = await this.prisma.rankingSeason.create({
      data: {
        name: dto.name,
        description: dto.description,
        gameId: dto.gameId,
        countryCode: dto.countryCode ?? null,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: dto.status ?? 'DRAFT',
        minimumMatches: dto.minimumMatches ?? rule.minimumMatches,
        scoringRulesVersion: rule.version,
      },
    });
    await this.auditLog(this.prisma, admin.id, 'SEASON_CREATED', 'RankingSeason', season.id, null, season, 'Alta de temporada');
    return season;
  }

  async updateSeason(admin: AuthUser, id: string, dto: UpdateSeasonDto) {
    const current = await this.prisma.rankingSeason.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Temporada no encontrada');
    const frozen = current.status === 'COMPLETED' || current.status === 'ARCHIVED';
    if (frozen && (dto.startDate || dto.endDate || dto.minimumMatches !== undefined)) {
      throw new BadRequestException('Una temporada cerrada conserva sus fechas y requisitos');
    }
    const status = dto.status && dto.status !== current.status ? dto.status : undefined;
    if (status && !SEASON_TRANSITIONS[current.status].includes(status)) throw new BadRequestException(`No se puede pasar de ${current.status} a ${status}`);
    const startDate = dto.startDate ?? current.startDate;
    const endDate = dto.endDate ?? current.endDate;
    if (endDate <= startDate) throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio');
    if (status === 'ACTIVE') await this.assertNoActiveOverlap(current.gameId, current.countryCode, id);

    const data: Prisma.RankingSeasonUpdateInput = {
      name: dto.name,
      description: dto.description,
      startDate: dto.startDate,
      endDate: dto.endDate,
      minimumMatches: dto.minimumMatches,
    };
    if (status === 'ACTIVE') data.scoringRulesVersion = (await ruleFor(this.prisma, current.gameId, 'INDIVIDUAL', new Date())).version;

    if (status === 'COMPLETED') {
      // Cierre: cálculo final con la temporada incluida, campeones y congelado (ya no se recalcula)
      await this.engine.recompute(current.gameId, [id], async (tx) => {
        await tx.rankingSeason.update({ where: { id }, data });
      });
      const [player, team] = await Promise.all([
        this.prisma.playerRanking.findFirst({ where: { seasonId: id, positionGlobal: 1 }, orderBy: [{ points: 'desc' }, { wins: 'desc' }], select: { playerId: true } }),
        this.prisma.teamRanking.findFirst({ where: { seasonId: id, positionGlobal: 1 }, orderBy: [{ points: 'desc' }, { wins: 'desc' }], select: { teamId: true } }),
      ]);
      const updated = await this.prisma.rankingSeason.update({
        where: { id },
        data: { status: 'COMPLETED', championPlayerId: player?.playerId ?? null, championTeamId: team?.teamId ?? null },
      });
      await this.auditLog(this.prisma, admin.id, 'SEASON_COMPLETED', 'RankingSeason', id, current, updated, dto.reason);
      await this.notifyChampions(updated);
      return updated;
    }

    const updated = await this.prisma.rankingSeason.update({ where: { id }, data: { ...data, status } });
    await this.auditLog(this.prisma, admin.id, status ? `SEASON_${status}` : 'SEASON_UPDATED', 'RankingSeason', id, current, updated, dto.reason);
    if (updated.status === 'ACTIVE') await this.engine.recompute(current.gameId);
    return updated;
  }

  private async notifyChampions(season: { id: string; name: string; championPlayerId: string | null; championTeamId: string | null }) {
    const userIds: string[] = [];
    if (season.championPlayerId) {
      const p = await this.prisma.player.findUnique({ where: { id: season.championPlayerId }, select: { userId: true } });
      if (p?.userId) userIds.push(p.userId);
    }
    if (season.championTeamId) {
      const t = await this.prisma.team.findUnique({ where: { id: season.championTeamId }, select: { ownerId: true } });
      if (t) userIds.push(t.ownerId);
    }
    await this.notifications.notify(
      [...new Set(userIds)].map((userId) => ({
        userId,
        type: 'RANKING_SEASON',
        title: `Campeón de ${season.name}`,
        body: 'Terminaste la temporada en el primer puesto del ranking.',
        link: `/rankings?season=${season.id}`,
      })),
    );
  }

  adminRules(gameId?: string) {
    return this.prisma.rankingRule.findMany({
      where: gameId ? { gameId } : {},
      orderBy: [{ gameId: 'asc' }, { competitionType: 'asc' }, { version: 'desc' }],
      include: { game: { select: { id: true, name: true } } },
    });
  }

  async createRule(admin: AuthUser, dto: RuleDto) {
    const errors = scoringErrors(dto.scoringConfiguration);
    if (errors.length) throw new BadRequestException(errors);
    const game = await this.prisma.game.findUnique({ where: { id: dto.gameId }, select: { id: true } });
    if (!game) throw new NotFoundException('Videojuego no encontrado');
    const rule = await this.prisma.$transaction(async (tx) => {
      const last = await tx.rankingRule.aggregate({ where: { gameId: dto.gameId, competitionType: dto.competitionType }, _max: { version: true } });
      return tx.rankingRule.create({
        data: {
          gameId: dto.gameId,
          competitionType: dto.competitionType,
          scoringConfiguration: dto.scoringConfiguration as Prisma.InputJsonValue,
          minimumMatches: dto.minimumMatches ?? 5,
          effectiveFrom: dto.effectiveFrom,
          version: (last._max.version ?? 0) + 1,
          status: 'DRAFT',
        },
      });
    });
    await this.auditLog(this.prisma, admin.id, 'RULE_CREATED', 'RankingRule', rule.id, null, rule, dto.reason);
    return rule;
  }

  /**
   * Una regla activa es inmutable (trazabilidad de los puntos ya otorgados con esa versión): solo puede
   * retirarse. Activar o retirar una versión recalcula el ranking del juego.
   */
  async updateRule(admin: AuthUser, id: string, dto: UpdateRuleDto) {
    const current = await this.prisma.rankingRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Regla no encontrada');
    const editsConfig = dto.scoringConfiguration !== undefined || dto.minimumMatches !== undefined || dto.effectiveFrom !== undefined;
    if (editsConfig && current.status !== 'DRAFT') throw new BadRequestException('Solo se editan reglas en borrador: crea una nueva versión');
    if (dto.scoringConfiguration) {
      const errors = scoringErrors(dto.scoringConfiguration);
      if (errors.length) throw new BadRequestException(errors);
    }
    const status = dto.status && dto.status !== current.status ? dto.status : undefined;
    if (status === 'DRAFT') throw new BadRequestException('Una regla publicada no vuelve a borrador');
    const updated = await this.prisma.rankingRule.update({
      where: { id },
      data: {
        scoringConfiguration: dto.scoringConfiguration as Prisma.InputJsonValue | undefined,
        minimumMatches: dto.minimumMatches,
        effectiveFrom: dto.effectiveFrom,
        status,
      },
    });
    await this.auditLog(this.prisma, admin.id, status ? `RULE_${status}` : 'RULE_UPDATED', 'RankingRule', id, current, updated, dto.reason);
    let recalculation = null;
    if (status) {
      recalculation = await this.engine.recalculate([current.gameId]);
      await this.auditLog(this.prisma, admin.id, 'RECALCULATED', 'Game', current.gameId, null, recalculation, `Cambio de regla v${current.version}: ${dto.reason}`);
    }
    return { ...updated, recalculation };
  }

  async recalculate(admin: AuthUser, dto: RecalculateDto) {
    const games = dto.gameId
      ? [dto.gameId]
      : (await this.prisma.game.findMany({ where: { OR: [{ tournaments: { some: { status: 'FINISHED' } } }, { rankingEvents: { some: {} } }] }, select: { id: true } })).map((g) => g.id);
    const summary = await this.engine.recalculate(games);
    await this.auditLog(this.prisma, admin.id, 'RECALCULATED', 'Game', dto.gameId ?? 'ALL', null, summary, dto.reason);
    return summary;
  }

  async audit(q: AuditQuery) {
    const where: Prisma.RankingAuditLogWhereInput = q.entityType ? { entityType: q.entityType } : {};
    const [items, total] = await Promise.all([
      this.prisma.rankingAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { administrator: { select: { username: true } } },
      }),
      this.prisma.rankingAuditLog.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  async events(q: EventQuery) {
    const where: Prisma.RankingEventWhereInput = {
      ...(q.game ? { gameId: q.game } : {}),
      ...(q.participant ? { participantId: q.participant } : {}),
      ...(q.tournament ? { tournamentId: q.tournament } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.rankingEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          game: { select: { name: true } },
          tournament: { select: { name: true, slug: true } },
          // Quién confirmó el resultado que originó el evento
          match: { select: { round: true, results: { where: { status: 'VALIDATED' }, orderBy: { version: 'desc' }, take: 1, select: { version: true, confirmedBy: { select: { username: true } } } } } },
        },
      }),
      this.prisma.rankingEvent.count({ where }),
    ]);
    const players = await this.participants('PLAYER', items.filter((e) => e.rankingType === 'PLAYER').map((e) => e.participantId));
    const teams = await this.participants('TEAM', items.filter((e) => e.rankingType === 'TEAM').map((e) => e.participantId));
    return paginate(
      items.map((e) => ({ ...e, participant: (e.rankingType === 'PLAYER' ? players : teams).get(e.participantId) ?? null })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async revertEvent(admin: AuthUser, id: string, dto: ReasonDto) {
    const event = await this.prisma.rankingEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.isReverted && event.revertedById) throw new BadRequestException('El evento ya fue revertido por un administrador');
    await this.engine.recompute(event.gameId, [], async (tx) => {
      await tx.rankingEvent.update({ where: { id }, data: { isReverted: true, revertedById: admin.id, revertReason: dto.reason, revertedAt: new Date() } });
      await this.auditLog(tx, admin.id, 'EVENT_REVERTED', 'RankingEvent', id, { isReverted: event.isReverted, points: event.pointsAwarded }, { isReverted: true }, dto.reason);
    });
    return { ok: true };
  }

  async adjust(admin: AuthUser, dto: AdjustmentDto) {
    if (dto.points === 0) throw new BadRequestException('El ajuste no puede ser 0');
    const exists =
      dto.rankingType === 'PLAYER'
        ? await this.prisma.player.count({ where: { id: dto.participantId } })
        : await this.prisma.team.count({ where: { id: dto.participantId } });
    if (!exists) throw new NotFoundException('Participante no encontrado');
    const rule = await ruleFor(this.prisma, dto.gameId, dto.rankingType === 'PLAYER' ? 'INDIVIDUAL' : 'TEAM', new Date());
    let created = null as Awaited<ReturnType<typeof this.prisma.rankingEvent.create>> | null;
    await this.engine.recompute(dto.gameId, [], async (tx) => {
      created = await tx.rankingEvent.create({
        data: {
          eventType: 'ADJUSTMENT',
          rankingType: dto.rankingType,
          participantId: dto.participantId,
          gameId: dto.gameId,
          pointsAwarded: dto.points,
          scoringRulesVersion: rule.version,
          eventReference: `adj:${randomUUID()}`,
        },
      });
      await this.auditLog(tx, admin.id, 'POINTS_ADJUSTED', dto.rankingType === 'PLAYER' ? 'Player' : 'Team', dto.participantId, null, { gameId: dto.gameId, points: dto.points, eventId: created.id }, dto.reason);
    });
    return created;
  }

  async suspend(admin: AuthUser, dto: SuspensionDto) {
    if (dto.until && dto.until <= new Date()) throw new BadRequestException('La suspensión debe terminar en el futuro');
    const current =
      dto.rankingType === 'PLAYER'
        ? await this.prisma.player.findUnique({ where: { id: dto.participantId }, select: { rankingSuspendedUntil: true } })
        : await this.prisma.team.findUnique({ where: { id: dto.participantId }, select: { rankingSuspendedUntil: true } });
    if (!current) throw new NotFoundException('Participante no encontrado');
    if (dto.rankingType === 'PLAYER') await this.prisma.player.update({ where: { id: dto.participantId }, data: { rankingSuspendedUntil: dto.until } });
    else await this.prisma.team.update({ where: { id: dto.participantId }, data: { rankingSuspendedUntil: dto.until } });
    await this.auditLog(
      this.prisma,
      admin.id,
      dto.until ? 'PARTICIPANT_SUSPENDED' : 'SUSPENSION_LIFTED',
      dto.rankingType === 'PLAYER' ? 'Player' : 'Team',
      dto.participantId,
      { until: current.rankingSuspendedUntil },
      { until: dto.until },
      dto.reason,
    );
    // Recalcula los juegos donde participa (su elegibilidad cambia)
    const games = await this.prisma.rankingEvent.findMany({ where: { rankingType: dto.rankingType, participantId: dto.participantId }, distinct: ['gameId'], select: { gameId: true } });
    for (const g of games) await this.engine.recompute(g.gameId);
    return { until: dto.until };
  }

  async adminTournaments(q: AdminTournamentQuery) {
    const where: Prisma.TournamentWhereInput = {
      category: 'ESPORT',
      gameId: q.game ? q.game : { not: null },
      status: { not: 'CANCELLED' },
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          mode: true,
          tier: true,
          isRanked: true,
          startsAt: true,
          game: { select: { name: true } },
          organizer: { select: { displayName: true } },
          _count: { select: { rankingEvents: { where: { isReverted: false } } } },
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  /** Nivel del torneo y si puntúa: lo decide el SUPERADMIN (el organizador no altera el ranking). */
  async updateTournament(admin: AuthUser, id: string, dto: TournamentRankingDto) {
    const current = await this.prisma.tournament.findUnique({ where: { id }, select: { id: true, tier: true, isRanked: true, gameId: true, status: true } });
    if (!current) throw new NotFoundException('Partida no encontrada');
    if (!current.gameId) throw new BadRequestException('Solo las partidas de videojuegos puntúan en el ranking');
    if (dto.tier === undefined && dto.isRanked === undefined) throw new BadRequestException('Indica el nivel o si puntúa');
    const updated = await this.prisma.tournament.update({ where: { id }, data: { tier: dto.tier, isRanked: dto.isRanked }, select: { id: true, tier: true, isRanked: true } });
    await this.auditLog(this.prisma, admin.id, 'TOURNAMENT_RANKING_UPDATED', 'Tournament', id, { tier: current.tier, isRanked: current.isRanked }, updated, dto.reason);
    if (current.status === 'FINISHED') await this.engine.recompute(current.gameId, [], (tx) => syncTournament(tx, id));
    return updated;
  }

  async reports(q: ReportQuery) {
    const where: Prisma.RankingResultReportWhereInput = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.rankingResultReport.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          reporter: { select: { username: true } },
          match: {
            select: {
              id: true,
              round: true,
              bracket: true,
              tournament: { select: { id: true, name: true, slug: true, game: { select: { name: true } } } },
              participants: { orderBy: { slot: 'asc' }, select: { slot: true, score: true, isWinner: true, registration: { select: { player: { select: { nickname: true } }, team: { select: { name: true } } } } } },
              results: { orderBy: { version: 'desc' }, select: { version: true, status: true, scores: true, correctionReason: true, createdAt: true, confirmedBy: { select: { username: true } } } },
              _count: { select: { rankingEvents: { where: { isReverted: false } } } },
            },
          },
        },
      }),
      this.prisma.rankingResultReport.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  /** Procede: revierte los eventos de ranking del encuentro (el resultado original queda intacto). */
  async reviewReport(admin: AuthUser, id: string, dto: ReviewReportDto) {
    const report = await this.prisma.rankingResultReport.findUnique({
      where: { id },
      include: { match: { select: { tournament: { select: { gameId: true, name: true } } } } },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (report.status !== 'OPEN') throw new BadRequestException('El reporte ya fue revisado');
    const gameId = report.match.tournament.gameId!;
    let reverted = 0;
    await this.engine.recompute(gameId, [], async (tx) => {
      if (dto.decision === 'UPHELD') {
        const r = await tx.rankingEvent.updateMany({
          where: { matchId: report.matchId, isReverted: false },
          data: { isReverted: true, revertedById: admin.id, revertReason: `Reporte de resultado: ${dto.resolution}`, revertedAt: new Date() },
        });
        reverted = r.count;
      }
      await tx.rankingResultReport.update({ where: { id }, data: { status: dto.decision, resolution: dto.resolution, reviewedById: admin.id, reviewedAt: new Date() } });
      await this.auditLog(tx, admin.id, `REPORT_${dto.decision}`, 'RankingResultReport', id, { status: 'OPEN' }, { status: dto.decision, revertedEvents: reverted }, dto.resolution);
    });
    await this.notifications.notify({
      userId: report.reporterId,
      type: 'RANKING_REPORT',
      title: dto.decision === 'UPHELD' ? 'Tu reporte de resultado procede' : 'Tu reporte de resultado fue desestimado',
      body: `${report.match.tournament.name}: ${dto.resolution}`,
      link: '/dashboard/ranking',
    });
    return { status: dto.decision, revertedEvents: reverted };
  }

  /**
   * Patrones anómalos (señales para revisión, no sanciones automáticas):
   * - Enfrentamientos repetidos: la misma pareja se cruza ≥ 3 veces en 90 días y siempre gana el mismo.
   * - Concentración: ≥ 80 % de los puntos de un participante provienen de torneos de un único organizador.
   */
  async anomalies(q: AnomalyQuery) {
    const since = new Date(Date.now() - 90 * 864e5);
    const matches = await this.prisma.match.findMany({
      where: { status: 'COMPLETED', tournament: { gameId: q.game, status: 'FINISHED', isRanked: true, endsAt: { gte: since } } },
      select: { tournamentId: true, participants: { select: { isWinner: true, registration: { select: { playerId: true, teamId: true } } } } },
    });
    const pairs = new Map<string, { a: string; b: string; count: number; winners: Set<string>; tournaments: Set<string> }>();
    for (const m of matches) {
      if (m.participants.length !== 2) continue;
      const keys = m.participants.map((p) => (p.registration.teamId ? `TEAM:${p.registration.teamId}` : `PLAYER:${p.registration.playerId}`));
      const [a, b] = [...keys].sort();
      const pair = pairs.get(`${a}|${b}`) ?? { a, b, count: 0, winners: new Set<string>(), tournaments: new Set<string>() };
      pair.count++;
      pair.tournaments.add(m.tournamentId);
      const winner = m.participants.findIndex((p) => p.isWinner === true);
      pair.winners.add(winner === -1 ? 'DRAW' : keys[winner]);
      pairs.set(`${a}|${b}`, pair);
    }
    const flaggedPairs = [...pairs.values()].filter((p) => p.count >= 3 && p.winners.size === 1 && !p.winners.has('DRAW'));

    const events = await this.prisma.rankingEvent.findMany({
      where: { gameId: q.game, isReverted: false, tournamentId: { not: null }, createdAt: { gte: new Date(Date.now() - 365 * 864e5) } },
      select: { rankingType: true, participantId: true, pointsAwarded: true, tournamentId: true, tournament: { select: { organizerId: true, organizer: { select: { displayName: true } } } } },
    });
    const byParticipant = new Map<string, { total: number; tournaments: Set<string>; byOrganizer: Map<string, { name: string; points: number }> }>();
    for (const e of events) {
      const key = `${e.rankingType}:${e.participantId}`;
      const agg = byParticipant.get(key) ?? { total: 0, tournaments: new Set<string>(), byOrganizer: new Map() };
      agg.total += e.pointsAwarded;
      agg.tournaments.add(e.tournamentId!);
      const org = agg.byOrganizer.get(e.tournament!.organizerId) ?? { name: e.tournament!.organizer.displayName, points: 0 };
      org.points += e.pointsAwarded;
      agg.byOrganizer.set(e.tournament!.organizerId, org);
      byParticipant.set(key, agg);
    }
    const concentration: { key: string; organizer: string; share: number; points: number; tournaments: number }[] = [];
    for (const [key, agg] of byParticipant) {
      if (agg.total < 100 || agg.tournaments.size < 3) continue;
      const top = [...agg.byOrganizer.values()].sort((x, y) => y.points - x.points)[0];
      const share = top.points / agg.total;
      if (share >= 0.8) concentration.push({ key, organizer: top.name, share: Math.round(share * 100), points: agg.total, tournaments: agg.tournaments.size });
    }

    const keys = [...flaggedPairs.flatMap((p) => [p.a, p.b]), ...concentration.map((c) => c.key)];
    const players = await this.participants('PLAYER', keys.filter((k) => k.startsWith('PLAYER:')).map((k) => k.slice(7)));
    const teams = await this.participants('TEAM', keys.filter((k) => k.startsWith('TEAM:')).map((k) => k.slice(5)));
    const who = (key: string) => {
      const [type, id] = key.split(':');
      return { type, ...((type === 'PLAYER' ? players : teams).get(id) ?? { id, name: '—' }) };
    };
    return {
      repeatedPairings: flaggedPairs.map((p) => ({ participants: [who(p.a), who(p.b)], matches: p.count, tournaments: p.tournaments.size, winner: who([...p.winners][0]) })),
      organizerConcentration: concentration.map((c) => ({ participant: who(c.key), organizer: c.organizer, share: c.share, points: c.points, tournaments: c.tournaments })),
    };
  }
}

// =========================================================================== Controladores

@ApiTags('Rankings')
@Controller('rankings')
export class RankingsController {
  constructor(private readonly service: RankingsService) {}

  @Public() @Get() list(@Query() q: RankingQuery) {
    return this.service.table(q);
  }
  @Public() @Get('global') global(@Query() q: RankingQuery) {
    return this.service.table(q, { country: null });
  }
  @Public() @Get('games/:gameId') byGame(@Param('gameId', ParseUUIDPipe) gameId: string, @Query() q: RankingQuery) {
    return this.service.table(q, { game: gameId });
  }
  @Public() @Get('countries/:countryCode') byCountry(@Param('countryCode') code: string, @Query() q: RankingQuery) {
    if (!/^[A-Za-z]{2}$/.test(code)) throw new BadRequestException('Código de país inválido');
    return this.service.table(q, { country: code.toUpperCase() });
  }
  @Public() @Get('seasons') seasons(@Query() q: SeasonListQuery) {
    return this.service.seasons(q);
  }
  @Public() @Get('seasons/:seasonId') bySeason(@Param('seasonId', ParseUUIDPipe) seasonId: string, @Query() q: RankingQuery) {
    return this.service.table(q, { season: seasonId });
  }
  @Public() @Get('rules') rules(@Query() q: SeasonListQuery) {
    return this.service.rules(q.game);
  }
  @Public() @Get('compare') compare(@Query() q: CompareRankingQuery) {
    return this.service.compare(q);
  }
  @Public() @Get('players/:playerId') player(@Param('playerId', ParseUUIDPipe) id: string) {
    return this.service.playerProfile(id);
  }
  @Public() @Get('teams/:teamId') team(@Param('teamId', ParseUUIDPipe) id: string) {
    return this.service.teamProfile(id);
  }
  @Public() @Get('history/:participantId') history(@Param('participantId', ParseUUIDPipe) id: string, @Query() q: HistoryQuery) {
    return this.service.history(id, q);
  }
  @ApiBearerAuth() @Post('reports') report(@CurrentUser() u: AuthUser, @Body() dto: ResultReportDto) {
    return this.service.report(u, dto);
  }
  @ApiBearerAuth() @Get('reports/mine') myReports(@CurrentUser() u: AuthUser) {
    return this.service.myReports(u);
  }
}

@ApiTags('SUPERADMIN · Rankings')
@ApiBearerAuth()
@Roles('SUPERADMIN')
@Controller('admin/ranking')
export class AdminRankingsController {
  constructor(private readonly service: RankingsService) {}

  @Get('seasons') seasons(@Query() q: SeasonListQuery) {
    return this.service.adminSeasons(q);
  }
  @Post('seasons') createSeason(@CurrentUser() u: AuthUser, @Body() dto: SeasonDto) {
    return this.service.createSeason(u, dto);
  }
  @Put('seasons/:id') updateSeason(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSeasonDto) {
    return this.service.updateSeason(u, id, dto);
  }
  @Get('rules') rules(@Query() q: SeasonListQuery) {
    return this.service.adminRules(q.game);
  }
  @Post('rules') createRule(@CurrentUser() u: AuthUser, @Body() dto: RuleDto) {
    return this.service.createRule(u, dto);
  }
  @Put('rules/:id') updateRule(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRuleDto) {
    return this.service.updateRule(u, id, dto);
  }
  @Post('recalculate') recalculate(@CurrentUser() u: AuthUser, @Body() dto: RecalculateDto) {
    return this.service.recalculate(u, dto);
  }
  @Get('audit') audit(@Query() q: AuditQuery) {
    return this.service.audit(q);
  }
  @Get('events') events(@Query() q: EventQuery) {
    return this.service.events(q);
  }
  @Post('events/:id/revert') revert(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.service.revertEvent(u, id, dto);
  }
  @Post('adjustments') adjust(@CurrentUser() u: AuthUser, @Body() dto: AdjustmentDto) {
    return this.service.adjust(u, dto);
  }
  @Put('suspensions') suspend(@CurrentUser() u: AuthUser, @Body() dto: SuspensionDto) {
    return this.service.suspend(u, dto);
  }
  @Get('tournaments') tournaments(@Query() q: AdminTournamentQuery) {
    return this.service.adminTournaments(q);
  }
  @Put('tournaments/:id') updateTournament(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TournamentRankingDto) {
    return this.service.updateTournament(u, id, dto);
  }
  @Get('reports') reports(@Query() q: ReportQuery) {
    return this.service.reports(q);
  }
  @Put('reports/:id') review(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewReportDto) {
    return this.service.reviewReport(u, id, dto);
  }
  @Get('anomalies') anomalies(@Query() q: AnomalyQuery) {
    return this.service.anomalies(q);
  }
}

@Global()
@Module({
  controllers: [RankingsController, AdminRankingsController],
  providers: [RankingEngineService, RankingsService],
  exports: [RankingEngineService],
})
export class RankingsModule {}
