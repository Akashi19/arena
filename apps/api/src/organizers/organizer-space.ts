import { NotFoundException } from '@nestjs/common';
import type { OrganizerType, Prisma } from '../generated/prisma/client.js';

export interface OrganizerSpaceInput {
  userId: string;
  displayName: string;
  country: string;
  city: string;
  description?: string;
  organizerType?: OrganizerType;
}

/**
 * Crea el espacio del organizador: perfil, membresía OWNER, suscripción FREE vigente
 * (con su historial) y la fila de reputación inicial (nivel NEW).
 * Debe ejecutarse dentro de una transacción.
 */
export async function createOrganizerSpace(tx: Prisma.TransactionClient, input: OrganizerSpaceInput) {
  const free = await tx.subscriptionPlan.findUnique({ where: { code: 'FREE' } });
  if (!free) throw new NotFoundException('El plan FREE no está configurado. Ejecuta el seed.');

  const organizer = await tx.organizerProfile.create({
    data: {
      userId: input.userId,
      displayName: input.displayName,
      country: input.country,
      city: input.city,
      description: input.description,
      organizerType: input.organizerType ?? 'PERSON',
      members: { create: { userId: input.userId, role: 'OWNER' } },
      reputation: { create: {} },
    },
  });

  const subscription = await tx.subscription.create({
    data: {
      organizerId: organizer.id,
      planId: free.id,
      status: 'ACTIVE',
      billingPeriod: 'MONTHLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: null, // FREE no vence
      provider: 'MANUAL',
    },
  });
  await tx.subscriptionHistory.create({
    data: {
      subscriptionId: subscription.id,
      toPlanId: free.id,
      toStatus: 'ACTIVE',
      changedById: input.userId,
      reason: 'Alta automática en plan FREE',
    },
  });

  return organizer;
}
