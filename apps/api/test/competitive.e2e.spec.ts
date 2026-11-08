/**
 * Módulo 21: verificación de nivel, comparador, reclutamiento (filtros e invitaciones), requisitos de
 * nivel/rango en las partidas y logros generados por eventos (MVP, tres títulos consecutivos).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin: Record<string, string>;
let valorant: { id: string };
let lol: { id: string };
let ranks: { id: string; rankOrder: number }[];
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
  valorant = await prisma.game.findUniqueOrThrow({ where: { slug: 'valorant' } });
  lol = await prisma.game.findFirstOrThrow({ where: { slug: { not: 'valorant' }, ranks: { some: {} } } });
  ranks = await prisma.gameRank.findMany({ where: { gameId: valorant.id }, orderBy: { rankOrder: 'asc' } });
  const login = await http.post('/api/auth/login').send({ identifier: 'superadmin', password: 'Arena2026demo' }).expect(200);
  admin = { authorization: `Bearer ${login.body.accessToken}` };
});

afterAll(async () => {
  await app?.close();
});

async function register(name: string, asOrganizer = false) {
  const username = `${name}${counter++}_${run}`.slice(0, 30);
  const res = await http
    .post('/api/auth/register')
    .send({ firstName: 'Test', lastName: name, username, email: `${username}@test.dev`, password: 'Prueba2026x', country: 'CL', city: 'Santiago', asOrganizer })
    .expect(201);
  const player = await prisma.player.findFirstOrThrow({ where: { user: { username } } });
  return { username, playerId: player.id, auth: { authorization: `Bearer ${res.body.accessToken}` } };
}

async function addGame(p: Account, body: Record<string, unknown> = {}) {
  const res = await http
    .post('/api/me/games')
    .set(p.auth)
    .send({ gameId: valorant.id, platform: 'PC', gamerTag: `${p.username.slice(0, 20)}#1`, competitiveLevel: 'BEGINNER', ...body })
    .expect(201);
  return res.body as { id: string; verificationType: string; verificationSource: string | null };
}

async function newTournament(org: Account, overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 5 * 864e5);
  const res = await http
    .post('/api/tournaments')
    .set(org.auth)
    .send({
      name: `Comp ${randomBytes(2).toString('hex')}`,
      category: 'ESPORT',
      gameId: valorant.id,
      startsAt: start.toISOString(),
      registrationDeadline: new Date(start.getTime() - 864e5).toISOString(),
      maxParticipants: 8,
      mode: 'INDIVIDUAL',
      format: 'SINGLE_ELIMINATION',
      isOnline: true,
      ...overrides,
    });
  return res;
}

/** Inscribe, aprueba y juega; `winner` gana todos sus encuentros (el resto, el slot 1). */
async function play(org: Account, id: string, entrants: Account[], winner?: Account) {
  const regByPlayer = new Map<string, string>();
  for (const e of entrants) {
    const reg = await http.post(`/api/tournaments/${id}/registrations`).set(e.auth).send({ acceptRules: true }).expect(201);
    regByPlayer.set(e.playerId, reg.body.id);
    await http.patch(`/api/registrations/${reg.body.id}`).set(org.auth).send({ status: 'APPROVED' }).expect(200);
  }
  const winnerReg = winner ? regByPlayer.get(winner.playerId) : undefined;
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
      const score = winnerSlot === 1 ? { score1: 13, score2: 5 } : { score1: 5, score2: 13 };
      await http.post(`/api/matches/${m.id}/result`).set(org.auth).send(score).expect(201);
    }
  }
  await http.patch(`/api/tournaments/${id}/status`).set(org.auth).send({ status: 'FINISHED' }).expect(200);
}

const profileOf = (p: Account) => prisma.playerGameProfile.findFirstOrThrow({ where: { playerId: p.playerId, gameId: valorant.id } });

