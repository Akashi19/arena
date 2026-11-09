/**
 * Módulo 23: enlaces de transmisión en vivo por encuentro.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { StreamsService } from '../src/streams/streams.js';

let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let streams: StreamsService;
let game: { id: string };
const run = randomBytes(3).toString('hex');
let counter = 0;

type Account = Awaited<ReturnType<typeof register>>;
let org: Account;
let rival: Account;
let outsider: Account;
let players: Account[];
let tournamentId: string;
let matchA: { id: string; participants: { registration: { id: string } }[] };
let matchB: { id: string };

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
  streams = app.get(StreamsService);
  const login = await http.post('/api/auth/login').send({ identifier: 'superadmin', password: 'Arena2026demo' }).expect(200);
  const admin = { authorization: `Bearer ${login.body.accessToken}` };
  game = (await http.post('/api/admin/games').set(admin).send({ name: `Stream ${run}`, category: 'FIGHTING', platforms: ['PC'] }).expect(201)).body;

  org = await register('org', true);
  rival = await register('rival', true);
  outsider = await register('fan');
  players = [await register('jug'), await register('jug'), await register('jug'), await register('jug')];

  const start = new Date(Date.now() + 5 * 864e5);
  tournamentId = (
    await http
      .post('/api/tournaments')
      .set(org.auth)
      .send({
        name: `Stream ${run}`,
        category: 'ESPORT',
        gameId: game.id,
        startsAt: start.toISOString(),
        registrationDeadline: new Date(start.getTime() - 864e5).toISOString(),
        maxParticipants: 8,
        mode: 'INDIVIDUAL',
        format: 'SINGLE_ELIMINATION',
        isOnline: true,
      })
      .expect(201)
  ).body.id;
  for (const p of players) {
    const reg = await http.post(`/api/tournaments/${tournamentId}/registrations`).set(p.auth).send({ acceptRules: true }).expect(201);
    await http.patch(`/api/registrations/${reg.body.id}`).set(org.auth).send({ status: 'APPROVED' }).expect(200);
  }
  await http.patch(`/api/tournaments/${tournamentId}/status`).set(org.auth).send({ status: 'IN_PROGRESS' }).expect(200);
});

afterAll(async () => {
  await app?.close();
});

async function register(name: string, organizer = false) {
  const username = `${name}${counter++}_${run}`.slice(0, 30);
  const res = await http
    .post('/api/auth/register')
    .send({
      firstName: 'Test',
      lastName: name,
      username,
      email: `${username}@test.dev`,
      password: 'Prueba2026x',
      country: 'CL',
      city: 'Ciudad',
      asOrganizer: organizer,
    })
    .expect(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  return { username, userId: user.id, auth: { authorization: `Bearer ${res.body.accessToken}` } };
}

async function notifications(a: Account, type: string) {
  const res = await http.get('/api/me/notifications').set(a.auth).query({ pageSize: 100 }).expect(200);
  return (res.body.items as { type: string; link: string }[]).filter((n) => n.type === type);
}

/** Jugador inscrito en el encuentro A (para validar la privacidad y los avisos). */
async function playerOf(matchId: string) {
  const regIds = (await prisma.matchParticipant.findMany({ where: { matchId }, select: { registration: { select: { requestedById: true } } } })).map(
    (p) => p.registration.requestedById,
  );
  return players.filter((p) => regIds.includes(p.userId));
}

