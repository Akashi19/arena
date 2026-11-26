import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CompetitiveLevel,
  DisciplineCategory,
  Platform,
  RegistrationStatus,
  TournamentFormat,
  TournamentMode,
  TournamentStatus,
} from '../../generated/prisma/enums.js';
import { PaginationQuery } from '../../common/utils/index.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const bool = ({ value }: { value: unknown }) => value === true || value === 'true';

export class CreateTournamentDto {
  @ApiProperty({ description: 'Nombre de la partida' })
  @Transform(trim)
  @IsString()
  @Length(3, 100)
  name: string;

  @ApiPropertyOptional({ description: 'Nombre del torneo / competición que agrupa la partida' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 100)
  competitionName?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) description?: string;

  @ApiProperty({ enum: DisciplineCategory }) @IsEnum(DisciplineCategory) category: DisciplineCategory;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sportId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gameId?: string;
  @ApiPropertyOptional({ enum: Platform }) @IsOptional() @IsEnum(Platform) platform?: Platform;

  @ApiProperty({ description: 'Fecha y hora de inicio (ISO 8601)' })
  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @ApiProperty({ description: 'Fecha límite de inscripción (ISO 8601)' })
  @Type(() => Date)
  @IsDate()
  registrationDeadline: Date;

  @ApiProperty({ minimum: 2, maximum: 1024 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(1024)
  maxParticipants: number;

  @ApiProperty({ enum: TournamentMode }) @IsEnum(TournamentMode) mode: TournamentMode;
  @ApiProperty({ enum: TournamentFormat }) @IsEnum(TournamentFormat) format: TournamentFormat;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(32) groupCount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(8) qualifiersPerGroup?: number;

  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() isOnline?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200) location?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @IsISO31661Alpha2() country?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) city?: string;

  @ApiPropertyOptional({
    description: 'Cuota de inscripción. Si es mayor que cero se cobra siempre con la cuenta de Mercado Pago del organizador',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  entryFee?: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'Moneda inválida (código ISO 4217)' })
  currency?: string;

  @ApiPropertyOptional({ description: 'Premio de la partida (texto libre, "" para quitarlo)', example: '500 USD al campeón' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(200)
  prize?: string | null;

  @ApiPropertyOptional({
    description: 'Canales oficiales de transmisión (YouTube, Twitch, Facebook, TikTok, Kick…). Las entradas vacías se ignoran; [] los quita',
    type: [String],
    example: ['https://www.twitch.tv/ligaandina', 'https://www.youtube.com/@ligaandina'],
  })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '') : value,
  )
  @IsArray()
  @ArrayMaxSize(6, { message: 'Máximo 6 canales de transmisión' })
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  streamChannels?: string[];

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(20000) rules?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) refundPolicy?: string;

  @ApiPropertyOptional({ enum: CompetitiveLevel }) @IsOptional() @IsEnum(CompetitiveLevel) minLevel?: CompetitiveLevel;
  @ApiPropertyOptional({ enum: CompetitiveLevel }) @IsOptional() @IsEnum(CompetitiveLevel) maxLevel?: CompetitiveLevel;
  @ApiPropertyOptional({ description: 'Rango mínimo del catálogo del videojuego ("" para quitarlo)' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  minRankId?: string | null;
  @ApiPropertyOptional({ description: 'Rango máximo del catálogo del videojuego ("" para quitarlo)' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  maxRankId?: string | null;

  @ApiPropertyOptional({ default: 3 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10) pointsWin?: number;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10) pointsDraw?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10) pointsLoss?: number;

  @ApiPropertyOptional({ description: 'Guardar como borrador (no visible públicamente)' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  draft?: boolean;
}

export class UpdateTournamentDto extends PartialType(OmitType(CreateTournamentDto, ['draft'] as const)) {
  @ApiPropertyOptional({ description: 'Motivo del cambio (se notifica a los inscritos si cambia el horario)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  changeReason?: string;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: ['OPEN', 'IN_PROGRESS', 'FINISHED'] })
  @IsIn(['OPEN', 'IN_PROGRESS', 'FINISHED'])
  status: 'OPEN' | 'IN_PROGRESS' | 'FINISHED';
}

export class CancelTournamentDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 500) reason: string;
}

export class TournamentListQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Búsqueda por nombre de partida, torneo, organizador o premio' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: DisciplineCategory }) @IsOptional() @IsEnum(DisciplineCategory) category?: DisciplineCategory;
  @ApiPropertyOptional({ description: 'slug del deporte' }) @IsOptional() @IsString() sport?: string;
  @ApiPropertyOptional({ description: 'slug del videojuego' }) @IsOptional() @IsString() game?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @IsISO31661Alpha2() country?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @ApiPropertyOptional({ enum: TournamentMode }) @IsOptional() @IsEnum(TournamentMode) mode?: TournamentMode;
  @ApiPropertyOptional({ enum: TournamentFormat }) @IsOptional() @IsEnum(TournamentFormat) format?: TournamentFormat;
  @ApiPropertyOptional({ enum: TournamentStatus }) @IsOptional() @IsEnum(TournamentStatus) status?: TournamentStatus;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) feeMin?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) feeMax?: number;
  @ApiPropertyOptional({ description: 'Solo online (true) o presencial (false)' })
  @IsOptional()
  @IsIn(['true', 'false'])
  online?: 'true' | 'false';
  @ApiPropertyOptional({ description: 'username del organizador' }) @IsOptional() @IsString() organizer?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() featured?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() verifiedOnly?: boolean;
  @ApiPropertyOptional({ enum: ['upcoming', 'recent', 'fee_asc', 'fee_desc', 'popular'] })
  @IsOptional()
  @IsIn(['upcoming', 'recent', 'fee_asc', 'fee_desc', 'popular'])
  sort?: 'upcoming' | 'recent' | 'fee_asc' | 'fee_desc' | 'popular';
}

export class MyTournamentsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: TournamentStatus }) @IsOptional() @IsEnum(TournamentStatus) status?: TournamentStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() q?: string;
}

export class RequestRegistrationDto {
  @ApiPropertyOptional({ description: 'Equipo a inscribir (torneos por equipos)' })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;

  @ApiProperty({ description: 'Confirma haber leído reglamento, cuota y condiciones' })
  @Transform(bool)
  @IsBoolean()
  acceptRules: boolean;
}

export class DecideRegistrationDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300) note?: string;
}

export class RegistrationListQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: RegistrationStatus })
  @IsOptional()
  @IsEnum(RegistrationStatus)
  status?: RegistrationStatus;
  @ApiPropertyOptional({ enum: CompetitiveLevel, description: 'Nivel del jugador en el videojuego de la partida' })
  @IsOptional()
  @IsEnum(CompetitiveLevel)
  level?: CompetitiveLevel;
}

export class SetMvpDto {
  @ApiPropertyOptional({ description: 'Jugador destacado (null para quitarlo)', nullable: true })
  @IsOptional()
  @IsUUID()
  playerId?: string | null;
}
