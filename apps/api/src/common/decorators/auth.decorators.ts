import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export const IS_PUBLIC_KEY = 'isPublic';
/** Ruta accesible sin autenticación (si llega un token válido, igualmente se adjunta el usuario). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restringe la ruta a ciertos roles (RBAC). SUPERADMIN siempre pasa. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.user;
});
