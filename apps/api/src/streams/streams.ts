import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { env } from '../config/env.js';
import { NotificationsService } from '../notifications/notifications.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import { assertCanManageOrganizer } from '../common/utils/access.js';
import { paginate, PaginationQuery } from '../common/utils/index.js';
import type { MatchStream, Prisma, StreamPlatform, StreamStatus } from '../generated/prisma/client.js';
import { parseStreamUrl, PLATFORM_NAME, StreamUrlError, type ParsedStreamUrl } from './platforms.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const PLATFORMS = ['YOUTUBE', 'TWITCH', 'FACEBOOK', 'TIKTOK', 'KICK', 'OTHER'] as const;
const SETTABLE: StreamStatus[] = ['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'];

/** Transiciones permitidas del estado de la transmisión (ENDED → LIVE reanuda un directo cortado). */
export const STREAM_TRANSITIONS: Record<StreamStatus, StreamStatus[]> = {
  NOT_CONFIGURED: ['SCHEDULED'],
  SCHEDULED: ['LIVE', 'CANCELLED'],
  LIVE: ['ENDED', 'CANCELLED'],
  ENDED: ['LIVE'],
  CANCELLED: ['SCHEDULED'],
};

/** Aviso de "próxima a transmitirse": cuánto antes del inicio programado y cada cuánto se revisa. */
export const UPCOMING_WINDOW_MS = 30 * 60_000;
const UPCOMING_SCAN_MS = 5 * 60_000;

export const STREAM_NOTIFICATION_TYPES = ['STREAM_UPCOMING', 'STREAM_LIVE', 'STREAM_UPDATED', 'STREAM_CANCELLED'] as const;

// =========================================================================== DTOs