describe('Verificación del nivel', () => {
  it('PLATFORM_VERIFIED solo cuando las estadísticas oficiales respaldan el nivel declarado', async () => {
    const p = await register('lvl');
    const created = await addGame(p, { competitiveLevel: 'ADVANCED' });
    expect(created.verificationType).toBe('SELF_DECLARED'); // sin partidas no hay respaldo

    // Estadísticas oficiales suficientes para ADVANCED (16 partidas, 56 %)
    await prisma.playerGameStatistics.upsert({
      where: { playerId_gameId: { playerId: p.playerId, gameId: valorant.id } },
      update: { matchesPlayed: 16, wins: 9, losses: 7, winRate: 56.25 },
      create: { playerId: p.playerId, gameId: valorant.id, matchesPlayed: 16, wins: 9, losses: 7, winRate: 56.25 },
    });
    const intermediate = await http.patch(`/api/me/games/${created.id}`).set(p.auth).send({ competitiveLevel: 'INTERMEDIATE' }).expect(200);
    expect(intermediate.body.verificationType).toBe('PLATFORM_VERIFIED');
    expect(intermediate.body.verificationSource).toContain('16 partidas');
    expect(intermediate.body.verifiedAt).toBeTruthy();

    // Declarar un nivel superior al respaldado lo devuelve a declarado
    const expert = await http.patch(`/api/me/games/${created.id}`).set(p.auth).send({ competitiveLevel: 'EXPERT' }).expect(200);
    expect(expert.body.verificationType).toBe('SELF_DECLARED');

    const history = await http.get(`/api/players/${p.username}/game-history`).query({ game: valorant.id }).expect(200);
    expect(history.body.map((h: { source: string }) => h.source)).toContain('PLATFORM_VERIFIED');
  });

  it('cerrar una partida evalúa el respaldo de todos los participantes', async () => {
    const org = await register('lvlorg', true);
    const players = await Promise.all([0, 1, 2, 3, 4, 5].map(() => register('rr')));
    for (const p of players) await addGame(p);
    const t = await newTournament(org, { format: 'ROUND_ROBIN', maxParticipants: 6 });
    expect(t.status).toBe(201);
    await play(org, t.body.id, players);
    // 5 partidas oficiales cada uno: respaldan el nivel BEGINNER declarado
    for (const p of players) {
      const prof = await profileOf(p);
      expect(prof.verificationType).toBe('PLATFORM_VERIFIED');
      expect(prof.verificationSource).toContain('5 partidas');
    }
  });

  it('EXTERNAL_VERIFIED lo registra un SUPERADMIN con fuente y justificación; se puede revocar', async () => {
    const p = await register('ext');
    const profile = await addGame(p, { competitiveLevel: 'EXPERT', gameRankId: ranks[2].id });

    await http.put(`/api/admin/game-profiles/${profile.id}/verification`).set(p.auth).send({ action: 'EXTERNAL', source: 'x', reason: 'yo mismo' }).expect(403);
    await http.put(`/api/admin/game-profiles/${profile.id}/verification`).set(admin).send({ action: 'EXTERNAL', reason: 'Falta la fuente' }).expect(400);
    await http
      .put(`/api/admin/game-profiles/${profile.id}/verification`)
      .set(admin)
      .send({ action: 'EXTERNAL', source: 'Captura verificada del cliente oficial', gameRankId: lol.id, reason: 'Revisión manual' })
      .expect(400); // un id que no es rango de este juego

    const ok = await http
      .put(`/api/admin/game-profiles/${profile.id}/verification`)
      .set(admin)
      .send({ action: 'EXTERNAL', source: 'Captura verificada del cliente oficial', gameRankId: ranks[3].id, reason: 'Revisión manual del perfil' })
      .expect(200);
    expect(ok.body.verificationType).toBe('EXTERNAL_VERIFIED');
    expect(ok.body.rank.id).toBe(ranks[3].id);

    // Las estadísticas de la plataforma no pisan una validación externa
    const list = await http.get('/api/admin/game-profiles').set(admin).query({ q: p.username, type: 'EXTERNAL_VERIFIED' }).expect(200);
    expect(list.body.total).toBe(1);
    const audit = await prisma.auditLog.findFirst({ where: { entityId: profile.id, action: 'LEVEL_EXTERNALLY_VERIFIED' } });
    expect(audit?.reason).toBe('Revisión manual del perfil');

    // Si el jugador declara otro nivel, deja de estar validado
    const changed = await http.patch(`/api/me/games/${profile.id}`).set(p.auth).send({ competitiveLevel: 'PROFESSIONAL' }).expect(200);
    expect(changed.body.verificationType).toBe('SELF_DECLARED');
    await http.put(`/api/admin/game-profiles/${profile.id}/verification`).set(admin).send({ action: 'REVOKE', reason: 'Ya no aplica' }).expect(400);
  });
});

