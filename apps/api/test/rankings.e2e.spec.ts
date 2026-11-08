/**
 * Módulo 22: ranking global. Cada ejecución usa un videojuego propio para que las posiciones no dependan
 * de los datos de otras pruebas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { snapshotDay } from '../src/rankings/engine.js';

let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin: Record<string, string>;
let game: { id: string };
const run = randomBytes(3).toString('hex');
let counter = 0;

type Account = Awaited<ReturnType<typeof register>>;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
  const login = await http.post('/api/auth/login').send({ identifier: 'superadmin', password: 'Arena2026demo' }).expect(200);
  admin = { authorization: `Bearer ${login.body.accessToken}` };
  game = (
    await http
      .post('/api/admin/games')
      .set(admin)
      .send({ name: `Ranked ${run}`, category: 'FIGHTING', platforms: ['PC', 'PLAYSTATION'] })
      .expect(201)
  ).body;
});

afterAll(async () => {
  await app?.close();
});

async function register(name: string, opts: { organizer?: boolean; country?: string; profile?: boolean; platform?: string } = {}) {
  const username = `${name}${counter++}_${run}`.slice(0, 30);
  const res = await http
    .post('/api/auth/register')
    .send({
      firstName: 'Test',
      lastName: name,
      username,
      email: `${username}@test.dev`,
      password: 'Prueba2026x',
      country: opts.country ?? 'CL',
      city: 'Ciudad',
      asOrganizer: !!opts.organizer,
    })
    .expect(201);
  const player = await prisma.player.findFirstOrThrow({ where: { user: { username } } });
  const auth = { authorization: `Bearer ${res.body.accessToken}` };
  if (opts.profile !== false && !opts.organizer) {
    await http
      .post('/api/me/games')
      .set(auth)
      .send({ gameId: game.id, platform: opts.platform ?? 'PC', gamerTag: `${username.slice(0, 20)}#1`, competitiveLevel: 'BEGINNER' })
      .expect(201);
  }
  return { username, playerId: player.id, userId: player.userId!, auth };
}

async function newTournament(org: Account, overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 5 * 864e5);
  const res = await http
    .post('/api/tournaments')
    .set(org.auth)
    .send({
      name: `Rank ${randomBytes(2).toString('hex')}`,
      category: 'ESPORT',
      gameId: game.id,
      startsAt: start.toISOString(),
      registrationDeadline: new Date(start.getTime() - 864e5).toISOString(),
      maxParticipants: 8,
      mode: 'INDIVIDUAL',
      format: 'SINGLE_ELIMINATION',
      isOnline: true,
      ...overrides,
    })
    .expect(201);
  return res.body as { id: string };
}

/** Inscribe (jugadores o equipos), aprueba y juega; `winner` gana todos sus encuentros. */
async function play(org: Account, id: string, entrants: { auth: Record<string, string>; key: string; teamId?: string }[], winner?: string) {
  const regByKey = new Map<string, string>();
  for (const e of entrants) {
    const reg = await http.post(`/api/tournaments/${id}/registrations`).set(e.auth).send({ acceptRules: true, teamId: e.teamId }).expect(201);
    regByKey.set(e.key, reg.body.id);
    await http.patch(`/api/registrations/${reg.body.id}`).set(org.auth).send({ status: 'APPROVED' }).expect(200);
  }
  const winnerReg = winner ? regByKey.get(winner) : undefined;
  await http.patch(`/api/tournaments/${id}/status`).set(org.auth).send({ status: 'IN_PROGRESS' }).expect(200);
  await http.post(`/api/tournaments/${id}/fixture`).set(org.auth).send({}).expect(201);
  for (;;) {
    const fx = (await http.get(`/api/tournaments/${id}/fixture`).expect(200)).body;
    const ready = fx.matches.filter(
      (m: { status: string; participants: unknown[] }) => m.status === 'SCHEDULED' && m.participants.length === 2,
    ) as { id: string; participants: { slot: number; registration: { id: string } }[] }[];
    if (!ready.length) break;
    for (const m of ready) {
      const winnerSlot = m.participants.find((p) => p.registration.id === winnerReg)?.slot ?? 1;
      await http.post(`/api/matches/${m.id}/result`).set(org.auth).send(winnerSlot === 1 ? { score1: 2, score2: 0 } : { score1: 0, score2: 2 }).expect(201);
    }
  }
  await http.patch(`/api/tournaments/${id}/status`).set(org.auth).send({ status: 'FINISHED' }).expect(200);
  return regByKey;
}

