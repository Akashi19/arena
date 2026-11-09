import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import { assertCanManageOrganizer } from '../common/utils/access.js';
import { Prisma } from '../generated/prisma/client.js';
import type { BracketSide, Tournament } from '../generated/prisma/client.js';
import {
  ELIMINATION_BRACKETS,
  computeStandings,
  distributeGroups,
  doubleElimination,
  eliminationPlacements,
  league,
  playoffSeeding,
  singleElimination,
  type FinishedElimMatch,
  type PlannedMatch,
  type ScoredResult,
  type StandingRow,
} from './engine.js';
import { parseStreamUrl, StreamUrlError } from '../streams/platforms.js';
import { presentStream } from '../streams/streams.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// =========================================================================== DTOs

export class GenerateFixtureDto {
  @ApiPropertyOptional({ description: 'Sortear el orden de los participantes sin siembra manual', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  shuffle?: boolean;

  @ApiPropertyOptional({ description: 'Programar automáticamente cada ronda cada N minutos desde el inicio' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(60 * 24 * 14)
  roundIntervalMinutes?: number;

  @ApiPropertyOptional({ description: 'Enlace de transmisión (HTTPS, dominio autorizado) que se programa en todos los encuentros generados' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  streamUrl?: string;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'PRIVATE'] })
  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE'])
  streamVisibility?: 'PUBLIC' | 'PRIVATE';
}

export class RecordResultDto {
  @ApiProperty({ description: 'Marcador del participante 1 (local)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999)
  score1: number;

  @ApiProperty({ description: 'Marcador del participante 2 (visitante)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999)
  score2: number;

  @ApiPropertyOptional({ description: 'Quién avanza si el marcador empata en eliminación (penales, prórroga…)', enum: [1, 2] })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  winnerSlot?: 1 | 2;

  @ApiPropertyOptional({ description: 'Obligatorio al corregir un resultado ya registrado' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(5, 500, { message: 'El motivo debe tener entre 5 y 500 caracteres' })
  reason?: string;
}

export class UpdateMatchDto {
  @ApiPropertyOptional({ description: 'Fecha y hora del encuentro (ISO 8601)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(160) venue?: string;

  @ApiPropertyOptional({ enum: ['SCHEDULED', 'LIVE'] })
  @IsOptional()
  @IsIn(['SCHEDULED', 'LIVE'])
  status?: 'SCHEDULED' | 'LIVE';

  @ApiPropertyOptional({ description: 'Motivo de la reprogramación (se comunica a los participantes)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}

// =========================================================================== Selects

const registrationDisplay = {
  id: true,
  seed: true,
  groupLabel: true,
  finalPosition: true,
  team: { select: { id: true, name: true, slug: true, tag: true, logoUrl: true } },
  player: { select: { id: true, nickname: true, avatarUrl: true, user: { select: { username: true } } } },
} satisfies Prisma.TournamentRegistrationSelect;

const LEAGUE_BRACKETS: BracketSide[] = ['GROUP', 'LEAGUE'];
const isElimination = (bracket: string) => ELIMINATION_BRACKETS.includes(bracket);

type Tx = Prisma.TransactionClient;

// =========================================================================== Servicio

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Fixture público: encuentros, último resultado válido y tabla de posiciones. */
  async fixture(tournamentId: string, viewer?: AuthUser) {
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        organizerId: true,
        status: true,
        format: true,
        mode: true,
        groupCount: true,
        qualifiersPerGroup: true,
        pointsWin: true,
        pointsDraw: true,
        pointsLoss: true,
        championRegistrationId: true,
      },
    });
    if (!t) throw new NotFoundException('Partida no encontrada');
    let canManage = false;
    if (viewer) {
      canManage = await assertCanManageOrganizer(this.prisma, viewer, t.organizerId).then(
        () => true,
        () => false,
      );
    }
    if (t.status === 'DRAFT' && !canManage) throw new NotFoundException('Partida no encontrada');

    const [matches, standings] = await Promise.all([
      this.prisma.match.findMany({
        where: { tournamentId },
        orderBy: [{ bracket: 'asc' }, { groupLabel: 'asc' }, { round: 'asc' }, { position: 'asc' }],
        select: {
          id: true,
          bracket: true,
          round: true,
          position: true,
          groupLabel: true,
          status: true,
          scheduledAt: true,
          venue: true,
          nextMatchId: true,
          nextMatchSlot: true,
          loserNextMatchId: true,
          participants: {
            orderBy: { slot: 'asc' },
            select: { slot: true, score: true, isWinner: true, registration: { select: registrationDisplay } },
          },
          results: {
            where: { status: 'VALIDATED' },
            orderBy: { version: 'desc' },
            take: 1,
            select: { version: true, isDraw: true, winnerRegistrationId: true, correctionReason: true, createdAt: true },
          },
          // Transmisión principal activa (la tarjeta del encuentro muestra su estado y el acceso)
          streams: { where: { isActive: true, isRebroadcast: false }, take: 1 },
        },
      }),
      this.prisma.tournamentStanding.findMany({
        where: { tournamentId },
        orderBy: [{ groupLabel: 'asc' }, { position: 'asc' }],
        select: {
          groupLabel: true,
          played: true,
          wins: true,
          draws: true,
          losses: true,
          scoreFor: true,
          scoreAgainst: true,
          points: true,
          position: true,
          registration: { select: registrationDisplay },
        },
      }),
    ]);

    const groupMatches = matches.filter((m) => m.bracket === 'GROUP');
    const playoffMatches = matches.filter((m) => m.bracket === 'PLAYOFF');
    const { organizerId: _o, ...tournament } = t;
    return {
      tournament,
      matches: matches.map(({ results, streams, ...m }) => {
        const s = streams[0];
        // Privadas: solo el estado; el enlace se consulta en el detalle (que valida si el usuario participa)
        const stream = s && (canManage || s.streamStatus !== 'CANCELLED') ? presentStream(s, canManage || s.streamVisibility === 'PUBLIC') : null;
        return {
          ...m,
          result: results[0] ?? null,
          stream: stream && { id: stream.id, status: stream.status, platform: stream.platform, platformName: stream.platformName, visibility: stream.visibility, url: stream.url, scheduledStartAt: stream.scheduledStartAt },
        };
      }),
      standings,
      progress: {
        total: matches.filter((m) => m.status !== 'CANCELLED').length,
        completed: matches.filter((m) => m.status === 'COMPLETED').length,
      },
      canGeneratePlayoffs:
        canManage &&
        t.format === 'GROUPS_PLAYOFFS' &&
        t.status === 'IN_PROGRESS' &&
        groupMatches.length > 0 &&
        groupMatches.every((m) => m.status === 'COMPLETED') &&
        playoffMatches.length === 0,
      canManage,
    };
  }

  /**
   * Genera el fixture según el formato. Solo con la partida en curso y sin resultados cargados:
   * si ya existía un fixture sin resultados, se regenera (útil tras cambiar la siembra).
   */
  async generate(user: AuthUser, tournamentId: string, dto: GenerateFixtureDto) {
    const t = await this.getManaged(user, tournamentId);
    if (t.status !== 'IN_PROGRESS') throw new BadRequestException('Inicia la partida para generar el fixture');
    let stream: ReturnType<typeof parseStreamUrl> | null = null;
    if (dto.streamUrl) {
      try {
        stream = parseStreamUrl(dto.streamUrl);
      } catch (e) {
        throw e instanceof StreamUrlError ? new BadRequestException(e.message) : e;
      }
    }

    const created = await this.prisma.$transaction(
      async (tx) => {
        const withResults = await tx.matchResult.count({ where: { match: { tournamentId } } });
        if (withResults > 0) {
          throw new ConflictException('Ya hay resultados registrados: el fixture no se puede regenerar');
        }
        await tx.match.deleteMany({ where: { tournamentId } });
        await tx.tournamentStanding.deleteMany({ where: { tournamentId } });

        const regs = await tx.tournamentRegistration.findMany({
          where: { tournamentId, status: 'APPROVED' },
          orderBy: [{ seed: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
          select: { id: true, seed: true },
        });
        if (regs.length < 2) throw new BadRequestException('Se necesitan al menos 2 participantes aprobados');

        let seeded = regs.map((r) => r.id);
        if (dto.shuffle) {
          const fixed = regs.filter((r) => r.seed != null).map((r) => r.id);
          const rest = shuffle(regs.filter((r) => r.seed == null).map((r) => r.id));
          seeded = [...fixed, ...rest];
        }
        // La siembra usada queda registrada en cada inscripción
        await Promise.all(
          seeded.map((id, i) => tx.tournamentRegistration.update({ where: { id }, data: { seed: i + 1, groupLabel: null } })),
        );

        let plan: PlannedMatch[];
        switch (t.format) {
          case 'SINGLE_ELIMINATION':
            plan = singleElimination(seeded);
            break;
          case 'DOUBLE_ELIMINATION':
            plan = doubleElimination(seeded);
            break;
          case 'ROUND_ROBIN':
            plan = league(seeded);
            await this.initStandings(tx, tournamentId, new Map([['', seeded]]));
            break;
          case 'GROUPS':
          case 'GROUPS_PLAYOFFS': {
            const groupCount = t.groupCount ?? 2;
            if (seeded.length < groupCount * 2) {
              throw new BadRequestException(`Se necesitan al menos ${groupCount * 2} participantes para ${groupCount} grupos`);
            }
            const groups = distributeGroups(seeded, groupCount);
            if (t.format === 'GROUPS_PLAYOFFS') {
              const smallest = Math.min(...[...groups.values()].map((g) => g.length));
              if ((t.qualifiersPerGroup ?? 1) > smallest) {
                throw new BadRequestException('Clasifican más participantes por grupo de los que tiene el grupo más pequeño');
              }
            }
            plan = [];
            for (const [label, members] of groups) {
              plan.push(...league(members, 'GROUP', label));
              await tx.tournamentRegistration.updateMany({ where: { id: { in: members } }, data: { groupLabel: label } });
            }
            await this.initStandings(tx, tournamentId, groups);
            break;
          }
        }
        await this.persistPlan(tx, tournamentId, plan, t.startsAt, dto.roundIntervalMinutes);
        if (stream) {
          // Mismo canal para todo el fixture: una transmisión programada por encuentro, con su historial
          const created = await tx.match.findMany({ where: { tournamentId }, select: { id: true, scheduledAt: true } });
          const rows = created.map((m) => ({
            id: randomUUID(),
            matchId: m.id,
            streamUrl: stream.url,
            streamPlatform: stream.platform,
            streamVisibility: dto.streamVisibility ?? 'PUBLIC',
            scheduledStartAt: m.scheduledAt,
            createdBy: user.id,
          }));
          await tx.matchStream.createMany({ data: rows });
          await tx.matchStreamHistory.createMany({
            data: rows.map((r) => ({ matchStreamId: r.id, newUrl: r.streamUrl, newStatus: 'SCHEDULED' as const, modifiedBy: user.id, modificationReason: 'Configurada al generar el fixture' })),
          });
        }
        return plan.length;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
    );

    await this.audit.log({
      actorId: user.id,
      action: 'FIXTURE_GENERATED',
      entityType: 'Tournament',
      entityId: tournamentId,
      after: { matches: created, format: t.format, shuffle: !!dto.shuffle },
    });
    await this.notifyTournament(tournamentId, {
      type: 'FIXTURE_PUBLISHED',
      title: `Fixture publicado: ${t.name}`,
      body: 'Ya puedes consultar tus encuentros y horarios.',
      link: `/torneos/${t.slug}`,
    });
    this.realtime.emitToTournament(tournamentId, 'fixture:updated', { tournamentId });
    return { matches: created };
  }

  /** Fase final de GROUPS_PLAYOFFS: clasifica a los mejores de cada grupo a una llave de eliminación. */
  async generatePlayoffs(user: AuthUser, tournamentId: string) {
    const t = await this.getManaged(user, tournamentId);
    if (t.format !== 'GROUPS_PLAYOFFS') throw new BadRequestException('Esta partida no tiene fase de playoffs');
    if (t.status !== 'IN_PROGRESS') throw new BadRequestException('La partida no está en curso');

    const count = await this.prisma.$transaction(
      async (tx) => {
        const matches = await tx.match.findMany({ where: { tournamentId }, select: { bracket: true, status: true } });
        if (matches.some((m) => m.bracket === 'PLAYOFF')) throw new ConflictException('Los playoffs ya fueron generados');
        const group = matches.filter((m) => m.bracket === 'GROUP');
        if (!group.length) throw new BadRequestException('Primero genera la fase de grupos');
        if (group.some((m) => m.status !== 'COMPLETED')) {
          throw new BadRequestException('Faltan resultados de la fase de grupos');
        }
        const rows = await tx.tournamentStanding.findMany({ where: { tournamentId }, orderBy: { position: 'asc' } });
        const groups = new Map<string, StandingRow[]>();
        for (const r of rows) {
          const list = groups.get(r.groupLabel) ?? [];
          list.push({
            registrationId: r.registrationId,
            played: r.played,
            wins: r.wins,
            draws: r.draws,
            losses: r.losses,
            scoreFor: Number(r.scoreFor),
            scoreAgainst: Number(r.scoreAgainst),
            points: r.points,
            position: r.position ?? 0,
          });
          groups.set(r.groupLabel, list);
        }
        const seeded = playoffSeeding(groups, t.qualifiersPerGroup ?? 1);
        if (seeded.length < 2) throw new BadRequestException('No hay suficientes clasificados para los playoffs');
        const plan = singleElimination(seeded, 'PLAYOFF');
        await this.persistPlan(tx, tournamentId, plan, null);
        return plan.length;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
    );

    await this.audit.log({ actorId: user.id, action: 'PLAYOFFS_GENERATED', entityType: 'Tournament', entityId: tournamentId });
    await this.notifyTournament(tournamentId, {
      type: 'FIXTURE_PUBLISHED',
      title: `Playoffs definidos: ${t.name}`,
      body: 'Terminó la fase de grupos. Consulta los cruces de la fase final.',
      link: `/torneos/${t.slug}`,
    });
    this.realtime.emitToTournament(tournamentId, 'fixture:updated', { tournamentId });
    return { matches: count };
  }

  /**
   * Registra o corrige el resultado de un encuentro. Cada corrección crea una versión nueva y anula la anterior.
   * En eliminación, el ganador avanza (y el perdedor baja a la llave de perdedores) automáticamente; una
   * corrección que cambia al ganador solo se admite si los encuentros siguientes aún no tienen resultado.
   */
  async recordResult(user: AuthUser, matchId: string, dto: RecordResultDto) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, include: { tournament: true } });
    if (!match) throw new NotFoundException('Encuentro no encontrado');
    const t = match.tournament;
    await assertCanManageOrganizer(this.prisma, user, t.organizerId);
    if (t.status !== 'IN_PROGRESS') throw new BadRequestException('Solo se registran resultados con la partida en curso');
    const elimination = isElimination(match.bracket);

    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const participants = await tx.matchParticipant.findMany({ where: { matchId }, orderBy: { slot: 'asc' } });
        if (participants.length !== 2) throw new BadRequestException('El encuentro aún no tiene sus dos participantes');
        if (match.status === 'CANCELLED') throw new BadRequestException('El encuentro está cancelado');
        const [p1, p2] = participants;

        let winnerSlot: 1 | 2 | null = dto.score1 > dto.score2 ? 1 : dto.score2 > dto.score1 ? 2 : null;
        if (winnerSlot && dto.winnerSlot && dto.winnerSlot !== winnerSlot) {
          throw new BadRequestException('El ganador indicado no coincide con el marcador');
        }
        if (!winnerSlot && elimination) {
          if (!dto.winnerSlot) {
            throw new BadRequestException('En eliminación debe haber un ganador: indica quién avanza (penales, prórroga…)');
          }
          winnerSlot = dto.winnerSlot;
        }
        if (!winnerSlot && !elimination && dto.winnerSlot) winnerSlot = dto.winnerSlot;
        const winner = winnerSlot === 1 ? p1 : winnerSlot === 2 ? p2 : null;
        const loser = winnerSlot === 1 ? p2 : winnerSlot === 2 ? p1 : null;

        const previous = await tx.matchResult.findFirst({
          where: { matchId, status: 'VALIDATED' },
          orderBy: { version: 'desc' },
        });
        if (previous && !dto.reason) throw new BadRequestException('Indica el motivo de la corrección');

        if (elimination && previous && previous.winnerRegistrationId !== winner!.registrationId) {
          // Cambia quién avanza: los encuentros siguientes no deben haberse jugado
          const downstream = [match.nextMatchId, match.loserNextMatchId].filter((x): x is string => !!x);
          const played = await tx.matchResult.count({ where: { matchId: { in: downstream }, status: 'VALIDATED' } });
          if (played > 0) {
            throw new ConflictException('El ganador ya disputó el siguiente encuentro: corrige primero los resultados posteriores');
          }
        }

        const lastVersion = await tx.matchResult.aggregate({ where: { matchId }, _max: { version: true } });
        if (previous) await tx.matchResult.update({ where: { id: previous.id }, data: { status: 'VOIDED' } });
        const result = await tx.matchResult.create({
          data: {
            matchId,
            version: (lastVersion._max.version ?? 0) + 1,
            scores: { '1': dto.score1, '2': dto.score2 },
            winnerRegistrationId: winner?.registrationId ?? null,
            isDraw: !winner,
            confirmedById: user.id,
            correctionReason: previous ? dto.reason : null,
          },
        });
        await tx.matchParticipant.update({
          where: { id: p1.id },
          data: { score: dto.score1, isWinner: winner ? winner.id === p1.id : null },
        });
        await tx.matchParticipant.update({
          where: { id: p2.id },
          data: { score: dto.score2, isWinner: winner ? winner.id === p2.id : null },
        });
        await tx.match.update({ where: { id: matchId }, data: { status: 'COMPLETED' } });

        if (elimination && winner && loser) {
          await this.placeInSlot(tx, match.nextMatchId, match.nextMatchSlot, winner.registrationId, previous?.winnerRegistrationId ?? undefined);
          const previousLoser = previous
            ? [p1, p2].find((p) => p.registrationId !== previous.winnerRegistrationId)?.registrationId
            : undefined;
          await this.placeInSlot(tx, match.loserNextMatchId, match.loserNextSlot, loser.registrationId, previousLoser);
        }
        if (LEAGUE_BRACKETS.includes(match.bracket)) await this.recomputeStandings(tx, t);

        return { result, previous, participants: [p1.registrationId, p2.registrationId] };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
    );

    await this.audit.log({
      actorId: user.id,
      action: outcome.previous ? 'MATCH_RESULT_CORRECTED' : 'MATCH_RESULT_RECORDED',
      entityType: 'Match',
      entityId: matchId,
      before: outcome.previous ? { version: outcome.previous.version, scores: outcome.previous.scores } : undefined,
      after: { version: outcome.result.version, scores: outcome.result.scores },
      reason: dto.reason,
    });
    await this.notifyRegistrations(outcome.participants, {
      type: 'MATCH_RESULT',
      title: outcome.previous ? `Resultado corregido · ${t.name}` : `Resultado registrado · ${t.name}`,
      body: `Marcador oficial: ${dto.score1} - ${dto.score2}.${outcome.previous ? ` Motivo: ${dto.reason}` : ''}`,
      link: `/torneos/${t.slug}`,
    });
    this.realtime.emitToTournament(t.id, 'match:updated', { tournamentId: t.id, matchId });
    return outcome.result;
  }

  /** Reprogramación (con historial y aviso a los participantes), sede y estado "en vivo". */
  async update(user: AuthUser, matchId: string, dto: UpdateMatchDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: true, participants: { select: { registrationId: true } } },
    });
    if (!match) throw new NotFoundException('Encuentro no encontrado');
    const t = match.tournament;
    await assertCanManageOrganizer(this.prisma, user, t.organizerId);
    if (['FINISHED', 'CANCELLED'].includes(t.status)) throw new BadRequestException('La partida ya terminó');
    if (match.status === 'COMPLETED' && (dto.scheduledAt || dto.status)) {
      throw new BadRequestException('El encuentro ya tiene resultado');
    }
    if (dto.status === 'LIVE' && match.participants.length < 2) {
      throw new BadRequestException('El encuentro aún no tiene sus dos participantes');
    }
    if (dto.status === 'LIVE' && t.status !== 'IN_PROGRESS') throw new BadRequestException('La partida no está en curso');

    const rescheduled = dto.scheduledAt && dto.scheduledAt.getTime() !== match.scheduledAt?.getTime();
    const updated = await this.prisma.$transaction(async (tx) => {
      if (rescheduled) {
        await tx.matchSchedule.create({
          data: {
            matchId,
            scheduledAt: dto.scheduledAt!,
            previousAt: match.scheduledAt,
            reason: dto.reason,
            changedById: user.id,
          },
        });
      }
      return tx.match.update({
        where: { id: matchId },
        data: {
          ...(dto.scheduledAt ? { scheduledAt: dto.scheduledAt } : {}),
          ...(dto.venue !== undefined ? { venue: dto.venue || null } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          isManuallyEdited: true,
        },
      });
    });

    if (rescheduled) {
      await this.audit.log({
        actorId: user.id,
        action: 'MATCH_RESCHEDULED',
        entityType: 'Match',
        entityId: matchId,
        before: { scheduledAt: match.scheduledAt },
        after: { scheduledAt: dto.scheduledAt },
        reason: dto.reason,
      });
      if (match.participants.length) {
        await this.notifyRegistrations(
          match.participants.map((p) => p.registrationId),
          {
            type: 'MATCH_SCHEDULE',
            title: match.scheduledAt ? `Encuentro reprogramado · ${t.name}` : `Horario de tu encuentro · ${t.name}`,
            body: `Nueva fecha: ${dto.scheduledAt!.toISOString()}${dto.reason ? `. Motivo: ${dto.reason}` : ''}`,
            link: `/torneos/${t.slug}`,
            data: { scheduledAt: dto.scheduledAt!.toISOString() },
          },
        );
      }
    }
    this.realtime.emitToTournament(t.id, 'match:updated', { tournamentId: t.id, matchId });
    return updated;
  }

  /**
   * Cierre de la partida: valida que el fixture esté completo, define el campeón y las posiciones finales.
   * Se llama dentro de la transacción que pasa la partida a FINISHED.
   */
  async finalize(tx: Tx, t: Tournament) {
    const matches = await tx.match.findMany({
      where: { tournamentId: t.id },
      select: {
        bracket: true,
        round: true,
        status: true,
        nextMatchId: true,
        loserNextMatchId: true,
        participants: { select: { registrationId: true, isWinner: true } },
      },
    });
    if (!matches.length) {
      // Partida gestionada sin fixture en la plataforma: los aprobados quedan como participantes validados
      await tx.tournamentRegistration.updateMany({ where: { tournamentId: t.id, status: 'APPROVED' }, data: { participationValidated: true } });
      return { champion: null };
    }
    if (matches.some((m) => m.status !== 'COMPLETED' && m.status !== 'CANCELLED')) {
      throw new BadRequestException('Quedan encuentros sin resultado');
    }
    if (t.format === 'GROUPS_PLAYOFFS' && !matches.some((m) => m.bracket === 'PLAYOFF')) {
      throw new BadRequestException('Genera y completa los playoffs antes de finalizar');
    }

    const approved = await tx.tournamentRegistration.findMany({
      where: { tournamentId: t.id, status: 'APPROVED' },
      select: { id: true },
    });
    const ids = approved.map((r) => r.id);
    let placements: Map<string, number>;

    const elim = matches.filter((m) => isElimination(m.bracket) && m.status === 'COMPLETED');
    if (elim.length) {
      const finished: FinishedElimMatch[] = elim.map((m) => {
        const w = m.participants.find((p) => p.isWinner)!;
        const l = m.participants.find((p) => !p.isWinner)!;
        return {
          bracket: m.bracket,
          round: m.round,
          winner: w.registrationId,
          loser: l.registrationId,
          loserContinues: !!m.loserNextMatchId,
          isFinal: !m.nextMatchId,
        };
      });
      placements = eliminationPlacements(finished, ids);
    } else {
      // Liga o grupos sin playoffs: posición en la tabla (en grupos, primero todos los 1.º, luego los 2.º…)
      const rows = await tx.tournamentStanding.findMany({
        where: { tournamentId: t.id },
        orderBy: [{ position: 'asc' }, { points: 'desc' }],
      });
      placements = new Map();
      rows.forEach((r, i) => placements.set(r.registrationId, i + 1));
    }

    const championId = [...placements.entries()].find(([, p]) => p === 1)?.[0] ?? null;
    for (const [id, position] of placements) {
      await tx.tournamentRegistration.update({
        where: { id },
        data: { finalPosition: position, participationValidated: true },
      });
    }
    await tx.tournament.update({ where: { id: t.id }, data: { championRegistrationId: championId } });
    return { champion: championId };
  }

  // =========================================================================== Helpers

  private async getManaged(user: AuthUser, id: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Partida no encontrada');
    await assertCanManageOrganizer(this.prisma, user, t.organizerId);
    return t;
  }

  private async persistPlan(tx: Tx, tournamentId: string, plan: PlannedMatch[], startsAt: Date | null, intervalMin?: number) {
    const ids = new Map(plan.map((m) => [m.key, randomUUID()]));
    // Rondas consecutivas de todas las llaves para programar horarios
    const roundOrder = [...new Set(plan.map((m) => `${roundWeight(m)}`))].map(Number).sort((a, b) => a - b);
    await tx.match.createMany({
      data: plan.map((m) => {
        const filled = m.slots.filter(Boolean).length;
        const slotIndex = roundOrder.indexOf(roundWeight(m));
        return {
          id: ids.get(m.key)!,
          tournamentId,
          bracket: m.bracket,
          round: m.round,
          position: m.position,
          groupLabel: m.groupLabel,
          status: filled === 2 ? 'SCHEDULED' : 'PENDING',
          scheduledAt: startsAt && intervalMin ? new Date(startsAt.getTime() + slotIndex * intervalMin * 60_000) : null,
          nextMatchId: m.next ? ids.get(m.next.key)! : null,
          nextMatchSlot: m.next?.slot ?? null,
          loserNextMatchId: m.loserNext ? ids.get(m.loserNext.key)! : null,
          loserNextSlot: m.loserNext?.slot ?? null,
        };
      }),
    });
    const participants = plan.flatMap((m) =>
      m.slots.flatMap((registrationId, i) => (registrationId ? [{ matchId: ids.get(m.key)!, registrationId, slot: i + 1 }] : [])),
    );
    if (participants.length) await tx.matchParticipant.createMany({ data: participants });
  }

  /** Coloca (o reemplaza, al corregir) a un participante en el slot del encuentro siguiente. */
  private async placeInSlot(tx: Tx, matchId: string | null, slot: number | null, registrationId: string, replacing?: string) {
    if (!matchId || !slot) return;
    const existing = await tx.matchParticipant.findUnique({ where: { matchId_slot: { matchId, slot } } });
    if (existing) {
      if (existing.registrationId === registrationId) return;
      if (replacing && existing.registrationId !== replacing) {
        throw new ConflictException('El encuentro siguiente cambió; revisa la llave antes de corregir');
      }
      await tx.matchParticipant.update({ where: { id: existing.id }, data: { registrationId, score: null, isWinner: null } });
    } else {
      await tx.matchParticipant.create({ data: { matchId, slot, registrationId } });
    }
    const count = await tx.matchParticipant.count({ where: { matchId } });
    if (count === 2) {
      await tx.match.updateMany({ where: { id: matchId, status: 'PENDING' }, data: { status: 'SCHEDULED' } });
    }
  }

  private async initStandings(tx: Tx, tournamentId: string, groups: Map<string, string[]>) {
    await tx.tournamentStanding.createMany({
      data: [...groups.entries()].flatMap(([groupLabel, members]) =>
        members.map((registrationId, i) => ({ tournamentId, registrationId, groupLabel, position: i + 1 })),
      ),
    });
  }

  /** Recalcula la tabla completa desde los resultados válidos: idempotente y robusto ante correcciones. */
  private async recomputeStandings(tx: Tx, t: Tournament) {
    const [standings, matches] = await Promise.all([
      tx.tournamentStanding.findMany({
        where: { tournamentId: t.id },
        select: { id: true, registrationId: true, groupLabel: true, registration: { select: { seed: true } } },
      }),
      tx.match.findMany({
        where: { tournamentId: t.id, bracket: { in: LEAGUE_BRACKETS }, status: 'COMPLETED' },
        select: {
          groupLabel: true,
          participants: { select: { slot: true, registrationId: true, score: true } },
          results: { where: { status: 'VALIDATED' }, take: 1, orderBy: { version: 'desc' }, select: { winnerRegistrationId: true } },
        },
      }),
    ]);
    const groups = new Map<string, typeof standings>();
    for (const s of standings) groups.set(s.groupLabel, [...(groups.get(s.groupLabel) ?? []), s]);

    for (const [label, rows] of groups) {
      const ids = rows
        .sort((a, b) => (a.registration.seed ?? 1e9) - (b.registration.seed ?? 1e9))
        .map((r) => r.registrationId);
      const results: ScoredResult[] = matches
        .filter((m) => (m.groupLabel ?? '') === label && m.participants.length === 2)
        .map((m) => {
          const home = m.participants.find((p) => p.slot === 1)!;
          const away = m.participants.find((p) => p.slot === 2)!;
          return {
            home: home.registrationId,
            away: away.registrationId,
            homeScore: Number(home.score ?? 0),
            awayScore: Number(away.score ?? 0),
            winner: m.results[0]?.winnerRegistrationId ?? null,
          };
        });
      const table = computeStandings(ids, results, { win: t.pointsWin, draw: t.pointsDraw, loss: t.pointsLoss });
      for (const row of table) {
        const id = rows.find((r) => r.registrationId === row.registrationId)!.id;
        await tx.tournamentStanding.update({
          where: { id },
          data: {
            played: row.played,
            wins: row.wins,
            draws: row.draws,
            losses: row.losses,
            scoreFor: row.scoreFor,
            scoreAgainst: row.scoreAgainst,
            points: row.points,
            position: row.position,
          },
        });
      }
    }
  }

  private async notifyRegistrations(
    registrationIds: string[],
    payload: { type: string; title: string; body: string; link?: string; data?: Prisma.InputJsonValue },
  ) {
    const regs = await this.prisma.tournamentRegistration.findMany({
      where: { id: { in: registrationIds } },
      select: {
        requestedById: true,
        player: { select: { userId: true } },
        team: { select: { members: { where: { leftAt: null }, select: { player: { select: { userId: true } } } } } },
      },
    });
    const userIds = new Set<string>();
    for (const r of regs) {
      userIds.add(r.requestedById);
      if (r.player?.userId) userIds.add(r.player.userId);
      for (const m of r.team?.members ?? []) if (m.player.userId) userIds.add(m.player.userId);
    }
    await this.notifications.notify([...userIds].map((userId) => ({ userId, ...payload })));
  }

  private async notifyTournament(tournamentId: string, payload: { type: string; title: string; body: string; link?: string }) {
    const regs = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId, status: 'APPROVED' },
      select: { id: true },
    });
    await this.notifyRegistrations(
      regs.map((r) => r.id),
      payload,
    );
  }
}

/** Orden temporal de las rondas: grupos/liga, luego ganadores y perdedores intercalados, playoffs y gran final. */
function roundWeight(m: Pick<PlannedMatch, 'bracket' | 'round'>) {
  switch (m.bracket) {
    case 'WINNERS':
      return m.round === 1 ? 1 : 2 * (m.round - 1);
    case 'LOSERS':
      return m.round + 1;
    case 'GRAND_FINAL':
      return 1000;
    default:
      return m.round;
  }
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =========================================================================== Controlador

@ApiTags('Encuentros, resultados y clasificación')
@Controller()
export class MatchesController {
  constructor(private readonly service: MatchesService) {}

  @Public()
  @Get('tournaments/:id/fixture')
  fixture(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.service.fixture(id, user);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Post('tournaments/:id/fixture')
  generate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateFixtureDto) {
    return this.service.generate(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Post('tournaments/:id/playoffs')
  playoffs(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.generatePlayoffs(user, id);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Post('matches/:id/result')
  result(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordResultDto) {
    return this.service.recordResult(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Patch('matches/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMatchDto) {
    return this.service.update(user, id, dto);
  }
}

@Module({ controllers: [MatchesController], providers: [MatchesService], exports: [MatchesService] })
export class MatchesModule {}
