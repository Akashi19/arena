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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService, MAX_IMAGE_BYTES } from '../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { AuthUser, CurrentUser, Public } from '../common/decorators/auth.decorators.js';
import { uniqueSlug } from '../common/utils/index.js';
import { RecruitmentStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTeamDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 60) name: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @Matches(/^[A-Za-z0-9]{2,6}$/) tag?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsISO31661Alpha2()
  country?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sportId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gameId?: string;
  @ApiPropertyOptional({ enum: RecruitmentStatus }) @IsOptional() @IsEnum(RecruitmentStatus) recruitmentStatus?: RecruitmentStatus;
}
export class UpdateTeamDto extends PartialType(CreateTeamDto) {}

export class AddMemberDto {
  @ApiProperty({ description: 'username del jugador con cuenta' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  username: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(40) role?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(99) jerseyNumber?: number;
}

export class SetCaptainDto {
  @ApiProperty() @IsUUID() playerId: string;
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: AuthUser, dto: CreateTeamDto) {
    if (dto.sportId && dto.gameId) throw new BadRequestException('Un equipo es de un deporte o de un videojuego, no ambos');
    const player = await this.prisma.player.findUnique({ where: { userId: user.id } });
    const team = await this.prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: { ...dto, slug: uniqueSlug(dto.name), ownerId: user.id, captainId: player?.id },
      });
      if (player) await tx.teamPlayer.create({ data: { teamId: created.id, playerId: player.id, role: 'Capitán' } });
      await this.audit.log({ actorId: user.id, action: 'TEAM_CREATED', entityType: 'Team', entityId: created.id, after: created }, tx);
      return created;
    });
    return team;
  }

  async update(user: AuthUser, id: string, dto: UpdateTeamDto) {
    const team = await this.getOwned(user, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.team.update({ where: { id }, data: dto });
      if (dto.name && dto.name !== team.name) {
        await tx.teamIdentityHistory.create({
          data: { teamId: id, field: 'name', oldValue: team.name, newValue: dto.name, changedBy: user.id },
        });
      }
      return u;
    });
    await this.audit.log({ actorId: user.id, action: 'TEAM_UPDATED', entityType: 'Team', entityId: id, before: team, after: updated });
    return updated;
  }

  /** Si el equipo ya compitió se desactiva (se conserva su historial); si no, se elimina. */
  async remove(user: AuthUser, id: string) {
    await this.getOwned(user, id);
    const registrations = await this.prisma.tournamentRegistration.count({ where: { teamId: id } });
    if (registrations > 0) {
      await this.prisma.team.update({ where: { id }, data: { isActive: false } });
    } else {
      await this.prisma.team.delete({ where: { id } });
    }
    await this.audit.log({ actorId: user.id, action: registrations ? 'TEAM_DEACTIVATED' : 'TEAM_DELETED', entityType: 'Team', entityId: id });
    return { ok: true, archived: registrations > 0 };
  }

  async uploadLogo(user: AuthUser, id: string, file: Express.Multer.File | undefined) {
    const team = await this.getOwned(user, id);
    const url = await this.storage.uploadPublicImage(file, `teams/${id}`);
    await this.prisma.$transaction([
      this.prisma.team.update({ where: { id }, data: { logoUrl: url } }),
      this.prisma.teamIdentityHistory.create({
        data: { teamId: id, field: 'logo', oldValue: team.logoUrl, newValue: url, changedBy: user.id },
      }),
    ]);
    return { logoUrl: url };
  }

  async addMember(user: AuthUser, id: string, dto: AddMemberDto) {
    const team = await this.getOwned(user, id);
    const player = await this.prisma.player.findFirst({ where: { user: { username: dto.username, status: 'ACTIVE' } } });
    if (!player) throw new NotFoundException('Jugador no encontrado');
    const active = await this.prisma.teamPlayer.findFirst({ where: { teamId: id, playerId: player.id, leftAt: null } });
    if (active) throw new ConflictException('El jugador ya forma parte del equipo');
    const member = await this.prisma.teamPlayer.create({
      data: { teamId: id, playerId: player.id, role: dto.role, jerseyNumber: dto.jerseyNumber },
    });
    await this.prisma.teamIdentityHistory.create({
      data: { teamId: id, field: 'member_added', newValue: player.nickname, changedBy: user.id },
    });
    if (player.userId) {
      await this.notifications.notify({
        userId: player.userId,
        type: 'TEAM_MEMBER_ADDED',
        title: `Te agregaron a ${team.name}`,
        body: `Ahora formas parte del equipo ${team.name}.`,
        link: `/equipos/${team.slug}`,
      });
    }
    return member;
  }

  async removeMember(user: AuthUser, id: string, playerId: string) {
    const team = await this.getOwned(user, id);
    const member = await this.prisma.teamPlayer.findFirst({ where: { teamId: id, playerId, leftAt: null }, include: { player: true } });
    if (!member) throw new NotFoundException('El jugador no está en el equipo');
    await this.prisma.$transaction([
      this.prisma.teamPlayer.update({ where: { id: member.id }, data: { leftAt: new Date() } }),
      ...(team.captainId === playerId ? [this.prisma.team.update({ where: { id }, data: { captainId: null } })] : []),
      this.prisma.teamIdentityHistory.create({
        data: { teamId: id, field: 'member_removed', oldValue: member.player.nickname, changedBy: user.id },
      }),
    ]);
    return { ok: true };
  }

  async setCaptain(user: AuthUser, id: string, dto: SetCaptainDto) {
    await this.getOwned(user, id);
    const member = await this.prisma.teamPlayer.findFirst({ where: { teamId: id, playerId: dto.playerId, leftAt: null } });
    if (!member) throw new BadRequestException('El capitán debe ser integrante activo del equipo');
    return this.prisma.team.update({ where: { id }, data: { captainId: dto.playerId } });
  }

  mine(user: AuthUser) {
    return this.prisma.team.findMany({
      where: {
        isActive: true,
        OR: [{ ownerId: user.id }, { members: { some: { leftAt: null, player: { userId: user.id } } } }],
      },
      orderBy: { name: 'asc' },
      include: {
        sport: { select: { name: true } },
        game: { select: { name: true, logoUrl: true } },
        _count: { select: { members: { where: { leftAt: null } }, registrations: true } },
      },
    });
  }

  async publicTeam(slug: string) {
    const team = await this.prisma.team.findUnique({
      where: { slug },
      include: {
        sport: { select: { name: true, slug: true } },
        game: { select: { name: true, slug: true, logoUrl: true } },
        owner: { select: { username: true } },
        captain: { select: { id: true, nickname: true } },
        members: {
          orderBy: [{ leftAt: 'asc' }, { joinedAt: 'asc' }],
          include: {
            player: {
              select: { id: true, nickname: true, avatarUrl: true, country: true, user: { select: { username: true } } },
            },
          },
        },
        registrations: {
          where: { status: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            finalPosition: true,
            tournament: {
              select: {
                name: true,
                slug: true,
                status: true,
                startsAt: true,
                organizer: { select: { displayName: true, logoUrl: true, verificationStatus: true, user: { select: { username: true } } } },
              },
            },
          },
        },
      },
    });
    if (!team) throw new NotFoundException('Equipo no encontrado');
    const where: Prisma.MatchParticipantWhereInput = { registration: { teamId: team.id }, match: { status: 'COMPLETED' } };
    const [played, wins] = await Promise.all([
      this.prisma.matchParticipant.count({ where }),
      this.prisma.matchParticipant.count({ where: { ...where, isWinner: true } }),
    ]);
    return {
      ...team,
      currentMembers: team.members.filter((m) => !m.leftAt),
      formerMembers: team.members.filter((m) => m.leftAt),
      members: undefined,
      stats: { tournaments: team.registrations.length, matchesPlayed: played, wins },
    };
  }

  private async getOwned(user: AuthUser, id: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Equipo no encontrado');
    if (team.ownerId !== user.id && user.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Solo el dueño del equipo puede modificarlo');
    }
    return team;
  }
}

