/**
 * Fase 5: fixture, llaves, resultados y clasificación (integración contra arena_test).
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

type FixtureMatch = {
  id: string;
  bracket: string;
  round: number;
  status: string;
  nextMatchId: string | null;
  participants: { slot: number; registration: { id: string } }[];
};
type Fixture = {
  matches: FixtureMatch[];
  standings: { groupLabel: string; points: number; position: number; registration: { id: string } }[];
  canGeneratePlayoffs: boolean;
};

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
  gameId = (await app.get(PrismaService).game.findUniqueOrThrow({ where: { slug: 'valorant' } })).id;
});

afterAll(async () => {
  await app?.close();
});

let counter = 0;
async function register(name: string, asOrganizer = true) {
  const username = `${name}${counter++}_${run}`;
  const res = await http
    .post('/api/auth/register')
    .send({ firstName: 'Test', lastName: name, username, email: `${username}@test.dev`, password: 'Prueba2026x', country: 'PE', city: 'Lima', asOrganizer })
    .expect(201);
  return { token: res.body.accessToken as string };
}

async function startTournament(players: number, overrides: Record<string, unknown> = {}) {
  const org = await register('fx');
  const auth = { authorization: `Bearer ${org.token}` };
  const start = new Date(Date.now() + 10 * 864e5);
  const t = await http
    .post('/api/tournaments')
    .set(auth)
    .send({
      name: `Fixture ${randomBytes(2).toString('hex')}`,
      category: 'ESPORT',
      gameId,
      startsAt: start.toISOString(),
      registrationDeadline: new Date(start.getTime() - 864e5).toISOString(),
      maxParticipants: 16,
      mode: 'INDIVIDUAL',
      format: 'SINGLE_ELIMINATION',
      isOnline: true,
      ...overrides,
    })
    .expect(201);
  const id = t.body.id as string;
  for (let i = 0; i < players; i++) {
    const p = await register('fxp', false);
    const reg = await http.post(`/api/tournaments/${id}/registrations`).set('authorization', `Bearer ${p.token}`).send({ acceptRules: true }).expect(201);
    await http.patch(`/api/registrations/${reg.body.id}`).set(auth).send({ status: 'APPROVED' }).expect(200);
  }
  await http.patch(`/api/tournaments/${id}/status`).set(auth).send({ status: 'IN_PROGRESS' }).expect(200);
  return { auth, id, slug: t.body.slug as string };
}

async function fixture(id: string): Promise<Fixture> {
  return (await http.get(`/api/tournaments/${id}/fixture`).expect(200)).body;
}

/** Juega todos los encuentros disponibles (gana el local) hasta que no quede ninguno. */
async function playAll(id: string, auth: Record<string, string>, bracket?: string) {
  for (;;) {
    const { matches } = await fixture(id);
    const ready = matches.filter((m) => m.status === 'SCHEDULED' && m.participants.length === 2 && (!bracket || m.bracket === bracket));
    if (!ready.length) return;
    for (const m of ready) {
      await http.post(`/api/matches/${m.id}/result`).set(auth).send({ score1: 2, score2: 1 }).expect(201);
    }
  }
}

