/**
 * Fase 4: perfiles gamer, ficha pública, privacidad, jugadores sin cuenta y estadísticas oficiales.
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
let valorant: { id: string };
let efootballRank: { id: string };
const run = randomBytes(3).toString('hex');
let counter = 0;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
  valorant = await prisma.game.findUniqueOrThrow({ where: { slug: 'valorant' } });
  const efootball = await prisma.game.findUniqueOrThrow({ where: { slug: 'efootball' } });
  efootballRank = await prisma.gameRank.findFirstOrThrow({ where: { gameId: efootball.id } });
});

afterAll(async () => {
  await app?.close();
});

async function register(name: string, asOrganizer = false) {
  const username = `${name}${counter++}_${run}`;
  const res = await http
    .post('/api/auth/register')
    .send({ firstName: 'Test', lastName: name, username, email: `${username}@test.dev`, password: 'Prueba2026x', country: 'CL', city: 'Santiago', asOrganizer })
    .expect(201);
  return { token: res.body.accessToken as string, username, auth: { authorization: `Bearer ${res.body.accessToken}` } };
}

async function newTournament(org: Awaited<ReturnType<typeof register>>, overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 5 * 864e5);
  const t = await http
    .post('/api/tournaments')
    .set(org.auth)
    .send({
      name: `Stats ${randomBytes(2).toString('hex')}`,
      category: 'ESPORT',
      gameId: valorant.id,
      startsAt: start.toISOString(),
      registrationDeadline: new Date(start.getTime() - 864e5).toISOString(),
      maxParticipants: 8,
      mode: 'INDIVIDUAL',
      format: 'SINGLE_ELIMINATION',
      isOnline: true,
      ...overrides,
    })
    .expect(201);
  return t.body.id as string;
}

/** Inscribe, aprueba, juega (gana siempre el slot 1) y finaliza. */
async function playTournament(org: Awaited<ReturnType<typeof register>>, id: string, entrants: { auth: Record<string, string>; teamId?: string }[]) {
  for (const e of entrants) {
    const reg = await http.post(`/api/tournaments/${id}/registrations`).set(e.auth).send({ acceptRules: true, teamId: e.teamId }).expect(201);
    await http.patch(`/api/registrations/${reg.body.id}`).set(org.auth).send({ status: 'APPROVED' }).expect(200);
  }
  await http.patch(`/api/tournaments/${id}/status`).set(org.auth).send({ status: 'IN_PROGRESS' }).expect(200);
  await http.post(`/api/tournaments/${id}/fixture`).set(org.auth).send({}).expect(201);
  for (;;) {
    const fx = (await http.get(`/api/tournaments/${id}/fixture`).expect(200)).body;
    const ready = fx.matches.filter((m: { status: string; participants: unknown[] }) => m.status === 'SCHEDULED' && m.participants.length === 2);
    if (!ready.length) break;
    for (const m of ready) await http.post(`/api/matches/${m.id}/result`).set(org.auth).send({ score1: 13, score2: 7 }).expect(201);
  }
  await http.patch(`/api/tournaments/${id}/status`).set(org.auth).send({ status: 'FINISHED' }).expect(200);
}

describe('Perfiles gamer', () => {
  it('valida plataforma, rango y duplicados; registra el historial de nivel', async () => {
    const p = await register('gamer');
    const base = { gameId: valorant.id, gamerTag: `Ace#${run}`, competitiveLevel: 'INTERMEDIATE' };
    await http.post('/api/me/games').set(p.auth).send({ ...base, platform: 'MOBILE' }).expect(400);
    await http.post('/api/me/games').set(p.auth).send({ ...base, platform: 'PC', gameRankId: efootballRank.id }).expect(400);
    const created = await http.post('/api/me/games').set(p.auth).send({ ...base, platform: 'PC' }).expect(201);
    expect(created.body.isPrimary).toBe(true); // el primero es el principal
    await http.post('/api/me/games').set(p.auth).send({ ...base, platform: 'PC' }).expect(409);

    await http.patch(`/api/me/games/${created.body.id}`).set(p.auth).send({ competitiveLevel: 'EXPERT' }).expect(200);
    const player = await prisma.player.findFirstOrThrow({ where: { user: { username: p.username } } });
    const history = await prisma.playerGameHistory.findMany({ where: { playerId: player.id }, orderBy: { recordedAt: 'asc' } });
    expect(history.map((h) => h.newLevel)).toEqual(['INTERMEDIATE', 'EXPERT']);
    expect(history[1].previousLevel).toBe('INTERMEDIATE');

    // Otro jugador no puede editar este perfil
    const other = await register('other');
    await http.patch(`/api/me/games/${created.body.id}`).set(other.auth).send({ competitiveLevel: 'BEGINNER' }).expect(404);

    // Búsqueda por gamertag y nivel
    const found = await http.get('/api/players').query({ q: `Ace#${run}`, game: valorant.id, level: 'EXPERT' }).expect(200);
    expect(found.body.items.map((i: { username: string }) => i.username)).toEqual([p.username]);

    // Retirar el juego lo saca de la búsqueda, pero puede volver a agregarse
    await http.delete(`/api/me/games/${created.body.id}`).set(p.auth).expect(200);
    const gone = await http.get('/api/players').query({ q: `Ace#${run}`, game: valorant.id }).expect(200);
    expect(gone.body.total).toBe(0);
    await http.post('/api/me/games').set(p.auth).send({ ...base, platform: 'PC' }).expect(201);
  });

  it('la ficha pública respeta la privacidad; el propio jugador la ve completa', async () => {
    const p = await register('private');
    await http.patch('/api/me/profile').set(p.auth).send({ privacy: { showRealName: false, showStats: false } }).expect(200);
    const anon = await http.get(`/api/players/${p.username}`).expect(200);
    expect(anon.body.fullName).toBeNull();
    expect(anon.body.stats).toBeNull();
    expect(anon.body.teams).not.toBeNull();
    const own = await http.get(`/api/players/${p.username}`).set(p.auth).expect(200);
    expect(own.body.isOwner).toBe(true);
    expect(own.body.fullName).toBeTruthy();
    expect(own.body.stats).not.toBeNull();
    await http.get(`/api/players/no_existe_${run}`).expect(404);
  });
});

