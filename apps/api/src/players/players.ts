import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsISO31661Alpha2, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser, CurrentUser, Public } from '../common/decorators/auth.decorators.js';
import { paginate, PaginationQuery } from '../common/utils/index.js';
import { CompetitiveLevel, Platform, RecruitmentStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { computePlayerStats } from './stats.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const bool = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');

const MAX_GAME_PROFILES = 10;

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
  verificationType: true,
  verifiedAt: true,
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
  ) {}

  /** Búsqueda pública de jugadores con cuenta (para reclutar o comparar). */
  async search(q: PlayerSearchQuery) {
    const gameFilter: Prisma.PlayerGameProfileWhereInput = {
      isActive: true,
      ...(q.game ? { gameId: q.game } : {}),
      ...(q.level ? { competitiveLevel: q.level } : {}),
      ...(q.platform ? { platform: q.platform } : {}),
    };
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
      ...(q.game || q.level || q.platform ? { gameProfiles: { some: gameFilter } } : {}),
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
          user: { select: { username: true, profile: { select: { privacy: true } } } },
          gameProfiles: {
            where: { isActive: true, isFeatured: true },
            orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
            take: 3,
            select: gameProfileSelect,
          },
          _count: { select: { teams: { where: { leftAt: null } } } },
        },
      }),
      this.prisma.player.count({ where }),
    ]);
    const items = rows.map(({ user, country, ...p }) => {
      const privacy = (user?.profile?.privacy ?? {}) as Privacy;
      return { ...p, username: user!.username, country: privacy.showCountry === false ? null : country };
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

    const { userId: _u, user, teams, fullName, country, ...rest } = player;
    return {
      ...rest,
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
            game: { select: { name: true, logoUrl: true } },
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

    return this.prisma.$transaction(async (tx) => {
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

    return this.prisma.$transaction(async (tx) => {
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

@Module({ controllers: [PlayersController], providers: [PlayersService] })
export class PlayersModule {}