describe('Comparador de jugadores', () => {
  it('compara dentro de un mismo juego, marca líderes y respeta la privacidad', async () => {
    const a = await register('cmpa');
    const b = await register('cmpb');
    const c = await register('cmpc');
    await addGame(a, { competitiveLevel: 'EXPERT', gameRankId: ranks[5].id });
    await addGame(b, { competitiveLevel: 'INTERMEDIATE', gameRankId: ranks[2].id });
    // c no tiene perfil del juego
    await prisma.playerGameStatistics.create({ data: { playerId: b.playerId, gameId: valorant.id, matchesPlayed: 10, wins: 7, losses: 3, winRate: 70 } });

    await http.get('/api/players/compare').query({ game: valorant.id, players: a.username }).expect(400);
    await http.get('/api/players/compare').query({ game: valorant.id, players: `${a.username},${a.username}` }).expect(400);
    await http.get('/api/players/compare').query({ game: valorant.id, players: `${a.username},nadie_${run}` }).expect(404);

    const res = await http.get('/api/players/compare').query({ game: valorant.id, players: `${a.username},${b.username},${c.username}` }).expect(200);
    const [ra, rb, rc] = res.body.players;
    expect(ra.profile.competitiveLevel).toBe('EXPERT');
    expect(rc.profile).toBeNull();
    expect(rb.stats.winRate).toBe(70);
    expect(res.body.leaders.level).toEqual([a.username]);
    expect(res.body.leaders.rank).toEqual([a.username]);
    expect(res.body.leaders.wins).toEqual([b.username]);

    await http.patch('/api/me/profile').set(b.auth).send({ privacy: { showStats: false, showHistory: false } }).expect(200);
    const priv = await http.get('/api/players/compare').query({ game: valorant.id, players: `${a.username},${b.username}` }).expect(200);
    expect(priv.body.players[1].stats).toBeNull();
    expect(priv.body.players[1].evolution).toBeNull();
    expect(priv.body.leaders.wins).toBeUndefined();
    await http.get(`/api/players/${b.username}/game-history`).expect(403);
    // El propio jugador sí ve sus datos
    const own = await http.get('/api/players/compare').set(b.auth).query({ game: valorant.id, players: `${a.username},${b.username}` }).expect(200);
    expect(own.body.players[1].stats.wins).toBe(7);
  });
});