describe('Fixture, resultados y clasificación', () => {
  it('eliminación simple con byes: avance automático, correcciones y campeón al finalizar', async () => {
    const { auth, id, slug } = await startTournament(5);
    const intruder = await register('fxintruder');

    await http.post(`/api/tournaments/${id}/fixture`).set('authorization', `Bearer ${intruder.token}`).send({}).expect(403);
    await http.post(`/api/tournaments/${id}/fixture`).set(auth).send({}).expect(201);
    let fx = await fixture(id);
    expect(fx.matches).toHaveLength(4); // n - 1: los byes se colapsan

    const first = fx.matches.find((m) => m.status === 'SCHEDULED' && m.round === 1)!;
    await http.post(`/api/matches/${first.id}/result`).set('authorization', `Bearer ${intruder.token}`).send({ score1: 1, score2: 0 }).expect(403);
    // Empate sin desempate no se admite en eliminación
    await http.post(`/api/matches/${first.id}/result`).set(auth).send({ score1: 1, score2: 1 }).expect(400);
    await http.post(`/api/matches/${first.id}/result`).set(auth).send({ score1: 1, score2: 1, winnerSlot: 2 }).expect(201);

    // El ganador (slot 2) pasó al encuentro siguiente
    fx = await fixture(id);
    const winnerId = first.participants.find((p) => p.slot === 2)!.registration.id;
    const nextIds = () => fx.matches.find((m) => m.id === first.nextMatchId)!.participants.map((p) => p.registration.id);
    expect(nextIds()).toContain(winnerId);

    // Corregir exige motivo; si cambia el ganador, se reemplaza al clasificado
    await http.post(`/api/matches/${first.id}/result`).set(auth).send({ score1: 3, score2: 1 }).expect(400);
    await http.post(`/api/matches/${first.id}/result`).set(auth).send({ score1: 3, score2: 1, reason: 'Error de carga del acta' }).expect(201);
    fx = await fixture(id);
    expect(nextIds()).not.toContain(winnerId);

    // Con resultados cargados ya no se regenera el fixture, ni se finaliza con encuentros pendientes
    await http.post(`/api/tournaments/${id}/fixture`).set(auth).send({}).expect(409);
    await http.patch(`/api/tournaments/${id}/status`).set(auth).send({ status: 'FINISHED' }).expect(400);

    await playAll(id, auth);
    fx = await fixture(id);
    expect(fx.matches.every((m) => m.status === 'COMPLETED')).toBe(true);

    // Cambiar al ganador cuando ya jugó la ronda siguiente: bloqueado
    await http.post(`/api/matches/${first.id}/result`).set(auth).send({ score1: 0, score2: 1, reason: 'Nueva revisión' }).expect(409);

    await http.patch(`/api/tournaments/${id}/status`).set(auth).send({ status: 'FINISHED' }).expect(200);
    const detail = await http.get(`/api/tournaments/${slug}`).expect(200);
    expect(detail.body.champion).toBeTruthy();
    const positions = detail.body.registrations.map((r: { finalPosition: number }) => r.finalPosition).sort();
    expect(positions).toEqual([1, 2, 3, 3, 5]);
  });

  it('liga: la tabla se recalcula con cada resultado y el líder es campeón', async () => {
    const { auth, id, slug } = await startTournament(4, { format: 'ROUND_ROBIN' });
    await http.post(`/api/tournaments/${id}/fixture`).set(auth).send({ roundIntervalMinutes: 60 }).expect(201);
    let fx = await fixture(id);
    expect(fx.matches).toHaveLength(6);
    expect(fx.standings).toHaveLength(4);

    // En liga el empate es válido
    await http.post(`/api/matches/${fx.matches[0].id}/result`).set(auth).send({ score1: 1, score2: 1 }).expect(201);
    fx = await fixture(id);
    expect(fx.standings.filter((s) => s.points === 1)).toHaveLength(2);

    await playAll(id, auth);
    fx = await fixture(id);
    expect(fx.standings.reduce((sum, s) => sum + s.points, 0)).toBe(5 * 3 + 2); // 5 victorias y un empate
    await http.patch(`/api/tournaments/${id}/status`).set(auth).send({ status: 'FINISHED' }).expect(200);
    const detail = await http.get(`/api/tournaments/${slug}`).expect(200);
    expect(detail.body.champion.id).toBe(fx.standings.find((s) => s.position === 1)!.registration.id);
  });

  it('grupos + playoffs: clasifican los mejores de cada grupo', async () => {
    const { auth, id } = await startTournament(8, { format: 'GROUPS_PLAYOFFS', groupCount: 2, qualifiersPerGroup: 2 });
    await http.post(`/api/tournaments/${id}/fixture`).set(auth).send({}).expect(201);
    let fx = await fixture(id);
    expect(fx.matches.filter((m) => m.bracket === 'GROUP')).toHaveLength(12);
    await http.post(`/api/tournaments/${id}/playoffs`).set(auth).expect(400);

    await playAll(id, auth, 'GROUP');
    await http.post(`/api/tournaments/${id}/playoffs`).set(auth).expect(201);
    await http.post(`/api/tournaments/${id}/playoffs`).set(auth).expect(409);
    fx = await fixture(id);
    const playoffs = fx.matches.filter((m) => m.bracket === 'PLAYOFF');
    expect(playoffs).toHaveLength(3);
    const qualified = playoffs.flatMap((m) => m.participants.map((p) => p.registration.id)).sort();
    expect(qualified).toEqual(fx.standings.filter((s) => s.position <= 2).map((s) => s.registration.id).sort());

    await playAll(id, auth, 'PLAYOFF');
    await http.patch(`/api/tournaments/${id}/status`).set(auth).send({ status: 'FINISHED' }).expect(200);
  });

  it('doble eliminación: la llave se completa hasta la gran final', async () => {
    const { auth, id } = await startTournament(6, { format: 'DOUBLE_ELIMINATION' });
    await http.post(`/api/tournaments/${id}/fixture`).set(auth).send({ shuffle: true }).expect(201);
    await playAll(id, auth);
    const fx = await fixture(id);
    expect(fx.matches.every((m) => m.status === 'COMPLETED')).toBe(true);
    expect(fx.matches.some((m) => m.bracket === 'GRAND_FINAL')).toBe(true);
    await http.patch(`/api/tournaments/${id}/status`).set(auth).send({ status: 'FINISHED' }).expect(200);
  });
});
