/**
 * Fase 6: estadísticas avanzadas (PRO), reporte ejecutivo (BUSINESS), exportación CSV y estadísticas globales.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { statsRange } from '../src/dashboard/stats.js';

let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let organizerId: string;
let subscriptionId: string;
let originalPlanId: string;
const auth: Record<string, { authorization: string }> = {};

async function login(identifier: string) {
  const res = await http.post('/api/auth/login').send({ identifier, password: 'Arena2026demo' }).expect(200);
  return { authorization: `Bearer ${res.body.accessToken}` };
}

async function setPlan(code: string) {
  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code } });
  await prisma.subscription.update({ where: { id: subscriptionId }, data: { planId: plan.id } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
  auth.org = await login('ligagamer');
  auth.admin = await login('superadmin');
  const organizer = await prisma.organizerProfile.findFirstOrThrow({ where: { user: { username: 'ligagamer' } } });
  organizerId = organizer.id;
  const sub = await prisma.subscription.findFirstOrThrow({ where: { organizerId, isCurrent: true } });
  subscriptionId = sub.id;
  originalPlanId = sub.planId;
});

afterAll(async () => {
  if (subscriptionId) await prisma.subscription.update({ where: { id: subscriptionId }, data: { planId: originalPlanId } });
  await app?.close();
});

describe('estadísticas del organizador', () => {
  it('FREE no accede a estadísticas avanzadas, reporte ni exportación', async () => {
    await setPlan('FREE');
    for (const path of ['/api/me/dashboard/stats', '/api/me/dashboard/report', '/api/me/dashboard/export/tournaments']) {
      const res = await http.get(path).set(auth.org).expect(403);
      expect(res.body.error).toBe('PLAN_LIMIT');
      expect(res.body.code).toBe('FEATURE_NOT_IN_PLAN');
    }
    // el panel básico sigue disponible
    await http.get('/api/me/dashboard').set(auth.org).expect(200);
  });

  it('PRO obtiene estadísticas coherentes con la base de datos', async () => {
    await setPlan('PRO');
    const res = await http.get('/api/me/dashboard/stats?months=12').set(auth.org).expect(200);
    const d = res.body;
    const { from } = statsRange(12);
    expect(d.range.months).toBe(12);
    expect(d.monthly).toHaveLength(12);
    expect(d.features).toEqual({ export: true, executiveReport: false });

    const registrations = await prisma.tournamentRegistration.count({ where: { tournament: { organizerId }, createdAt: { gte: from } } });
    expect(d.summary.registrations).toBe(registrations);
    expect(d.monthly.reduce((a: number, m: { registrations: number }) => a + m.registrations, 0)).toBe(registrations);
    const created = await prisma.tournament.count({ where: { organizerId, createdAt: { gte: from } } });
    expect(d.summary.tournamentsCreated).toBe(created);
    expect(d.summary.newParticipants).toBeLessThanOrEqual(d.summary.activeParticipants);
    expect(d.summary.returningParticipants).toBeLessThanOrEqual(d.summary.activeParticipants);
    for (const k of ['approvalRate', 'occupancyRate', 'drawRate', 'retentionRate']) {
      const v = d.summary[k];
      expect(v === null || (v >= 0 && v <= 1)).toBe(true);
    }
    for (const t of d.top) expect(t.wins).toBeLessThanOrEqual(t.played);
    // solo sus propios torneos
    const own = new Set((await prisma.tournament.findMany({ where: { organizerId }, select: { id: true } })).map((t) => t.id));
    for (const t of d.tournaments) expect(own.has(t.id)).toBe(true);
  });

  it('rechaza periodos no permitidos', async () => {
    await http.get('/api/me/dashboard/stats?months=7').set(auth.org).expect(400);
    await http.get('/api/me/dashboard/export/usuarios').set(auth.org).expect(400);
  });

  it('PRO exporta CSV pero no tiene reporte ejecutivo', async () => {
    const csv = await http.get('/api/me/dashboard/export/registrations?months=12').set(auth.org).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="arena-inscripciones-12m-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(csv.text.startsWith('﻿')).toBe(true);
    expect(csv.text.split('\r\n')[0]).toContain('Torneo,Participante,Tipo,Estado');
    for (const kind of ['tournaments', 'matches']) await http.get(`/api/me/dashboard/export/${kind}`).set(auth.org).expect(200);
    await http.get('/api/me/dashboard/report').set(auth.org).expect(403);
  });

  it('BUSINESS obtiene el reporte ejecutivo con comparación de periodos', async () => {
    await setPlan('BUSINESS');
    const res = await http.get('/api/me/dashboard/report?months=3').set(auth.org).expect(200);
    expect(res.body.organizer.displayName).toBe('Liga Gamer');
    expect(res.body.plan).toBe('Business');
    expect(res.body.monthly).toHaveLength(3);
    expect(Object.keys(res.body.changes)).toEqual(Object.keys(res.body.summary));
    expect(res.body.previous).toBeTruthy();
  });
});

describe('estadísticas globales', () => {
  it('solo SUPERADMIN', async () => {
    await http.get('/api/admin/stats').set(auth.org).expect(403);
    const res = await http.get('/api/admin/stats?months=3').set(auth.admin).expect(200);
    const d = res.body;
    const users = await prisma.user.count({ where: { status: { not: 'DELETED' } } });
    expect(d.users.total).toBe(users);
    expect(d.users.signups).toHaveLength(3);
    const tournaments = await prisma.tournament.count();
    expect(Object.values(d.tournamentsByStatus as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(tournaments);
    expect(d.topOrganizers.length).toBeLessThanOrEqual(10);
    expect(d.summary).toHaveProperty('matchesPlayed');
  });
});
