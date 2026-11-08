import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ReputationLevel } from '../generated/prisma/enums.js';

/**
 * Motor de reputación (Trust & Reputation System).
 *
 * Reglas (documentadas en docs/ARQUITECTURA.md):
 * - Ponderación: organización 25 %, horarios 25 %, comunicación 20 %, transparencia 15 %, experiencia 15 %.
 * - Solo cuentan valoraciones con moderación APPROVED.
 * - Nivel consolidado solo con ≥ 10 valoraciones válidas y ≥ 5 torneos completados; si no, NEW.
 * - Cumplimiento = completados / (completados + cancelaciones computables) × 100. Las partidas en curso no cuentan.
 *   Una cancelación no computa si el SUPERADMIN la marcó como justificada o si no tenía participantes aprobados.
 * - Las incidencias solo cuentan si están confirmadas (RESOLVED). No restan puntuación: se muestran como indicador.
 * - El plan contratado no interviene en ningún cálculo.
 */

export const RATING_WEIGHTS = {
  organization: 0.25,
  punctuality: 0.25,
  communication: 0.2,
  transparency: 0.15,
  experience: 0.15,
} as const;

export const MIN_RATINGS_FOR_LEVEL = 10;
export const MIN_COMPLETED_FOR_LEVEL = 5;
export const RATING_EDIT_DAYS = 7;
export const RESPONSE_EDIT_DAYS = 7;

export interface CriteriaScores {
  organization: number;
  punctuality: number;
  communication: number;
  transparency: number;
  experience: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Puntuación ponderada con dos decimales. */
export function weightedScore(s: CriteriaScores): number {
  return round2(
    s.organization * RATING_WEIGHTS.organization +
      s.punctuality * RATING_WEIGHTS.punctuality +
      s.communication * RATING_WEIGHTS.communication +
      s.transparency * RATING_WEIGHTS.transparency +
      s.experience * RATING_WEIGHTS.experience,
  );
}

export function reputationLevel(score: number, totalRatings: number, completedTournaments: number): ReputationLevel {
  if (totalRatings < MIN_RATINGS_FOR_LEVEL || completedTournaments < MIN_COMPLETED_FOR_LEVEL) return 'NEW';
  if (score >= 4.8) return 'TOP';
  if (score >= 4.5) return 'EXCELLENT';
  if (score >= 4.0) return 'GOOD';
  // La especificación define INITIAL para 3.00-3.99; por debajo de 3 se mantiene como INITIAL (no hay nivel inferior)
  return 'INITIAL';
}

export function completionRate(completed: number, countedCancellations: number): number {
  const due = completed + countedCancellations;
  return due ? round2((completed / due) * 100) : 0;
}

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Recalcula desde cero (idempotente) y registra en auditoría los cambios de puntuación o nivel. */
  async recalculate(organizerId: string, actorId?: string, reason?: string) {
    const [agg, finished, cancelled, incidents, before] = await Promise.all([
      this.prisma.organizerRating.aggregate({
        where: { organizerId, moderationStatus: 'APPROVED' },
        _avg: {
          organizationScore: true,
          punctualityScore: true,
          communicationScore: true,
          transparencyScore: true,
          overallExperienceScore: true,
        },
        _count: true,
      }),
      this.prisma.tournament.count({ where: { organizerId, status: 'FINISHED' } }),
      this.prisma.tournament.count({
        where: {
          organizerId,
          status: 'CANCELLED',
          // Sin revisar (NULL) o revisada como injustificada; `not: true` excluiría los NULL en SQL
          OR: [{ cancellationJustified: null }, { cancellationJustified: false }],
          registrations: { some: { status: 'APPROVED' } },
        },
      }),
      this.prisma.organizerIncident.count({ where: { organizerId, status: 'RESOLVED' } }),
      this.prisma.organizerReputation.findUnique({ where: { organizerId } }),
    ]);

    const avg = {
      organization: Number(agg._avg.organizationScore ?? 0),
      punctuality: Number(agg._avg.punctualityScore ?? 0),
      communication: Number(agg._avg.communicationScore ?? 0),
      transparency: Number(agg._avg.transparencyScore ?? 0),
      experience: Number(agg._avg.overallExperienceScore ?? 0),
    };
    const total = agg._count;
    const score = total ? weightedScore(avg) : 0;
    const level = reputationLevel(score, total, finished);
    const data = {
      averageScore: score,
      totalRatings: total,
      organizationAverage: round2(avg.organization),
      punctualityAverage: round2(avg.punctuality),
      communicationAverage: round2(avg.communication),
      transparencyAverage: round2(avg.transparency),
      experienceAverage: round2(avg.experience),
      completedTournaments: finished,
      cancelledTournaments: cancelled,
      dueTournaments: finished + cancelled,
      completionRate: completionRate(finished, cancelled),
      confirmedIncidents: incidents,
      reputationLevel: level,
      lastCalculatedAt: new Date(),
    };
    const saved = await this.prisma.organizerReputation.upsert({
      where: { organizerId },
      update: data,
      create: { organizerId, ...data },
    });

    if (!before || Number(before.averageScore) !== score || before.reputationLevel !== level || before.totalRatings !== total) {
      await this.audit.log({
        actorId: actorId ?? null,
        action: 'REPUTATION_RECALCULATED',
        entityType: 'OrganizerReputation',
        entityId: organizerId,
        before: before ? { score: Number(before.averageScore), level: before.reputationLevel, total: before.totalRatings } : undefined,
        after: { score, level, total },
        reason,
      });
    }
    return saved;
  }

  /** Para disparadores que no deben fallar la operación principal (finalizar o cancelar una partida). */
  recalculateSafe(organizerId: string, reason?: string) {
    return this.recalculate(organizerId, undefined, reason).catch((e) => this.logger.error(`Reputación ${organizerId}: ${e}`));
  }
}

@Global()
@Module({ providers: [ReputationService], exports: [ReputationService] })
export class ReputationModule {}