@ApiTags('Equipos')
@Controller()
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @ApiBearerAuth() @Get('me/teams') mine(@CurrentUser() u: AuthUser) {
    return this.service.mine(u);
  }
  @Public() @Get('teams/:slug') get(@Param('slug') slug: string) {
    return this.service.publicTeam(slug);
  }
  @ApiBearerAuth() @Post('teams') create(@CurrentUser() u: AuthUser, @Body() dto: CreateTeamDto) {
    return this.service.create(u, dto);
  }
  @ApiBearerAuth() @Patch('teams/:id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTeamDto) {
    return this.service.update(u, id, dto);
  }
  @ApiBearerAuth() @Delete('teams/:id') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(u, id);
  }
  @ApiBearerAuth()
  @Post('teams/:id/logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  logo(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadLogo(u, id, file);
  }
  @ApiBearerAuth() @Post('teams/:id/members') add(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) {
    return this.service.addMember(u, id, dto);
  }
  @ApiBearerAuth() @Delete('teams/:id/members/:playerId') removeMember(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('playerId', ParseUUIDPipe) playerId: string,
  ) {
    return this.service.removeMember(u, id, playerId);
  }
  @ApiBearerAuth() @Patch('teams/:id/captain') captain(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCaptainDto) {
    return this.service.setCaptain(u, id, dto);
  }
}

@Module({ controllers: [TeamsController], providers: [TeamsService] })
export class TeamsModule {}
