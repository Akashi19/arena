import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { AuthUser, CurrentUser, Public } from '../common/decorators/auth.decorators.js';
import { createOrganizerSpace } from '../organizers/organizer-space.js';
import { ChangePasswordDto, LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto.js';
import type { Role } from '../generated/prisma/client.js';

const BCRYPT_ROUNDS = 12;
// Hash señuelo: la comparación se ejecuta aunque el usuario no exista (tiempos de respuesta uniformes)
const DUMMY_HASH = bcrypt.hashSync('arena-timing-decoy', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
      select: { email: true, username: true },
    });
    if (exists) {
      throw new ConflictException(
        exists.email === dto.email ? 'El correo ya está registrado' : 'El nombre de usuario no está disponible',
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const role: Role = dto.asOrganizer === false ? 'PLAYER' : 'ORGANIZER';

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          passwordHash,
          role,
          profile: {
            create: {
              firstName: dto.firstName,
              lastName: dto.lastName,
              country: dto.country,
              city: dto.city,
              phone: dto.phone,
              bio: dto.description,
            },
          },
          // Todo usuario tiene ficha de jugador (perfil gamer, inscripciones individuales)
          player: {
            create: {
              fullName: `${dto.firstName} ${dto.lastName}`,
              nickname: dto.username,
              country: dto.country,
            },
          },
        },
      });
      if (role === 'ORGANIZER') {
        await createOrganizerSpace(tx, {
          userId: created.id,
          displayName: dto.organizerName ?? `${dto.firstName} ${dto.lastName}`,
          country: dto.country,
          city: dto.city,
          description: dto.description,
          organizerType: dto.organizerType,
        });
      }
      await this.audit.log(
        { actorId: created.id, action: 'USER_REGISTERED', entityType: 'User', entityId: created.id, after: { role }, ip },
        tx,
      );
      return created;
    });

    await this.notifications.notify({
      userId: user.id,
      type: 'WELCOME',
      title: '¡Bienvenido a Arena!',
      body:
        role === 'ORGANIZER'
          ? 'Tu espacio de organizador está listo. Sube tu logo y crea tu primer torneo.'
          : 'Completa tu perfil gamer y busca torneos para competir.',
      link: role === 'ORGANIZER' ? '/dashboard' : '/torneos',
    });

    return this.issueTokens(user.id, user.username, user.role, user.tokenVersion);
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.identifier }, { username: dto.identifier }] },
    });
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await bcrypt.compare(dto.password, hash);
    if (!user || !ok) throw new UnauthorizedException('Credenciales incorrectas');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Tu cuenta está suspendida');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'USER_LOGIN', entityType: 'User', entityId: user.id, ip });
    return this.issueTokens(user.id, user.username, user.role, user.tokenVersion);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; tv: number; typ: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: env.jwt.refreshSecret });
    } catch {
      throw new UnauthorizedException('Sesión expirada, vuelve a iniciar sesión');
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException('Token inválido');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('Sesión revocada, vuelve a iniciar sesión');
    }
    return this.issueTokens(user.id, user.username, user.role, user.tokenVersion);
  }

  /** Cierra sesión en todos los dispositivos invalidando los refresh tokens emitidos. */
  async logoutAll(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    return { ok: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
    });
    await this.audit.log({ actorId: userId, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: userId });
    return this.issueTokens(updated.id, updated.username, updated.role, updated.tokenVersion);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        profile: true,
        player: { select: { id: true, nickname: true, avatarUrl: true } },
        organizerProfile: {
          select: {
            id: true,
            displayName: true,
            logoUrl: true,
            verificationStatus: true,
            primaryColor: true,
          },
        },
      },
    });
    const unreadNotifications = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { ...user, unreadNotifications };
  }

  private async issueTokens(userId: string, username: string, role: Role, tokenVersion: number) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, username, role, typ: 'access' },
      { secret: env.jwt.accessSecret, expiresIn: env.jwt.accessTtl as never },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tv: tokenVersion, typ: 'refresh' },
      { secret: env.jwt.refreshSecret, expiresIn: `${env.jwt.refreshTtlDays}d` as never },
    );
    return { accessToken, refreshToken, user: { id: userId, username, role } };
  }
}

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, req.ip);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user.id);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