export class StreamFieldsDto {
  @ApiPropertyOptional({ description: 'Título personalizado' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ description: 'Descripción opcional' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'PRIVATE'], description: 'PRIVATE: solo el organizador y los participantes del encuentro ven el enlace' })
  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';

  @ApiPropertyOptional({ description: 'Inicio programado (ISO 8601). Por defecto, el horario del encuentro' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledStartAt?: Date;

  @ApiPropertyOptional({ description: 'Fin programado (ISO 8601)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledEndAt?: Date;

  @ApiPropertyOptional({ description: 'Motivo del cambio (queda en el historial)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CreateStreamDto extends StreamFieldsDto {
  @ApiProperty({ description: 'URL HTTPS de la transmisión (YouTube, Twitch, Facebook, TikTok, Kick u otra autorizada)' })
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  url: string;

  @ApiPropertyOptional({ enum: PLATFORMS, description: 'Se detecta por el dominio; si se envía debe coincidir' })
  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: StreamPlatform;

  @ApiPropertyOptional({ description: 'Retransmisión adicional (otro canal, idioma…): no reemplaza a la principal', default: false })
  @IsOptional()
  @IsBoolean()
  isRebroadcast?: boolean;
}

export class UpdateStreamDto extends StreamFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(10, 500) url?: string;
  @ApiPropertyOptional({ enum: PLATFORMS }) @IsOptional() @IsIn(PLATFORMS) platform?: StreamPlatform;

  @ApiPropertyOptional({ description: 'Transmisión a editar (por defecto, la principal activa)' })
  @IsOptional()
  @IsUUID()
  streamId?: string;
}

export class StreamStatusDto {
  @ApiProperty({ enum: SETTABLE })
  @IsIn(SETTABLE)
  status: StreamStatus;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300) reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() streamId?: string;
}

export class StreamListQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Filtrar por videojuego' }) @IsOptional() @IsUUID() game?: string;
}

export class TournamentStreamsQuery {
  @ApiPropertyOptional({ enum: ['LIVE', 'UPCOMING', 'ENDED'] })
  @IsOptional()
  @IsIn(['LIVE', 'UPCOMING', 'ENDED'])
  status?: 'LIVE' | 'UPCOMING' | 'ENDED';
}

export class NotificationPreferenceDto {
  @ApiProperty({ enum: STREAM_NOTIFICATION_TYPES }) @IsIn(STREAM_NOTIFICATION_TYPES) type: string;
  @ApiProperty() @IsBoolean() inApp: boolean;
  @ApiProperty() @IsBoolean() email: boolean;
  @ApiProperty() @IsBoolean() whatsapp: boolean;
}

// =========================================================================== Selects

const entrant = {
  id: true,
  team: { select: { id: true, name: true, slug: true, tag: true, logoUrl: true } },
  player: { select: { id: true, nickname: true, avatarUrl: true, user: { select: { username: true } } } },
} satisfies Prisma.TournamentRegistrationSelect;

const tournamentSummary = {
  id: true,
  slug: true,
  name: true,
  status: true,
  mode: true,
  organizerId: true,
  game: { select: { id: true, name: true } },
  sport: { select: { id: true, name: true } },
  organizer: { select: { displayName: true, user: { select: { username: true } } } },
} satisfies Prisma.TournamentSelect;

const matchSummary = {
  id: true,
  status: true,
  scheduledAt: true,
  venue: true,
  bracket: true,
  round: true,
  groupLabel: true,
  participants: { orderBy: { slot: 'asc' }, select: { slot: true, score: true, isWinner: true, registration: { select: entrant } } },
} satisfies Prisma.MatchSelect;

/** Usuarios vinculados a una inscripción (quien inscribió, el jugador y los integrantes actuales del equipo). */
const regUsers = {
  requestedById: true,
  player: { select: { userId: true } },
  team: { select: { members: { where: { leftAt: null }, select: { player: { select: { userId: true } } } } } },
} satisfies Prisma.TournamentRegistrationSelect;

type RegUsers = Prisma.TournamentRegistrationGetPayload<{ select: typeof regUsers }>;
const usersOf = (regs: RegUsers[]) => {
  const ids = new Set<string>();
  for (const r of regs) {
    ids.add(r.requestedById);
    if (r.player?.userId) ids.add(r.player.userId);
    for (const m of r.team?.members ?? []) if (m.player.userId) ids.add(m.player.userId);
  }
  return ids;
};

const streamListInclude = {
  match: { select: { ...matchSummary, tournament: { select: tournamentSummary } } },
} satisfies Prisma.MatchStreamInclude;

/** Los formularios trabajan al minuto: una diferencia de segundos no es un cambio de horario. */
const sameMinute = (a: Date | null | undefined, b: Date | null | undefined) =>
  (!a && !b) || (!!a && !!b && Math.abs(a.getTime() - b.getTime()) < 60_000);

/** Datos públicos de una transmisión. El enlace solo se entrega a quien puede verlo y si su dominio sigue autorizado. */
export function presentStream(s: MatchStream, canView: boolean) {
  let parsed: ParsedStreamUrl | null = null;
  try {
    parsed = parseStreamUrl(s.streamUrl);
  } catch {
    parsed = null;
  }
  const visible = canView && !!parsed;
  return {
    id: s.id,
    matchId: s.matchId,
    platform: s.streamPlatform,
    platformName: PLATFORM_NAME[s.streamPlatform],
    title: s.streamTitle,
    description: s.streamDescription,
    status: s.streamStatus,
    visibility: s.streamVisibility,
    isRebroadcast: s.isRebroadcast,
    isActive: s.isActive,
    scheduledStartAt: s.scheduledStartAt,
    scheduledEndAt: s.scheduledEndAt,
    actualStartAt: s.actualStartAt,
    actualEndAt: s.actualEndAt,
    updatedAt: s.updatedAt,
    url: visible ? parsed!.url : null,
    embed: visible ? parsed!.embed : null,
    restricted: !canView,
  };
}

// =========================================================================== Servicio

@Injectable()
export class StreamsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Streams');
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (env.isTest) return;
    this.timer = setInterval(() => void this.notifyUpcoming().catch((e) => this.logger.error(e)), UPCOMING_SCAN_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Valida la URL y la plataforma elegida; convierte el error de dominio en 400. */
  parse(url: string, platform?: StreamPlatform) {
    let parsed: ParsedStreamUrl;
    try {
      parsed = parseStreamUrl(url);
    } catch (e) {
      if (e instanceof StreamUrlError) throw new BadRequestException(e.message);
      throw e;
    }
    if (platform && platform !== parsed.platform) {
      throw new BadRequestException(`La URL corresponde a ${PLATFORM_NAME[parsed.platform]}, no a ${PLATFORM_NAME[platform]}`);
    }
    return parsed;
  }

  // ------------------------------------------------------------------ acceso

  private async loadMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        ...matchSummary,
        tournament: { select: tournamentSummary },
        results: { where: { status: 'VALIDATED' }, orderBy: { version: 'desc' }, take: 1, select: { version: true, isDraw: true } },
      },
    });
    if (!match) throw new NotFoundException('Encuentro no encontrado');
    return match;
  }

  private async canManage(viewer: AuthUser | undefined, organizerId: string) {
    if (!viewer) return false;
    return assertCanManageOrganizer(this.prisma, viewer, organizerId).then(
      () => true,
      () => false,
    );
  }

  /** Usuarios de los participantes del encuentro: ven las transmisiones privadas. */
  private async participantUsers(matchIds: string[]) {
    const parts = await this.prisma.matchParticipant.findMany({
      where: { matchId: { in: matchIds } },
      select: { matchId: true, registration: { select: regUsers } },
    });
    const byMatch = new Map<string, Set<string>>();
    for (const p of parts) {
      const set = byMatch.get(p.matchId) ?? new Set<string>();
      for (const u of usersOf([p.registration])) set.add(u);
      byMatch.set(p.matchId, set);
    }
    return byMatch;
  }

  private async managed(user: AuthUser, matchId: string) {
    const match = await this.loadMatch(matchId);
    await assertCanManageOrganizer(this.prisma, user, match.tournament.organizerId);
    return match;
  }

  private async target(matchId: string, streamId?: string) {
    const stream = await this.prisma.matchStream.findFirst({
      where: streamId ? { id: streamId, matchId, isActive: true } : { matchId, isActive: true, isRebroadcast: false },
    });
    if (!stream) throw new NotFoundException('El encuentro no tiene una transmisión configurada');
    return stream;
  }

  // ------------------------------------------------------------------ gestión

  async create(user: AuthUser, matchId: string, dto: CreateStreamDto) {
    const match = await this.managed(user, matchId);
    if (match.tournament.status === 'CANCELLED' || match.status === 'CANCELLED') {
      throw new BadRequestException('No se puede transmitir un encuentro cancelado');
    }
    const parsed = this.parse(dto.url, dto.platform);
    const start = dto.scheduledStartAt ?? match.scheduledAt ?? null;
    this.checkWindow(start, dto.scheduledEndAt ?? null);
    const rebroadcast = !!dto.isRebroadcast;
    if (!rebroadcast) {
      const existing = await this.prisma.matchStream.count({ where: { matchId, isActive: true, isRebroadcast: false } });
      if (existing) throw new ConflictException('El encuentro ya tiene una transmisión activa: edítala o márcala como retransmisión');
    }

    const stream = await this.prisma.$transaction(async (tx) => {
      const s = await tx.matchStream.create({
        data: {
          matchId,
          streamUrl: parsed.url,
          streamPlatform: parsed.platform,
          streamTitle: dto.title || null,
          streamDescription: dto.description || null,
          streamVisibility: dto.visibility ?? 'PUBLIC',
          streamStatus: 'SCHEDULED',
          isRebroadcast: rebroadcast,
          scheduledStartAt: start,
          scheduledEndAt: dto.scheduledEndAt ?? null,
          createdBy: user.id,
        },
      });
      await tx.matchStreamHistory.create({
        data: {
          matchStreamId: s.id,
          newUrl: s.streamUrl,
          newStatus: 'SCHEDULED',
          modifiedBy: user.id,
          modificationReason: dto.reason || (rebroadcast ? 'Retransmisión agregada' : 'Transmisión configurada'),
        },
      });
      return s;
    });
    this.changed(match.tournament.id, matchId);
    return presentStream(stream, true);
  }

  async update(user: AuthUser, matchId: string, dto: UpdateStreamDto) {
    const match = await this.managed(user, matchId);
    const current = await this.target(matchId, dto.streamId);
    const parsed = dto.url !== undefined ? this.parse(dto.url, dto.platform) : null;
    if (!parsed && dto.platform && dto.platform !== current.streamPlatform) {
      throw new BadRequestException('La plataforma se detecta por la URL: cambia el enlace para cambiarla');
    }
    const start = dto.scheduledStartAt !== undefined ? dto.scheduledStartAt : current.scheduledStartAt;
    const end = dto.scheduledEndAt !== undefined ? dto.scheduledEndAt : current.scheduledEndAt;
    this.checkWindow(start, end);

    const data: Prisma.MatchStreamUpdateInput = {};
    const changes: string[] = [];
    if (parsed && parsed.url !== current.streamUrl) {
      data.streamUrl = parsed.url;
      data.streamPlatform = parsed.platform;
      changes.push('enlace');
    }
    if (dto.title !== undefined && (dto.title || null) !== current.streamTitle) {
      data.streamTitle = dto.title || null;
      changes.push('título');
    }
    if (dto.description !== undefined && (dto.description || null) !== current.streamDescription) {
      data.streamDescription = dto.description || null;
      changes.push('descripción');
    }
    if (dto.visibility && dto.visibility !== current.streamVisibility) {
      data.streamVisibility = dto.visibility;
      changes.push('visibilidad');
    }
    if (dto.scheduledStartAt !== undefined && !sameMinute(dto.scheduledStartAt, current.scheduledStartAt)) {
      data.scheduledStartAt = dto.scheduledStartAt;
      data.upcomingNotifiedAt = null; // el aviso previo se vuelve a enviar con el nuevo horario
      changes.push('horario');
    }
    if (dto.scheduledEndAt !== undefined && !sameMinute(dto.scheduledEndAt, current.scheduledEndAt)) {
      data.scheduledEndAt = dto.scheduledEndAt;
      if (!changes.includes('horario')) changes.push('horario');
    }
    if (!changes.length) return presentStream(current, true);

    const updated = await this.prisma.$transaction(async (tx) => {
      const s = await tx.matchStream.update({ where: { id: current.id }, data });
      await tx.matchStreamHistory.create({
        data: {
          matchStreamId: s.id,
          previousUrl: current.streamUrl,
          newUrl: s.streamUrl,
          previousStatus: current.streamStatus,
          newStatus: s.streamStatus,
          modifiedBy: user.id,
          modificationReason: dto.reason || `Actualizado: ${changes.join(', ')}`,
        },
      });
      return s;
    });

    if (data.streamUrl && ['SCHEDULED', 'LIVE'].includes(updated.streamStatus)) {
      await this.notify(match, updated, user.id, {
        type: 'STREAM_UPDATED',
        title: `Nuevo enlace de transmisión · ${this.label(match)}`,
        body: `${match.tournament.name}: la transmisión ahora está en ${PLATFORM_NAME[updated.streamPlatform]}.${dto.reason ? ` Motivo: ${dto.reason}` : ''}`,
      });
    }
    this.changed(match.tournament.id, matchId);
    return presentStream(updated, true);
  }

  async setStatus(user: AuthUser, matchId: string, dto: StreamStatusDto) {
    const match = await this.managed(user, matchId);
    const current = await this.target(matchId, dto.streamId);
    if (current.streamStatus === dto.status) return presentStream(current, true);
    if (!STREAM_TRANSITIONS[current.streamStatus].includes(dto.status)) {
      throw new BadRequestException(`No se puede pasar de ${current.streamStatus} a ${dto.status}`);
    }
    if (dto.status === 'LIVE' && ['FINISHED', 'CANCELLED'].includes(match.tournament.status)) {
      throw new BadRequestException('La partida ya terminó: no se puede iniciar una transmisión en vivo');
    }
    const now = new Date();
    const data: Prisma.MatchStreamUpdateInput = { streamStatus: dto.status };
    if (dto.status === 'LIVE') {
      data.actualStartAt = current.actualStartAt ?? now;
      data.actualEndAt = null;
    }
    if (dto.status === 'ENDED' || (dto.status === 'CANCELLED' && current.streamStatus === 'LIVE')) data.actualEndAt = now;
    if (dto.status === 'SCHEDULED') data.upcomingNotifiedAt = null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const s = await tx.matchStream.update({ where: { id: current.id }, data });
      await tx.matchStreamHistory.create({
        data: {
          matchStreamId: s.id,
          previousUrl: current.streamUrl,
          newUrl: s.streamUrl,
          previousStatus: current.streamStatus,
          newStatus: dto.status,
          modifiedBy: user.id,
          modificationReason: dto.reason || null,
        },
      });
      return s;
    });

    if (dto.status === 'LIVE' && current.streamStatus !== 'ENDED') {
      await this.notify(match, updated, user.id, {
        type: 'STREAM_LIVE',
        title: `🔴 En vivo: ${this.label(match)}`,
        body: `${match.tournament.name} se está transmitiendo en ${PLATFORM_NAME[updated.streamPlatform]}.`,
      });
    }
    if (dto.status === 'CANCELLED') {
      await this.notify(match, updated, user.id, {
        type: 'STREAM_CANCELLED',
        title: `Transmisión cancelada · ${this.label(match)}`,
        body: `${match.tournament.name}: la transmisión del encuentro se canceló.${dto.reason ? ` Motivo: ${dto.reason}` : ''}`,
      });
    }
    this.changed(match.tournament.id, matchId);
    return presentStream(updated, true);
  }

  /** Quita el enlace: la transmisión deja de estar activa, pero se conserva con su historial. */
  async remove(user: AuthUser, matchId: string, streamId?: string, reason?: string) {
    const match = await this.managed(user, matchId);
    const current = await this.target(matchId, streamId);
    const why = reason?.trim().slice(0, 300) || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.matchStream.update({
        where: { id: current.id },
        data: { isActive: false, ...(current.streamStatus === 'LIVE' ? { streamStatus: 'ENDED', actualEndAt: new Date() } : {}) },
      });
      await tx.matchStreamHistory.create({
        data: {
          matchStreamId: current.id,
          previousUrl: current.streamUrl,
          newUrl: null,
          previousStatus: current.streamStatus,
          newStatus: current.streamStatus === 'LIVE' ? 'ENDED' : current.streamStatus,
          modifiedBy: user.id,
          modificationReason: why ?? 'Enlace eliminado',
        },
      });
    });
    await this.audit.log({
      actorId: user.id,
      action: 'MATCH_STREAM_REMOVED',
      entityType: 'MatchStream',
      entityId: current.id,
      before: { url: current.streamUrl, status: current.streamStatus },
      reason: why ?? undefined,
    });
    if (current.streamStatus === 'SCHEDULED' || current.streamStatus === 'LIVE') {
      await this.notify(match, current, user.id, {
        type: 'STREAM_CANCELLED',
        title: `Transmisión retirada · ${this.label(match)}`,
        body: `${match.tournament.name}: el organizador quitó el enlace de transmisión.${why ? ` Motivo: ${why}` : ''}`,
      });
    }
    this.changed(match.tournament.id, matchId);
    return { ok: true };
  }

  async history(user: AuthUser, matchId: string) {
    await this.managed(user, matchId);
    const rows = await this.prisma.matchStreamHistory.findMany({
      where: { stream: { matchId } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        modifier: { select: { username: true, profile: { select: { firstName: true, lastName: true } } } },
        stream: { select: { id: true, streamPlatform: true, isRebroadcast: true, isActive: true } },
      },
    });
    return rows.map(({ modifier, stream, ...h }) => ({
      ...h,
      modifiedBy: { username: modifier.username, name: modifier.profile ? `${modifier.profile.firstName} ${modifier.profile.lastName}`.trim() : modifier.username },
      stream: { id: stream.id, platform: stream.streamPlatform, isRebroadcast: stream.isRebroadcast, isActive: stream.isActive },
    }));
  }

  // ------------------------------------------------------------------ consulta

  /** Detalle del encuentro con su transmisión principal y retransmisiones activas. */
  async forMatch(matchId: string, viewer?: AuthUser) {
    const match = await this.loadMatch(matchId);
    const canManage = await this.canManage(viewer, match.tournament.organizerId);
    if (match.tournament.status === 'DRAFT' && !canManage) throw new NotFoundException('Encuentro no encontrado');
    const participants = viewer ? ((await this.participantUsers([matchId])).get(matchId) ?? new Set<string>()) : new Set<string>();
    const canViewPrivate = canManage || (!!viewer && participants.has(viewer.id));
    const streams = await this.prisma.matchStream.findMany({
      where: { matchId, isActive: true, ...(canManage ? {} : { streamStatus: { not: 'CANCELLED' } }) },
      orderBy: [{ isRebroadcast: 'asc' }, { createdAt: 'asc' }],
    });
    const present = (s: MatchStream) => presentStream(s, s.streamVisibility === 'PUBLIC' || canViewPrivate);
    const primary = streams.find((s) => !s.isRebroadcast) ?? null;
    const { tournament, results, ...m } = match;
    const { organizerId: _o, ...t } = tournament;
    return {
      match: { ...m, result: results[0] ?? null },
      tournament: t,
      streamStatus: (primary?.streamStatus ?? 'NOT_CONFIGURED') as StreamStatus,
      stream: primary ? present(primary) : null,
      rebroadcasts: streams.filter((s) => s.isRebroadcast).map(present),
      canManage,
      canViewPrivate,
    };
  }

  private publicWhere(extra: Prisma.MatchStreamWhereInput, game?: string): Prisma.MatchStreamWhereInput {
    return {
      isActive: true,
      streamVisibility: 'PUBLIC',
      match: { status: { not: 'CANCELLED' }, tournament: { status: { notIn: ['DRAFT', 'CANCELLED'] }, ...(game ? { gameId: game } : {}) } },
      ...extra,
    };
  }

  private listItem(s: Prisma.MatchStreamGetPayload<{ include: typeof streamListInclude }>, canView: boolean) {
    const { tournament, ...match } = s.match;
    const { organizerId: _o, ...t } = tournament;
    return { ...presentStream(s, canView), match, tournament: t };
  }

  async live(q: StreamListQuery) {
    const where = this.publicWhere({ streamStatus: 'LIVE' }, q.game);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.matchStream.findMany({
        where,
        include: streamListInclude,
        orderBy: [{ actualStartAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.matchStream.count({ where }),
    ]);
    return paginate(
      items.map((s) => this.listItem(s, true)),
      total,
      q.page,
      q.pageSize,
    );
  }

  async upcoming(q: StreamListQuery, now = new Date()) {
    // Programadas que no empezaron (con un margen de 3 h por retrasos) o sin hora definida
    const where = this.publicWhere(
      { streamStatus: 'SCHEDULED', OR: [{ scheduledStartAt: null }, { scheduledStartAt: { gte: new Date(now.getTime() - 3 * 3600_000) } }] },
      q.game,
    );
    const [items, total] = await this.prisma.$transaction([
      this.prisma.matchStream.findMany({
        where,
        include: streamListInclude,
        orderBy: [{ scheduledStartAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.matchStream.count({ where }),
    ]);
    return paginate(
      items.map((s) => this.listItem(s, true)),
      total,
      q.page,
      q.pageSize,
    );
  }

  /** "Partidas transmitidas" de un torneo: en vivo, próximas y finalizadas, con contadores por filtro. */
  async forTournament(tournamentId: string, q: TournamentStreamsQuery, viewer?: AuthUser) {
    const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, status: true, organizerId: true } });
    if (!t) throw new NotFoundException('Partida no encontrada');
    const canManage = await this.canManage(viewer, t.organizerId);
    if (t.status === 'DRAFT' && !canManage) throw new NotFoundException('Partida no encontrada');

    const streams = await this.prisma.matchStream.findMany({
      where: { isActive: true, streamStatus: { in: ['SCHEDULED', 'LIVE', 'ENDED'] }, match: { tournamentId } },
      include: streamListInclude,
    });
    let visible = streams;
    let allowed = new Set<string>();
    if (!canManage) {
      const privateMatches = [...new Set(streams.filter((s) => s.streamVisibility === 'PRIVATE').map((s) => s.matchId))];
      const users = viewer && privateMatches.length ? await this.participantUsers(privateMatches) : new Map<string, Set<string>>();
      allowed = new Set(privateMatches.filter((id) => !!viewer && users.get(id)?.has(viewer.id)));
      visible = streams.filter((s) => s.streamVisibility === 'PUBLIC' || allowed.has(s.matchId));
    }
    const bucket = (s: (typeof streams)[number]) => (s.streamStatus === 'SCHEDULED' ? 'UPCOMING' : s.streamStatus) as 'LIVE' | 'UPCOMING' | 'ENDED';
    const counts = { LIVE: 0, UPCOMING: 0, ENDED: 0 };
    for (const s of visible) counts[bucket(s)]++;
    const order = { LIVE: 0, UPCOMING: 1, ENDED: 2 };
    const time = (s: (typeof streams)[number]) => (s.actualStartAt ?? s.scheduledStartAt ?? s.createdAt).getTime();
    const items = visible
      .filter((s) => !q.status || bucket(s) === q.status)
      .sort((a, b) => order[bucket(a)] - order[bucket(b)] || (bucket(a) === 'UPCOMING' ? time(a) - time(b) : time(b) - time(a)))
      .map((s) => this.listItem(s, true));
    return { items, counts };
  }

  // ------------------------------------------------------------------ notificaciones

  /** Envía el aviso "próxima a transmitirse" a las transmisiones que empiezan dentro de la ventana. */
  async notifyUpcoming(now = new Date()) {
    const due = await this.prisma.matchStream.findMany({
      where: {
        isActive: true,
        streamStatus: 'SCHEDULED',
        upcomingNotifiedAt: null,
        scheduledStartAt: { gt: now, lte: new Date(now.getTime() + UPCOMING_WINDOW_MS) },
        match: { status: { not: 'CANCELLED' }, tournament: { status: { notIn: ['DRAFT', 'CANCELLED', 'FINISHED'] } } },
      },
      take: 200,
    });
    for (const s of due) {
      // Marca primero (condicional) para no duplicar el aviso si dos procesos corren a la vez
      const claimed = await this.prisma.matchStream.updateMany({ where: { id: s.id, upcomingNotifiedAt: null }, data: { upcomingNotifiedAt: now } });
      if (!claimed.count) continue;
      const match = await this.loadMatch(s.matchId);
      const minutes = Math.max(1, Math.round((s.scheduledStartAt!.getTime() - now.getTime()) / 60_000));
      await this.notify(match, s, null, {
        type: 'STREAM_UPCOMING',
        title: `Próxima transmisión · ${this.label(match)}`,
        body: `${match.tournament.name}: empieza en ${minutes} min en ${PLATFORM_NAME[s.streamPlatform]}.`,
      });
    }
    return due.length;
  }

  /**
   * Destinatarios: inscritos aprobados del torneo (públicas) o solo los participantes del encuentro
   * (privadas). Quien hizo el cambio no se notifica a sí mismo.
   */
  private async notify(
    match: Awaited<ReturnType<StreamsService['loadMatch']>>,
    stream: MatchStream,
    actorId: string | null,
    payload: { type: (typeof STREAM_NOTIFICATION_TYPES)[number]; title: string; body: string },
  ) {
    const regs =
      stream.streamVisibility === 'PRIVATE'
        ? (await this.prisma.matchParticipant.findMany({ where: { matchId: match.id }, select: { registration: { select: regUsers } } })).map((p) => p.registration)
        : await this.prisma.tournamentRegistration.findMany({ where: { tournamentId: match.tournament.id, status: 'APPROVED' }, select: regUsers });
    const ids = usersOf(regs);
    if (actorId) ids.delete(actorId);
    await this.notifications.notify(
      [...ids].map((userId) => ({
        userId,
        ...payload,
        link: `/encuentros/${match.id}`,
        data: { matchId: match.id, streamId: stream.id, platform: stream.streamPlatform },
      })),
    );
  }

  private label(match: Awaited<ReturnType<StreamsService['loadMatch']>>) {
    const names = match.participants.map((p) => p.registration.team?.name ?? p.registration.player?.nickname ?? '¿?');
    return names.length === 2 ? `${names[0]} vs ${names[1]}` : 'Encuentro por definir';
  }

  private checkWindow(start: Date | null, end: Date | null) {
    if (start && end && end.getTime() <= start.getTime()) throw new BadRequestException('El fin programado debe ser posterior al inicio');
  }

  private changed(tournamentId: string, matchId: string) {
    this.realtime.emitToTournament(tournamentId, 'stream:updated', { tournamentId, matchId });
    this.realtime.broadcast('streams:changed', { matchId });
  }

  // ------------------------------------------------------------------ preferencias

  async preferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId, type: { in: [...STREAM_NOTIFICATION_TYPES] } } });
    return STREAM_NOTIFICATION_TYPES.map((type) => {
      const r = rows.find((x) => x.type === type);
      return { type, inApp: r?.inApp ?? true, email: r?.email ?? false, whatsapp: r?.whatsapp ?? false };
    });
  }

  async setPreference(user: AuthUser, dto: NotificationPreferenceDto) {
    if (dto.whatsapp) {
      const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { profile: { select: { phone: true } } } });
      if (!u?.profile?.phone) throw new ForbiddenException('Agrega un teléfono en tu perfil para recibir avisos por WhatsApp');
    }
    await this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId: user.id, type: dto.type } },
      create: { userId: user.id, type: dto.type, inApp: dto.inApp, email: dto.email, whatsapp: dto.whatsapp },
      update: { inApp: dto.inApp, email: dto.email, whatsapp: dto.whatsapp },
    });
    return this.preferences(user.id);
  }
}

