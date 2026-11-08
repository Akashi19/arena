import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { StorageService, MAX_DOCUMENT_BYTES } from '../storage/storage.service.js';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import { assertCanManageOrganizer } from '../common/utils/access.js';
import { paginate, PaginationQuery } from '../common/utils/index.js';
import { IncidentStatus, IncidentType, ModerationStatus, ReputationLevel } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { RATING_EDIT_DAYS, RESPONSE_EDIT_DAYS, ReputationService, weightedScore } from './reputation.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DAY = 864e5;

/** Filtro básico de lenguaje ofensivo (se complementa con la moderación del SUPERADMIN). */
const OFFENSIVE = ['idiota', 'imbecil', 'estupido', 'mierda', 'puta', 'puto', 'pendejo', 'cabron', 'maricon', 'hdp', 'malparido', 'gonorrea'];
export function isOffensive(text?: string | null) {
  if (!text) return false;
  const norm = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return OFFENSIVE.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(norm));
}

// =========================================================================== DTOs

const Score = () => (target: object, key: string) => {
  ApiProperty({ minimum: 1, maximum: 5 })(target, key);
  Type(() => Number)(target, key);
  IsInt()(target, key);
  Min(1, { message: 'Cada criterio va de 1 a 5 estrellas' })(target, key);
  Max(5, { message: 'Cada criterio va de 1 a 5 estrellas' })(target, key);
};

export class RatingScoresDto {
  @Score() organizationScore: number;
  @Score() punctualityScore: number;
  @Score() communicationScore: number;
  @Score() transparencyScore: number;
  @Score() overallExperienceScore: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?: string;
}

export class CreateRatingDto extends RatingScoresDto {
  @ApiProperty() @IsUUID() tournamentId: string;
}

export class ResponseDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 1000, { message: 'La respuesta debe tener entre 2 y 1000 caracteres' }) response: string;
}

export class ReportDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 500, { message: 'Describe el motivo (5 a 500 caracteres)' }) reason: string;
}

export class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType }) @IsEnum(IncidentType) incidentType: IncidentType;
  @ApiProperty() @Transform(trim) @IsString() @Length(20, 3000, { message: 'Describe la incidencia con al menos 20 caracteres' }) description: string;
}

export class ResolveIncidentDto {
  @ApiProperty({ enum: ['UNDER_REVIEW', 'RESOLVED', 'DISMISSED'] }) @IsIn(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']) status: 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  @ApiProperty({ description: 'Resolución administrativa (pública si se confirma)' })
  @Transform(trim)
  @IsString()
  @Length(5, 2000)
  resolution: string;
}

export class ModerateRatingDto {
  @ApiProperty({ enum: ['APPROVED', 'HIDDEN', 'SUSPENDED'] }) @IsIn(['APPROVED', 'HIDDEN', 'SUSPENDED']) status: 'APPROVED' | 'HIDDEN' | 'SUSPENDED';
  @ApiProperty({ description: 'Justificación obligatoria (auditoría)' }) @Transform(trim) @IsString() @Length(5, 500) reason: string;
}

export class CancellationReviewDto {
  @ApiProperty() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() justified: boolean;
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 500) reason: string;
}

export class RatingListQuery extends PaginationQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) stars?: number;
}

export class AdminRatingQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ModerationStatus }) @IsOptional() @IsEnum(ModerationStatus) status?: ModerationStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() suspicious?: boolean;
}

export class AdminIncidentQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: IncidentStatus }) @IsOptional() @IsEnum(IncidentStatus) status?: IncidentStatus;
}

export class AdminReputationQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ enum: ReputationLevel }) @IsOptional() @IsEnum(ReputationLevel) level?: ReputationLevel;
}

// =========================================================================== Selects

const publicRatingSelect = {
  id: true,
  organizationScore: true,
  punctualityScore: true,
  communicationScore: true,
  transparencyScore: true,
  overallExperienceScore: true,
  finalScore: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  tournament: { select: { name: true, slug: true } },
  participant: { select: { username: true, player: { select: { nickname: true, avatarUrl: true } } } },
  response: { where: { moderationStatus: 'APPROVED' }, select: { response: true, createdAt: true, updatedAt: true } },
} satisfies Prisma.OrganizerRatingSelect;

