/**
 * Pruebas de integración contra la base de datos arena_test.
 * Preparación: `npm run test:db -w apps/api` (migraciones + seed) con la infraestructura levantada.
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
let gameId: string;
const run = randomBytes(3).toString('hex');

async function register(name: string, asOrganizer = true) {
  const username = `${name}_${run}`;
  const res = await http
    .post('/api/auth/register')
    .send({ firstName: 'Test', lastName: name, username, email: `${username}@test.dev`, password: 'Prueba2026x', country: 'PE', city: 'Lima', asOrganizer })
    .expect(201);
  return { token: res.body.accessToken as string, username, refresh: res.body.refreshToken as string };
}

function tournamentPayload(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 10 * 864e5);
  return {
    name: `Copa ${randomBytes(2).toString('hex')}`,
    category: 'ESPORT',
    gameId,
    startsAt: start.toISOString(),
    registrationDeadline: new Date(start.getTime() - 864e5).toISOString(),
    maxParticipants: 8,
    mode: 'INDIVIDUAL',
    format: 'SINGLE_ELIMINATION',
    isOnline: true,
    entryFee: 0,
    currency: 'USD',
    ...overrides,
  };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
  const prisma = app.get(PrismaService);
  gameId = (await prisma.game.findUniqueOrThrow({ where: { slug: 'valorant' } })).id;
});

afterAll(async () => {
  await app?.close();
});

describe('Autenticación', () => {
  it('rechaza campos no permitidos (no se puede auto-asignar rol)', async () => {
    await http
      .post('/api/auth/register')
      .send({ firstName: 'Eve', lastName: 'Il', username: `eve_${run}`, email: `eve_${run}@test.dev`, password: 'Prueba2026x', country: 'PE', city: 'Lima', role: 'SUPERADMIN' })
      .expect(400);
  });

  it('login, /me y refresh funcionan; logout-all revoca el refresh token', async () => {
    const user = await register('auth');
    const me = await http.get('/api/auth/me').set('authorization', `Bearer ${user.token}`).expect(200);
    expect(me.body.username).toBe(user.username);
    expect(me.body.organizerProfile).toBeTruthy();
    await http.post('/api/auth/refresh').send({ refreshToken: user.refresh }).expect(200);
    await http.post('/api/auth/logout-all').set('authorization', `Bearer ${user.token}`).expect(200);
    await http.post('/api/auth/refresh').send({ refreshToken: user.refresh }).expect(401);
  });
});

describe('Partidas y límites del plan FREE', () => {
  it('permite 2 torneos activos y bloquea el tercero con PLAN_LIMIT', async () => {
    const org = await register('limit');
    for (let i = 0; i < 2; i++) {
      await http.post('/api/tournaments').set('authorization', `Bearer ${org.token}`).send(tournamentPayload()).expect(201);
    }
    const res = await http.post('/api/tournaments').set('authorization', `Bearer ${org.token}`).send(tournamentPayload()).expect(403);
    expect(res.body.error).toBe('PLAN_LIMIT');
    expect(res.body.message).toContain('límite de 2 torneos activos');
  });

  it('rechaza más participantes que los permitidos por el plan', async () => {
    const org = await register('cap');
    const res = await http.post('/api/tournaments').set('authorization', `Bearer ${org.token}`).send(tournamentPayload({ maxParticipants: 64 })).expect(403);
    expect(res.body.code).toBe('PARTICIPANTS_LIMIT');
  });

  it('valida fechas: la inscripción debe cerrar antes del inicio', async () => {
    const org = await register('dates');
    const start = new Date(Date.now() + 5 * 864e5);
    await http
      .post('/api/tournaments')
      .set('authorization', `Bearer ${org.token}`)
      .send(tournamentPayload({ startsAt: start.toISOString(), registrationDeadline: new Date(start.getTime() + 864e5).toISOString() }))
      .expect(400);
  });

  it('un jugador sin perfil de organizador no puede crear partidas', async () => {
    const player = await register('player', false);
    await http.post('/api/tournaments').set('authorization', `Bearer ${player.token}`).send(tournamentPayload()).expect(403);
  });
});

describe('Aislamiento entre organizadores e inscripciones', () => {
  it('otro organizador no puede editar, cancelar ni aprobar inscripciones ajenas', async () => {
    const owner = await register('owner');
    const intruder = await register('intruder');
    const player = await register('gamer', false);

    const t = await http.post('/api/tournaments').set('authorization', `Bearer ${owner.token}`).send(tournamentPayload()).expect(201);
    const id = t.body.id as string;

    await http.patch(`/api/tournaments/${id}`).set('authorization', `Bearer ${intruder.token}`).send({ name: 'Hackeado' }).expect(403);
    await http.post(`/api/tournaments/${id}/cancel`).set('authorization', `Bearer ${intruder.token}`).send({ reason: 'porque sí' }).expect(403);

    // Inscripción del jugador (requiere aceptar el reglamento)
    await http.post(`/api/tournaments/${id}/registrations`).set('authorization', `Bearer ${player.token}`).send({ acceptRules: false }).expect(400);
    const reg = await http.post(`/api/tournaments/${id}/registrations`).set('authorization', `Bearer ${player.token}`).send({ acceptRules: true }).expect(201);
    await http.post(`/api/tournaments/${id}/registrations`).set('authorization', `Bearer ${player.token}`).send({ acceptRules: true }).expect(409);

    await http.patch(`/api/registrations/${reg.body.id}`).set('authorization', `Bearer ${intruder.token}`).send({ status: 'APPROVED' }).expect(403);
    await http.patch(`/api/registrations/${reg.body.id}`).set('authorization', `Bearer ${owner.token}`).send({ status: 'APPROVED' }).expect(200);

    // El organizador no puede inscribirse en su propia partida
    await http.post(`/api/tournaments/${id}/registrations`).set('authorization', `Bearer ${owner.token}`).send({ acceptRules: true }).expect(403);

    const detail = await http.get(`/api/tournaments/${t.body.slug}`).expect(200);
    expect(detail.body.registeredCount).toBe(1);
    expect(detail.body.organizer.user.username).toBe(owner.username);

    // El jugador recibió la notificación de aprobación
    const notes = await http.get('/api/me/notifications').set('authorization', `Bearer ${player.token}`).expect(200);
    expect(notes.body.items.some((n: { type: string }) => n.type === 'REGISTRATION_APPROVED')).toBe(true);
  });

  it('el premio se guarda, aparece en el buscador y se puede quitar', async () => {
    const org = await register('prize');
    const prize = `Premio ${randomBytes(3).toString('hex')} al campeón`;
    const t = await http
      .post('/api/tournaments')
      .set('authorization', `Bearer ${org.token}`)
      .send(tournamentPayload({ prize: `  ${prize}  ` }))
      .expect(201);
    expect(t.body.prize).toBe(prize);
    const found = await http.get('/api/tournaments').query({ q: prize.split(' ')[1] }).expect(200);
    expect(found.body.items.map((i: { id: string; prize: string }) => [i.id, i.prize])).toContainEqual([t.body.id, prize]);
    await http.patch(`/api/tournaments/${t.body.id}`).set('authorization', `Bearer ${org.token}`).send({ prize: '' }).expect(200);
    const detail = await http.get(`/api/tournaments/${t.body.slug}`).expect(200);
    expect(detail.body.prize).toBeNull();
    await http.post('/api/tournaments').set('authorization', `Bearer ${org.token}`).send(tournamentPayload({ prize: 'x'.repeat(201) })).expect(400);
  });

  it('guarda los canales oficiales de transmisión validados y sin duplicados', async () => {
    const org = await register('canales');
    const auth = { authorization: `Bearer ${org.token}` };
    const t = await http
      .post('/api/tournaments')
      .set(auth)
      .send(tournamentPayload({ streamChannels: ['https://www.twitch.tv/arena', '', 'https://www.twitch.tv/arena', ' https://www.youtube.com/@arena '] }))
      .expect(201);
    const detail = await http.get(`/api/tournaments/${t.body.slug}`).expect(200);
    expect(detail.body.streamChannels).toEqual([
      { platform: 'TWITCH', url: 'https://www.twitch.tv/arena' },
      { platform: 'YOUTUBE', url: 'https://www.youtube.com/@arena' },
    ]);
    await http.patch(`/api/tournaments/${t.body.id}`).set(auth).send({ streamChannels: ['https://evil.example.com/live'] }).expect(400);
    await http.patch(`/api/tournaments/${t.body.id}`).set(auth).send({ streamChannels: ['http://www.twitch.tv/arena'] }).expect(400);
    await http.patch(`/api/tournaments/${t.body.id}`).set(auth).send({ streamChannels: [] }).expect(200);
    expect((await http.get(`/api/tournaments/${t.body.slug}`).expect(200)).body.streamChannels).toEqual([]);
  });

  it('los borradores no son visibles públicamente', async () => {
    const org = await register('draft');
    const t = await http.post('/api/tournaments').set('authorization', `Bearer ${org.token}`).send(tournamentPayload({ draft: true })).expect(201);
    await http.get(`/api/tournaments/${t.body.slug}`).expect(404);
    await http.get(`/api/tournaments/${t.body.slug}`).set('authorization', `Bearer ${org.token}`).expect(200);
  });

  it('no se puede auto-asignar la insignia de verificación', async () => {
    const org = await register('badge');
    await http.patch('/api/me/organizer').set('authorization', `Bearer ${org.token}`).send({ verificationStatus: 'VERIFIED' }).expect(400);
  });
});