// =========================================================================== Controladores

@ApiTags('Transmisiones en vivo')
@Controller()
export class StreamsController {
  constructor(private readonly service: StreamsService) {}

  @Public()
  @Get('matches/:matchId/stream')
  get(@Param('matchId', ParseUUIDPipe) matchId: string, @CurrentUser() user?: AuthUser) {
    return this.service.forMatch(matchId, user);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Post('matches/:matchId/stream')
  create(@CurrentUser() user: AuthUser, @Param('matchId', ParseUUIDPipe) matchId: string, @Body() dto: CreateStreamDto) {
    return this.service.create(user, matchId, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Put('matches/:matchId/stream')
  update(@CurrentUser() user: AuthUser, @Param('matchId', ParseUUIDPipe) matchId: string, @Body() dto: UpdateStreamDto) {
    return this.service.update(user, matchId, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Delete('matches/:matchId/stream')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Query('streamId', new ParseUUIDPipe({ optional: true })) streamId?: string,
    @Query('reason') reason?: string,
  ) {
    return this.service.remove(user, matchId, streamId, reason);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Patch('matches/:matchId/stream/status')
  status(@CurrentUser() user: AuthUser, @Param('matchId', ParseUUIDPipe) matchId: string, @Body() dto: StreamStatusDto) {
    return this.service.setStatus(user, matchId, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Get('matches/:matchId/stream/history')
  history(@CurrentUser() user: AuthUser, @Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.service.history(user, matchId);
  }

  @Public()
  @Get('streams/live')
  live(@Query() q: StreamListQuery) {
    return this.service.live(q);
  }

  @Public()
  @Get('streams/upcoming')
  upcoming(@Query() q: StreamListQuery) {
    return this.service.upcoming(q);
  }

  @Public()
  @Get('tournaments/:tournamentId/streams')
  tournament(@Param('tournamentId', ParseUUIDPipe) id: string, @Query() q: TournamentStreamsQuery, @CurrentUser() user?: AuthUser) {
    return this.service.forTournament(id, q, user);
  }
}

@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('me/notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly service: StreamsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.preferences(user.id);
  }

  @Put()
  set(@CurrentUser() user: AuthUser, @Body() dto: NotificationPreferenceDto) {
    return this.service.setPreference(user, dto);
  }
}

@Module({ controllers: [StreamsController, NotificationPreferencesController], providers: [StreamsService], exports: [StreamsService] })
export class StreamsModule {}