// =========================================================================== Servicio

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly reputation: ReputationService,
  ) {}

  /** ¿Participó el usuario en el torneo? (inscripción aprobada con participación validada al finalizar) */
  private async participation(userId: string, tournamentId: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, name: true, slug: true, status: true, organizerId: true, startsAt: true, endsAt: true, organizer: { select: { userId: true } } },
    });
    if (!t) throw new NotFoundException('Partida no encontrada');
    const regs = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        status: 'APPROVED',
        OR: [{ requestedById: userId }, { player: { userId } }, { team: { members: { some: { player: { userId } } } } }],
      },
      select: {
        participationValidated: true,
        requestedById: true,
        player: { select: { userId: true } },
        team: { select: { members: { where: { player: { userId } }, select: { joinedAt: true, leftAt: true } } } },
      },
    });
    const end = t.endsAt ?? new Date();
    const participated = regs.some(
      (r) =>
        r.requestedById === userId ||
        r.player?.userId === userId ||
        r.team?.members.some((m) => m.joinedAt <= end && (!m.leftAt || m.leftAt >= t.startsAt)),
    );
    const validated = regs.some((r) => r.participationValidated);
    const member = await this.prisma.organizerMember.findUnique({
      where: { organizerId_userId: { organizerId: t.organizerId, userId } },
      select: { id: true },
    });
    return { t, participated, validated, isOrganizer: !!member || t.organizer.userId === userId };
  }

  /** Estado del usuario frente a un torneo: si puede valorar, su valoración e incidencias. */
  async feedback(user: AuthUser, tournamentId: string) {
    const p = await this.participation(user.id, tournamentId);
    const [rating, incidents] = await Promise.all([
      this.prisma.organizerRating.findUnique({
        where: { participantId_tournamentId: { participantId: user.id, tournamentId } },
        select: { ...publicRatingSelect, editableUntil: true, moderationStatus: true },
      }),
      this.prisma.organizerIncident.findMany({
        where: { tournamentId, reportedBy: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, incidentType: true, status: true, createdAt: true, resolution: true },
      }),
    ]);
    let reason: string | null = null;
    if (p.isOrganizer) reason = 'No puedes valorar tu propia partida';
    else if (!p.participated) reason = 'Solo los participantes confirmados pueden valorar';
    else if (p.t.status !== 'FINISHED') reason = 'Podrás valorar cuando la partida finalice';
    else if (!p.validated) reason = 'Tu participación aún no fue validada';
    return {
      canRate: !reason && !rating,
      canEdit: !!rating && rating.editableUntil > new Date(),
      reason: rating ? null : reason,
      rating,
      canReportIncident: p.participated && !p.isOrganizer && ['IN_PROGRESS', 'FINISHED', 'CANCELLED'].includes(p.t.status),
      incidents,
    };
  }

  async create(user: AuthUser, organizerId: string, dto: CreateRatingDto) {
    const p = await this.participation(user.id, dto.tournamentId);
    if (p.t.organizerId !== organizerId) throw new BadRequestException('La partida no pertenece a este organizador');
    if (p.isOrganizer) throw new ForbiddenException('No puedes valorar tu propia partida');
    if (!p.participated) throw new ForbiddenException('Solo los participantes confirmados pueden valorar');
    if (p.t.status !== 'FINISHED') throw new BadRequestException('Solo se valoran partidas finalizadas');
    if (!p.validated) throw new ForbiddenException('Tu participación aún no fue validada');

    const flags = await this.suspicionFlags(user.id, organizerId, dto.comment);
    const created = await this.prisma.organizerRating.create({
      data: {
        organizerId,
        tournamentId: dto.tournamentId,
        participantId: user.id,
        organizationScore: dto.organizationScore,
        punctualityScore: dto.punctualityScore,
        communicationScore: dto.communicationScore,
        transparencyScore: dto.transparencyScore,
        overallExperienceScore: dto.overallExperienceScore,
        finalScore: weightedScore(toCriteria(dto)),
        comment: dto.comment || null,
        // Sospechosa u ofensiva: queda pendiente de moderación y no cuenta hasta revisarse
        moderationStatus: flags.length ? 'PENDING' : 'APPROVED',
        isSuspicious: flags.length > 0,
        editableUntil: new Date(Date.now() + RATING_EDIT_DAYS * DAY),
      },
      select: { ...publicRatingSelect, moderationStatus: true, editableUntil: true },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'RATING_CREATED',
      entityType: 'OrganizerRating',
      entityId: created.id,
      after: { finalScore: Number(created.finalScore), flags },
    });
    await this.reputation.recalculate(organizerId, user.id, 'Nueva valoración');
    const owner = await this.prisma.organizerProfile.findUnique({ where: { id: organizerId }, select: { userId: true, user: { select: { username: true } } } });
    if (owner && created.moderationStatus === 'APPROVED') {
      await this.notifications.notify({
        userId: owner.userId,
        type: 'RATING_RECEIVED',
        title: `Nueva valoración: ${Number(created.finalScore).toFixed(2)} ★`,
        body: `Un participante de ${p.t.name} valoró tu organización.`,
        link: '/dashboard/reputacion',
      });
    }
    return created;
  }

  /** Edición por el autor dentro del plazo; conserva el historial completo. */
  async update(user: AuthUser, ratingId: string, dto: RatingScoresDto) {
    const r = await this.prisma.organizerRating.findUnique({ where: { id: ratingId } });
    if (!r) throw new NotFoundException('Valoración no encontrada');
    if (r.participantId !== user.id) throw new ForbiddenException('Solo el autor puede editar su valoración');
    if (r.editableUntil < new Date()) throw new BadRequestException(`El plazo de edición de ${RATING_EDIT_DAYS} días terminó`);
    if (r.moderationStatus === 'SUSPENDED' || r.moderationStatus === 'HIDDEN') throw new ForbiddenException('La valoración está moderada');

    const offensive = isOffensive(dto.comment);
    const previous = snapshot(r);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.organizerRating.update({
        where: { id: ratingId },
        data: {
          organizationScore: dto.organizationScore,
          punctualityScore: dto.punctualityScore,
          communicationScore: dto.communicationScore,
          transparencyScore: dto.transparencyScore,
          overallExperienceScore: dto.overallExperienceScore,
          finalScore: weightedScore(toCriteria(dto)),
          comment: dto.comment || null,
          ...(offensive ? { moderationStatus: 'PENDING' as const, isSuspicious: true } : {}),
        },
        select: { ...publicRatingSelect, moderationStatus: true, editableUntil: true },
      });
      await tx.ratingHistory.create({
        data: { ratingId, previousValues: previous, newValues: snapshot({ ...r, ...dto, finalScore: u.finalScore, comment: u.comment }), changedBy: user.id, reason: 'Edición del autor' },
      });
      return u;
    });
    await this.reputation.recalculate(r.organizerId, user.id, 'Valoración editada');
    return updated;
  }

  async listPublic(organizerId: string, q: RatingListQuery) {
    const where: Prisma.OrganizerRatingWhereInput = {
      organizerId,
      moderationStatus: 'APPROVED',
      ...(q.stars ? { finalScore: { gte: q.stars - 0.5, lt: q.stars + 0.5 } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organizerRating.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: publicRatingSelect,
      }),
      this.prisma.organizerRating.count({ where }),
    ]);
    // Identificación pública por nickname (no se exponen nombres reales)
    return paginate(
      items.map(({ participant, ...r }) => ({
        ...r,
        author: { nickname: participant.player?.nickname ?? participant.username, username: participant.username, avatarUrl: participant.player?.avatarUrl ?? null },
        response: r.response ?? null,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  /** Indicadores públicos: reputación, distribución de estrellas, evolución mensual e incidencias confirmadas. */
  async publicReputation(organizerId: string) {
    const organizer = await this.prisma.organizerProfile.findUnique({
      where: { id: organizerId },
      select: { id: true, verificationStatus: true, verifiedAt: true, reputation: true },
    });
    if (!organizer) throw new NotFoundException('Organizador no encontrado');
    const reputation = organizer.reputation ?? (await this.reputation.recalculate(organizerId));
    const [ratings, incidents] = await Promise.all([
      this.prisma.organizerRating.findMany({
        where: { organizerId, moderationStatus: 'APPROVED' },
        select: { finalScore: true, createdAt: true },
      }),
      this.prisma.organizerIncident.findMany({
        where: { organizerId, status: 'RESOLVED' },
        orderBy: { resolvedAt: 'desc' },
        take: 20,
        select: { id: true, incidentType: true, resolution: true, resolvedAt: true, createdAt: true, tournament: { select: { name: true, slug: true } } },
      }),
    ]);
    return {
      reputation,
      distribution: starDistribution(ratings.map((r) => Number(r.finalScore))),
      monthly: monthlyEvolution(ratings.map((r) => ({ score: Number(r.finalScore), at: r.createdAt }))),
      confirmedIncidents: incidents,
      smallSample: reputation.totalRatings < 10 || reputation.completedTournaments < 5,
    };
  }

  /** Panel del organizador: indicadores + comentarios recientes + respuestas pendientes. */
  async myReputation(user: AuthUser) {
    const organizer = await this.prisma.organizerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!organizer) throw new NotFoundException('Primero activa tu perfil de organizador');
    const [pub, recent, pending, openIncidents] = await Promise.all([
      this.publicReputation(organizer.id),
      this.prisma.organizerRating.findMany({
        where: { organizerId: organizer.id, moderationStatus: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { ...publicRatingSelect, response: { select: { response: true, createdAt: true, editableUntil: true, moderationStatus: true } } },
      }),
      this.prisma.organizerRating.count({ where: { organizerId: organizer.id, moderationStatus: 'APPROVED', response: null } }),
      this.prisma.organizerIncident.count({ where: { organizerId: organizer.id, status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    ]);
    return {
      ...pub,
      organizerId: organizer.id,
      pendingResponses: pending,
      openIncidents,
      recent: recent.map(({ participant, ...r }) => ({
        ...r,
        author: { nickname: participant.player?.nickname ?? participant.username, username: participant.username, avatarUrl: participant.player?.avatarUrl ?? null },
      })),
    };
  }

  // --------------------------------------------------------------------------- Respuestas y reportes

  async respond(user: AuthUser, ratingId: string, dto: ResponseDto) {
    const r = await this.prisma.organizerRating.findUnique({ where: { id: ratingId }, include: { response: true, tournament: { select: { name: true, slug: true } } } });
    if (!r) throw new NotFoundException('Valoración no encontrada');
    await assertCanManageOrganizer(this.prisma, user, r.organizerId);
    if (r.response) throw new ConflictException('Ya respondiste esta valoración; puedes editar tu respuesta');
    if (isOffensive(dto.response)) throw new BadRequestException('La respuesta contiene lenguaje ofensivo');
    const created = await this.prisma.organizerResponse.create({
      data: { ratingId, organizerId: r.organizerId, response: dto.response, editableUntil: new Date(Date.now() + RESPONSE_EDIT_DAYS * DAY) },
    });
    await this.audit.log({ actorId: user.id, action: 'RATING_RESPONSE_CREATED', entityType: 'OrganizerRating', entityId: ratingId });
    await this.notifications.notify({
      userId: r.participantId,
      type: 'RATING_RESPONSE',
      title: 'El organizador respondió tu valoración',
      body: `Sobre ${r.tournament.name}.`,
      link: `/torneos/${r.tournament.slug}`,
    });
    return created;
  }

  async editResponse(user: AuthUser, ratingId: string, dto: ResponseDto) {
    const resp = await this.prisma.organizerResponse.findUnique({ where: { ratingId } });
    if (!resp) throw new NotFoundException('Respuesta no encontrada');
    await assertCanManageOrganizer(this.prisma, user, resp.organizerId);
    if (resp.editableUntil < new Date()) throw new BadRequestException(`El plazo de edición de ${RESPONSE_EDIT_DAYS} días terminó`);
    if (isOffensive(dto.response)) throw new BadRequestException('La respuesta contiene lenguaje ofensivo');
    await this.audit.log({
      actorId: user.id,
      action: 'RATING_RESPONSE_EDITED',
      entityType: 'OrganizerRating',
      entityId: ratingId,
      before: { response: resp.response },
      after: { response: dto.response },
    });
    return this.prisma.organizerResponse.update({ where: { ratingId }, data: { response: dto.response } });
  }

  async report(user: AuthUser, ratingId: string, dto: ReportDto) {
    const r = await this.prisma.organizerRating.findUnique({ where: { id: ratingId } });
    if (!r) throw new NotFoundException('Valoración no encontrada');
    if (r.participantId === user.id) throw new BadRequestException('No puedes reportar tu propia valoración');
    const exists = await this.prisma.ratingReport.findUnique({ where: { ratingId_reportedBy: { ratingId, reportedBy: user.id } } });
    if (exists) throw new ConflictException('Ya reportaste esta valoración');
    await this.prisma.ratingReport.create({ data: { ratingId, reportedBy: user.id, reason: dto.reason } });
    // Con 3 reportes se marca para revisión del SUPERADMIN (no se oculta automáticamente)
    const reports = await this.prisma.ratingReport.count({ where: { ratingId, resolved: false } });
    if (reports >= 3 && !r.isSuspicious) await this.prisma.organizerRating.update({ where: { id: ratingId }, data: { isSuspicious: true } });
    await this.audit.log({ actorId: user.id, action: 'RATING_REPORTED', entityType: 'OrganizerRating', entityId: ratingId, reason: dto.reason });
    return { ok: true };
  }

  // --------------------------------------------------------------------------- Incidencias

  async createIncident(user: AuthUser, tournamentId: string, dto: CreateIncidentDto, file?: Express.Multer.File) {
    const p = await this.participation(user.id, tournamentId);
    if (p.isOrganizer) throw new ForbiddenException('El organizador no puede reportar incidencias de su propia partida');
    if (!p.participated) throw new ForbiddenException('Solo los participantes pueden reportar incidencias');
    if (!['IN_PROGRESS', 'FINISHED', 'CANCELLED'].includes(p.t.status)) {
      throw new BadRequestException('Las incidencias se reportan desde que la partida comienza');
    }
    const open = await this.prisma.organizerIncident.count({ where: { tournamentId, reportedBy: user.id, status: { in: ['OPEN', 'UNDER_REVIEW'] } } });
    if (open >= 3) throw new BadRequestException('Ya tienes incidencias abiertas en esta partida; espera su revisión');
    const evidencePath = file ? await this.storage.uploadPrivateDocument(file, `incidents/${tournamentId}`) : null;
    const incident = await this.prisma.organizerIncident.create({
      data: { organizerId: p.t.organizerId, tournamentId, reportedBy: user.id, incidentType: dto.incidentType, description: dto.description, evidencePath },
      select: { id: true, incidentType: true, status: true, createdAt: true },
    });
    await this.audit.log({ actorId: user.id, action: 'INCIDENT_REPORTED', entityType: 'OrganizerIncident', entityId: incident.id, after: { type: dto.incidentType } });
    return incident;
  }

  /** Públicamente solo se muestran las incidencias confirmadas; el organizador ve todas las suyas. */
  async listIncidents(organizerId: string, viewer?: AuthUser) {
    const canManage = viewer
      ? await assertCanManageOrganizer(this.prisma, viewer, organizerId).then(
          () => true,
          () => false,
        )
      : false;
    return this.prisma.organizerIncident.findMany({
      where: { organizerId, ...(canManage ? {} : { status: 'RESOLVED' }) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        incidentType: true,
        status: true,
        resolution: true,
        createdAt: true,
        resolvedAt: true,
        tournament: { select: { name: true, slug: true } },
        ...(canManage ? { description: true } : {}),
      },
    });
  }

  // --------------------------------------------------------------------------- SUPERADMIN

  async adminResolveIncident(user: AuthUser, id: string, dto: ResolveIncidentDto) {
    const inc = await this.prisma.organizerIncident.findUnique({ where: { id }, include: { tournament: { select: { name: true, slug: true } }, organizer: { select: { userId: true } } } });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');
    const final = dto.status !== 'UNDER_REVIEW';
    const updated = await this.prisma.organizerIncident.update({
      where: { id },
      data: { status: dto.status, resolution: dto.resolution, reviewedBy: user.id, resolvedAt: final ? new Date() : null },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'INCIDENT_REVIEWED',
      entityType: 'OrganizerIncident',
      entityId: id,
      before: { status: inc.status },
      after: { status: dto.status },
      reason: dto.resolution,
    });
    if (inc.status === 'RESOLVED' || dto.status === 'RESOLVED') await this.reputation.recalculate(inc.organizerId, user.id, 'Revisión de incidencia');
    if (final) {
      const label = dto.status === 'RESOLVED' ? 'confirmada' : 'desestimada';
      await this.notifications.notify([
        { userId: inc.reportedBy, type: 'INCIDENT_REVIEWED', title: `Tu incidencia fue ${label}`, body: dto.resolution, link: `/torneos/${inc.tournament.slug}` },
        { userId: inc.organizer.userId, type: 'INCIDENT_REVIEWED', title: `Incidencia ${label} en ${inc.tournament.name}`, body: dto.resolution, link: '/dashboard/reputacion' },
      ]);
    }
    return updated;
  }

  async adminIncidents(q: AdminIncidentQuery) {
    const where: Prisma.OrganizerIncidentWhereInput = q.status ? { status: q.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organizerIncident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          tournament: { select: { name: true, slug: true } },
          organizer: { select: { displayName: true, user: { select: { username: true } } } },
          reporter: { select: { username: true } },
        },
      }),
      this.prisma.organizerIncident.count({ where }),
    ]);
    return paginate(
      items.map(({ evidencePath, ...i }) => ({ ...i, hasEvidence: !!evidencePath })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async adminIncidentEvidence(user: AuthUser, id: string) {
    const inc = await this.prisma.organizerIncident.findUnique({ where: { id } });
    if (!inc?.evidencePath) throw new NotFoundException('La incidencia no tiene evidencia');
    await this.audit.log({ actorId: user.id, action: 'INCIDENT_EVIDENCE_VIEWED', entityType: 'OrganizerIncident', entityId: id });
    return { url: await this.storage.signedPrivateUrl(inc.evidencePath), expiresInSeconds: 300 };
  }

  async adminRatings(q: AdminRatingQuery) {
    const where: Prisma.OrganizerRatingWhereInput = {
      ...(q.status ? { moderationStatus: q.status } : {}),
      ...(q.suspicious ? { isSuspicious: true } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organizerRating.findMany({
        where,
        orderBy: [{ isSuspicious: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          ...publicRatingSelect,
          moderationStatus: true,
          isSuspicious: true,
          participant: { select: { username: true, createdAt: true, player: { select: { nickname: true, avatarUrl: true } } } },
          organizer: { select: { displayName: true, user: { select: { username: true } } } },
          reports: { select: { reason: true, createdAt: true, resolved: true } },
          history: { orderBy: { createdAt: 'desc' }, select: { previousValues: true, newValues: true, reason: true, createdAt: true, changer: { select: { username: true } } } },
        },
      }),
      this.prisma.organizerRating.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  /** Moderación: nunca modifica puntuaciones, solo su visibilidad; siempre con justificación y auditoría. */
  async adminModerate(user: AuthUser, id: string, dto: ModerateRatingDto) {
    const r = await this.prisma.organizerRating.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Valoración no encontrada');
    await this.prisma.$transaction([
      this.prisma.organizerRating.update({ where: { id }, data: { moderationStatus: dto.status, isSuspicious: dto.status === 'APPROVED' ? false : r.isSuspicious } }),
      this.prisma.ratingHistory.create({
        data: { ratingId: id, previousValues: { moderationStatus: r.moderationStatus }, newValues: { moderationStatus: dto.status }, changedBy: user.id, reason: dto.reason },
      }),
      this.prisma.ratingReport.updateMany({ where: { ratingId: id }, data: { resolved: true } }),
    ]);
    await this.audit.log({
      actorId: user.id,
      action: 'RATING_MODERATED',
      entityType: 'OrganizerRating',
      entityId: id,
      before: { moderationStatus: r.moderationStatus },
      after: { moderationStatus: dto.status },
      reason: dto.reason,
    });
    await this.reputation.recalculate(r.organizerId, user.id, `Moderación: ${dto.reason}`);
    if (dto.status !== 'APPROVED') {
      await this.notifications.notify({
        userId: r.participantId,
        type: 'RATING_MODERATED',
        title: 'Tu valoración fue moderada',
        body: `Motivo: ${dto.reason}`,
      });
    }
    return { ok: true };
  }

  async adminReviewCancellation(user: AuthUser, tournamentId: string, dto: CancellationReviewDto) {
    const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!t) throw new NotFoundException('Partida no encontrada');
    if (t.status !== 'CANCELLED') throw new BadRequestException('La partida no está cancelada');
    await this.prisma.tournament.update({ where: { id: tournamentId }, data: { cancellationJustified: dto.justified } });
    await this.audit.log({
      actorId: user.id,
      action: 'CANCELLATION_REVIEWED',
      entityType: 'Tournament',
      entityId: tournamentId,
      before: { justified: t.cancellationJustified },
      after: { justified: dto.justified },
      reason: dto.reason,
    });
    await this.reputation.recalculate(t.organizerId, user.id, 'Revisión de cancelación');
    return { ok: true };
  }

/** Cancelaciones con participantes aprobados: el SUPERADMIN decide si se justifican (no computan en el cumplimiento). */
  async adminCancellations(q: PaginationQuery) {
    const where: Prisma.TournamentWhereInput = { status: 'CANCELLED', registrations: { some: { status: 'APPROVED' } } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tournament.findMany({
        where,
        orderBy: [{ cancellationJustified: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          startsAt: true,
          updatedAt: true,
          cancelledReason: true,
          cancellationJustified: true,
          organizer: { select: { displayName: true, user: { select: { username: true } } } },
          _count: { select: { registrations: { where: { status: 'APPROVED' } } } },
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  async adminReputation(q: AdminReputationQuery) {
    const where: Prisma.OrganizerProfileWhereInput = {
      ...(q.q ? { displayName: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(q.level ? { reputation: { reputationLevel: q.level } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organizerProfile.findMany({
        where,
        orderBy: [{ reputation: { averageScore: 'desc' } }, { displayName: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          displayName: true,
          logoUrl: true,
          verificationStatus: true,
          user: { select: { username: true } },
          reputation: true,
          _count: {
            select: {
              incidents: { where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } },
              ratings: { where: { OR: [{ isSuspicious: true }, { moderationStatus: 'PENDING' }] } },
            },
          },
        },
      }),
      this.prisma.organizerProfile.count({ where }),
    ]);
    return paginate(items, total, q.page, q.pageSize);
  }

  /** Dashboard de confianza del SUPERADMIN. */
  async adminTrustDashboard() {
    const [verification, levels, ratings, suspicious, pendingModeration, incidents] = await Promise.all([
      this.prisma.organizerProfile.groupBy({ by: ['verificationStatus'], _count: true }),
      this.prisma.organizerReputation.groupBy({ by: ['reputationLevel'], _count: true }),
      this.prisma.organizerRating.count(),
      this.prisma.organizerRating.count({ where: { isSuspicious: true } }),
      this.prisma.organizerRating.count({ where: { moderationStatus: 'PENDING' } }),
      this.prisma.organizerIncident.groupBy({ by: ['status'], _count: true }),
    ]);
    const since = new Date(Date.now() - 365 * DAY);
    const recent = await this.prisma.organizerRating.findMany({
      where: { createdAt: { gte: since }, moderationStatus: 'APPROVED' },
      select: { finalScore: true, createdAt: true },
    });
    return {
      verification: Object.fromEntries(verification.map((v) => [v.verificationStatus, v._count])),
      reputationLevels: Object.fromEntries(levels.map((l) => [l.reputationLevel, l._count])),
      ratings: { total: ratings, suspicious, pendingModeration },
      incidents: Object.fromEntries(incidents.map((i) => [i.status, i._count])),
      monthly: monthlyEvolution(recent.map((r) => ({ score: Number(r.finalScore), at: r.createdAt }))),
    };
  }

  // --------------------------------------------------------------------------- Detección de patrones sospechosos

  private async suspicionFlags(userId: string, organizerId: string, comment?: string) {
    const flags: string[] = [];
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } });
    if (Date.now() - user.createdAt.getTime() < DAY) flags.push('Cuenta creada hace menos de 24 h');
    if (comment && /(https?:\/\/|www\.)/i.test(comment)) flags.push('Comentario con enlaces');
    if (isOffensive(comment)) flags.push('Lenguaje ofensivo');
    const burst = await this.prisma.organizerRating.count({ where: { organizerId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (burst >= 10) flags.push('Ráfaga de valoraciones en la última hora');
    if (comment && comment.length >= 20) {
      const dup = await this.prisma.organizerRating.count({ where: { organizerId, comment, participantId: { not: userId } } });
      if (dup) flags.push('Comentario idéntico a otra valoración');
    }
    return flags;
  }
}

function toCriteria(d: RatingScoresDto) {
  return {
    organization: d.organizationScore,
    punctuality: d.punctualityScore,
    communication: d.communicationScore,
    transparency: d.transparencyScore,
    experience: d.overallExperienceScore,
  };
}

function snapshot(r: Partial<Omit<RatingScoresDto, 'comment'>> & { finalScore?: unknown; comment?: string | null }) {
  return {
    organizationScore: r.organizationScore,
    punctualityScore: r.punctualityScore,
    communicationScore: r.communicationScore,
    transparencyScore: r.transparencyScore,
    overallExperienceScore: r.overallExperienceScore,
    finalScore: Number(r.finalScore),
    comment: r.comment ?? null,
  } as Prisma.InputJsonObject;
}

export function starDistribution(scores: number[]) {
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of scores) dist[Math.min(5, Math.max(1, Math.round(s))) as 1 | 2 | 3 | 4 | 5]++;
  return dist;
}

/** Evolución de los últimos 12 meses: promedio y cantidad de valoraciones por mes. */
export function monthlyEvolution(rows: { score: number; at: Date }[], now = new Date()) {
  const months: { month: string; average: number | null; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const inMonth = rows.filter((r) => r.at.toISOString().startsWith(key));
    const avg = inMonth.length ? inMonth.reduce((s, r) => s + r.score, 0) / inMonth.length : null;
    months.push({ month: key, average: avg === null ? null : Math.round(avg * 100) / 100, count: inMonth.length });
  }
  return months;
}

// =========================================================================== Controladores

@ApiTags('Reputación, valoraciones e incidencias')
@Controller()
export class RatingsController {
  constructor(private readonly service: RatingsService) {}

  @Public()
  @Get('organizers/:id/ratings')
  list(@Param('id', ParseUUIDPipe) id: string, @Query() q: RatingListQuery) {
    return this.service.listPublic(id, q);
  }

  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('organizers/:id/ratings')
  create(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRatingDto) {
    return this.service.create(user, id, dto);
  }

  @Public()
  @Get('organizers/:id/reputation')
  reputation(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.publicReputation(id);
  }

  @Public()
  @Get('organizers/:id/incidents')
  incidents(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.service.listIncidents(id, user);
  }

  @ApiBearerAuth()
  @Put('ratings/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RatingScoresDto) {
    return this.service.update(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Post('ratings/:id/responses')
  respond(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResponseDto) {
    return this.service.respond(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Put('ratings/:id/responses')
  editResponse(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResponseDto) {
    return this.service.editResponse(user, id, dto);
  }

  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('ratings/:id/reports')
  report(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportDto) {
    return this.service.report(user, id, dto);
  }

  @ApiBearerAuth()
  @Get('tournaments/:id/feedback')
  feedback(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.feedback(user, id);
  }

  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('tournaments/:id/incidents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('evidence', { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  incident(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateIncidentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.createIncident(user, id, dto, file);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Get('me/reputation')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.myReputation(user);
  }
}

@ApiTags('SUPERADMIN · Confianza')
@ApiBearerAuth()
@Roles('SUPERADMIN')
@Controller('admin')
export class AdminTrustController {
  constructor(private readonly service: RatingsService) {}

  @Get('trust') dashboard() {
    return this.service.adminTrustDashboard();
  }
  @Get('reputation') reputation(@Query() q: AdminReputationQuery) {
    return this.service.adminReputation(q);
  }
  @Get('ratings') ratings(@Query() q: AdminRatingQuery) {
    return this.service.adminRatings(q);
  }
  @Patch('ratings/:id/moderation') moderate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateRatingDto) {
    return this.service.adminModerate(u, id, dto);
  }
  @Get('incidents') incidents(@Query() q: AdminIncidentQuery) {
    return this.service.adminIncidents(q);
  }
  @Get('incidents/:id/evidence') evidence(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminIncidentEvidence(u, id);
  }
  @Put('incidents/:id/resolve') resolve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveIncidentDto) {
    return this.service.adminResolveIncident(u, id, dto);
  }
  @Get('cancellations') cancellations(@Query() q: PaginationQuery) {
    return this.service.adminCancellations(q);
  }
  @Patch('tournaments/:id/cancellation') cancellation(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancellationReviewDto) {
    return this.service.adminReviewCancellation(u, id, dto);
  }
}

@Module({ controllers: [RatingsController, AdminTrustController], providers: [RatingsService] })
export class RatingsModule {}