describe('Jugadores sin cuenta', () => {
  it('el dueño del equipo agrega jugadores sin cuenta; nadie más puede', async () => {
    const owner = await register('club');
    const team = await http.post('/api/teams').set(owner.auth).send({ name: `Club ${run}`, country: 'CL' }).expect(201);
    const intruder = await register('intr');
    await http.post(`/api/teams/${team.body.id}/guests`).set(intruder.auth).send({ fullName: 'Juan Pérez', nickname: 'Juancho' }).expect(403);
    const guest = await http.post(`/api/teams/${team.body.id}/guests`).set(owner.auth).send({ fullName: 'Juan Pérez', nickname: 'Juancho', jerseyNumber: 9 }).expect(201);
    expect(guest.body.player.userId).toBeNull();
    const page = await http.get(`/api/teams/${team.body.slug}`).expect(200);
    const member = page.body.currentMembers.find((m: { player: { nickname: string } }) => m.player.nickname === 'Juancho');
    expect(member.player.user).toBeNull();
    expect(member.jerseyNumber).toBe(9);
  });
});

describe('Estadísticas oficiales y logros', () => {
  it('al finalizar se materializan estadísticas y logros (individual)', async () => {
    const org = await register('statorg', true);
    const a = await register('champ');
    const b = await register('runner');
    const id = await newTournament(org);
    await playTournament(org, id, [a, b]);

    const champ = (await http.get(`/api/players/${a.username}`).expect(200)).body;
    const runner = (await http.get(`/api/players/${b.username}`).expect(200)).body;
    const winner = champ.stats.overall.tournamentsWon === 1 ? champ : runner;
    const loser = winner === champ ? runner : champ;
    expect(winner.stats.overall).toMatchObject({ tournamentsPlayed: 1, tournamentsWon: 1, wins: 1, matchesPlayed: 1, winRate: 100 });
    expect(loser.stats.overall).toMatchObject({ tournamentsPlayed: 1, tournamentsWon: 0, losses: 1 });
    expect(winner.achievements.map((x: { achievement: { code: string } }) => x.achievement.code).sort()).toEqual(['CHAMPION', 'FIRST_TOURNAMENT', 'FIRST_WIN']);
    expect(loser.achievements.map((x: { achievement: { code: string } }) => x.achievement.code)).toEqual(['FIRST_TOURNAMENT']);
    expect(winner.history[0]).toMatchObject({ finalPosition: 1 });

    const row = await prisma.playerGameStatistics.findFirstOrThrow({ where: { player: { user: { username: winner.username } }, gameId: valorant.id } });
    expect(row.tournamentsWon).toBe(1);
  });

  it('en partidas por equipos las estadísticas se atribuyen a los integrantes', async () => {
    const org = await register('teamorg', true);
    const captains = [await register('capa'), await register('capb')];
    const member = await register('member');
    const teams: string[] = [];
    for (const c of captains) {
      const t = await http.post('/api/teams').set(c.auth).send({ name: `Team ${c.username}`, gameId: valorant.id }).expect(201);
      teams.push(t.body.id);
    }
    await http.post(`/api/teams/${teams[0]}/members`).set(captains[0].auth).send({ username: member.username }).expect(201);
    await http.post(`/api/teams/${teams[1]}/guests`).set(captains[1].auth).send({ fullName: 'Invitado Uno', nickname: 'Inv1' }).expect(201);

    const id = await newTournament(org, { mode: 'TEAM' });
    await playTournament(org, id, [
      { auth: captains[0].auth, teamId: teams[0] },
      { auth: captains[1].auth, teamId: teams[1] },
    ]);
    const profile = (await http.get(`/api/players/${member.username}`).expect(200)).body;
    expect(profile.stats.overall.tournamentsPlayed).toBe(1);
    expect(profile.stats.overall.matchesPlayed).toBe(1);
    expect(profile.history[0].team.name).toBe(`Team ${captains[0].username}`);
    // El invitado sin cuenta también acumula estadísticas
    const guest = await prisma.player.findFirstOrThrow({ where: { nickname: 'Inv1', teams: { some: { teamId: teams[1] } } } });
    const guestStats = await prisma.playerGameStatistics.findUniqueOrThrow({ where: { playerId_gameId: { playerId: guest.id, gameId: valorant.id } } });
    expect(guestStats.tournamentsPlayed).toBe(1);
  });
});
