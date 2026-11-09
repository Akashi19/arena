/**
 * Módulo 17: contratación, pagos, webhooks, ciclo de vida y panel SUPERADMIN de suscripciones.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { BillingService } from '../src/billing/billing.js';
import { signStripePayload } from '../src/billing/providers.js';

const STRIPE_SECRET = 'whsec_test_arena';
let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let billing: BillingService;
let admin: { authorization: string };
const run = randomBytes(3).toString('hex');
let counter = 0;

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = STRIPE_SECRET;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
  billing = app.get(BillingService);
  const login = await http.post('/api/auth/login').send({ identifier: 'superadmin', password: 'Arena2026demo' }).expect(200);
  admin = { authorization: `Bearer ${login.body.accessToken}` };
});

afterAll(async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  await app?.close();
});

async function organizer() {
  const username = `bill${counter++}_${run}`;
  const res = await http
    .post('/api/auth/register')
    .send({
      firstName: 'Org',
      lastName: 'Pagos',
      username,
      email: `${username}@test.arena`,
      password: 'Arena2026demo',
      country: 'PE',
      city: 'Lima',
      asOrganizer: true,
      organizerName: `Org ${username}`,
      organizerType: 'CLUB',
    })
    .expect(201);
  const auth = { authorization: `Bearer ${res.body.accessToken}` };
  const me = await http.get('/api/me/subscription').set(auth).expect(200);
  return { auth, username, me: me.body };
}

const checkout = (auth: object, body: Record<string, unknown>) =>
  http.post('/api/me/subscription/checkout').set(auth).send({ billingPeriod: 'MONTHLY', idempotencyKey: randomUUID(), ...body });

describe('contratación con pago de prueba', () => {
  it('cotiza, paga, emite comprobante y es idempotente', async () => {
    const o = await organizer();
    expect(o.me.plan.code).toBe('FREE');
    expect(o.me.providers.map((p: { code: string }) => p.code)).toContain('SANDBOX');

    const quote = await http.post('/api/me/subscription/quote').set(o.auth).send({ planCode: 'PRO', billingPeriod: 'MONTHLY' }).expect(200);
    expect(quote.body).toMatchObject({ change: 'IMMEDIATE', kind: 'NEW', amount: 19, creditAmount: 0 });

    const key = randomUUID();
    const first = await checkout(o.auth, { planCode: 'PRO', idempotencyKey: key }).expect(200);
    expect(first.body.result).toBe('CHECKOUT');
    expect(first.body.checkoutUrl).toContain(`/dashboard/suscripcion/pago/${first.body.paymentId}`);
    const again = await checkout(o.auth, { planCode: 'PRO', idempotencyKey: key }).expect(200);
    expect(again.body.paymentId).toBe(first.body.paymentId);

    // El organizador no puede fijarse el plan sin pagar
    await http.post('/api/me/subscription/checkout').set(o.auth).send({ planCode: 'PRO', billingPeriod: 'MONTHLY', idempotencyKey: randomUUID(), status: 'ACTIVE' }).expect(400);

    const paid = await http.post(`/api/me/subscription/payments/${first.body.paymentId}/sandbox`).set(o.auth).send({ outcome: 'SUCCEEDED' }).expect(200);
    expect(paid.body).toMatchObject({ status: 'SUCCEEDED', amount: '19' });
    expect(paid.body.invoice.number).toMatch(/^ARN-\d{4}-\d{6}$/);
    await http.post(`/api/me/subscription/payments/${first.body.paymentId}/sandbox`).set(o.auth).send({ outcome: 'SUCCEEDED' }).expect(409);

    const me = await http.get('/api/me/subscription').set(o.auth).expect(200);
    expect(me.body.plan.code).toBe('PRO');
    expect(me.body.subscription).toMatchObject({ status: 'ACTIVE', billingPeriod: 'MONTHLY' });
    expect(me.body.usage.activeTournaments.limit).toBe(20);

    const inv = await http.get(`/api/me/subscription/invoices/${paid.body.invoice.id}`).set(o.auth).expect(200);
    expect(inv.body.number).toBe(paid.body.invoice.number);
    const other = await organizer();
    await http.get(`/api/me/subscription/invoices/${paid.body.invoice.id}`).set(other.auth).expect(404);
    await http.get(`/api/me/subscription/payments/${first.body.paymentId}`).set(other.auth).expect(404);
  });

  it('pago rechazado no cambia el plan y notifica', async () => {
    const o = await organizer();
    const c = await checkout(o.auth, { planCode: 'BUSINESS' }).expect(200);
    await http.post(`/api/me/subscription/payments/${c.body.paymentId}/sandbox`).set(o.auth).send({ outcome: 'FAILED' }).expect(200);
    const me = await http.get('/api/me/subscription').set(o.auth).expect(200);
    expect(me.body.plan.code).toBe('FREE');
    const notes = await http.get('/api/me/notifications').set(o.auth).expect(200);
    expect(notes.body.items.some((n: { type: string }) => n.type === 'PAYMENT_FAILED')).toBe(true);
  });

  it('cupón del 100 % activa el plan sin pasar por el proveedor', async () => {
    const code = `FULL${run}`.toUpperCase();
    await http.post('/api/admin/billing/promotions').set(admin).send({ code, percentOff: 100, maxRedemptions: 1 }).expect(201);
    const o = await organizer();
    const c = await checkout(o.auth, { planCode: 'PRO', promoCode: code }).expect(200);
    expect(c.body.result).toBe('PAID');
    const o2 = await organizer();
    const q = await http.post('/api/me/subscription/quote').set(o2.auth).send({ planCode: 'PRO', billingPeriod: 'MONTHLY', promoCode: code }).expect(400);
    expect(q.body.message).toMatch(/límite de usos/);
  });
});

describe('webhook de Stripe', () => {
  it('rechaza firmas inválidas y aplica una sola vez un evento firmado', async () => {
    const o = await organizer();
    const sub = await prisma.subscription.findFirstOrThrow({ where: { organizer: { user: { username: o.username } }, isCurrent: true } });
    const pro = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'PRO' } });
    const payment = await prisma.subscriptionPayment.create({
      data: { subscriptionId: sub.id, planId: pro.id, billingPeriod: 'YEARLY', listAmount: 190, amount: 190, currency: 'USD', provider: 'STRIPE', idempotencyKey: randomUUID() },
    });
    const event = (amount: number, id = `evt_${randomBytes(6).toString('hex')}`) =>
      JSON.stringify({
        id,
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test', metadata: { paymentId: payment.id }, payment_status: 'paid', amount_total: amount, currency: 'usd', payment_intent: `pi_${id}` } },
      });

    const body = event(19000);
    await http.post('/api/billing/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signStripePayload(body, 'otro')).send(body).expect(401);

    // Importe manipulado: se ignora sin activar el plan
    const tampered = event(100);
    const ign = await http.post('/api/billing/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signStripePayload(tampered, STRIPE_SECRET)).send(tampered).expect(200);
    expect(ign.body.ignored).toBe(true);

    const ok = await http.post('/api/billing/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signStripePayload(body, STRIPE_SECRET)).send(body).expect(200);
    expect(ok.body.ok).toBe(true);
    const dup = await http.post('/api/billing/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signStripePayload(body, STRIPE_SECRET)).send(body).expect(200);
    expect(dup.body.duplicate).toBe(true);

    const updated = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { plan: true, invoices: true } });
    expect(updated).toMatchObject({ status: 'ACTIVE', billingPeriod: 'YEARLY', provider: 'STRIPE' });
    expect(updated.plan.code).toBe('PRO');
    expect(updated.invoices).toHaveLength(1);
  });
});

describe('cambios de plan y ciclo de vida', () => {
  async function proOrganizer() {
    const o = await organizer();
    const c = await checkout(o.auth, { planCode: 'PRO' }).expect(200);
    await http.post(`/api/me/subscription/payments/${c.body.paymentId}/sandbox`).set(o.auth).send({ outcome: 'SUCCEEDED' }).expect(200);
    const sub = await prisma.subscription.findFirstOrThrow({ where: { organizer: { user: { username: o.username } }, isCurrent: true } });
    return { ...o, sub };
  }

  it('subir a BUSINESS descuenta el saldo de PRO; bajar queda programado y se puede revertir', async () => {
    const o = await proOrganizer();
    const up = await http.post('/api/me/subscription/quote').set(o.auth).send({ planCode: 'BUSINESS', billingPeriod: 'MONTHLY' }).expect(200);
    expect(up.body.change).toBe('IMMEDIATE');
    expect(up.body.creditAmount).toBeGreaterThan(18);
    expect(up.body.amount).toBeCloseTo(79 - up.body.creditAmount, 2);

    const down = await checkout(o.auth, { planCode: 'PRO', billingPeriod: 'YEARLY' }).expect(200);
    expect(down.body.result).toBe('CHECKOUT'); // mensual → anual es inmediato
    await http.post('/api/me/subscription/resume').set(o.auth).expect(409);

    const toFree = await checkout(o.auth, { planCode: 'FREE' }).expect(200);
    expect(toFree.body.result).toBe('SCHEDULED');
    const me = await http.get('/api/me/subscription').set(o.auth).expect(200);
    expect(me.body.subscription.cancelAtPeriodEnd).toBe(true);
    expect(me.body.pendingPayment).toBeNull(); // el pago pendiente anterior se reemplazó / canceló
    await http.post('/api/me/subscription/resume').set(o.auth).expect(200);
    expect((await http.get('/api/me/subscription').set(o.auth)).body.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it('fin de periodo: aviso, pago pendiente con gracia, vencimiento y paso a FREE', async () => {
    const o = await proOrganizer();
    const end = new Date(Date.now() + 3 * 864e5);
    await prisma.subscription.update({ where: { id: o.sub.id }, data: { currentPeriodEnd: end } });

    const s1 = await billing.runLifecycle(new Date());
    expect(s1.notices).toBeGreaterThanOrEqual(1);
    await billing.runLifecycle(new Date()); // no repite el aviso
    expect(await prisma.notification.count({ where: { user: { username: o.username }, type: 'SUBSCRIPTION_EXPIRING' } })).toBe(1);

    await billing.runLifecycle(new Date(end.getTime() + 1000));
    let s = await prisma.subscription.findUniqueOrThrow({ where: { id: o.sub.id } });
    expect(s.status).toBe('PAST_DUE');
    expect(s.graceUntil!.getTime()).toBe(end.getTime() + 7 * 864e5);
    // En gracia conserva el plan
    expect((await http.get('/api/me/subscription').set(o.auth)).body.plan.code).toBe('PRO');
    const renew = await http.post('/api/me/subscription/quote').set(o.auth).send({ planCode: 'PRO', billingPeriod: 'MONTHLY' }).expect(200);
    expect(renew.body.kind).toBe('RENEWAL');

    await billing.runLifecycle(new Date(end.getTime() + 8 * 864e5));
    s = await prisma.subscription.findUniqueOrThrow({ where: { id: o.sub.id } });
    expect(s).toMatchObject({ status: 'EXPIRED', isCurrent: false });
    const me = await http.get('/api/me/subscription').set(o.auth).expect(200);
    expect(me.body.plan.code).toBe('FREE');
    expect(me.body.subscription.status).toBe('ACTIVE');
  });

  it('prueba gratuita: una sola vez y vuelve a FREE si no se paga', async () => {
    const o = await organizer();
    expect(o.me.trialAvailable).toBe(true);
    await http.post('/api/me/subscription/trial').set(o.auth).send({ planCode: 'BUSINESS' }).expect(200);
    const me = await http.get('/api/me/subscription').set(o.auth).expect(200);
    expect(me.body).toMatchObject({ plan: { code: 'BUSINESS' }, subscription: { status: 'TRIAL' }, trialAvailable: false });
    const sub = await prisma.subscription.findFirstOrThrow({ where: { organizer: { user: { username: o.username } }, isCurrent: true } });
    await billing.runLifecycle(new Date(sub.currentPeriodEnd!.getTime() + 1000));
    expect((await http.get('/api/me/subscription').set(o.auth)).body.plan.code).toBe('FREE');
    await http.post('/api/me/subscription/trial').set(o.auth).send({ planCode: 'PRO' }).expect(409);
  });
});

describe('panel SUPERADMIN', () => {
  it('crea y edita planes con reglas, y solo SUPERADMIN accede', async () => {
    const o = await organizer();
    await http.get('/api/admin/billing/metrics').set(o.auth).expect(403);
    const free = (await http.get('/api/admin/billing/plans').set(admin).expect(200)).body.find((p: { code: string }) => p.code === 'FREE');
    await http.patch(`/api/admin/billing/plans/${free.id}`).set(admin).send({ status: 'INACTIVE' }).expect(400);
    await http.patch(`/api/admin/billing/plans/${free.id}`).set(admin).send({ priceMonthly: 5 }).expect(400);

    const code = `ENT${run}`.toUpperCase();
    const plan = await http
      .post('/api/admin/billing/plans')
      .set(admin)
      .send({ code, name: 'Enterprise', priceMonthly: 199, priceYearly: 1990, maxParticipantsPerTournament: 2048, maxAdmins: 50, features: ['ADVANCED_STATS', 'AUDIT_LOG'], status: 'INACTIVE' })
      .expect(201);
    await http.post('/api/admin/billing/plans').set(admin).send({ code, name: 'Duplicado', priceMonthly: 1, priceYearly: 10, maxParticipantsPerTournament: 8, maxAdmins: 1 }).expect(409);
    // Inactivo: no se puede contratar ni aparece en /plans
    await http.post('/api/me/subscription/quote').set(o.auth).send({ planCode: code, billingPeriod: 'MONTHLY' }).expect(404);
    expect((await http.get('/api/plans')).body.some((p: { code: string }) => p.code === code)).toBe(false);

    const upd = await http.patch(`/api/admin/billing/plans/${plan.body.id}`).set(admin).send({ status: 'ACTIVE', priceMonthly: 149, features: ['AUDIT_LOG'], reason: 'Lanzamiento' }).expect(200);
    expect(upd.body.features.filter((f: { enabled: boolean }) => f.enabled).map((f: { featureKey: string }) => f.featureKey)).toEqual(['AUDIT_LOG']);
    const q = await http.post('/api/me/subscription/quote').set(o.auth).send({ planCode: code, billingPeriod: 'MONTHLY' }).expect(200);
    expect(q.body.amount).toBe(149);
    await http.patch(`/api/admin/billing/plans/${plan.body.id}`).set(admin).send({ status: 'INACTIVE' }).expect(200);
  });

  it('métricas, suscriptores y pagos', async () => {
    const m = await http.get('/api/admin/billing/metrics').set(admin).expect(200);
    expect(m.body.paying).toBeGreaterThan(0);
    const usd = m.body.revenue.find((r: { currency: string }) => r.currency === 'USD');
    expect(usd.mrr).toBeGreaterThan(0);
    expect(usd.arr).toBeCloseTo(usd.mrr * 12, 1);
    expect(usd.series).toHaveLength(12);
    expect(m.body.conversion.freeToPro.count).toBeGreaterThan(0);

    const subs = await http.get('/api/admin/billing/subscriptions?plan=PRO').set(admin).expect(200);
    expect(subs.body.items.every((s: { plan: { code: string } }) => s.plan.code === 'PRO')).toBe(true);
    const expired = await http.get('/api/admin/billing/subscriptions?status=EXPIRED').set(admin).expect(200);
    expect(expired.body.total).toBeGreaterThan(0);
    const pays = await http.get('/api/admin/billing/payments?status=SUCCEEDED').set(admin).expect(200);
    expect(pays.body.items[0].subscription.organizer.displayName).toBeTruthy();
  });
});
