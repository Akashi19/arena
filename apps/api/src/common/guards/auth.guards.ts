import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Role } from '../../generated/prisma/client.js';
import { AuthedRequest, IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/auth.decorators.js';

interface AccessPayload {
  sub: string;
  username: string;
  role: Role;
  typ: 'access';
}

/**
 * Guard global: valida el JWT de acceso (Authorization: Bearer).
 * Comprueba en BD que la cuenta siga activa y usa el rol actual (no el del token)
 * para que una suspensión o cambio de rol tenga efecto inmediato.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractToken(req);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Debes iniciar sesión');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, { secret: env.jwt.accessSecret });
      if (payload.typ !== 'access') throw new Error('tipo de token inválido');
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, role: true, status: true },
      });
      if (!user || user.status !== 'ACTIVE') throw new Error('cuenta inactiva');
      req.user = { id: user.id, username: user.username, role: user.role };
      return true;
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
  }

  private extractToken(req: AuthedRequest): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new UnauthorizedException('Debes iniciar sesión');
    if (user.role === 'SUPERADMIN' || roles.includes(user.role)) return true;
    throw new ForbiddenException('No tienes permisos para esta acción');
  }
}
