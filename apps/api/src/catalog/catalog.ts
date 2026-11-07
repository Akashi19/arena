import {
  Body,
  Controller,
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
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, Length, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import { slugify } from '../common/utils/index.js';
import { CatalogStatus, Platform } from '../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SportDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 60) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ protocols: ['https', 'http'] }) iconUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowsDraw?: boolean;
  @ApiPropertyOptional({ enum: CatalogStatus }) @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
export class UpdateSportDto extends PartialType(SportDto) {}

export class GameDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 60) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ protocols: ['https', 'http'] }) logoUrl?: string;
  @ApiPropertyOptional({ example: 'FPS' }) @IsOptional() @IsString() @Length(2, 30) category?: string;
  @ApiPropertyOptional({ enum: Platform, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Platform, { each: true })
  platforms?: Platform[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowsDraw?: boolean;
  @ApiPropertyOptional({ enum: CatalogStatus }) @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
export class UpdateGameDto extends PartialType(GameDto) {}

export class GameRankDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 40) rankName: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) rankLevel: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) rankOrder: number;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ protocols: ['https', 'http'] }) iconUrl?: string;
  @ApiPropertyOptional({ enum: CatalogStatus }) @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
}
export class UpdateGameRankDto extends PartialType(GameRankDto) {}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  sports(all = false) {
    return this.prisma.sport.findMany({
      where: all ? {} : { status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  games(all = false) {
    return this.prisma.game.findMany({
      where: all ? {} : { status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async ranks(gameIdOrSlug: string) {
    const game = await this.prisma.game.findFirst({
      where: /^[0-9a-f-]{36}$/i.test(gameIdOrSlug) ? { id: gameIdOrSlug } : { slug: gameIdOrSlug },
    });
    if (!game) throw new NotFoundException('Videojuego no encontrado');
    return this.prisma.gameRank.findMany({
      where: { gameId: game.id, status: 'ACTIVE' },
      orderBy: { rankOrder: 'asc' },
    });
  }

  async createSport(actor: AuthUser, dto: SportDto) {
    const sport = await this.prisma.sport.create({ data: { ...dto, slug: slugify(dto.name) } });
    await this.audit.log({ actorId: actor.id, action: 'SPORT_CREATED', entityType: 'Sport', entityId: sport.id, after: sport });
    return sport;
  }

  async updateSport(actor: AuthUser, id: string, dto: UpdateSportDto) {
    const before = await this.prisma.sport.findUniqueOrThrow({ where: { id } });
    const sport = await this.prisma.sport.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { slug: slugify(dto.name) } : {}) },
    });
    await this.audit.log({ actorId: actor.id, action: 'SPORT_UPDATED', entityType: 'Sport', entityId: id, before, after: sport });
    return sport;
  }

  async createGame(actor: AuthUser, dto: GameDto) {
    const game = await this.prisma.game.create({ data: { ...dto, slug: slugify(dto.name) } });
    await this.audit.log({ actorId: actor.id, action: 'GAME_CREATED', entityType: 'Game', entityId: game.id, after: game });
    return game;
  }

  async updateGame(actor: AuthUser, id: string, dto: UpdateGameDto) {
    const before = await this.prisma.game.findUniqueOrThrow({ where: { id } });
    const game = await this.prisma.game.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { slug: slugify(dto.name) } : {}) },
    });
    await this.audit.log({ actorId: actor.id, action: 'GAME_UPDATED', entityType: 'Game', entityId: id, before, after: game });
    return game;
  }

  async createRank(actor: AuthUser, gameId: string, dto: GameRankDto) {
    const rank = await this.prisma.gameRank.create({ data: { ...dto, gameId } });
    await this.audit.log({ actorId: actor.id, action: 'GAME_RANK_CREATED', entityType: 'GameRank', entityId: rank.id, after: rank });
    return rank;
  }

  async updateRank(actor: AuthUser, rankId: string, dto: UpdateGameRankDto) {
    const before = await this.prisma.gameRank.findUniqueOrThrow({ where: { id: rankId } });
    const rank = await this.prisma.gameRank.update({ where: { id: rankId }, data: dto });
    await this.audit.log({ actorId: actor.id, action: 'GAME_RANK_UPDATED', entityType: 'GameRank', entityId: rankId, before, after: rank });
    return rank;
  }
}

@ApiTags('Catálogo')
@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Public() @Get('sports') sports() {
    return this.service.sports();
  }

  @Public() @Get('games') games() {
    return this.service.games();
  }

  @Public() @Get('games/:id/ranks') ranks(@Param('id') id: string) {
    return this.service.ranks(id);
  }
}

@ApiTags('Admin · Catálogo')
@ApiBearerAuth()
@Roles('SUPERADMIN')
@Controller('admin')
export class CatalogAdminController {
  constructor(private readonly service: CatalogService) {}

  @Get('sports') sports(@Query('all') _all?: string) {
    return this.service.sports(true);
  }
  @Post('sports') createSport(@CurrentUser() u: AuthUser, @Body() dto: SportDto) {
    return this.service.createSport(u, dto);
  }
  @Patch('sports/:id') updateSport(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSportDto) {
    return this.service.updateSport(u, id, dto);
  }
  @Get('games') games() {
    return this.service.games(true);
  }
  @Post('games') createGame(@CurrentUser() u: AuthUser, @Body() dto: GameDto) {
    return this.service.createGame(u, dto);
  }
  @Patch('games/:id') updateGame(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGameDto) {
    return this.service.updateGame(u, id, dto);
  }
  @Post('games/:id/ranks') createRank(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GameRankDto) {
    return this.service.createRank(u, id, dto);
  }
  @Patch('ranks/:rankId') updateRank(@CurrentUser() u: AuthUser, @Param('rankId', ParseUUIDPipe) id: string, @Body() dto: UpdateGameRankDto) {
    return this.service.updateRank(u, id, dto);
  }
}

@Module({ controllers: [CatalogController, CatalogAdminController], providers: [CatalogService] })
export class CatalogModule {}
