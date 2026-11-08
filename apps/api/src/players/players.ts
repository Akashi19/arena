import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import { paginate, PaginationQuery } from '../common/utils/index.js';
import { CompetitiveLevel, LevelVerificationType, Platform, RecruitmentStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { computePlayerStats } from './stats.js';
import { LEVEL_THRESHOLDS, syncLevelVerification } from './levels.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const bool = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');

const MAX_GAME_PROFILES = 10;
const LEVEL_RANK: Record<CompetitiveLevel, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3, EXPERT: 4, PROFESSIONAL: 5 };

// =========================================================================== DTOs

export class PlayerSearchQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Apodo o usuario' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(60) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() game?: string;
  @ApiPropertyOptional({ enum: CompetitiveLevel }) @IsOptional() @IsEnum(CompetitiveLevel) level?: CompetitiveLevel;
  @ApiPropertyOptional({ enum: Platform }) @IsOptional() @IsEnum(Platform) platform?: Platform;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsISO31661Alpha2()
  country?: string;
  @ApiPropertyOptional({ enum: RecruitmentStatus }) @IsOptional() @IsEnum(RecruitmentStatus) recruitment?: RecruitmentStatus;
  @ApiPropertyOptional({ description: 'Rango mínimo (requiere videojuego): compara solo dentro del catálogo de ese juego' })
  @IsOptional()
  @IsUUID()
  rank?: string;
  @ApiPropertyOptional({ description: 'Rol o posición (texto)' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(40) role?: string;
  @ApiPropertyOptional({ description: 'Disponibilidad horaria (texto, p. ej. "noches")' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  availability?: string;
  @ApiPropertyOptional({ enum: ['with', 'without'], description: 'Con o sin equipo actual' }) @IsOptional() @IsIn(['with', 'without']) team?: 'with' | 'without';
  @ApiPropertyOptional({ enum: LevelVerificationType, description: 'Solo niveles con ese origen' })
  @IsOptional()
  @IsEnum(LevelVerificationType)
  verification?: LevelVerificationType;
}

export class CompareQuery {
  @ApiProperty({ description: 'Videojuego: solo se comparan jugadores dentro del mismo juego' }) @IsUUID() game: string;
  @ApiProperty({ description: 'Usuarios separados por coma (2 a 4)', example: 'nova,blaze' })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? [...new Set(value.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean))]
      : value,
  )
  @IsArray()
  @ArrayMinSize(2, { message: 'Elige al menos 2 jugadores distintos' })
  @ArrayMaxSize(4, { message: 'Puedes comparar hasta 4 jugadores' })
  @IsString({ each: true })
  players: string[];
}

export class GameHistoryQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() game?: string;
}