describe('Reclutamiento', () => {
  it('filtra por rango (solo dentro del juego), rol, disponibilidad y equipo', async () => {
    const p = await register('rec');
    await addGame(p, { competitiveLevel: 'ADVANCED', gameRankId: ranks[4].id, playerRole: `Centinela${run}` });
    await http.patch('/api/me/player').set(p.auth).send({ recruitmentStatus: 'LOOKING_FOR_TEAM', availability: 'Noches y fines de semana' }).expect(200);

    await http.get('/api/players').query({ rank: ranks[4].id }).expect(400); // rango sin juego
    const q = { game: valorant.id, role: `centinela${run}` };
    const higher = await http.get('/api/players').query({ ...q, rank: ranks[4].id }).expect(200);
    expect(higher.body.items.map((i: { username: string }) => i.username)).toEqual([p.username]);
    const tooHigh = await http.get('/api/players').query({ ...q, rank: ranks[5].id }).expect(200);
    expect(tooHigh.body.total).toBe(0);
    const avail = await http.get('/api/players').query({ ...q, availability: 'noches', team: 'without' }).expect(200);
    expect(avail.body.total).toBe(1);
    const withTeam = await http.get('/api/players').query({ ...q, team: 'with' }).expect(200);
    expect(withTeam.body.total).toBe(0);
  });

  it('invitaciones: el dueño invita, el jugador acepta o rechaza; sin duplicadas ni caducadas', async () => {
    const owner = await register('own');
    const p = await register('inv');
    const q = await register('inv');
    const team = (await http.post('/api/teams').set(owner.auth).send({ name: `Inv ${run}`, gameId: valorant.id }).expect(201)).body;

    await http.post(`/api/teams/${team.id}/invitations`).set(p.auth).send({ username: q.username }).expect(403);
    const inv = await http.post(`/api/teams/${team.id}/invitations`).set(owner.auth).send({ username: p.username, message: 'Buscamos duelista' }).expect(201);
    await http.post(`/api/teams/${team.id}/invitations`).set(owner.auth).send({ username: p.username }).expect(409);

    const mine = await http.get('/api/me/invitations').set(p.auth).expect(200);
    expect(mine.body.map((i: { id: string }) => i.id)).toEqual([inv.body.id]);
    await http.post(`/api/invitations/${inv.body.id}/accept`).set(q.auth).expect(404); // no es suya
    await http.post(`/api/invitations/${inv.body.id}/accept`).set(p.auth).expect(201);
    expect(await prisma.teamPlayer.count({ where: { teamId: team.id, playerId: p.playerId, leftAt: null } })).toBe(1);
    await http.post(`/api/invitations/${inv.body.id}/decline`).set(p.auth).expect(400);
    await http.post(`/api/teams/${team.id}/invitations`).set(owner.auth).send({ username: p.username }).expect(409); // ya es integrante

    // Rechazo
    const inv2 = await http.post(`/api/teams/${team.id}/invitations`).set(owner.auth).send({ username: q.username }).expect(201);
    await http.post(`/api/invitations/${inv2.body.id}/decline`).set(q.auth).expect(201);
    expect(await prisma.teamPlayer.count({ where: { teamId: team.id, playerId: q.playerId } })).toBe(0);

    // Caducada: no se puede aceptar y se puede volver a invitar
    const inv3 = await http.post(`/api/teams/${team.id}/invitations`).set(owner.auth).send({ username: q.username }).expect(201);
    await prisma.teamInvitation.update({ where: { id: inv3.body.id }, data: { createdAt: new Date(Date.now() - 15 * 864e5) } });
    await http.post(`/api/invitations/${inv3.body.id}/accept`).set(q.auth).expect(400);
    const inv4 = await http.post(`/api/teams/${team.id}/invitations`).set(owner.auth).send({ username: q.username }).expect(201);
    await http.delete(`/api/invitations/${inv4.body.id}`).set(owner.auth).expect(200);
    const list = await http.get(`/api/teams/${team.id}/invitations`).set(owner.auth).expect(200);
    expect(list.body.map((i: { status: string }) => i.status).sort()).toEqual(['ACCEPTED', 'CANCELLED', 'DECLINED', 'EXPIRED']);
  });
});

