import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsInt, IsISO31661Alpha2, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { StorageService, MAX_DOCUMENT_BYTES } from '../storage/storage.service.js';
import { AuthUser, CurrentUser, Roles } from '../common/decorators/auth.decorators.js';
import { paginate, PaginationQuery } from '../common/utils/index.js';
import { sanitizeSocialLinks } from '../organizers/organizers.js';
import { OrganizerType, VerificationStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DAY = 864e5;

/** Política de conservación y vigencia (documentadas en docs/ARQUITECTURA.md). */
export const VERIFICATION_VALID_MONTHS = 12;
export const EXPIRY_WARNING_DAYS = 30;
const KEEP_DOCS_AFTER_APPROVAL_DAYS = 90;
const KEEP_DOCS_AFTER_REJECTION_DAYS = 30;
const MAX_DOCUMENTS = 5;

// =========================================================================== DTOs (multipart: todos los campos llegan como texto)

export class RequestVerificationDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 80) organizerName: string;
  @ApiPropertyOptional({ description: 'Nombre comercial o razón social' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(160) legalName?: string;
  @ApiProperty({ enum: OrganizerType }) @IsEnum(OrganizerType) verificationType: OrganizerType;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsISO31661Alpha2({ message: 'País inválido' })
  country: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 80) city: string;
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @IsEmail({}, { message: 'Correo inválido' }) contactEmail: string;
  @ApiProperty() @Transform(trim) @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Teléfono inválido' }) contactPhone: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(30, 2000, { message: 'La descripción debe tener entre 30 y 2000 caracteres' }) description: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim() : undefined))
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true }, { message: 'Sitio web inválido' })
  website?: string;
  @ApiPropertyOptional({ description: 'JSON: { instagram, x, youtube, twitch, tiktok, facebook, discord, kick }' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value || '{}');
    } catch {
      return value;
    }
  })
  socialLinks?: Record<string, string>;
  @ApiPropertyOptional({ description: 'JSON: tipo de cada documento, en el mismo orden que los archivos' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value || '[]');
    } catch {
      return value;
    }
  })
  documentTypes?: string[];
  @ApiProperty({ description: 'Aceptación de las políticas de verificación' })
  @IsIn(['true'], { message: 'Debes aceptar las políticas de verificación' })
  acceptPolicy: 'true';
}

export class AdditionalInfoDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 2000) message: string;
}

const ACTIONS = ['START_REVIEW', 'REQUEST_INFO', 'APPROVE', 'REJECT', 'SUSPEND', 'REINSTATE', 'RENEW'] as const;
type Action = (typeof ACTIONS)[number];