export class ReorderGamesDto {
  @ApiProperty({ type: [String], description: 'IDs de los perfiles gamer en el orden deseado' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class AdminGameProfileQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() game?: string;
  @ApiPropertyOptional({ enum: LevelVerificationType }) @IsOptional() @IsEnum(LevelVerificationType) type?: LevelVerificationType;
}

export class LevelVerificationDto {
  @ApiProperty({ enum: ['EXTERNAL', 'REVOKE'] }) @IsIn(['EXTERNAL', 'REVOKE']) action: 'EXTERNAL' | 'REVOKE';
  @ApiPropertyOptional({ description: 'Fuente externa autorizada (obligatoria al verificar)' })
  @ValidateIf((o: LevelVerificationDto) => o.action === 'EXTERNAL')
  @Transform(trim)
  @IsString()
  @Length(3, 200, { message: 'Indica la fuente externa (3 a 200 caracteres)' })
  source?: string;
  @ApiPropertyOptional({ enum: CompetitiveLevel, description: 'Nivel validado (si difiere del declarado)' })
  @IsOptional()
  @IsEnum(CompetitiveLevel)
  competitiveLevel?: CompetitiveLevel;
  @ApiPropertyOptional({ description: 'Rango validado del catálogo del juego' }) @IsOptional() @IsUUID() gameRankId?: string;
  @ApiProperty({ description: 'Justificación (queda en auditoría)' })
  @Transform(trim)
  @IsString()
  @Length(5, 500, { message: 'La justificación debe tener entre 5 y 500 caracteres' })
  reason: string;
}

export class GameProfileDto {
  @ApiProperty() @IsUUID() gameId: string;
  @ApiProperty({ enum: Platform }) @IsEnum(Platform) platform: Platform;
  @ApiProperty({ description: 'Nombre/ID dentro del juego' })
  @Transform(trim)
  @IsString()
  @Length(2, 40, { message: 'El gamertag debe tener entre 2 y 40 caracteres' })
  gamerTag: string;
  @ApiProperty({ enum: CompetitiveLevel }) @IsEnum(CompetitiveLevel) competitiveLevel: CompetitiveLevel;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gameRankId?: string;
  @ApiPropertyOptional({ description: 'Rol o posición (p. ej. Duelista, Soporte)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  playerRole?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50) experienceYears?: number;
  @ApiPropertyOptional({ description: 'Juego principal (solo uno)' }) @IsOptional() @Transform(bool) @IsBoolean() isPrimary?: boolean;
  @ApiPropertyOptional({ description: 'Mostrar en el perfil público' }) @IsOptional() @Transform(bool) @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional({ description: 'Juego favorito' }) @IsOptional() @Transform(bool) @IsBoolean() isFavorite?: boolean;
}

export class UpdateGameProfileDto extends PartialType(OmitType(GameProfileDto, ['gameId'] as const)) {}

export class UpdatePlayerDto {
  @ApiPropertyOptional({ enum: RecruitmentStatus }) @IsOptional() @IsIn(['NOT_LOOKING', 'LOOKING_FOR_TEAM']) recruitmentStatus?: RecruitmentStatus;
  @ApiPropertyOptional({ description: 'Posición habitual (deportes)' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(40) position?: string;
  @ApiPropertyOptional({ description: 'Disponibilidad horaria' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(200) availability?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(99) jerseyNumber?: number;
}

// =========================================================================== Selects

const gameProfileSelect = {
  id: true,
  platform: true,
  gamerTag: true,
  competitiveLevel: true,
  playerRole: true,
  experienceYears: true,
  isPrimary: true,
  isFeatured: true,
  isFavorite: true,
  displayOrder: true,
  verificationType: true,
  verificationSource: true,
  verifiedAt: true,
  joinedAt: true,
  lastUpdatedAt: true,
  game: { select: { id: true, name: true, slug: true, logoUrl: true } },
  rank: { select: { id: true, rankName: true, rankOrder: true, iconUrl: true } },
} satisfies Prisma.PlayerGameProfileSelect;

type Privacy = { showRealName?: boolean; showCountry?: boolean; showStats?: boolean; showTeams?: boolean; showHistory?: boolean };

// =========================================================================== Servicio

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Búsqueda pública de jugadores con cuenta (para reclutar o comparar). */
  async search(q: PlayerSearchQuery) {
    let minRankOrder: number | undefined;
    if (q.rank) {
      // Los rangos solo son comparables dentro de un mismo videojuego
      if (!q.game) throw new BadRequestException('Elige un videojuego para filtrar por rango');
      const rank = await this.prisma.gameRank.findFirst({ where: { id: q.rank, gameId: q.game } });
      if (!rank) throw new BadRequestException('El rango no corresponde a este videojuego');
      minRankOrder = rank.rankOrder;
    }
    const gameFilter: Prisma.PlayerGameProfileWhereInput = {
      isActive: true,
      isFeatured: true,
      ...(q.game ? { gameId: q.game } : {}),
      ...(q.level ? { competitiveLevel: q.level } : {}),
      ...(q.platform ? { platform: q.platform } : {}),
      ...(minRankOrder !== undefined ? { rank: { rankOrder: { gte: minRankOrder } } } : {}),
      ...(q.role ? { playerRole: { contains: q.role, mode: 'insensitive' } } : {}),
      ...(q.verification ? { verificationType: q.verification } : {}),
    };
    const usesGameFilter = !!(q.game || q.level || q.platform || q.rank || q.role || q.verification);
    const where: Prisma.PlayerWhereInput = {
      user: { status: 'ACTIVE' },
      isSuspended: false,
      ...(q.q
        ? {
            OR: [
              { nickname: { contains: q.q, mode: 'insensitive' } },
              { user: { username: { contains: q.q.toLowerCase() } } },
              { gameProfiles: { some: { gamerTag: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
      ...(q.country ? { country: q.country } : {}),
      ...(q.recruitment ? { recruitmentStatus: q.recruitment } : {}),
      ...(q.availability ? { availability: { contains: q.availability, mode: 'insensitive' } } : {}),
      ...(q.team === 'with' ? { teams: { some: { leftAt: null, team: { isActive: true } } } } : {}),
      ...(q.team === 'without' ? { teams: { none: { leftAt: null, team: { isActive: true } } } } : {}),
      ...(usesGameFilter ? { gameProfiles: { some: gameFilter } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.player.findMany({
        where,
        orderBy: [{ recruitmentStatus: 'desc' }, { updatedAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          nickname: true,
          avatarUrl: true,
          country: true,
          recruitmentStatus: true,
          availability: true,
          user: { select: { username: true, profile: { select: { privacy: true } } } },
          gameProfiles: {
            // Con filtro de juego se muestra ese juego; si no, los destacados del jugador
            where: { isActive: true, isFeatured: true, ...(q.game ? { gameId: q.game } : {}) },
            orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
            take: 3,
            select: gameProfileSelect,
          },
          teams: {
            where: { leftAt: null, team: { isActive: true } },
            take: 1,
            orderBy: { joinedAt: 'desc' },
            select: { team: { select: { name: true, slug: true, tag: true, logoUrl: true } } },
          },
        },
      }),
      this.prisma.player.count({ where }),
    ]);
    const items = rows.map(({ user, country, teams, ...p }) => {
      const privacy = (user?.profile?.privacy ?? {}) as Privacy;
      return {
        ...p,
        username: user!.username,
        country: privacy.showCountry === false ? null : country,
        currentTeam: privacy.showTeams === false ? null : (teams[0]?.team ?? null),
      };
    });
    return paginate(items, total, q.page, q.pageSize);
  }

  /** Perfil público del jugador: respeta las preferencias de privacidad (el propio jugador lo ve todo). */
  async profile(username: string, viewer?: AuthUser) {
    const player = await this.prisma.player.findFirst({
      where: { user: { username: username.toLowerCase(), status: 'ACTIVE' } },
      select: {
        id: true,
        userId: true,
        nickname: true,
        fullName: true,
        avatarUrl: true,
        country: true,
        position: true,
        jerseyNumber: true,
        recruitmentStatus: true,
        availability: true,
        isSuspended: true,
        createdAt: true,
        user: {
          select: {
            username: true,
            createdAt: true,
            profile: { select: { bio: true, city: true, privacy: true } },
            organizerProfile: { select: { displayName: true, verificationStatus: true } },
          },
        },
        gameProfiles: {
          where: { isActive: true },
          orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }, { joinedAt: 'asc' }],
          select: gameProfileSelect,
        },
        teams: {
          orderBy: { joinedAt: 'desc' },
          select: {
            role: true,
            jerseyNumber: true,
            joinedAt: true,
            leftAt: true,
            team: {
              select: {
                id: true,
                name: true,
                slug: true,
                tag: true,
                logoUrl: true,
                captainId: true,
                game: { select: { name: true } },
                sport: { select: { name: true } },
              },
            },
          },
        },
        achievements: {
          orderBy: { unlockedAt: 'desc' },
          select: { unlockedAt: true, achievement: { select: { code: true, name: true, description: true, iconUrl: true } } },
        },
      },
    });
    if (!player) throw new NotFoundException('Jugador no encontrado');

    const isOwner = viewer?.id === player.userId;
    const privacy = (player.user!.profile?.privacy ?? {}) as Privacy;
    const show = (k: keyof Privacy) => isOwner || privacy[k] !== false;

    let stats: Awaited<ReturnType<PlayersService['statsPayload']>> | null = null;
    if (show('showStats')) stats = await this.statsPayload(player.id);
    const history = show('showHistory') ? await this.history(player.id) : null;

    const { userId: _u, user, teams, fullName, country, gameProfiles, ...rest } = player;
    return {
      ...rest,
      // Los juegos no destacados solo los ve el propio jugador
      gameProfiles: gameProfiles.filter((g) => isOwner || g.isFeatured),
      username: user!.username,
      memberSince: user!.createdAt,
      bio: user!.profile?.bio ?? null,
      fullName: show('showRealName') ? fullName : null,
      country: show('showCountry') ? country : null,
      city: show('showCountry') ? (user!.profile?.city ?? null) : null,
      organizer: user!.organizerProfile,
      teams: show('showTeams')
        ? teams.map((m) => ({ ...m, isCaptain: m.team.captainId === player.id }))
        : null,
      stats,
      history,
      isOwner,
      privacy: isOwner ? privacy : undefined,
    };
  }

  private async statsPayload(playerId: string) {
    const stats = await computePlayerStats(this.prisma, playerId);
    const gameIds = [...stats.byDiscipline.keys()].filter((k) => k !== 'sport');
    const games = await this.prisma.game.findMany({ where: { id: { in: gameIds } }, select: { id: true, name: true, slug: true, logoUrl: true } });
    return {
      overall: stats.overall,
      byDiscipline: [...stats.byDiscipline.entries()]
        .map(([key, line]) => ({
          key,
          game: games.find((g) => g.id === key) ?? null,
          label: key === 'sport' ? 'Deportes' : (games.find((g) => g.id === key)?.name ?? 'Juego'),
          ...line,
        }))
        .sort((a, b) => b.tournamentsPlayed - a.tournamentsPlayed),
    };
  }

  /** Torneos del jugador (individuales o con su equipo mientras era integrante), más recientes primero. */
  private async history(playerId: string) {
    const regs = await this.prisma.tournamentRegistration.findMany({
      where: {
        status: 'APPROVED',
        tournament: { status: { in: ['IN_PROGRESS', 'FINISHED'] } },
        OR: [{ playerId }, { team: { members: { some: { playerId } } } }],
      },
      orderBy: { tournament: { startsAt: 'desc' } },
      take: 60,
      select: {
        playerId: true,
        finalPosition: true,
        team: {
          select: { name: true, slug: true, logoUrl: true, members: { where: { playerId }, select: { joinedAt: true, leftAt: true } } },
        },
        tournament: {
          select: {
            name: true,
            slug: true,
            status: true,
            startsAt: true,
            endsAt: true,
            category: true,
            format: true,
            game: { select: { id: true, name: true, logoUrl: true } },
            sport: { select: { name: true } },
            organizer: { select: { displayName: true } },
            _count: { select: { registrations: { where: { status: 'APPROVED' } } } },
          },
        },
      },
    });
    return regs
      .filter((r) => {
        if (r.playerId === playerId) return true;
        const end = r.tournament.endsAt ?? new Date();
        return r.team?.members.some((m) => m.joinedAt <= end && (!m.leftAt || m.leftAt >= r.tournament.startsAt));
      })
      .slice(0, 30)
      .map(({ team, tournament: { _count, ...t }, finalPosition }) => ({
        finalPosition,
        participants: _count.registrations,
        team: team ? { name: team.name, slug: team.slug, logoUrl: team.logoUrl } : null,
        tournament: t,
      }));
  }

  // --------------------------------------------------------------------------- Mi ficha

  async me(user: AuthUser) {
    const player = await this.prisma.player.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        nickname: true,
        recruitmentStatus: true,
        position: true,
        availability: true,
        jerseyNumber: true,
        gameProfiles: { where: { isActive: true }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }], select: gameProfileSelect },
      },
    });
    if (!player) throw new NotFoundException('No tienes ficha de jugador');
    return player;
  }

  async updateMe(user: AuthUser, dto: UpdatePlayerDto) {
    const player = await this.requirePlayer(user.id);
    return this.prisma.player.update({
      where: { id: player.id },
      data: {
        recruitmentStatus: dto.recruitmentStatus,
        position: dto.position === '' ? null : dto.position,
        availability: dto.availability === '' ? null : dto.availability,
        jerseyNumber: dto.jerseyNumber,
      },
      select: { id: true, recruitmentStatus: true, position: true, availability: true, jerseyNumber: true },
    });
  }

  async addGame(user: AuthUser, dto: GameProfileDto) {
    const player = await this.requirePlayer(user.id);
    await this.validateGameProfile(dto.gameId, dto.platform, dto.gameRankId);
    const count = await this.prisma.playerGameProfile.count({ where: { playerId: player.id, isActive: true } });
    if (count >= MAX_GAME_PROFILES) throw new BadRequestException(`Puedes registrar hasta ${MAX_GAME_PROFILES} videojuegos`);

    const existing = await this.prisma.playerGameProfile.findUnique({ where: { playerId_gameId: { playerId: player.id, gameId: dto.gameId } } });
    if (existing?.isActive) throw new ConflictException('Ya tienes un perfil para este videojuego');

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary || count === 0) {
        await tx.playerGameProfile.updateMany({ where: { playerId: player.id }, data: { isPrimary: false } });
      }
      const data = {
        platform: dto.platform,
        gamerTag: dto.gamerTag,
        competitiveLevel: dto.competitiveLevel,
        gameRankId: dto.gameRankId ?? null,
        playerRole: dto.playerRole || null,
        experienceYears: dto.experienceYears ?? null,
        isPrimary: dto.isPrimary || count === 0,
        isFeatured: dto.isFeatured ?? true,
        isFavorite: dto.isFavorite ?? false,
        displayOrder: count,
        isActive: true,
        verificationType: 'SELF_DECLARED' as const,
        verifiedAt: null,
      };
      // Un perfil retirado se reactiva (la clave única es jugador + juego)
      const profile = existing
        ? await tx.playerGameProfile.update({ where: { id: existing.id }, data, select: gameProfileSelect })
        : await tx.playerGameProfile.create({ data: { playerId: player.id, gameId: dto.gameId, ...data }, select: gameProfileSelect });
      await tx.playerGameHistory.create({
        data: {
          playerId: player.id,
          gameId: dto.gameId,
          newLevel: dto.competitiveLevel,
          newRank: profile.rank?.rankName ?? null,
          source: 'SELF_DECLARED',
        },
      });
      return profile;
    });
    return this.withVerification(player.id, created.id);
  }

  /** Reevalúa el respaldo de la plataforma tras un cambio declarado y devuelve el perfil actualizado. */
  private async withVerification(playerId: string, profileId: string) {
    await syncLevelVerification(this.prisma, [playerId]);
    return this.prisma.playerGameProfile.findUniqueOrThrow({ where: { id: profileId }, select: gameProfileSelect });
  }

  /** Orden de los juegos en el perfil público. */
  async reorderGames(user: AuthUser, dto: ReorderGamesDto) {
    const player = await this.requirePlayer(user.id);
    const owned = await this.prisma.playerGameProfile.findMany({ where: { playerId: player.id, isActive: true }, select: { id: true } });
    const ids = new Set(owned.map((o) => o.id));
    if (dto.ids.length !== ids.size || dto.ids.some((id) => !ids.has(id))) {
      throw new BadRequestException('Incluye todos tus videojuegos activos, sin repetir');
    }
    await this.prisma.$transaction(dto.ids.map((id, i) => this.prisma.playerGameProfile.update({ where: { id }, data: { displayOrder: i } })));
    return this.me(user);
  }

  async updateGame(user: AuthUser, id: string, dto: UpdateGameProfileDto) {
    const player = await this.requirePlayer(user.id);
    const current = await this.prisma.playerGameProfile.findFirst({
      where: { id, playerId: player.id, isActive: true },
      include: { rank: true },
    });
    if (!current) throw new NotFoundException('Perfil de videojuego no encontrado');
    await this.validateGameProfile(current.gameId, dto.platform ?? current.platform, dto.gameRankId);

    const levelChanged = dto.competitiveLevel !== undefined && dto.competitiveLevel !== current.competitiveLevel;
    const rankChanged = dto.gameRankId !== undefined && dto.gameRankId !== current.gameRankId;

    const updatedProfile = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) await tx.playerGameProfile.updateMany({ where: { playerId: player.id }, data: { isPrimary: false } });
      const updated = await tx.playerGameProfile.update({
        where: { id },
        data: {
          platform: dto.platform,
          gamerTag: dto.gamerTag,
          competitiveLevel: dto.competitiveLevel,
          gameRankId: dto.gameRankId,
          playerRole: dto.playerRole === '' ? null : dto.playerRole,
          experienceYears: dto.experienceYears,
          isPrimary: dto.isPrimary,
          isFeatured: dto.isFeatured,
          isFavorite: dto.isFavorite,
          // Un nivel declarado por el jugador deja de estar verificado
          ...(levelChanged || rankChanged ? { verificationType: 'SELF_DECLARED', verifiedAt: null, verificationSource: null } : {}),
        },
        select: gameProfileSelect,
      });
      if (levelChanged || rankChanged) {
        await tx.playerGameHistory.create({
          data: {
            playerId: player.id,
            gameId: current.gameId,
            previousLevel: current.competitiveLevel,
            newLevel: updated.competitiveLevel,
            previousRank: current.rank?.rankName ?? null,
            newRank: updated.rank?.rankName ?? null,
            source: 'SELF_DECLARED',
          },
        });
      }
      return updated;
    });
    return levelChanged || rankChanged ? this.withVerification(player.id, updatedProfile.id) : updatedProfile;
  }

  /** Retira el juego del perfil; el historial de niveles y las estadísticas se conservan. */
  async removeGame(user: AuthUser, id: string) {
    const player = await this.requirePlayer(user.id);
    const current = await this.prisma.playerGameProfile.findFirst({ where: { id, playerId: player.id, isActive: true } });
    if (!current) throw new NotFoundException('Perfil de videojuego no encontrado');
    await this.prisma.$transaction(async (tx) => {
      await tx.playerGameProfile.update({ where: { id }, data: { isActive: false, isPrimary: false } });
      if (current.isPrimary) {
        const next = await tx.playerGameProfile.findFirst({ where: { playerId: player.id, isActive: true }, orderBy: { displayOrder: 'asc' } });
        if (next) await tx.playerGameProfile.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    });
    await this.audit.log({ actorId: user.id, action: 'GAME_PROFILE_REMOVED', entityType: 'PlayerGameProfile', entityId: id });
    return { ok: true };
  }

  // --------------------------------------------------------------------------- Comparador

  /**
   * Compara 2-4 jugadores dentro de UN videojuego. Nunca mezcla juegos: rangos y estadísticas solo son
   * comparables en el catálogo y los resultados del mismo juego. Respeta la privacidad de cada jugador.
   */
  async compare(q: CompareQuery, viewer?: AuthUser) {
    const game = await this.prisma.game.findUnique({
      where: { id: q.game },
      select: { id: true, name: true, slug: true, logoUrl: true, _count: { select: { ranks: { where: { status: 'ACTIVE' } } } } },
    });
    if (!game) throw new NotFoundException('Videojuego no encontrado');

    const players = await this.prisma.player.findMany({
      where: { user: { username: { in: q.players }, status: 'ACTIVE' } },
      select: {
        id: true,
        userId: true,
        nickname: true,
        avatarUrl: true,
        country: true,
        user: { select: { username: true, profile: { select: { privacy: true } } } },
        gameProfiles: { where: { gameId: game.id, isActive: true }, select: gameProfileSelect },
        statistics: { where: { gameId: game.id } },
        gameHistory: {
          where: { gameId: game.id },
          orderBy: { recordedAt: 'asc' },
          take: 50,
          select: { recordedAt: true, newLevel: true, newRank: true, source: true },
        },
      },
    });
    const missing = q.players.filter((u) => !players.some((p) => p.user!.username === u));
    if (missing.length) throw new NotFoundException(`Jugador no encontrado: ${missing.join(', ')}`);

    const rows = await Promise.all(
      q.players.map(async (username) => {
        const p = players.find((x) => x.user!.username === username)!;
        const isOwner = viewer?.id === p.userId;
        const privacy = (p.user!.profile?.privacy ?? {}) as Privacy;
        const show = (k: keyof Privacy) => isOwner || privacy[k] !== false;
        const profile = p.gameProfiles[0] && (isOwner || p.gameProfiles[0].isFeatured) ? p.gameProfiles[0] : null;
        const s = p.statistics[0];
        const results = show('showHistory')
          ? (await this.history(p.id))
              .filter((h) => h.tournament.game?.id === game.id && h.tournament.status === 'FINISHED')
              .slice(0, 8)
              .map((h) => ({
                finalPosition: h.finalPosition,
                participants: h.participants,
                tournament: { name: h.tournament.name, slug: h.tournament.slug, startsAt: h.tournament.startsAt },
              }))
          : null;
        return {
          username,
          nickname: p.nickname,
          avatarUrl: p.avatarUrl,
          country: show('showCountry') ? p.country : null,
          profile,
          stats: show('showStats')
            ? {
                matchesPlayed: s?.matchesPlayed ?? 0,
                wins: s?.wins ?? 0,
                losses: s?.losses ?? 0,
                draws: s?.draws ?? 0,
                winRate: Number(s?.winRate ?? 0),
                tournamentsPlayed: s?.tournamentsPlayed ?? 0,
                tournamentsWon: s?.tournamentsWon ?? 0,
              }
            : null,
          evolution: show('showHistory') ? p.gameHistory : null,
          results,
        };
      }),
    );

    // Mejores valores por métrica (solo entre datos visibles y comparables)
    const leaders: Record<string, string[]> = {};
    const metric = (key: string, value: (r: (typeof rows)[number]) => number | null | undefined) => {
      const vals = rows.map((r) => ({ u: r.username, v: value(r) })).filter((x): x is { u: string; v: number } => x.v !== null && x.v !== undefined);
      if (vals.length < 2) return;
      const best = Math.max(...vals.map((x) => x.v));
      if (best <= 0 && key !== 'level') return;
      leaders[key] = vals.filter((x) => x.v === best).map((x) => x.u);
    };
    metric('level', (r) => (r.profile ? LEVEL_RANK[r.profile.competitiveLevel] : null));
    metric('rank', (r) => r.profile?.rank?.rankOrder);
    metric('matchesPlayed', (r) => r.stats?.matchesPlayed);
    metric('wins', (r) => r.stats?.wins);
    metric('winRate', (r) => (r.stats?.matchesPlayed ? r.stats.winRate : null));
    metric('tournamentsWon', (r) => r.stats?.tournamentsWon);

    return { game: { id: game.id, name: game.name, slug: game.slug, logoUrl: game.logoUrl, hasRanks: game._count.ranks > 0 }, players: rows, leaders };
  }

  /** Historial de niveles y rangos (con su origen). Respeta la preferencia "mostrar historial". */
  async gameHistory(username: string, gameId: string | undefined, viewer?: AuthUser) {
    const player = await this.prisma.player.findFirst({
      where: { user: { username: username.toLowerCase(), status: 'ACTIVE' } },
      select: { id: true, userId: true, user: { select: { profile: { select: { privacy: true } } } } },
    });
    if (!player) throw new NotFoundException('Jugador no encontrado');
    const privacy = (player.user!.profile?.privacy ?? {}) as Privacy;
    if (viewer?.id !== player.userId && privacy.showHistory === false) {
      throw new ForbiddenException('El jugador mantiene su historial en privado');
    }
    return this.prisma.playerGameHistory.findMany({
      where: { playerId: player.id, ...(gameId ? { gameId } : {}) },
      orderBy: { recordedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        previousLevel: true,
        newLevel: true,
        previousRank: true,
        newRank: true,
        source: true,
        recordedAt: true,
        game: { select: { id: true, name: true, logoUrl: true } },
      },
    });
  }

  // --------------------------------------------------------------------------- SUPERADMIN

  async adminGameProfiles(q: AdminGameProfileQuery) {
    const where: Prisma.PlayerGameProfileWhereInput = {
      isActive: true,
      ...(q.game ? { gameId: q.game } : {}),
      ...(q.type ? { verificationType: q.type } : {}),
      ...(q.q
        ? {
            OR: [
              { gamerTag: { contains: q.q, mode: 'insensitive' } },
              { player: { nickname: { contains: q.q, mode: 'insensitive' } } },
              { player: { user: { username: { contains: q.q.toLowerCase() } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.playerGameProfile.findMany({
        where,
        orderBy: [{ lastUpdatedAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          ...gameProfileSelect,
          playerId: true,
          gameId: true,
          player: { select: { nickname: true, avatarUrl: true, user: { select: { username: true } } } },
        },
      }),
      this.prisma.playerGameProfile.count({ where }),
    ]);
    const stats = await this.prisma.playerGameStatistics.findMany({
      where: { OR: rows.map((r) => ({ playerId: r.playerId, gameId: r.gameId })) },
    });
    const items = rows.map(({ player, ...r }) => {
      const s = stats.find((x) => x.playerId === r.playerId && x.gameId === r.gameId);
      return {
        ...r,
        nickname: player.nickname,
        avatarUrl: player.avatarUrl,
        username: player.user?.username ?? null,
        stats: s ? { matchesPlayed: s.matchesPlayed, winRate: Number(s.winRate), tournamentsWon: s.tournamentsWon } : null,
      };
    });
    return paginate(items, total, q.page, q.pageSize);
  }

  /**
   * EXTERNAL_VERIFIED: un SUPERADMIN registra la validación de una fuente externa autorizada (p. ej.,
   * captura verificada del cliente oficial o integración del editor). REVOKE la retira y el perfil vuelve a
   * evaluarse contra las estadísticas de la plataforma. Todo queda en historial y auditoría.
   */
  async adminVerifyLevel(admin: AuthUser, id: string, dto: LevelVerificationDto) {
    const current = await this.prisma.playerGameProfile.findFirst({
      where: { id, isActive: true },
      include: { rank: true, game: { select: { name: true } }, player: { select: { userId: true, user: { select: { username: true } } } } },
    });
    if (!current) throw new NotFoundException('Perfil de videojuego no encontrado');

    if (dto.action === 'REVOKE' && current.verificationType !== 'EXTERNAL_VERIFIED') {
      throw new BadRequestException('Solo se revocan niveles validados externamente');
    }
    let newRankName = current.rank?.rankName ?? null;
    if (dto.action === 'EXTERNAL' && dto.gameRankId) {
      const rank = await this.prisma.gameRank.findFirst({ where: { id: dto.gameRankId, gameId: current.gameId, status: 'ACTIVE' } });
      if (!rank) throw new BadRequestException('El rango no corresponde a este videojuego');
      newRankName = rank.rankName;
    }

    const before = {
      verificationType: current.verificationType,
      verificationSource: current.verificationSource,
      competitiveLevel: current.competitiveLevel,
      rank: current.rank?.rankName ?? null,
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const row =
        dto.action === 'EXTERNAL'
          ? await tx.playerGameProfile.update({
              where: { id },
              data: {
                verificationType: 'EXTERNAL_VERIFIED',
                verificationSource: dto.source,
                verifiedAt: new Date(),
                competitiveLevel: dto.competitiveLevel ?? current.competitiveLevel,
                gameRankId: dto.gameRankId ?? current.gameRankId,
              },
              select: gameProfileSelect,
            })
          : await tx.playerGameProfile.update({
              where: { id },
              data: { verificationType: 'SELF_DECLARED', verificationSource: null, verifiedAt: null },
              select: gameProfileSelect,
            });
      await tx.playerGameHistory.create({
        data: {
          playerId: current.playerId,
          gameId: current.gameId,
          previousLevel: current.competitiveLevel,
          newLevel: row.competitiveLevel,
          previousRank: current.rank?.rankName ?? null,
          newRank: dto.action === 'EXTERNAL' ? newRankName : (current.rank?.rankName ?? null),
          source: dto.action === 'EXTERNAL' ? 'EXTERNAL_VERIFIED' : 'SELF_DECLARED',
        },
      });
      await this.audit.log(
        {
          actorId: admin.id,
          action: dto.action === 'EXTERNAL' ? 'LEVEL_EXTERNALLY_VERIFIED' : 'LEVEL_VERIFICATION_REVOKED',
          entityType: 'PlayerGameProfile',
          entityId: id,
          before,
          after: { verificationType: row.verificationType, verificationSource: row.verificationSource, competitiveLevel: row.competitiveLevel, rank: row.rank?.rankName ?? null },
          reason: dto.reason,
        },
        tx,
      );
      return row;
    });
    if (dto.action === 'REVOKE') await syncLevelVerification(this.prisma, [current.playerId]);

    if (current.player.userId) {
      await this.notifications.notify({
        userId: current.player.userId,
        type: dto.action === 'EXTERNAL' ? 'LEVEL_VERIFIED' : 'LEVEL_VERIFICATION_REVOKED',
        title: dto.action === 'EXTERNAL' ? `Nivel validado en ${current.game.name}` : `Validación de nivel retirada en ${current.game.name}`,
        body: dto.action === 'EXTERNAL' ? `Tu nivel se validó con: ${dto.source}.` : `Motivo: ${dto.reason}`,
        link: current.player.user ? `/jugadores/${current.player.user.username}` : undefined,
      });
    }
    return dto.action === 'REVOKE' ? this.prisma.playerGameProfile.findUniqueOrThrow({ where: { id }, select: gameProfileSelect }) : updated;
  }

  private async requirePlayer(userId: string) {
    const player = await this.prisma.player.findUnique({ where: { userId } });
    if (!player) throw new NotFoundException('No tienes ficha de jugador');
    return player;
  }

  private async validateGameProfile(gameId: string, platform: Platform, rankId?: string) {
    const game = await this.prisma.game.findFirst({ where: { id: gameId, status: 'ACTIVE' } });
    if (!game) throw new BadRequestException('Videojuego no disponible');
    if (game.platforms.length && !game.platforms.includes(platform)) {
      throw new BadRequestException(`${game.name} no está disponible en esa plataforma`);
    }
    if (rankId) {
      const rank = await this.prisma.gameRank.findFirst({ where: { id: rankId, gameId, status: 'ACTIVE' } });
      if (!rank) throw new BadRequestException('El rango no corresponde a este videojuego');
    }
  }
}

// =========================================================================== Controlador

@ApiTags('Jugadores y perfiles gamer')
@Controller()
export class PlayersController {
  constructor(private readonly service: PlayersService) {}

  @Public()
  @Get('players')
  search(@Query() q: PlayerSearchQuery) {
    return this.service.search(q);
  }

  @Public()
  @Get('players/search')
  searchAlias(@Query() q: PlayerSearchQuery) {
    return this.service.search(q);
  }

  @Public()
  @Get('players/compare')
  compare(@Query() q: CompareQuery, @CurrentUser() user?: AuthUser) {
    return this.service.compare(q, user);
  }

  @Public()
  @Get('players/level-criteria')
  levelCriteria() {
    return LEVEL_THRESHOLDS;
  }

  @Public()
  @Get('players/:username/game-history')
  gameHistory(@Param('username') username: string, @Query() q: GameHistoryQuery, @CurrentUser() user?: AuthUser) {
    return this.service.gameHistory(username, q.game, user);
  }

  @Public()
  @Get('players/:username')
  profile(@Param('username') username: string, @CurrentUser() user?: AuthUser) {
    return this.service.profile(username, user);
  }

  @ApiBearerAuth()
  @Get('me/player')
  me(@CurrentUser() user: AuthUser) {
    return this.service.me(user);
  }

  @ApiBearerAuth()
  @Patch('me/player')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdatePlayerDto) {
    return this.service.updateMe(user, dto);
  }

  @ApiBearerAuth()
  @Post('me/games')
  addGame(@CurrentUser() user: AuthUser, @Body() dto: GameProfileDto) {
    return this.service.addGame(user, dto);
  }

  @ApiBearerAuth()
  @Put('me/games/order')
  reorder(@CurrentUser() user: AuthUser, @Body() dto: ReorderGamesDto) {
    return this.service.reorderGames(user, dto);
  }

  @ApiBearerAuth()
  @Patch('me/games/:id')
  updateGame(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGameProfileDto) {
    return this.service.updateGame(user, id, dto);
  }

  @ApiBearerAuth()
  @Delete('me/games/:id')
  removeGame(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeGame(user, id);
  }
}

@ApiTags('SUPERADMIN · Niveles competitivos')
@ApiBearerAuth()
@Roles('SUPERADMIN')
@Controller('admin/game-profiles')
export class AdminPlayersController {
  constructor(private readonly service: PlayersService) {}

  @Get() list(@Query() q: AdminGameProfileQuery) {
    return this.service.adminGameProfiles(q);
  }
  @Put(':id/verification') verify(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LevelVerificationDto) {
    return this.service.adminVerifyLevel(u, id, dto);
  }
}

@Module({ controllers: [PlayersController, AdminPlayersController], providers: [PlayersService] })
export class PlayersModule {}