const asEntrant = (a: Account) => ({ auth: a.auth, key: a.playerId });
const points = async (playerId: string, seasonId: string | null = null) =>
  (await prisma.playerRanking.findFirst({ where: { playerId, gameId: game.id, seasonId } }))?.points ?? null;

describe('Motor de ranking', () => {
  let org: Account;
  let players: Account[];
  let tournamentId: string;

  it('un torneo finalizado genera puntos por juego, sin duplicar al reprocesar', async () => {
    org = await register('rorg', { organizer: true });
    players = [await register('ra'), await register('rb'), await register('rc', { country: 'PE' }), await register('rd')];
    tournamentId = (await newTournament(org)).id;
    await play(org, tournamentId, players.map(asEntrant), players[0].playerId);

    // Reglas por defecto (el juego no tiene reglas propias): victoria 25, participación 5, 1.º 100, 2.º 60, 3.º 40
    expect(await points(players[0].playerId)).toBe(160);
    const all = await Promise.all(players.map((p) => points(p.playerId)));
    expect(all.reduce((a, b) => a! + b!, 0)).toBe(160 + 95 + 45 + 45);
    const before = await prisma.rankingEvent.count({ where: { tournamentId } });

    const recalc = await http.post('/api/admin/ranking/recalculate').set(admin).send({ gameId: game.id, reason: 'Prueba de idempotencia' }).expect(201);
    expect(recalc.body.created).toBe(0);
    expect(await prisma.rankingEvent.count({ where: { tournamentId } })).toBe(before);
    expect(await points(players[0].playerId)).toBe(160);
    // Con menos de 5 partidas todos son provisionales
    const table = (await http.get('/api/rankings').query({ game: game.id }).expect(200)).body;
    expect(table.items).toHaveLength(0);
    expect(table.provisional.length).toBe(4);
    expect(table.minimumMatches).toBe(5);
  });

  it('las reglas son versionadas: activar una nueva recalcula y conserva el historial', async () => {
    await http.post('/api/admin/ranking/rules').set(admin).send({ gameId: game.id, competitionType: 'INDIVIDUAL', scoringConfiguration: { win: -1 }, effectiveFrom: '2026-01-01', reason: 'Inválida' }).expect(400);
    const rule = (
      await http
        .post('/api/admin/ranking/rules')
        .set(admin)
        .send({
          gameId: game.id,
          competitionType: 'INDIVIDUAL',
          scoringConfiguration: { win: 30, participation: 0, placement: { '1': 50 } },
          minimumMatches: 1,
          effectiveFrom: '2026-01-01',
          reason: 'Temporada de prueba',
        })
        .expect(201)
    ).body;
    expect(rule.version).toBe(1);
    expect(rule.status).toBe('DRAFT');
    const activated = await http.put(`/api/admin/ranking/rules/${rule.id}`).set(admin).send({ status: 'ACTIVE', reason: 'Publicación' }).expect(200);
    expect(activated.body.recalculation.reverted).toBeGreaterThan(0);
    // Campeón: 2 victorias × 30 + 1.º puesto 50
    expect(await points(players[0].playerId)).toBe(110);
    expect(await prisma.rankingEvent.count({ where: { tournamentId, isReverted: true } })).toBeGreaterThan(0);
    expect(await prisma.rankingEvent.count({ where: { tournamentId, isReverted: false, scoringRulesVersion: 1 } })).toBeGreaterThan(0);
    // Una regla activa no se edita: se crea otra versión
    await http.put(`/api/admin/ranking/rules/${rule.id}`).set(admin).send({ scoringConfiguration: { win: 40 }, reason: 'Cambio directo' }).expect(400);

    // Con mínimo 1 partida ya hay posiciones globales y nacionales
    const table = (await http.get('/api/rankings').query({ game: game.id }).expect(200)).body;
    expect(table.items[0].participant.id).toBe(players[0].playerId);
    expect(table.items[0].position).toBe(1);
    expect(table.items[0].trend.status).toBe('NEW');
    const pe = (await http.get('/api/rankings/countries/pe').query({ game: game.id }).expect(200)).body;
    expect(pe.items).toHaveLength(1);
    expect(pe.items[0].participant.id).toBe(players[2].playerId);
    expect(pe.items[0].position).toBe(1);
  });

  it('la evolución compara snapshots: ↑ cuando la posición mejora respecto del día anterior', async () => {
    const yesterday = new Date(snapshotDay().getTime() - 864e5);
    const loser = players[3];
    const current = await prisma.playerRanking.findFirstOrThrow({ where: { playerId: loser.playerId, gameId: game.id, seasonId: null } });
    await prisma.rankingSnapshot.create({
      data: { rankingType: 'PLAYER', participantId: loser.playerId, gameId: game.id, countryCode: 'CL', points: 0, position: current.positionGlobal! + 2, snapshotDate: yesterday },
    });
    const table = (await http.get('/api/rankings').query({ game: game.id, pageSize: 50 }).expect(200)).body;
    const row = table.items.find((i: { participant: { id: string } }) => i.participant.id === loser.playerId);
    expect(row.trend).toEqual({ status: 'UP', delta: 2 });
    const champ = table.items.find((i: { participant: { id: string } }) => i.participant.id === players[0].playerId);
    expect(champ.trend.status).toBe('NEW'); // no estaba en el snapshot anterior

    const history = (await http.get(`/api/rankings/history/${loser.playerId}`).query({ game: game.id }).expect(200)).body;
    expect(history.snapshots.length).toBe(2);
    expect(history.weekly.length).toBeGreaterThanOrEqual(1);
  });

  it('nivel del torneo (solo SUPERADMIN) multiplica los puntos; el organizador no puede cambiarlo', async () => {
    await http.put(`/api/admin/ranking/tournaments/${tournamentId}`).set(org.auth).send({ tier: 5, reason: 'Quiero más puntos' }).expect(403);
    await http.put(`/api/admin/ranking/tournaments/${tournamentId}`).set(admin).send({ tier: 2, reason: 'Torneo regional' }).expect(200);
    expect(await points(players[0].playerId)).toBe(Math.round(30 * 1.25) * 2 + Math.round(50 * 1.25));
    await http.put(`/api/admin/ranking/tournaments/${tournamentId}`).set(admin).send({ isRanked: false, reason: 'Torneo amistoso' }).expect(200);
    expect(await points(players[0].playerId)).toBeNull();
    await http.put(`/api/admin/ranking/tournaments/${tournamentId}`).set(admin).send({ isRanked: true, tier: 1, reason: 'Vuelve a puntuar' }).expect(200);
    expect(await points(players[0].playerId)).toBe(110);
  });

  it('ajustes, reversión y suspensión son auditados y nunca borran eventos', async () => {
    const target = players[1];
    const base = (await points(target.playerId))!;
    const adj = await http
      .post('/api/admin/ranking/adjustments')
      .set(admin)
      .send({ rankingType: 'PLAYER', participantId: target.playerId, gameId: game.id, points: -20, reason: 'Sanción por conducta' })
      .expect(201);
    expect(await points(target.playerId)).toBe(base - 20);
    await http.post(`/api/admin/ranking/events/${adj.body.id}/revert`).set(admin).send({ reason: 'Sanción anulada en apelación' }).expect(201);
    expect(await points(target.playerId)).toBe(base);
    expect(await prisma.rankingEvent.findUnique({ where: { id: adj.body.id } })).toMatchObject({ isReverted: true, revertReason: 'Sanción anulada en apelación' });
    // Una reversión administrativa sobrevive a un recálculo
    await http.post('/api/admin/ranking/recalculate').set(admin).send({ gameId: game.id, reason: 'Comprobación' }).expect(201);
    expect(await points(target.playerId)).toBe(base);

    const until = new Date(Date.now() + 7 * 864e5).toISOString();
    await http.put('/api/admin/ranking/suspensions').set(admin).send({ rankingType: 'PLAYER', participantId: target.playerId, until, reason: 'Investigación en curso' }).expect(200);
    let table = (await http.get('/api/rankings').query({ game: game.id, pageSize: 50 }).expect(200)).body;
    const ids = (list: { participant: { id: string } }[]) => list.map((i) => i.participant.id);
    expect(ids(table.items)).not.toContain(target.playerId);
    expect(ids(table.provisional)).not.toContain(target.playerId);
    await http.put('/api/admin/ranking/suspensions').set(admin).send({ rankingType: 'PLAYER', participantId: target.playerId, until: null, reason: 'Investigación cerrada' }).expect(200);
    table = (await http.get('/api/rankings').query({ game: game.id, pageSize: 50 }).expect(200)).body;
    expect(ids(table.items)).toContain(target.playerId);

    const audit = (await http.get('/api/admin/ranking/audit').set(admin).query({ pageSize: 50 }).expect(200)).body;
    const actions = audit.items.map((a: { action: string }) => a.action);
    for (const a of ['POINTS_ADJUSTED', 'EVENT_REVERTED', 'PARTICIPANT_SUSPENDED', 'SUSPENSION_LIFTED', 'RULE_ACTIVE', 'TOURNAMENT_RANKING_UPDATED']) {
      expect(actions).toContain(a);
    }
    await http.get('/api/admin/ranking/audit').set(players[0].auth).expect(403);
  });

  it('reporte de resultado: solo participantes; si procede se revierten sus puntos y el resultado original se conserva', async () => {
    const match = await prisma.match.findFirstOrThrow({
      where: { tournamentId, participants: { some: { registration: { playerId: players[3].playerId } } } },
      select: { id: true },
    });
    await http.post('/api/rankings/reports').set(players[1].auth).send({ matchId: match.id, reason: 'No jugué ese encuentro' }).expect(403);
    const report = await http.post('/api/rankings/reports').set(players[3].auth).send({ matchId: match.id, reason: 'El rival usó una cuenta ajena' }).expect(201);
    await http.post('/api/rankings/reports').set(players[3].auth).send({ matchId: match.id, reason: 'Otra vez el mismo reporte' }).expect(409);
    const mine = (await http.get('/api/rankings/reports/mine').set(players[3].auth).expect(200)).body;
    expect(mine[0].status).toBe('OPEN');

    const review = await http.put(`/api/admin/ranking/reports/${report.body.id}`).set(admin).send({ decision: 'UPHELD', resolution: 'Se confirmó la suplantación' }).expect(200);
    expect(review.body.revertedEvents).toBeGreaterThan(0);
    expect(await prisma.rankingEvent.count({ where: { matchId: match.id, isReverted: false } })).toBe(0);
    expect(await prisma.matchResult.count({ where: { matchId: match.id, status: 'VALIDATED' } })).toBe(1);
    await http.put(`/api/admin/ranking/reports/${report.body.id}`).set(admin).send({ decision: 'DISMISSED', resolution: 'Doble revisión' }).expect(400);
  });

  it('perfil competitivo y comparador', async () => {
    const profile = (await http.get(`/api/rankings/players/${players[0].playerId}`).expect(200)).body;
    const g = profile.games.find((x: { game: { id: string } }) => x.game.id === game.id);
    expect(g.historic.positionGlobal).toBe(1);
    expect(profile.events.length).toBeGreaterThan(0);
    const cmp = (await http.get('/api/rankings/compare').query({ game: game.id, ids: `${players[0].playerId},${players[1].playerId}` }).expect(200)).body;
    expect(cmp.items).toHaveLength(2);
    expect(cmp.leaders.points).toEqual([players[0].playerId]);
    await http.get('/api/rankings/compare').query({ game: game.id, ids: players[0].playerId }).expect(400);
  });
});

