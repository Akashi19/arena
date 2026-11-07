import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO31661Alpha2,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService, MAX_IMAGE_BYTES } from '../storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PlanLimitsService } from '../plans/plans.js';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import { organizerPublicSelect, paginate, PaginationQuery } from '../common/utils/index.js';
import { OrganizerType } from '../generated/prisma/enums.js';
import { createOrganizerSpace } from './organizer-space.js';
import type { Prisma } from '../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const imageUpload = () => FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } });

// ----------------------------------------------------------------------------- DTOs

export class UpdateUserProfileDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 60) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 60) lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsISO31661Alpha2()
  country?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 80) city?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @Matches(/^(\+?[0-9 ()-]{6,20})?$/, { message: 'Teléfono inválido' })
  phone?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) bio?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 32) nickname?: string;
  @ApiPropertyOptional({ description: 'Visibilidad del perfil público de jugador' })
  @IsOptional()
  @IsObject()
  privacy?: Record<string, boolean>;
}

export class BecomeOrganizerDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 80) displayName: string;
  @ApiPropertyOptional({ enum: OrganizerType }) @IsOptional() @IsEnum(OrganizerType) organizerType?: OrganizerType;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
}

export class UpdateOrganizerDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 80) displayName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(120) legalName?: string;
  @ApiPropertyOptional({ enum: OrganizerType }) @IsOptional() @IsEnum(OrganizerType) organizerType?: OrganizerType;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsISO31661Alpha2()
  country?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 80) city?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true }, { message: 'Sitio web inválido' })
  website?: string;
  @ApiPropertyOptional({ description: 'Redes sociales: { instagram, x, youtube, twitch, tiktok, facebook, discord }' })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
  @ApiPropertyOptional({ description: 'Color de acento (#RRGGBB). Requiere personalización completa (PRO+)' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color inválido, usa formato #RRGGBB' })
  primaryColor?: string;
}

export class OrganizerListQuery extends PaginationQuery {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsISO31661Alpha2()
  country?: string;
  @IsOptional() @Type(() => String) @Transform(({ value }) => value === 'true') @IsBoolean() verified?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() featured?: boolean;
}

const SOCIAL_KEYS = new Set(['instagram', 'x', 'youtube', 'twitch', 'tiktok', 'facebook', 'discord', 'kick']);

function sanitizeSocialLinks(links: Record<string, string> | undefined) {
  if (!links) return undefined;
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(links)) {
    if (!SOCIAL_KEYS.has(key) || typeof value !== 'string' || !value.trim()) continue;
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new BadRequestException(`Enlace de ${key} inválido`);
    }
    if (url.protocol !== 'https:') throw new BadRequestException(`El enlace de ${key} debe usar https`);
    clean[key] = url.toString();
  }
  return clean;
}

// ----------------------------------------------------------------------------- Service