describe('Transmisiones por encuentro', () => {
  it('valida el enlace al generar el fixture y lo programa en todos los encuentros', async () => {
    const bad = await http.post(`/api/tournaments/${tournamentId}/fixture`).set(org.auth).send({ streamUrl: 'http://www.twitch.tv/liga' }).expect(400);
    expect(bad.body.message).toMatch(/HTTPS/);
    await http.post(`/api/tournaments/${tournamentId}/fixture`).set(org.auth).send({ streamUrl: 'https://www.twitch.tv/LigaStream' }).expect(201);

    const fx = (await http.get(`/api/tournaments/${tournamentId}/fixture`).expect(200)).body;
    expect(fx.matches).toHaveLength(3);
    for (const m of fx.matches) expect(m.stream).toMatchObject({ status: 'SCHEDULED', platform: 'TWITCH', url: 'https://www.twitch.tv/LigaStream' });
    const ready = fx.matches.filter((m: { participants: unknown[] }) => m.participants.length === 2);
    [matchA, matchB] = ready;
    const hist = (await http.get(`/api/matches/${matchA.id}/stream/history`).set(org.auth).expect(200)).body;
    expect(hist[0]).toMatchObject({ newStatus: 'SCHEDULED', modificationReason: 'Configurada al generar el fixture' });
  });

  it('muestra la transmisión del encuentro con su reproductor embebido', async () => {
    const res = (await http.get(`/api/matches/${matchA.id}/stream`).expect(200)).body;
    expect(res.streamStatus).toBe('SCHEDULED');
    expect(res.stream).toMatchObject({ platformName: 'Twitch', embed: { provider: 'twitch', id: 'ligastream' }, restricted: false });
    expect(res.tournament).toMatchObject({ id: tournamentId, game: { id: game.id } });
    expect(res.tournament.organizerId).toBeUndefined();
    expect(res.canManage).toBe(false);
  });

  it('solo hay una transmisión principal activa; las retransmisiones son explícitas', async () => {
    const dup = await http.post(`/api/matches/${matchA.id}/stream`).set(org.auth).send({ url: 'https://youtu.be/dQw4w9WgXcQ' }).expect(409);
    expect(dup.body.message).toMatch(/retransmisión/);
    await http
      .post(`/api/matches/${matchA.id}/stream`)
      .set(org.auth)
      .send({ url: 'https://youtu.be/dQw4w9WgXcQ', isRebroadcast: true, title: 'Señal en inglés' })
      .expect(201);
    const mismatch = await http
      .post(`/api/matches/${matchA.id}/stream`)
      .set(org.auth)
      .send({ url: 'https://kick.com/liga', platform: 'TWITCH', isRebroadcast: true })
      .expect(400);
    expect(mismatch.body.message).toMatch(/Kick/);
    const res = (await http.get(`/api/matches/${matchA.id}/stream`).expect(200)).body;
    expect(res.rebroadcasts).toEqual([expect.objectContaining({ platform: 'YOUTUBE', title: 'Señal en inglés', embed: { provider: 'youtube', id: 'dQw4w9WgXcQ' } })]);
  });

  it('solo el organizador de la partida gestiona la transmisión', async () => {
    await http.put(`/api/matches/${matchA.id}/stream`).set(rival.auth).send({ title: 'Hackeado' }).expect(403);
    await http.patch(`/api/matches/${matchA.id}/stream/status`).set(rival.auth).send({ status: 'LIVE' }).expect(403);
    await http.delete(`/api/matches/${matchA.id}/stream`).set(rival.auth).expect(403);
    await http.get(`/api/matches/${matchA.id}/stream/history`).set(rival.auth).expect(403);
    await http.put(`/api/matches/${matchA.id}/stream`).set(players[0].auth).send({ title: 'x' }).expect(403);
    await http.put(`/api/matches/${matchA.id}/stream`).send({ title: 'x' }).expect(401);
  });

  it('cambiar el enlace queda en el historial y avisa a los participantes', async () => {
    const res = await http
      .put(`/api/matches/${matchA.id}/stream`)
      .set(org.auth)
      .send({ url: 'https://kick.com/liga-gamer', title: 'Semifinal 1', reason: 'Twitch caído' })
      .expect(200);
    expect(res.body).toMatchObject({ platform: 'KICK', title: 'Semifinal 1', embed: { provider: 'kick', id: 'liga-gamer' } });
    const hist = (await http.get(`/api/matches/${matchA.id}/stream/history`).set(org.auth).expect(200)).body;
    expect(hist[0]).toMatchObject({
      previousUrl: 'https://www.twitch.tv/LigaStream',
      newUrl: 'https://kick.com/liga-gamer',
      modificationReason: 'Twitch caído',
      modifiedBy: { username: org.username },
    });
    // Todos los inscritos aprobados reciben el aviso (es pública); el organizador no se notifica a sí mismo
    for (const p of players) expect(await notifications(p, 'STREAM_UPDATED')).toEqual([expect.objectContaining({ link: `/encuentros/${matchA.id}` })]);
    expect(await notifications(org, 'STREAM_UPDATED')).toHaveLength(0);
    // Sin cambios reales no se escribe historial
    await http.put(`/api/matches/${matchA.id}/stream`).set(org.auth).send({ title: 'Semifinal 1' }).expect(200);
    expect((await http.get(`/api/matches/${matchA.id}/stream/history`).set(org.auth).expect(200)).body).toHaveLength(hist.length);
  });

  it('respeta las preferencias de notificación del usuario', async () => {
    const muted = players[1];
    const prefs = (await http.get('/api/me/notification-preferences').set(muted.auth).expect(200)).body;
    expect(prefs.map((p: { type: string }) => p.type)).toEqual(['STREAM_UPCOMING', 'STREAM_LIVE', 'STREAM_UPDATED', 'STREAM_CANCELLED']);
    expect(prefs[1]).toEqual({ type: 'STREAM_LIVE', inApp: true, email: false, whatsapp: false });
    const wa = await http.put('/api/me/notification-preferences').set(muted.auth).send({ type: 'STREAM_LIVE', inApp: false, email: true, whatsapp: true }).expect(403);
    expect(wa.body.message).toMatch(/teléfono/);
    await http.put('/api/me/notification-preferences').set(muted.auth).send({ type: 'STREAM_LIVE', inApp: false, email: true, whatsapp: false }).expect(200);
    await http.put('/api/me/notification-preferences').set(muted.auth).send({ type: 'OTRO', inApp: false, email: false, whatsapp: false }).expect(400);
  });

  it('activa EN VIVO, aparece en /streams/live y respeta las transiciones', async () => {
    const live = await http.patch(`/api/matches/${matchA.id}/stream/status`).set(org.auth).send({ status: 'LIVE' }).expect(200);
    expect(live.body.actualStartAt).toBeTruthy();
    const list = (await http.get('/api/streams/live').query({ game: game.id }).expect(200)).body;
    expect(list.items).toEqual([expect.objectContaining({ matchId: matchA.id, status: 'LIVE', tournament: expect.objectContaining({ id: tournamentId }) })]);
    expect(list.items[0].match.participants).toHaveLength(2);
    const upcoming = (await http.get('/api/streams/upcoming').query({ game: game.id }).expect(200)).body.items as { matchId: string; isRebroadcast: boolean }[];
    // La principal de A ya no está programada; su retransmisión sí
    expect(upcoming.filter((s) => s.matchId === matchA.id).map((s) => s.isRebroadcast)).toEqual([true]);

    const bad = await http.patch(`/api/matches/${matchA.id}/stream/status`).set(org.auth).send({ status: 'SCHEDULED' }).expect(400);
    expect(bad.body.message).toMatch(/LIVE/);
    await http.patch(`/api/matches/${matchA.id}/stream/status`).set(org.auth).send({ status: 'NOT_CONFIGURED' }).expect(400);

    expect(await notifications(players[0], 'STREAM_LIVE')).toHaveLength(1);
    expect(await notifications(players[1], 'STREAM_LIVE')).toHaveLength(0); // la silenció en sus preferencias

    const ended = await http.patch(`/api/matches/${matchA.id}/stream/status`).set(org.auth).send({ status: 'ENDED' }).expect(200);
    expect(ended.body.actualEndAt).toBeTruthy();
  });

  it('las transmisiones privadas solo las ven el organizador y los participantes del encuentro', async () => {
    await http.put(`/api/matches/${matchB.id}/stream`).set(org.auth).send({ visibility: 'PRIVATE' }).expect(200);
    const anon = (await http.get(`/api/matches/${matchB.id}/stream`).expect(200)).body;
    expect(anon.stream).toMatchObject({ visibility: 'PRIVATE', url: null, embed: null, restricted: true });
    expect((await http.get(`/api/matches/${matchB.id}/stream`).set(outsider.auth).expect(200)).body.stream.url).toBeNull();
    const [inB] = await playerOf(matchB.id);
    const mine = (await http.get(`/api/matches/${matchB.id}/stream`).set(inB.auth).expect(200)).body;
    expect(mine).toMatchObject({ canViewPrivate: true, stream: { url: 'https://www.twitch.tv/LigaStream', restricted: false } });

    const fx = (await http.get(`/api/tournaments/${tournamentId}/fixture`).expect(200)).body;
    expect(fx.matches.find((m: { id: string }) => m.id === matchB.id).stream).toMatchObject({ visibility: 'PRIVATE', url: null });

    const pub = (await http.get(`/api/tournaments/${tournamentId}/streams`).expect(200)).body;
    expect(pub.items.map((s: { matchId: string }) => s.matchId)).not.toContain(matchB.id);
    expect(pub.counts).toEqual({ LIVE: 0, UPCOMING: 2, ENDED: 1 }); // final y retransmisión de A programadas + A finalizada
    const own = (await http.get(`/api/tournaments/${tournamentId}/streams`).set(inB.auth).expect(200)).body;
    expect(own.counts.UPCOMING).toBe(3);
    const ended = (await http.get(`/api/tournaments/${tournamentId}/streams`).query({ status: 'ENDED' }).expect(200)).body;
    expect(ended.items).toEqual([expect.objectContaining({ matchId: matchA.id, status: 'ENDED' })]);
    expect((await http.get('/api/streams/upcoming').query({ game: game.id }).expect(200)).body.items.map((s: { matchId: string }) => s.matchId)).not.toContain(
      matchB.id,
    );
  });

  it('avisa una sola vez cuando la transmisión está próxima a empezar', async () => {
    const now = new Date();
    await http
      .put(`/api/matches/${matchB.id}/stream`)
      .set(org.auth)
      .send({ scheduledStartAt: new Date(now.getTime() + 10 * 60_000).toISOString(), scheduledEndAt: new Date(now.getTime() + 70 * 60_000).toISOString() })
      .expect(200);
    const bad = await http
      .put(`/api/matches/${matchB.id}/stream`)
      .set(org.auth)
      .send({ scheduledEndAt: new Date(now.getTime() - 60_000).toISOString() })
      .expect(400);
    expect(bad.body.message).toMatch(/posterior/);

    await streams.notifyUpcoming(now);
    await streams.notifyUpcoming(now);
    const inB = await playerOf(matchB.id);
    for (const p of inB) expect(await notifications(p, 'STREAM_UPCOMING')).toHaveLength(1);
    // Privada: solo los participantes de ese encuentro
    const others = players.filter((p) => !inB.includes(p));
    for (const p of others) expect(await notifications(p, 'STREAM_UPCOMING')).toHaveLength(0);
  });

  it('cancelar y eliminar el enlace conserva el historial', async () => {
    await http.patch(`/api/matches/${matchB.id}/stream/status`).set(org.auth).send({ status: 'CANCELLED', reason: 'Sin casters' }).expect(200);
    const inB = await playerOf(matchB.id);
    expect(await notifications(inB[0], 'STREAM_CANCELLED')).toEqual([expect.objectContaining({ link: `/encuentros/${matchB.id}` })]);
    // Cancelada: el público ya no la ve; el organizador sí, para reactivarla
    expect((await http.get(`/api/matches/${matchB.id}/stream`).expect(200)).body.streamStatus).toBe('NOT_CONFIGURED');
    expect((await http.get(`/api/matches/${matchB.id}/stream`).set(org.auth).expect(200)).body.stream.status).toBe('CANCELLED');

    await http.delete(`/api/matches/${matchB.id}/stream`).set(org.auth).query({ reason: 'Encuentro sin transmisión' }).expect(200);
    const after = (await http.get(`/api/matches/${matchB.id}/stream`).set(org.auth).expect(200)).body;
    expect(after).toMatchObject({ streamStatus: 'NOT_CONFIGURED', stream: null, canManage: true });
    await http.delete(`/api/matches/${matchB.id}/stream`).set(org.auth).expect(404);

    const hist = (await http.get(`/api/matches/${matchB.id}/stream/history`).set(org.auth).expect(200)).body;
    expect(hist[0]).toMatchObject({ newUrl: null, modificationReason: 'Encuentro sin transmisión', stream: { isActive: false } });
    expect(hist.map((h: { newStatus: string }) => h.newStatus)).toContain('CANCELLED');

    // Se puede volver a agregar un enlace después de eliminarlo
    await http.post(`/api/matches/${matchB.id}/stream`).set(org.auth).send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).expect(201);
    expect((await http.get(`/api/matches/${matchB.id}/stream`).expect(200)).body.stream.platform).toBe('YOUTUBE');
  });

  it('los encuentros sin transmisión funcionan normalmente', async () => {
    const plain = (await http.get(`/api/tournaments/${tournamentId}/fixture`).expect(200)).body.matches.find(
      (m: { participants: unknown[] }) => m.participants.length < 2,
    );
    await http.delete(`/api/matches/${plain.id}/stream`).set(org.auth).expect(200);
    const res = (await http.get(`/api/matches/${plain.id}/stream`).expect(200)).body;
    expect(res).toMatchObject({ streamStatus: 'NOT_CONFIGURED', stream: null, rebroadcasts: [] });
    await http.patch(`/api/matches/${plain.id}/stream/status`).set(org.auth).send({ status: 'LIVE' }).expect(404);
    await http.post(`/api/matches/${matchA.id}/result`).set(org.auth).send({ score1: 2, score2: 1 }).expect(201);
    await http.get(`/api/matches/00000000-0000-4000-8000-000000000000/stream`).expect(404);
  });
});
