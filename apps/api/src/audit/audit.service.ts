import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Serializa Decimals/Dates de forma segura
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Registro de auditoría centralizado (AuditLogs). Nunca debe romper la operación principal. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    try {
      await db.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: toJson(entry.before),
          after: toJson(entry.after),
          reason: entry.reason,
          ip: entry.ip,
        },
      });
    } catch (err) {
      if (tx) throw err;
      this.logger.error(`No se pudo registrar auditoría ${entry.action}: ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