@Injectable()
export class OrganizersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly limits: PlanLimitsService,
  ) {}

  async myOrganizer(userId: string) {
    const organizer = await this.prisma.organizerProfile.findUnique({ where: { userId } });
    if (!organizer) throw new NotFoundException('No tienes un perfil de organizador');
    return organizer;
  }

  async updateUserProfile(userId: string, dto: UpdateUserProfileDto) {
    const { nickname, privacy, ...profile } = dto;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.userProfile.findUniqueOrThrow({ where: { userId } });
      const updated = await tx.userProfile.update({
        where: { userId },
        data: {
          ...profile,
          phone: profile.phone === '' ? null : profile.phone,
          privacy: privacy ? { ...(before.privacy as object), ...privacy } : undefined,
        },
      });
      const player = await tx.player.findUnique({ where: { userId } });
      if (player) {
        await tx.player.update({
          where: { id: player.id },
          data: {
            nickname: nickname ?? undefined,
            country: profile.country ?? undefined,
            fullName:
              profile.firstName || profile.lastName
                ? `${profile.firstName ?? before.firstName} ${profile.lastName ?? before.lastName}`
                : undefined,
          },
        });
      }
      return updated;
    });
  }

  async uploadAvatar(userId: string, file: Express.Multer.File | undefined) {
    const url = await this.storage.uploadPublicImage(file, `avatars/${userId}`);
    const profile = await this.prisma.userProfile.findUniqueOrThrow({ where: { userId } });
    await this.prisma.$transaction([
      this.prisma.userProfile.update({ where: { userId }, data: { avatarUrl: url } }),
      this.prisma.player.updateMany({ where: { userId }, data: { avatarUrl: url } }),
    ]);
    await this.storage.deletePublicByUrl(profile.avatarUrl);
    return { avatarUrl: url };
  }

  async becomeOrganizer(userId: string, dto: BecomeOrganizerDto) {
    const existing = await this.prisma.organizerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Ya eres organizador');
    const profile = await this.prisma.userProfile.findUniqueOrThrow({ where: { userId } });
    return this.prisma.$transaction(async (tx) => {
      const organizer = await createOrganizerSpace(tx, {
        userId,
        displayName: dto.displayName,
        country: profile.country,
        city: profile.city,
        description: dto.description,
        organizerType: dto.organizerType,
      });
      // Un SUPERADMIN conserva su rol
      await tx.user.updateMany({ where: { id: userId, role: 'PLAYER' }, data: { role: 'ORGANIZER' } });
      await this.audit.log(
        { actorId: userId, action: 'ORGANIZER_CREATED', entityType: 'OrganizerProfile', entityId: organizer.id },
        tx,
      );
      return organizer;
    });
  }

  async updateOrganizer(userId: string, dto: UpdateOrganizerDto) {
    const organizer = await this.myOrganizer(userId);
    if (dto.primaryColor !== undefined && dto.primaryColor !== organizer.primaryColor) {
      await this.limits.assertFeature(organizer.id, 'FULL_CUSTOMIZATION', 'El color de marca personalizado');
    }
    const { socialLinks, ...rest } = dto;
    const updated = await this.prisma.organizerProfile.update({
      where: { id: organizer.id },
      data: { ...rest, socialLinks: sanitizeSocialLinks(socialLinks) },
    });
    await this.audit.log({
      actorId: userId,
      action: 'ORGANIZER_UPDATED',
      entityType: 'OrganizerProfile',
      entityId: organizer.id,
      before: organizer,
      after: updated,
    });
    return updated;
  }

  async uploadOrganizerImage(userId: string, kind: 'logo' | 'banner', file: Express.Multer.File | undefined) {
    const organizer = await this.myOrganizer(userId);
    if (kind === 'banner') {
      await this.limits.assertFeature(organizer.id, 'FULL_CUSTOMIZATION', 'El banner personalizado');
    }
    const url = await this.storage.uploadPublicImage(file, `organizers/${organizer.id}/${kind}`);
    const field = kind === 'logo' ? 'logoUrl' : 'bannerUrl';
    await this.prisma.organizerProfile.update({ where: { id: organizer.id }, data: { [field]: url } });
    await this.storage.deletePublicByUrl(organizer[field]);
    await this.audit.log({
      actorId: userId,
      action: kind === 'logo' ? 'ORGANIZER_LOGO_UPDATED' : 'ORGANIZER_BANNER_UPDATED',
      entityType: 'OrganizerProfile',
      entityId: organizer.id,
    });
    return { [field]: url };
  }

  async list(q: OrganizerListQuery) {
    const where: Prisma.OrganizerProfileWhereInput = {
      user: { status: 'ACTIVE' },
      ...(q.q ? { displayName: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(q.country ? { country: q.country } : {}),
      ...(q.verified ? { verificationStatus: 'VERIFIED' } : {}),
      ...(q.featured ? { isFeatured: true } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organizerProfile.findMany({
        where,
        select: { ...organizerPublicSelect, description: true, _count: { select: { tournaments: true } } },
        orderBy: [{ isFeatured: 'desc' }, { reputation: { averageScore: 'desc' } }, { createdAt: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.organizerProfile.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  /** Perfil público /organizer/{username}. Nunca expone documentos ni datos privados. */
  async publicProfile(username: string) {
    const organizer = await this.prisma.organizerProfile.findFirst({
      where: { user: { username: username.toLowerCase(), status: 'ACTIVE' } },
      select: {
        ...organizerPublicSelect,
        description: true,
        bannerUrl: true,
        website: true,
        socialLinks: true,
        createdAt: true,
      },
    });
    if (!organizer) throw new NotFoundException('Organizador no encontrado');

    const now = new Date();
    const tournamentCard = {
      id: true,
      name: true,
      slug: true,
      status: true,
      startsAt: true,
      category: true,
      coverUrl: true,
      maxParticipants: true,
      entryFee: true,
      currency: true,
      mode: true,
      format: true,
      sport: { select: { name: true, slug: true } },
      game: { select: { name: true, slug: true, logoUrl: true } },
      _count: { select: { registrations: { where: { status: 'APPROVED' } } } },
    } as const;

    const [counts, upcoming, history, teamsParticipating] = await Promise.all([
      this.prisma.tournament.groupBy({
        by: ['status'],
        where: { organizerId: organizer.id, status: { not: 'DRAFT' } },
        _count: true,
      }),
      this.prisma.tournament.findMany({
        where: { organizerId: organizer.id, status: { in: ['OPEN', 'IN_PROGRESS'] }, startsAt: { gte: new Date(now.getTime() - 7 * 864e5) } },
        orderBy: { startsAt: 'asc' },
        take: 12,
        select: tournamentCard,
      }),
      this.prisma.tournament.findMany({
        where: { organizerId: organizer.id, status: { in: ['FINISHED', 'CANCELLED'] } },
        orderBy: { startsAt: 'desc' },
        take: 12,
        select: {
          ...tournamentCard,
          champion: {
            select: {
              team: { select: { name: true, logoUrl: true, slug: true } },
              player: { select: { nickname: true, avatarUrl: true } },
            },
          },
        },
      }),
      this.prisma.tournamentRegistration.findMany({
        where: { tournament: { organizerId: organizer.id }, status: 'APPROVED', teamId: { not: null } },
        distinct: ['teamId'],
        select: { teamId: true },
      }),
    ]);

    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));
    return {
      organizer,
      stats: {
        tournamentsOrganized: counts.reduce((acc, c) => acc + c._count, 0),
        finished: byStatus.FINISHED ?? 0,
        cancelled: byStatus.CANCELLED ?? 0,
        active: (byStatus.OPEN ?? 0) + (byStatus.IN_PROGRESS ?? 0),
        teamsParticipating: teamsParticipating.length,
      },
      upcoming,
      history,
    };
  }
}

// ----------------------------------------------------------------------------- Controllers

@ApiTags('Perfil de usuario')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly service: OrganizersService) {}

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserProfileDto) {
    return this.service.updateUserProfile(user.id, dto);
  }

  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(imageUpload())
  avatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadAvatar(user.id, file);
  }

  @Post('become-organizer')
  become(@CurrentUser() user: AuthUser, @Body() dto: BecomeOrganizerDto) {
    return this.service.becomeOrganizer(user.id, dto);
  }

  @Roles('ORGANIZER')
  @Get('organizer')
  organizer(@CurrentUser() user: AuthUser) {
    return this.service.myOrganizer(user.id);
  }

  @Roles('ORGANIZER')
  @Patch('organizer')
  updateOrganizer(@CurrentUser() user: AuthUser, @Body() dto: UpdateOrganizerDto) {
    return this.service.updateOrganizer(user.id, dto);
  }

  @Roles('ORGANIZER')
  @Post('organizer/logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(imageUpload())
  logo(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadOrganizerImage(user.id, 'logo', file);
  }

  @Roles('ORGANIZER')
  @Post('organizer/banner')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(imageUpload())
  banner(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadOrganizerImage(user.id, 'banner', file);
  }
}

@ApiTags('Organizadores')
@Controller('organizers')
export class OrganizersController {
  constructor(private readonly service: OrganizersService) {}

  @Public()
  @Get()
  list(@Query() q: OrganizerListQuery) {
    return this.service.list(q);
  }

  @Public()
  @Get(':username')
  profile(@Param('username') username: string) {
    return this.service.publicProfile(username);
  }
}

@Module({
  controllers: [MeController, OrganizersController],
  providers: [OrganizersService],
  exports: [OrganizersService],
})
export class OrganizersModule {}
