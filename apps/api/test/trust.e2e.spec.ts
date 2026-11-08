/**
 * Módulos 18-20: verificación de organizadores, valoraciones, incidencias y reputación (TRS).
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
let gameId: string;
let admin: { authorization: string };
const run = randomBytes(3).toString('hex');
let counter = 0;

// PNG 1×1 y PDF mínimos (se validan por firma binaria)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
  gameId = (await prisma.game.findUniqueOrThrow({ where: { slug: 'valorant' } })).id;
  const login = await http.post('/api/auth/login').send({ identifier: 'superadmin', password: 'Arena2026demo' }).expect(200);
  admin = { authorization: `Bearer ${login.body.accessToken}` };
});

afterAll(async () => {
  await app?.close();
});

async function register(name: string, asOrganizer = false, { aged = true } = {}) {
  const username = `${name}${counter++}_${run}`;
  const res = await http
    .post('/api/auth/register')
    .send({ firstName: 'Test', lastName: name, username, email: `${username}@test.dev`, password: 'Prueba2026x', country: 'PE', city: 'Lima', asOrganizer })
    .expect(201);
  // Cuentas "antiguas" para no activar la detección de cuentas recién creadas
  if (aged) await prisma.user.update({ where: { username }, data: { createdAt: new Date(Date.now() - 30 * 864e5) } });
  const auth = { authorization: `Bearer ${res.body.accessToken}` };
  const organizerId = asOrganizer ? (await http.get('/api/me/organizer').set(auth).expect(200)).body.id : null;
  return { username, auth, organizerId: organizerId as string };
}

async function finishedTournament(org: Awaited<ReturnType<typeof register>>, players: Awaited<ReturnType<typeof register>>[], finish = true) {
  const start = new Date(Date.now() + 3 * 864e5);
  const t = await http
    .post('/api/tournaments')
    .set(org.auth)
    .send({
      name: `Trust ${randomBytes(2).toString('hex')}`,
      category: 'ESPORT',
      gameId,
      startsAt: start.toISOString(),
      registrationDeadline: new Date(start.getTime() - 864e5).toISOString(),
      maxParticipants: 8,
      mode: 'INDIVIDUAL',
      format: 'ROUND_ROBIN',
      isOnline: true,
    })
    .expect(201);
  const id = t.body.id as string;
  for (const p of players) {
    const reg = await http.post(`/api/tournaments/${id}/registrations`).set(p.auth).send({ acceptRules: true }).expect(201);
    await http.patch(`/api/registrations/${reg.body.id}`).set(org.auth).send({ status: 'APPROVED' }).expect(200);
  }
  await http.patch(`/api/tournaments/${id}/status`).set(org.auth).send({ status: 'IN_PROGRESS' }).expect(200);
  if (finish) await http.patch(`/api/tournaments/${id}/status`).set(org.auth).send({ status: 'FINISHED' }).expect(200);
  return id;
}

const scores = (n: number) => ({
  organizationScore: n,
  punctualityScore: n,
  communicationScore: n,
  transparencyScore: n,
  overallExperienceScore: n,
});

describe('Verificación de organizadores', () => {
  it('flujo completo: solicitud, información adicional, aprobación, suspensión, rehabilitación y vencimiento', async () => {
    const org = await register('verif', true);
    const send = (fields: Record<string, string>, docs = 1) => {
      let req = http.post('/api/me/verification').set(org.auth);
      for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
      for (let i = 0; i < docs; i++) req = req.attach('documents', PDF, { filename: `doc${i}.pdf`, contentType: 'application/pdf' });
      return req;
    };
    const fields = {
      organizerName: 'Liga Verificada',
      verificationType: 'COMPANY',
      country: 'PE',
      city: 'Lima',
      contactEmail: 'contacto@liga.test',
      contactPhone: '+51 999 888 777',
      description: 'Organizamos ligas amateur de Valorant y fútbol desde 2020 en Lima.',
      socialLinks: JSON.stringify({ instagram: 'https://instagram.com/liga' }),
      documentTypes: JSON.stringify(['RUC']),
      acceptPolicy: 'true',
    };

    // Requiere logo oficial y aceptar la política
    await send(fields).expect(400);
    await http.post('/api/me/organizer/logo').set(org.auth).attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' }).expect(201);
    await send({ ...fields, acceptPolicy: 'false' }).expect(400);
    // Un archivo que no es PDF/imagen se rechaza aunque diga serlo
    await http
      .post('/api/me/verification')
      .set(org.auth)
      .field('organizerName', fields.organizerName)
      .field('verificationType', 'COMPANY')
      .field('country', 'PE')
      .field('city', 'Lima')
      .field('contactEmail', fields.contactEmail)
      .field('contactPhone', fields.contactPhone)
      .field('description', fields.description)
      .field('acceptPolicy', 'true')
      .attach('documents', Buffer.from('MZ fake exe'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(400);

    const created = await send(fields).expect(201);
    await send(fields).expect(409); // sin solicitudes duplicadas
    let mine = (await http.get('/api/me/verification').set(org.auth).expect(200)).body;
    expect(mine.status).toBe('PENDING');
    expect(mine.current.documents).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toContain('storagePath'); // la ruta privada nunca se expone

    // Solo el SUPERADMIN revisa
    await http.get('/api/admin/verifications').set(org.auth).expect(403);
    const id = created.body.id as string;
    await http.post(`/api/admin/verifications/${id}/actions`).set(admin).send({ action: 'REJECT' }).expect(400);
    await http.post(`/api/admin/verifications/${id}/actions`).set(admin).send({ action: 'REQUEST_INFO', reason: 'Adjunta la vigencia de poder' }).expect(201);
    await http.post('/api/me/verification/info').set(org.auth).field('message', 'Adjunto la vigencia de poder').attach('documents', PDF, { filename: 'poder.pdf', contentType: 'application/pdf' }).expect(201);

    const detail = (await http.get(`/api/admin/verifications/${id}`).set(admin).expect(200)).body;
    expect(detail.documents).toHaveLength(2);
    const doc = await http.get(`/api/admin/verifications/${id}/documents/${detail.documents[0].id}`).set(admin).expect(200);
    expect(doc.body.url).toContain('X-Amz-Signature');

    await http.post(`/api/admin/verifications/${id}/actions`).set(admin).send({ action: 'APPROVE', comments: 'Documentos conformes' }).expect(201);
    let pub = (await http.get(`/api/organizers/${org.username}`).expect(200)).body;
    expect(pub.organizer.verificationStatus).toBe('VERIFIED');

    await http.post(`/api/admin/verifications/${id}/actions`).set(admin).send({ action: 'SUSPEND' }).expect(400);
    await http.post(`/api/admin/verifications/${id}/actions`).set(admin).send({ action: 'SUSPEND', reason: 'Denuncias en revisión' }).expect(201);
    pub = (await http.get(`/api/organizers/${org.username}`).expect(200)).body;
    expect(pub.organizer.verificationStatus).toBe('SUSPENDED');
    await send(fields).expect(409); // suspendida: no puede autogestionar una nueva solicitud
    await http.post(`/api/admin/verifications/${id}/actions`).set(admin).send({ action: 'REINSTATE', reason: 'Denuncias desestimadas' }).expect(201);

    // Vencimiento automático
    await prisma.organizerVerification.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const maint = await http.post('/api/admin/verifications/maintenance').set(admin).expect(201);
    expect(maint.body.expired).toBeGreaterThanOrEqual(1);
    mine = (await http.get('/api/me/verification').set(org.auth).expect(200)).body;
    expect(mine.status).toBe('EXPIRED');
    expect(mine.canRequest).toBe(true);

    // Historial completo y auditoría
    const history = await prisma.verificationHistory.findMany({ where: { verificationId: id }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => h.newStatus)).toEqual(['PENDING', 'UNDER_REVIEW', 'UNDER_REVIEW', 'VERIFIED', 'SUSPENDED', 'VERIFIED', 'EXPIRED']);
    const audits = await prisma.auditLog.count({ where: { entityId: id, action: { startsWith: 'VERIFICATION_' } } });
    expect(audits).toBeGreaterThanOrEqual(6);
  });

  it('el organizador no puede asignarse la insignia', async () => {
    const org = await register('selfbadge', true);
    await http.patch('/api/me/organizer').set(org.auth).send({ verificationStatus: 'VERIFIED' }).expect(400);
    await http.post('/api/admin/verifications/00000000-0000-0000-0000-000000000000/actions').set(org.auth).send({ action: 'APPROVE' }).expect(403);
  });
});

describe('Valoraciones y reputación', () => {
  it('reglas de elegibilidad, edición con historial, respuestas y reportes', async () => {
    const org = await register('rorg', true);
    const [a, b] = [await register('ra'), await register('rb')];
    const outsider = await register('rout');

    // Antes de finalizar no se puede valorar
    const running = await finishedTournament(org, [a, b], false);
    await http.post(`/api/organizers/${org.organizerId}/ratings`).set(a.auth).send({ tournamentId: running, ...scores(5) }).expect(400);

    const id = await finishedTournament(org, [a, b]);
    const fb = (await http.get(`/api/tournaments/${id}/feedback`).set(a.auth).expect(200)).body;
    expect(fb.canRate).toBe(true);
    await http.post(`/api/organizers/${org.organizerId}/ratings`).set(outsider.auth).send({ tournamentId: id, ...scores(5) }).expect(403);
    await http.post(`/api/organizers/${org.organizerId}/ratings`).set(org.auth).send({ tournamentId: id, ...scores(5) }).expect(403);
    await http.post(`/api/organizers/${org.organizerId}/ratings`).set(a.auth).send({ tournamentId: id, ...scores(6) }).expect(400);

    const ra = await http
      .post(`/api/organizers/${org.organizerId}/ratings`)
      .set(a.auth)
      .send({ tournamentId: id, organizationScore: 4, punctualityScore: 3, communicationScore: 5, transparencyScore: 2, overallExperienceScore: 1, comment: 'Buen torneo, pero empezó tarde.' })
      .expect(201);
    expect(Number(ra.body.finalScore)).toBe(3.2);
    expect(ra.body.moderationStatus).toBe('APPROVED');
    await http.post(`/api/organizers/${org.organizerId}/ratings`).set(a.auth).send({ tournamentId: id, ...scores(5) }).expect(409);

    // Edición por el autor (con historial) y nadie más
    await http.put(`/api/ratings/${ra.body.id}`).set(b.auth).send(scores(1)).expect(403);
    const edited = await http.put(`/api/ratings/${ra.body.id}`).set(a.auth).send({ ...scores(4), comment: 'Actualizo: el organizador compensó el retraso.' }).expect(200);
    expect(Number(edited.body.finalScore)).toBe(4);
    const hist = await prisma.ratingHistory.findMany({ where: { ratingId: ra.body.id } });
    expect(hist).toHaveLength(1);
    expect((hist[0].previousValues as { finalScore: number }).finalScore).toBe(3.2);

    // Plazo de edición vencido
    await prisma.organizerRating.update({ where: { id: ra.body.id }, data: { editableUntil: new Date(Date.now() - 1000) } });
    await http.put(`/api/ratings/${ra.body.id}`).set(a.auth).send(scores(5)).expect(400);

    await http.post(`/api/organizers/${org.organizerId}/ratings`).set(b.auth).send({ tournamentId: id, ...scores(5) }).expect(201);
    let rep = (await http.get(`/api/organizers/${org.organizerId}/reputation`).expect(200)).body;
    expect(rep.reputation.totalRatings).toBe(2);
    expect(Number(rep.reputation.averageScore)).toBe(4.5);
    expect(rep.reputation.reputationLevel).toBe('NEW'); // muestra pequeña
    expect(rep.smallSample).toBe(true);
    expect(rep.distribution['4']).toBe(1);
    expect(rep.distribution['5']).toBe(1);

    // Respuesta pública del organizador: una por valoración y sin lenguaje ofensivo
    await http.post(`/api/ratings/${ra.body.id}/responses`).set(outsider.auth).send({ response: 'Gracias' }).expect(403);
    await http.post(`/api/ratings/${ra.body.id}/responses`).set(org.auth).send({ response: 'Eres un idiota' }).expect(400);
    await http.post(`/api/ratings/${ra.body.id}/responses`).set(org.auth).send({ response: '¡Gracias! Ajustamos los horarios para la próxima.' }).expect(201);
    await http.post(`/api/ratings/${ra.body.id}/responses`).set(org.auth).send({ response: 'Otra' }).expect(409);
    const list = (await http.get(`/api/organizers/${org.organizerId}/ratings`).expect(200)).body;
    const withResponse = list.items.find((r: { id: string }) => r.id === ra.body.id);
    expect(withResponse.response.response).toContain('Gracias');
    expect(withResponse.author.nickname).toBeTruthy();
    expect(JSON.stringify(list)).not.toContain('@test.dev'); // sin datos personales

    // Reportes: uno por usuario; el autor no puede reportar la suya
    await http.post(`/api/ratings/${ra.body.id}/reports`).set(a.auth).send({ reason: 'Quiero borrarla' }).expect(400);
    await http.post(`/api/ratings/${ra.body.id}/reports`).set(org.auth).send({ reason: 'Contiene datos falsos' }).expect(201);
    await http.post(`/api/ratings/${ra.body.id}/reports`).set(org.auth).send({ reason: 'Contiene datos falsos' }).expect(409);

    // Moderación del SUPERADMIN: cambia la visibilidad, nunca la puntuación, y recalcula
    await http.patch(`/api/admin/ratings/${ra.body.id}/moderation`).set(admin).send({ status: 'HIDDEN' }).expect(400);
    await http.patch(`/api/admin/ratings/${ra.body.id}/moderation`).set(admin).send({ status: 'HIDDEN', reason: 'Revisión de reporte' }).expect(200);
    rep = (await http.get(`/api/organizers/${org.organizerId}/reputation`).expect(200)).body;
    expect(rep.reputation.totalRatings).toBe(1);
    expect(Number(rep.reputation.averageScore)).toBe(5);
    const audit = await prisma.auditLog.count({ where: { entityId: org.organizerId, action: 'REPUTATION_RECALCULATED' } });
    expect(audit).toBeGreaterThanOrEqual(3);
  });

  it('las valoraciones sospechosas quedan pendientes y no cuentan', async () => {
    const org = await register('sorg', true);
    const fresh = await register('fresh', false, { aged: false });
    const id = await finishedTournament(org, [fresh, await register('sp')]);
    const r = await http.post(`/api/organizers/${org.organizerId}/ratings`).set(fresh.auth).send({ tournamentId: id, ...scores(5), comment: 'Visiten www.spam.test' }).expect(201);
    expect(r.body.moderationStatus).toBe('PENDING');
    const rep = (await http.get(`/api/organizers/${org.organizerId}/reputation`).expect(200)).body;
    expect(rep.reputation.totalRatings).toBe(0);
    const queue = (await http.get('/api/admin/ratings').query({ suspicious: true, pageSize: 100 }).set(admin).expect(200)).body;
    expect(queue.items.some((x: { id: string }) => x.id === r.body.id)).toBe(true);
  });

  it('cumplimiento: cancelaciones con participantes cuentan salvo que se justifiquen', async () => {
    const org = await register('corg', true);
    const p = await register('cp');
    await finishedTournament(org, [p, await register('cp2')]);
    const cancelled = await finishedTournament(org, [await register('cq'), await register('cq2')], false);
    await http.post(`/api/tournaments/${cancelled}/cancel`).set(org.auth).send({ reason: 'Problemas con el servidor' }).expect(201);
    let rep = (await http.get(`/api/organizers/${org.organizerId}/reputation`).expect(200)).body.reputation;
    expect(Number(rep.completionRate)).toBe(50);
    await http.patch(`/api/admin/tournaments/${cancelled}/cancellation`).set(admin).send({ justified: true, reason: 'Caída del proveedor acreditada' }).expect(200);
    rep = (await http.get(`/api/organizers/${org.organizerId}/reputation`).expect(200)).body.reputation;
    expect(Number(rep.completionRate)).toBe(100);
  });
});

describe('Incidencias', () => {
  it('solo las confirmadas son públicas y cuentan en la reputación', async () => {
    const org = await register('iorg', true);
    const p = await register('ip');
    const outsider = await register('iout');
    const id = await finishedTournament(org, [p, await register('iq')]);
    const body = { incidentType: 'SCHEDULE_BREACH', description: 'La final empezó dos horas tarde sin aviso previo a los equipos.' };
    await http.post(`/api/tournaments/${id}/incidents`).set(outsider.auth).field('incidentType', body.incidentType).field('description', body.description).expect(403);
    await http.post(`/api/tournaments/${id}/incidents`).set(p.auth).field('incidentType', body.incidentType).field('description', 'corto').expect(400);
    const inc = await http
      .post(`/api/tournaments/${id}/incidents`)
      .set(p.auth)
      .field('incidentType', body.incidentType)
      .field('description', body.description)
      .attach('evidence', PNG, { filename: 'captura.png', contentType: 'image/png' })
      .expect(201);

    expect((await http.get(`/api/organizers/${org.organizerId}/incidents`).expect(200)).body).toHaveLength(0);
    expect((await http.get(`/api/organizers/${org.organizerId}/incidents`).set(org.auth).expect(200)).body).toHaveLength(1);
    const ev = await http.get(`/api/admin/incidents/${inc.body.id}/evidence`).set(admin).expect(200);
    expect(ev.body.url).toContain('X-Amz-Signature');

    await http.put(`/api/admin/incidents/${inc.body.id}/resolve`).set(org.auth).send({ status: 'RESOLVED', resolution: 'ok' }).expect(403);
    await http.put(`/api/admin/incidents/${inc.body.id}/resolve`).set(admin).send({ status: 'RESOLVED', resolution: 'Se verificó el retraso con los registros del servidor.' }).expect(200);
    const pub = (await http.get(`/api/organizers/${org.organizerId}/incidents`).expect(200)).body;
    expect(pub).toHaveLength(1);
    expect(pub[0].description).toBeUndefined(); // el relato del reportante no se publica
    const rep = (await http.get(`/api/organizers/${org.organizerId}/reputation`).expect(200)).body;
    expect(rep.reputation.confirmedIncidents).toBe(1);
    expect(rep.confirmedIncidents).toHaveLength(1);

    const dash = (await http.get('/api/admin/trust').set(admin).expect(200)).body;
    expect(dash.incidents.RESOLVED).toBeGreaterThanOrEqual(1);
  });
});