export class VerificationActionDto {
  @ApiProperty({ enum: ACTIONS }) @IsIn(ACTIONS) action: Action;
  @ApiPropertyOptional({ description: 'Motivo (obligatorio al pedir información, rechazar o suspender)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;
  @ApiPropertyOptional({ description: 'Observaciones internas (no se muestran al organizador)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  comments?: string;
  @ApiPropertyOptional({ description: 'Meses de vigencia al aprobar o renovar', default: VERIFICATION_VALID_MONTHS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;
}

export class AdminVerificationQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: VerificationStatus }) @IsOptional() @IsEnum(VerificationStatus) status?: VerificationStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
}

/** Transiciones permitidas por acción (estado actual → estado nuevo). */
const TRANSITIONS: Record<Action, { from: VerificationStatus[]; to: VerificationStatus; reasonRequired: boolean }> = {
  START_REVIEW: { from: ['PENDING'], to: 'UNDER_REVIEW', reasonRequired: false },
  REQUEST_INFO: { from: ['PENDING', 'UNDER_REVIEW'], to: 'UNDER_REVIEW', reasonRequired: true },
  APPROVE: { from: ['PENDING', 'UNDER_REVIEW'], to: 'VERIFIED', reasonRequired: false },
  REJECT: { from: ['PENDING', 'UNDER_REVIEW'], to: 'REJECTED', reasonRequired: true },
  SUSPEND: { from: ['VERIFIED'], to: 'SUSPENDED', reasonRequired: true },
  REINSTATE: { from: ['SUSPENDED'], to: 'VERIFIED', reasonRequired: true },
  RENEW: { from: ['VERIFIED'], to: 'VERIFIED', reasonRequired: false },
};

const ORGANIZER_MESSAGES: Partial<Record<Action, (reason?: string) => { title: string; body: string }>> = {
  START_REVIEW: () => ({ title: 'Comenzó la revisión de tu verificación', body: 'Un administrador está revisando tu solicitud.' }),
  REQUEST_INFO: (r) => ({ title: 'Necesitamos información adicional', body: r ?? '' }),
  APPROVE: () => ({ title: '¡Ya eres organizador verificado!', body: 'La insignia de verificación ya aparece en tu perfil y tus partidas.' }),
  REJECT: (r) => ({ title: 'Tu solicitud de verificación fue rechazada', body: `Motivo: ${r}. Puedes corregir las observaciones y volver a enviarla.` }),
  SUSPEND: (r) => ({ title: 'Tu verificación fue suspendida', body: `Motivo: ${r}. La insignia no se mostrará hasta su rehabilitación.` }),
  REINSTATE: () => ({ title: 'Tu verificación fue rehabilitada', body: 'La insignia vuelve a mostrarse en tu perfil.' }),
  RENEW: () => ({ title: 'Tu verificación fue renovada', body: 'Se extendió la vigencia de tu insignia.' }),
};

const addMonths = (d: Date, m: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + m);
  return r;
};

// =========================================================================== Servicio

@Injectable()
export class VerificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerificationService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    // Mantenimiento periódico: vencimientos, avisos y política de conservación de documentos
    if (env.isTest) return;
    this.timer = setInterval(() => void this.runMaintenance().catch((e) => this.logger.error(e)), 3600_000);
    setTimeout(() => void this.runMaintenance().catch((e) => this.logger.error(e)), 10_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // --------------------------------------------------------------------------- Organizador

  async mine(user: AuthUser) {
    const organizer = await this.requireOrganizer(user.id);
    const requests = await this.prisma.organizerVerification.findMany({
      where: { organizerId: organizer.id },
      orderBy: { submittedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        verificationType: true,
        organizerName: true,
        submittedAt: true,
        reviewedAt: true,
        approvedAt: true,
        expiresAt: true,
        rejectionReason: true,
        infoRequested: true,
        isOpen: true,
        documents: { select: { id: true, documentType: true, originalName: true, uploadedAt: true, reviewStatus: true } },
        // El organizador ve el historial sin las observaciones internas
        history: { orderBy: { createdAt: 'asc' }, select: { previousStatus: true, newStatus: true, reason: true, createdAt: true } },
      },
    });
    return {
      status: organizer.verificationStatus,
      verifiedAt: organizer.verifiedAt,
      current: requests[0] ?? null,
      previous: requests.slice(1),
      canRequest: !requests.some((r) => r.isOpen) && organizer.verificationStatus !== 'VERIFIED' && organizer.verificationStatus !== 'SUSPENDED',
      prefill: {
        organizerName: organizer.displayName,
        legalName: organizer.legalName,
        verificationType: organizer.organizerType,
        country: organizer.country,
        city: organizer.city,
        contactEmail: organizer.user.email,
        contactPhone: organizer.user.profile?.phone ?? '',
        description: organizer.description ?? '',
        website: organizer.website ?? '',
        socialLinks: organizer.socialLinks,
        logoUrl: organizer.logoUrl,
      },
    };
  }

  async request(user: AuthUser, dto: RequestVerificationDto, files: Express.Multer.File[] = []) {
    const organizer = await this.requireOrganizer(user.id);
    if (organizer.verificationStatus === 'VERIFIED') throw new ConflictException('Tu organización ya está verificada');
    if (organizer.verificationStatus === 'SUSPENDED') {
      throw new ConflictException('Tu verificación está suspendida: el equipo de la plataforma debe rehabilitarla');
    }
    if (!organizer.logoUrl) throw new BadRequestException('Sube el logo oficial en tu perfil antes de solicitar la verificación');
    if (files.length > MAX_DOCUMENTS) throw new BadRequestException(`Puedes adjuntar hasta ${MAX_DOCUMENTS} documentos`);
    const open = await this.prisma.organizerVerification.findFirst({ where: { organizerId: organizer.id, isOpen: true } });
    if (open) throw new ConflictException('Ya tienes una solicitud en curso');
    const socialLinks = sanitizeSocialLinks(dto.socialLinks) ?? {};

    // Primero los documentos (validados por firma binaria) al bucket privado
    const types = Array.isArray(dto.documentTypes) ? dto.documentTypes : [];
    const uploaded: { path: string; file: Express.Multer.File; type: string }[] = [];
    try {
      for (const [i, file] of files.entries()) {
        const path = await this.storage.uploadPrivateDocument(file, `verifications/${organizer.id}`);
        uploaded.push({ path, file, type: String(types[i] ?? 'SUPPORTING_DOCUMENT').slice(0, 40) });
      }
    } catch (e) {
      await Promise.all(uploaded.map((u) => this.storage.deletePrivate(u.path).catch(() => undefined)));
      throw e;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const v = await tx.organizerVerification.create({
        data: {
          organizerId: organizer.id,
          verificationType: dto.verificationType,
          status: 'PENDING',
          organizerName: dto.organizerName,
          legalName: dto.legalName || null,
          country: dto.country,
          city: dto.city,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone,
          description: dto.description,
          website: dto.website || null,
          socialLinks,
          logoUrl: organizer.logoUrl,
          policyAcceptedAt: new Date(),
          documents: {
            create: uploaded.map((u) => ({ documentType: u.type, storagePath: u.path, originalName: u.file.originalname?.slice(0, 200), mimeType: u.file.mimetype })),
          },
          history: { create: { previousStatus: organizer.verificationStatus, newStatus: 'PENDING', changedBy: user.id, reason: 'Solicitud enviada' } },
        },
        select: { id: true, status: true, submittedAt: true },
      });
      await tx.organizerProfile.update({ where: { id: organizer.id }, data: { verificationStatus: 'PENDING' } });
      return v;
    });

    await this.audit.log({ actorId: user.id, action: 'VERIFICATION_REQUESTED', entityType: 'OrganizerVerification', entityId: created.id, after: { documents: uploaded.length } });
    await this.notifications.notify({
      userId: user.id,
      type: 'VERIFICATION_RECEIVED',
      title: 'Recibimos tu solicitud de verificación',
      body: 'Te avisaremos cuando comience la revisión.',
      link: '/dashboard/verificacion',
    });
    await this.notifyAdmins({ type: 'VERIFICATION_PENDING', title: `Nueva solicitud de verificación: ${dto.organizerName}`, body: 'Pendiente de revisión.', link: `/admin/verificaciones/${created.id}` });
    return created;
  }

  /** Respuesta del organizador a una solicitud de información adicional. */
  async provideInfo(user: AuthUser, dto: AdditionalInfoDto, files: Express.Multer.File[] = []) {
    const organizer = await this.requireOrganizer(user.id);
    const v = await this.prisma.organizerVerification.findFirst({
      where: { organizerId: organizer.id, isOpen: true },
      include: { _count: { select: { documents: true } } },
    });
    if (!v || !v.infoRequested) throw new BadRequestException('No hay información pendiente de enviar');
    if (v._count.documents + files.length > MAX_DOCUMENTS * 2) throw new BadRequestException('Superaste el máximo de documentos');
    const paths: { path: string; file: Express.Multer.File }[] = [];
    for (const file of files) paths.push({ path: await this.storage.uploadPrivateDocument(file, `verifications/${organizer.id}`), file });
    await this.prisma.$transaction([
      ...paths.map((p) =>
        this.prisma.verificationDocument.create({
          data: { verificationId: v.id, documentType: 'ADDITIONAL_INFO', storagePath: p.path, originalName: p.file.originalname?.slice(0, 200), mimeType: p.file.mimetype },
        }),
      ),
      this.prisma.organizerVerification.update({ where: { id: v.id }, data: { infoRequested: null } }),
      this.prisma.verificationHistory.create({
        data: { verificationId: v.id, previousStatus: v.status, newStatus: v.status, changedBy: user.id, reason: 'Información adicional enviada', comments: dto.message },
      }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'VERIFICATION_INFO_PROVIDED', entityType: 'OrganizerVerification', entityId: v.id });
    await this.notifyAdmins({ type: 'VERIFICATION_PENDING', title: `${v.organizerName} envió la información solicitada`, body: dto.message.slice(0, 200), link: `/admin/verificaciones/${v.id}` });
    return { ok: true };
  }

  // --------------------------------------------------------------------------- SUPERADMIN

  async adminList(q: AdminVerificationQuery) {
    const where: Prisma.OrganizerVerificationWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? { OR: [{ organizerName: { contains: q.q, mode: 'insensitive' } }, { organizer: { displayName: { contains: q.q, mode: 'insensitive' } } }] }
        : {}),
    };
    const [items, total, counts] = await this.prisma.$transaction([
      this.prisma.organizerVerification.findMany({
        where,
        orderBy: [{ isOpen: 'desc' }, { submittedAt: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          status: true,
          verificationType: true,
          organizerName: true,
          country: true,
          city: true,
          submittedAt: true,
          reviewedAt: true,
          expiresAt: true,
          infoRequested: true,
          isOpen: true,
          organizer: { select: { id: true, displayName: true, logoUrl: true, user: { select: { username: true } } } },
          _count: { select: { documents: true } },
        },
      }),
      this.prisma.organizerVerification.count({ where }),
      this.prisma.organizerVerification.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } }),
    ]);
    return { ...paginate(items, total, q.page, q.pageSize), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
  }

  async adminDetail(user: AuthUser, id: string) {
    const v = await this.prisma.organizerVerification.findUnique({
      where: { id },
      include: {
        organizer: {
          select: {
            id: true,
            displayName: true,
            logoUrl: true,
            verificationStatus: true,
            createdAt: true,
            user: { select: { username: true, email: true, createdAt: true } },
            reputation: true,
            _count: { select: { tournaments: true } },
          },
        },
        reviewer: { select: { username: true } },
        documents: { orderBy: { uploadedAt: 'asc' }, select: { id: true, documentType: true, originalName: true, mimeType: true, uploadedAt: true, reviewStatus: true, deleteAfter: true } },
        history: { orderBy: { createdAt: 'asc' }, include: { changer: { select: { username: true } } } },
      },
    });
    if (!v) throw new NotFoundException('Solicitud no encontrada');
    // Las consultas de información privada quedan registradas
    await this.audit.log({ actorId: user.id, action: 'VERIFICATION_VIEWED', entityType: 'OrganizerVerification', entityId: id });
    return v;
  }

  /** URL temporal (5 min) para revisar un documento privado; cada acceso queda auditado. */
  async adminDocument(user: AuthUser, id: string, documentId: string) {
    const doc = await this.prisma.verificationDocument.findFirst({ where: { id: documentId, verificationId: id } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.audit.log({ actorId: user.id, action: 'VERIFICATION_DOCUMENT_VIEWED', entityType: 'VerificationDocument', entityId: documentId });
    return { url: await this.storage.signedPrivateUrl(doc.storagePath), expiresInSeconds: 300, name: doc.originalName };
  }

  async adminAction(user: AuthUser, id: string, dto: VerificationActionDto) {
    const v = await this.prisma.organizerVerification.findUnique({ where: { id }, include: { organizer: { select: { id: true, userId: true } } } });
    if (!v) throw new NotFoundException('Solicitud no encontrada');
    const rule = TRANSITIONS[dto.action];
    if (!rule.from.includes(v.status)) throw new BadRequestException(`No se puede aplicar ${dto.action} a una solicitud en estado ${v.status}`);
    if (rule.reasonRequired && (!dto.reason || dto.reason.length < 5)) throw new BadRequestException('Indica el motivo (mínimo 5 caracteres)');
    // Suspender, rehabilitar y renovar solo aplican a la verificación vigente del organizador
    if (['SUSPEND', 'REINSTATE', 'RENEW'].includes(dto.action)) {
      const latest = await this.prisma.organizerVerification.findFirst({ where: { organizerId: v.organizerId }, orderBy: { submittedAt: 'desc' } });
      if (latest?.id !== v.id) throw new BadRequestException('Esta no es la verificación vigente del organizador');
    }

    const now = new Date();
    const months = dto.months ?? VERIFICATION_VALID_MONTHS;
    const data: Prisma.OrganizerVerificationUpdateInput = { status: rule.to, reviewedAt: now, reviewer: { connect: { id: user.id } } };
    if (dto.comments) data.adminNotes = [v.adminNotes, `[${now.toISOString()}] ${dto.comments}`].filter(Boolean).join('\n');
    switch (dto.action) {
      case 'REQUEST_INFO':
        data.infoRequested = dto.reason;
        break;
      case 'APPROVE':
        Object.assign(data, { approvedAt: now, expiresAt: addMonths(now, months), isOpen: false, infoRequested: null, rejectionReason: null });
        break;
      case 'REJECT':
        Object.assign(data, { rejectionReason: dto.reason, isOpen: false, infoRequested: null });
        break;
      case 'RENEW':
        data.expiresAt = addMonths(v.expiresAt && v.expiresAt > now ? v.expiresAt : now, months);
        break;
    }
    const profileStatus: VerificationStatus = rule.to;

    await this.prisma.$transaction(async (tx) => {
      await tx.organizerVerification.update({ where: { id }, data });
      await tx.verificationHistory.create({
        data: { verificationId: id, previousStatus: v.status, newStatus: rule.to, changedBy: user.id, reason: dto.reason ?? dto.action, comments: dto.comments },
      });
      await tx.organizerProfile.update({
        where: { id: v.organizerId },
        data: {
          verificationStatus: profileStatus,
          ...(dto.action === 'APPROVE' ? { verifiedAt: now, organizerType: v.verificationType } : {}),
          ...(dto.action === 'REJECT' ? { verifiedAt: null } : {}),
        },
      });
      // Política de conservación: los documentos se eliminan después de la decisión
      if (dto.action === 'APPROVE' || dto.action === 'REJECT') {
        const days = dto.action === 'APPROVE' ? KEEP_DOCS_AFTER_APPROVAL_DAYS : KEEP_DOCS_AFTER_REJECTION_DAYS;
        await tx.verificationDocument.updateMany({
          where: { verificationId: id },
          data: { deleteAfter: new Date(now.getTime() + days * DAY), reviewStatus: dto.action === 'APPROVE' ? 'ACCEPTED' : 'REJECTED' },
        });
      }
    });

    await this.audit.log({
      actorId: user.id,
      action: `VERIFICATION_${dto.action}`,
      entityType: 'OrganizerVerification',
      entityId: id,
      before: { status: v.status },
      after: { status: rule.to },
      reason: dto.reason,
    });
    const message = ORGANIZER_MESSAGES[dto.action]?.(dto.reason);
    if (message) {
      await this.notifications.notify({ userId: v.organizer.userId, type: `VERIFICATION_${dto.action}`, ...message, link: '/dashboard/verificacion' });
    }
    return this.prisma.organizerVerification.findUnique({ where: { id }, select: { id: true, status: true, expiresAt: true, infoRequested: true } });
  }

  /**
   * Mantenimiento: vence verificaciones, avisa las próximas a vencer y elimina documentos cuyo plazo de
   * conservación terminó. Idempotente; corre cada hora y puede lanzarse a mano desde el panel.
   */
  async runMaintenance(actorId?: string) {
    const now = new Date();
    const expired = await this.prisma.organizerVerification.findMany({
      where: { status: 'VERIFIED', expiresAt: { lt: now } },
      select: { id: true, organizerId: true, organizer: { select: { userId: true } } },
    });
    for (const v of expired) {
      await this.prisma.$transaction([
        this.prisma.organizerVerification.update({ where: { id: v.id }, data: { status: 'EXPIRED' } }),
        this.prisma.verificationHistory.create({ data: { verificationId: v.id, previousStatus: 'VERIFIED', newStatus: 'EXPIRED', changedBy: actorId, reason: 'Vencimiento automático' } }),
        this.prisma.organizerProfile.update({ where: { id: v.organizerId }, data: { verificationStatus: 'EXPIRED' } }),
      ]);
      await this.audit.log({ actorId, action: 'VERIFICATION_EXPIRED', entityType: 'OrganizerVerification', entityId: v.id });
      await this.notifications.notify({
        userId: v.organizer.userId,
        type: 'VERIFICATION_EXPIRED',
        title: 'Tu verificación venció',
        body: 'Envía una nueva solicitud para recuperar la insignia.',
        link: '/dashboard/verificacion',
      });
    }

    const soon = await this.prisma.organizerVerification.findMany({
      where: { status: 'VERIFIED', expiresAt: { gte: now, lt: new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY) } },
      select: { id: true, expiresAt: true, organizer: { select: { userId: true } } },
    });
    let warned = 0;
    for (const v of soon) {
      const already = await this.prisma.notification.count({
        where: { userId: v.organizer.userId, type: 'VERIFICATION_EXPIRING', data: { path: ['verificationId'], equals: v.id } },
      });
      if (already) continue;
      warned++;
      await this.notifications.notify({
        userId: v.organizer.userId,
        type: 'VERIFICATION_EXPIRING',
        title: 'Tu verificación vence pronto',
        body: `Vence el ${v.expiresAt!.toISOString().slice(0, 10)}. Contacta al equipo para renovarla.`,
        link: '/dashboard/verificacion',
        data: { verificationId: v.id },
      });
    }

    const purge = await this.prisma.verificationDocument.findMany({ where: { deleteAfter: { lt: now } }, select: { id: true, storagePath: true } });
    for (const d of purge) {
      await this.storage.deletePrivate(d.storagePath).catch((e) => this.logger.warn(`No se pudo borrar ${d.storagePath}: ${e}`));
      await this.prisma.verificationDocument.delete({ where: { id: d.id } });
    }
    if (purge.length) await this.audit.log({ actorId, action: 'VERIFICATION_DOCUMENTS_PURGED', entityType: 'VerificationDocument', after: { count: purge.length } });
    return { expired: expired.length, warned, purgedDocuments: purge.length };
  }

  // --------------------------------------------------------------------------- Helpers

  private async requireOrganizer(userId: string) {
    const organizer = await this.prisma.organizerProfile.findUnique({
      where: { userId },
      include: { user: { select: { email: true, profile: { select: { phone: true } } } } },
    });
    if (!organizer) throw new NotFoundException('Primero activa tu perfil de organizador');
    return organizer;
  }

  private async notifyAdmins(payload: { type: string; title: string; body: string; link: string }) {
    const admins = await this.prisma.user.findMany({ where: { role: 'SUPERADMIN', status: 'ACTIVE' }, select: { id: true } });
    await this.notifications.notify(admins.map((a) => ({ userId: a.id, ...payload })));
  }
}

