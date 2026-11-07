import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { OrganizerType } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 60, { message: 'Los nombres deben tener entre 2 y 60 caracteres' }) firstName: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 60, { message: 'Los apellidos deben tener entre 2 y 60 caracteres' }) lastName: string;

  @ApiProperty({ description: '3-24 caracteres: letras, números, guion bajo o guion' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9_-]{3,24}$/, { message: 'El usuario debe tener 3-24 caracteres: letras, números, _ o -' })
  username: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email: string;

  @ApiProperty({ description: 'Mínimo 8 caracteres, con letras y números' })
  @IsString()
  @Length(8, 72, { message: 'La contraseña debe tener entre 8 y 72 caracteres' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'La contraseña debe incluir letras y números' })
  password: string;

  @ApiProperty({ example: 'PE' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsISO31661Alpha2({ message: 'País inválido (código ISO de 2 letras)' })
  country: string;

  @ApiProperty() @Transform(trim) @IsString() @Length(2, 80, { message: 'La ciudad debe tener entre 2 y 80 caracteres' }) city: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Teléfono inválido' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Descripción del organizador / biografía' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Crear también el perfil de organizador', default: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  asOrganizer?: boolean = true;

  @ApiPropertyOptional({ description: 'Nombre público del organizador (por defecto nombre y apellido)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  organizerName?: string;

  @ApiPropertyOptional({ enum: OrganizerType })
  @IsOptional()
  @IsEnum(OrganizerType)
  organizerType?: OrganizerType;
}

export class LoginDto {
  @ApiProperty({ description: 'Correo o nombre de usuario' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(3, 254)
  identifier: string;

  @ApiProperty() @IsString() @Length(1, 72) password: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() currentPassword: string;

  @ApiProperty()
  @IsString()
  @Length(8, 72, { message: 'La contraseña debe tener entre 8 y 72 caracteres' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'La contraseña debe incluir letras y números' })
  newPassword: string;
}