describe('Ranking de equipos y alineaciones', () => {
  it('los puntos son del equipo; sus integrantes los reciben por la alineación registrada', async () => {
    const org = await register('torg', { organizer: true });
    const owners = [await register('ta'), await register('tb')];
    const mates = [await register('tc'), await register('td')];
    const teams = [];
    for (const [i, o] of owners.entries()) {
      const t = (await http.post('/api/teams').set(o.auth).send({ name: `Rank Team ${i} ${run}`, gameId: game.id }).expect(201)).body;
      await prisma.teamPlayer.create({ data: { teamId: t.id, playerId: mates[i].playerId, joinedAt: new Date(Date.now() - 864e5) } });
      teams.push(t);
    }
    const t = await newTournament(org, { mode: 'TEAM' });
    await play(org, t.id, teams.map((team, i) => ({ auth: owners[i].auth, key: team.id, teamId: team.id })), teams[0].id);

    const teamRow = await prisma.teamRanking.findFirstOrThrow({ where: { teamId: teams[0].id, gameId: game.id, seasonId: null } });
    expect(teamRow.points).toBe(25 + 5 + 100); // sin reglas TEAM propias: valores por defecto
    expect(teamRow.tournamentsWon).toBe(1);
    expect(await prisma.matchLineup.count({ where: { match: { tournamentId: t.id } } })).toBe(4);
    // El compañero suma en el ranking individual (regla INDIVIDUAL no aplica: se usa la del torneo por equipos)
    expect(await points(mates[0].playerId)).toBe(130);

    // Salir del equipo no se lleva los puntos: siguen siendo del equipo
    await prisma.teamPlayer.updateMany({ where: { teamId: teams[0].id, playerId: mates[0].playerId }, data: { leftAt: new Date() } });
    await http.post('/api/admin/ranking/recalculate').set(admin).send({ gameId: game.id, reason: 'Cambio de plantilla' }).expect(201);
    expect((await prisma.teamRanking.findFirstOrThrow({ where: { teamId: teams[0].id, gameId: game.id, seasonId: null } })).points).toBe(130);

    const profile = (await http.get(`/api/rankings/teams/${teams[0].id}`).expect(200)).body;
    expect(profile.formerMembers.map((m: { player: { id: string } }) => m.player.id)).toContain(mates[0].playerId);
    const table = (await http.get('/api/rankings').query({ game: game.id, type: 'TEAM' }).expect(200)).body;
    expect(table.type).toBe('TEAM');
    expect([...table.items, ...table.provisional].some((i: { participant: { id: string } }) => i.participant.id === teams[0].id)).toBe(true);
  });
});