describe('Requisitos de nivel y rango en las partidas', () => {
  it('valida los rangos contra el juego y filtra inscripciones de jugadores y equipos', async () => {
    const org = await register('reqorg', true);
    const lolRank = await prisma.gameRank.findFirstOrThrow({ where: { gameId: lol.id } });
    expect((await newTournament(org, { minRankId: lolRank.id })).status).toBe(400);
    expect((await newTournament(org, { minRankId: ranks[4].id, maxRankId: ranks[2].id })).status).toBe(400);

    const t = await newTournament(org, { minLevel: 'INTERMEDIATE', minRankId: ranks[3].id, maxRankId: ranks[5].id });
    expect(t.status).toBe(201);
    const detail = await http.get(`/api/tournaments/${t.body.id}`).expect(200);
    expect(detail.body.minRank.id).toBe(ranks[3].id);

    const noRank = await register('req');
    await addGame(noRank, { competitiveLevel: 'ADVANCED' });
    const low = await register('req');
    await addGame(low, { competitiveLevel: 'ADVANCED', gameRankId: ranks[2].id });
    const ok = await register('req');
    await addGame(ok, { competitiveLevel: 'ADVANCED', gameRankId: ranks[4].id });

    const reg = (a: Account, teamId?: string) => http.post(`/api/tournaments/${t.body.id}/registrations`).set(a.auth).send({ acceptRules: true, teamId });
    expect((await reg(noRank)).body.message).toContain('rango');
    expect((await reg(low)).status).toBe(400);
    expect((await reg(ok)).status).toBe(201);

    // Filtro del organizador por nivel
    const filtered = await http.get(`/api/tournaments/${t.body.id}/registrations`).set(org.auth).query({ level: 'ADVANCED' }).expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].player.gameProfiles[0].rank.rankName).toBeTruthy();
    expect((await http.get(`/api/tournaments/${t.body.id}/registrations`).set(org.auth).query({ level: 'EXPERT' }).expect(200)).body.total).toBe(0);

    // Por equipos: todos los integrantes actuales deben cumplir
    const tt = await newTournament(org, { mode: 'TEAM', minRankId: ranks[3].id });
    const team = (await http.post('/api/teams').set(ok.auth).send({ name: `Req ${run}`, gameId: valorant.id }).expect(201)).body;
    await http.post(`/api/teams/${team.id}/members`).set(ok.auth).send({ username: low.username }).expect(201);
    const teamReg = await http.post(`/api/tournaments/${tt.body.id}/registrations`).set(ok.auth).send({ acceptRules: true, teamId: team.id }).expect(400);
    expect(teamReg.body.message).toContain(low.username.slice(0, 6));
  });
});

describe('Logros por eventos', () => {
  it('MVP lo elige el organizador al finalizar y se retira si se corrige', async () => {
    const org = await register('mvporg', true);
    const a = await register('mvp');
    const b = await register('mvp');
    const outsider = await register('mvp');
    const t = await newTournament(org);
    await http.put(`/api/tournaments/${t.body.id}/mvp`).set(org.auth).send({ playerId: a.playerId }).expect(400); // no finalizada
    await play(org, t.body.id, [a, b]);

    await http.put(`/api/tournaments/${t.body.id}/mvp`).set(org.auth).send({ playerId: outsider.playerId }).expect(400);
    await http.put(`/api/tournaments/${t.body.id}/mvp`).set(a.auth).send({ playerId: a.playerId }).expect(403);
    await http.put(`/api/tournaments/${t.body.id}/mvp`).set(org.auth).send({ playerId: a.playerId }).expect(200);
    const mvp = await prisma.achievement.findUniqueOrThrow({ where: { code: 'MVP' } });
    expect(await prisma.playerAchievement.count({ where: { playerId: a.playerId, achievementId: mvp.id } })).toBe(1);

    await http.put(`/api/tournaments/${t.body.id}/mvp`).set(org.auth).send({ playerId: b.playerId }).expect(200);
    expect(await prisma.playerAchievement.count({ where: { playerId: a.playerId, achievementId: mvp.id } })).toBe(0);
    expect(await prisma.playerAchievement.count({ where: { playerId: b.playerId, achievementId: mvp.id } })).toBe(1);
    const detail = await http.get(`/api/tournaments/${t.body.id}`).expect(200);
    expect(detail.body.mvp.nickname).toBeTruthy();
  });

  it('THREE_IN_A_ROW tras ganar tres torneos consecutivos', async () => {
    const org = await register('streak', true);
    const champ = await register('champ');
    const rival = await register('rival');
    const streak = await prisma.achievement.findUniqueOrThrow({ where: { code: 'THREE_IN_A_ROW' } });
    for (let i = 0; i < 3; i++) {
      const t = await newTournament(org, { maxParticipants: 2, startsAt: new Date(Date.now() + (5 + i) * 864e5).toISOString() });
      await play(org, t.body.id, [rival, champ], champ);
      const has = await prisma.playerAchievement.count({ where: { playerId: champ.playerId, achievementId: streak.id } });
      expect(has).toBe(i === 2 ? 1 : 0);
    }
    expect(await prisma.playerAchievement.count({ where: { playerId: rival.playerId, achievementId: streak.id } })).toBe(0);
  });
});