// =========================================================================== Controladores

@ApiTags('Verificación de organizadores')
@ApiBearerAuth()
@Roles('ORGANIZER')
@Controller('me/verification')
export class VerificationController {
  constructor(private readonly service: VerificationService) {}

  @Get() mine(@CurrentUser() u: AuthUser) {
    return this.service.mine(u);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('documents', MAX_DOCUMENTS, { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  request(@CurrentUser() u: AuthUser, @Body() dto: RequestVerificationDto, @UploadedFiles() files: Express.Multer.File[]) {
    return this.service.request(u, dto, files);
  }

  @Post('info')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('documents', MAX_DOCUMENTS, { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  info(@CurrentUser() u: AuthUser, @Body() dto: AdditionalInfoDto, @UploadedFiles() files: Express.Multer.File[]) {
    return this.service.provideInfo(u, dto, files);
  }
}

@ApiTags('SUPERADMIN · Verificación de organizadores')
@ApiBearerAuth()
@Roles('SUPERADMIN')
@Controller('admin/verifications')
export class AdminVerificationController {
  constructor(private readonly service: VerificationService) {}

  @Get() list(@Query() q: AdminVerificationQuery) {
    return this.service.adminList(q);
  }
  @Post('maintenance') maintenance(@CurrentUser() u: AuthUser) {
    return this.service.runMaintenance(u.id);
  }
  @Get(':id') detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminDetail(u, id);
  }
  @Get(':id/documents/:documentId') document(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.service.adminDocument(u, id, documentId);
  }
  @Post(':id/actions') action(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerificationActionDto) {
    return this.service.adminAction(u, id, dto);
  }
}

@Module({ controllers: [VerificationController, AdminVerificationController], providers: [VerificationService], exports: [VerificationService] })
export class VerificationModule {}