describe('Temporadas', () => {
  it('se crean, activan (sin solaparse), cierran con campeón y se archivan', async () => {
    const body = {
      name: `Temporada ${run}`,
      gameId: game.id,
      startDate: new Date(Date.now() - 30 * 864e5).toISOString(),
      endDate: new Date(Date.now() + 30 * 864e5).toISOString(),
      minimumMatches: 1,
    };
    await http.post('/api/admin/ranking/seasons').set(admin).send({ ...body, endDate: body.startDate }).expect(400);
    const s = (await http.post('/api/admin/ranking/seasons').set(admin).send(body).expect(201)).body;
    await http.get(`/api/rankings/seasons/${s.id}`).expect(404); // borrador: no es pública
    await http.put(`/api/admin/ranking/seasons/${s.id}`).set(admin).send({ status: 'COMPLETED', reason: 'Salto inválido' }).expect(400);
    await http.put(`/api/admin/ranking/seasons/${s.id}`).set(admin).send({ status: 'ACTIVE', reason: 'Inicio' }).expect(200);
    const other = (await http.post('/api/admin/ranking/seasons').set(admin).send({ ...body, name: `Paralela ${run}` }).expect(201)).body;
    await http.put(`/api/admin/ranking/seasons/${other.id}`).set(admin).send({ status: 'ACTIVE', reason: 'Solapada' }).expect(409);
    // Una temporada nacional sí convive con la global
    const national = (await http.post('/api/admin/ranking/seasons').set(admin).send({ ...body, name: `Perú ${run}`, countryCode: 'PE' }).expect(201)).body;
    await http.put(`/api/admin/ranking/seasons/${national.id}`).set(admin).send({ status: 'ACTIVE', reason: 'Nacional' }).expect(200);

    const table = (await http.get(`/api/rankings/seasons/${s.id}`).query({ pageSize: 50 }).expect(200)).body;
    expect(table.season.id).toBe(s.id);
    expect(table.items.length).toBeGreaterThan(0);
    const leader = table.items[0].participant.id;
    const nationalRows = await prisma.playerRanking.findMany({ where: { seasonId: national.id }, include: { player: { select: { country: true } } } });
    expect(nationalRows.every((r) => r.player.country === 'PE')).toBe(true);

    const done = (await http.put(`/api/admin/ranking/seasons/${s.id}`).set(admin).send({ status: 'COMPLETED', reason: 'Fin de temporada' }).expect(200)).body;
    expect(done.championPlayerId).toBe(leader);
    await http.put(`/api/admin/ranking/seasons/${s.id}`).set(admin).send({ startDate: new Date().toISOString(), reason: 'Cambio tardío' }).expect(400);
    // Cerrada: un recálculo ya no la toca
    const frozen = await prisma.playerRanking.count({ where: { seasonId: s.id } });
    await http.post('/api/admin/ranking/recalculate').set(admin).send({ gameId: game.id, reason: 'Tras el cierre' }).expect(201);
    expect(await prisma.playerRanking.count({ where: { seasonId: s.id } })).toBe(frozen);
    await http.put(`/api/admin/ranking/seasons/${s.id}`).set(admin).send({ status: 'ARCHIVED', reason: 'Archivo' }).expect(200);
    const seasons = (await http.get('/api/rankings/seasons').query({ game: game.id }).expect(200)).body;
    expect(seasons.find((x: { id: string }) => x.id === s.id).champions.player.id).toBe(leader);
    await http.put(`/api/admin/ranking/seasons/${national.id}`).set(admin).send({ status: 'COMPLETED', reason: 'Cierre' }).expect(200);
  });
});
