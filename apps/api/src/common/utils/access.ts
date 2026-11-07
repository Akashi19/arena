import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../decorators/auth.decorators.js';

/**
 * Aislamiento entre organizadores: solo el propietario y los administradores
 * del espacio (organizer_members) pueden gestionar sus competiciones.
 * SUPERADMIN puede supervisar cualquier espacio.
 */
export async function assertCanManageOrganizer(prisma: PrismaService, user: AuthUser, organizerId: string) {
  if (user.role === 'SUPERADMIN') return;
  const member = await prisma.organizerMember.findUnique({
    where: { organizerId_userId: { organizerId, userId: user.id } },
    select: { id: true },
  });
  if (!member) throw new ForbiddenException('No puedes administrar competiciones de otro organizador');
}

/** Organizador "propio" del usuario (dueño). */
export async function requireOwnOrganizer(prisma: PrismaService, userId: string) {
  const organizer = await prisma.organizerProfile.findUnique({ where: { userId } });
  if (!organizer) throw new NotFoundException('Primero activa tu perfil de organizador');
  return organizer;
}

export const LEVEL_ORDER = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'PROFESSIONAL'] as const;
export function levelIndex(level: string | null | undefined) {
  return level ? LEVEL_ORDER.indexOf(level as (typeof LEVEL_ORDER)[number]) : -1;
}
