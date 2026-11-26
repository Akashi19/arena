/**
 * Cobro de inscripciones en línea con la cuenta del organizador o centralizado por Arena (pagos de prueba, sin dinero real):
 * reserva de cupo, aprobación al pagar, reintentos, vencimiento, pago tardío, comisión y reembolsos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RegistrationPaymentsService } from '../src/payments/registration-payments.js';

let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let payments: RegistrationPaymentsService;
let gameId: string;
let freeFee: unknown;
const run = randomBytes(3).toString('hex');

type Auth = { authorization: string };

async function register(name: string, asOrganizer = true): Promise<Auth> {
  const username = `${name}_${run}`;
  const res = await http
    .post('/api/auth/register')
    .send({ firstName: 'Test', lastName: name, username, email: `${username}@test.dev`, password: 'Prueba2026x', country: 'PE', city: 'Lima', asOrganizer })
    .expect(201);
  return { authorization: `Bearer ${res.body.accessToken}` };
}

function tournament(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 10 * 864e5);
  return {
    name: `Copa paga ${randomBytes(2).toString('hex')}`,
    category: 'ESPORT',
    gameId,
    startsAt: start.toISOString(),
    registrationDeadline: new Date(start.getTime() - 864e5).toISOString(),
    maxParticipants: 2,
    mode: 'INDIVIDUAL',
    format: 'SINGLE_ELIMINATION',
    isOnline: true,
    entryFee: 20,
    currency: 'PEN',
    ...overrides,
  };
}

const join = (id: string, auth: Auth) => http.post(`/api/tournaments/${id}/registrations`).set(auth).send({ acceptRules: true });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
  payments = app.get(RegistrationPaymentsService);
  gameId = (await prisma.game.findUniqueOrThrow({ where: { slug: 'valorant' } })).id;
  // Comisión de Arena del 5 % en FREE durante la prueba
  const free = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'FREE' } });
  freeFee = free.registrationFeePercent;
  await prisma.subscriptionPlan.update({ where: { code: 'FREE' }, data: { registrationFeePercent: 5 } });
});

afterAll(async () => {
  if (freeFee !== undefined) await prisma.subscriptionPlan.update({ where: { code: 'FREE' }, data: { registrationFeePercent: freeFee as number } });
  await app?.close();
});

describe('cobro de inscripciones en línea', () => {
  let org: Auth;
  let tournamentId: string;
  const players: Auth[] = [];

  it('sin cuenta de Mercado Pago no se puede crear una partida con cuota (gratis sí)', async () => {
    org = await register('cobra');
    const res = await http.post('/api/tournaments').set(org).send(tournament()).expect(400);
    expect(res.body.message).toContain('se pagan con Mercado Pago');
    const free = await http.post('/api/tournaments').set(org).send(tournament({ entryFee: 0 })).expect(201);
    expect(free.body.collectOnline).toBe(false);
    const account = await http.get('/api/me/payment-account').set(org).expect(200);
    expect(account.body).toMatchObject({ account: null, canCollect: false, feePercent: 5 });
  });

  it('conecta la cuenta de prueba y crea la partida: toda cuota se cobra con Mercado Pago', async () => {
    await http.post('/api/me/payment-account/sandbox').set(org).expect(201);
    const account = await http.get('/api/me/payment-account').set(org).expect(200);
    expect(account.body.canCollect).toBe(true);
    expect(account.body.account.provider).toBe('SANDBOX');
    // Los tokens nunca salen de la API
    expect(JSON.stringify(account.body)).not.toContain('Enc');

    // collectOnline ya no es una opción: lo define la cuota
    await http.post('/api/tournaments').set(org).send(tournament({ collectOnline: false })).expect(400);
    const t = await http.post('/api/tournaments').set(org).send(tournament()).expect(201);
    tournamentId = t.body.id;
    expect(t.body.collectOnline).toBe(true);
    for (const n of ['p1', 'p2', 'p3']) players.push(await register(n, false));
  });

  it('inscribirse reserva el cupo y abre el pago; repetir devuelve el mismo pago', async () => {
    const first = await join(tournamentId, players[0]!).expect(201);
    expect(first.body.status).toBe('PAYMENT_PENDING');
    expect(first.body.payment.checkoutUrl).toContain(`/inscripciones/pago/${first.body.payment.id}`);
    const again = await join(tournamentId, players[0]!).expect(201);
    expect(again.body.payment.id).toBe(first.body.payment.id);

    const p = await prisma.registrationPayment.findUniqueOrThrow({ where: { id: first.body.payment.id } });
    expect(Number(p.amount)).toBe(20);
    expect(Number(p.platformFee)).toBe(1);
    expect(Number(p.feePercent)).toBe(5);

    // Solo quien paga ve el enlace; otro jugador no ve el pago
    const mine = await http.get(`/api/registration-payments/${p.id}`).set(players[0]!).expect(200);
    expect(mine.body.checkoutUrl).toBeTruthy();
    expect(mine.body.sandbox).toBe(true);
    await http.get(`/api/registration-payments/${p.id}`).set(players[1]!).expect(403);
    const asOrganizer = await http.get(`/api/registration-payments/${p.id}`).set(org).expect(200);
    expect(asOrganizer.body.checkoutUrl).toBeNull();

    // La página de la partida permite retomar el pago
    const detail = await http.get(`/api/tournaments/${tournamentId}`).set(players[0]!).expect(200);
    expect(detail.body.viewer.myRegistration).toMatchObject({ status: 'PAYMENT_PENDING', pendingPaymentId: p.id });
  });

  it('los pagos en curso ocupan cupo', async () => {
    await join(tournamentId, players[1]!).expect(201);
    const full = await join(tournamentId, players[2]!).expect(400);
    expect(full.body.message).toContain('No quedan cupos');
  });

  it('el pago aprobado aprueba la inscripción; uno rechazado deja reintentar', async () => {
    const p1 = await prisma.registrationPayment.findFirstOrThrow({ where: { tournamentId, payer: { username: `p1_${run}` } } });
    const ok = await http.post(`/api/registration-payments/${p1.id}/sandbox`).set(players[0]!).send({ approve: true }).expect(201);
    expect(ok.body.status).toBe('SUCCEEDED');
    expect((await prisma.tournamentRegistration.findUniqueOrThrow({ where: { id: p1.registrationId } })).status).toBe('APPROVED');
    await http.post(`/api/registration-payments/${p1.id}/sandbox`).set(players[0]!).send({ approve: true }).expect(400);

    const p2 = await prisma.registrationPayment.findFirstOrThrow({ where: { tournamentId, payer: { username: `p2_${run}` } } });
    const rejected = await http.post(`/api/registration-payments/${p2.id}/sandbox`).set(players[1]!).send({ approve: false }).expect(201);
    expect(rejected.body.status).toBe('PENDING');
    expect(rejected.body.failureReason).toBeTruthy();
    expect((await prisma.tournamentRegistration.findUniqueOrThrow({ where: { id: p2.registrationId } })).status).toBe('PAYMENT_PENDING');
  });

  it('una reserva vencida libera el cupo y un pago tardío sin cupo se reembolsa', async () => {
    const p2 = await prisma.registrationPayment.findFirstOrThrow({ where: { tournamentId, payer: { username: `p2_${run}` } } });
    await payments.expirePending(new Date(Date.now() + 2 * 86_400_000));
    expect((await prisma.registrationPayment.findUniqueOrThrow({ where: { id: p2.id } })).status).toBe('CANCELLED');
    expect((await prisma.tournamentRegistration.findUniqueOrThrow({ where: { id: p2.registrationId } })).status).toBe('WITHDRAWN');

    // Otro jugador toma el cupo liberado
    const p3 = await join(tournamentId, players[2]!).expect(201);
    expect(p3.body.status).toBe('PAYMENT_PENDING');

    // Mercado Pago confirma tarde el pago vencido: ya no hay cupo, se reembolsa solo
    expect(await payments.apply(p2.id, 'SUCCEEDED', { providerPaymentId: 'late-1' })).toBe('late');
    const late = await prisma.registrationPayment.findUniqueOrThrow({ where: { id: p2.id } });
    expect(late.status).toBe('REFUNDED');
    expect(late.refundReason).toContain('ya no había cupo');
    expect((await prisma.tournamentRegistration.findUniqueOrThrow({ where: { id: p2.registrationId } })).status).toBe('WITHDRAWN');
  });

  it('retirarse anula el pago en curso', async () => {
    const p3 = await prisma.registrationPayment.findFirstOrThrow({ where: { tournamentId, payer: { username: `p3_${run}` }, status: 'PENDING' } });
    await http.delete(`/api/registrations/${p3.registrationId}`).set(players[2]!).expect(200);
    expect((await prisma.registrationPayment.findUniqueOrThrow({ where: { id: p3.id } })).status).toBe('CANCELLED');
  });

  it('el organizador ve lo cobrado y rechazar una inscripción pagada la reembolsa', async () => {
    const list = await http.get('/api/me/registration-payments').set(org).expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(3);
    expect(list.body.totals).toEqual([{ currency: 'PEN', payments: 1, gross: 20, fee: 1, net: 19 }]);

    const p1 = await prisma.registrationPayment.findFirstOrThrow({ where: { tournamentId, status: 'SUCCEEDED' } });
    await http.patch(`/api/registrations/${p1.registrationId}`).set(org).send({ status: 'REJECTED', note: 'Datos de jugador incorrectos' }).expect(200);
    const refunded = await prisma.registrationPayment.findUniqueOrThrow({ where: { id: p1.id } });
    expect(refunded.status).toBe('REFUNDED');
    expect(refunded.refundReason).toBe('Datos de jugador incorrectos');
    expect((await prisma.tournamentRegistration.findUniqueOrThrow({ where: { id: p1.registrationId } })).status).toBe('REJECTED');
    const after = await http.get('/api/me/registration-payments').set(org).expect(200);
    expect(after.body.totals).toEqual([]);
  });

  it('otro organizador no puede reembolsar ni ver pagos ajenos', async () => {
    const intruder = await register('intruso');
    const p = await prisma.registrationPayment.findFirstOrThrow({ where: { tournamentId } });
    await http.post(`/api/registration-payments/${p.id}/refund`).set(intruder).send({ reason: 'porque sí' }).expect(403);
    await http.get(`/api/registration-payments/${p.id}`).set(intruder).expect(403);
    const theirs = await http.get('/api/me/registration-payments').set(intruder).expect(200);
    expect(theirs.body.total).toBe(0);
  });

  it('no se desconecta Mercado Pago con partidas activas con cuota; dejarla gratis la libera', async () => {
    const res = await http.delete('/api/me/payment-account').set(org).expect(400);
    expect(res.body.message).toContain('partida activa con cuota');
    const pending = await prisma.tournamentRegistration.count({ where: { tournamentId, status: 'PAYMENT_PENDING' } });
    if (pending) await prisma.tournamentRegistration.updateMany({ where: { tournamentId, status: 'PAYMENT_PENDING' }, data: { status: 'WITHDRAWN' } });
    const free = await http.patch(`/api/tournaments/${tournamentId}`).set(org).send({ entryFee: 0 }).expect(200);
    expect(free.body.collectOnline).toBe(false);
    await http.delete('/api/me/payment-account').set(org).expect(200);
    // Sin cuenta ya no puede volver a poner cuota
    await http.patch(`/api/tournaments/${tournamentId}`).set(org).send({ entryFee: 10 }).expect(400);
  });

  it('el webhook de Mercado Pago exige firma válida', async () => {
    process.env.MERCADOPAGO_CLIENT_ID = 'test-client';
    process.env.MERCADOPAGO_CLIENT_SECRET = 'test-secret';
    process.env.MERCADOPAGO_MARKETPLACE_WEBHOOK_SECRET = 'whsec-mp';
    try {
      await http
        .post('/api/registration-payments/webhooks/mercadopago?ref=00000000-0000-0000-0000-000000000000&data.id=123&type=payment')
        .set('x-signature', 'ts=1,v1=abc')
        .send({ type: 'payment', data: { id: '123' } })
        .expect(401);
      // Notificaciones que no son de pagos se ignoran
      await http.post('/api/registration-payments/webhooks/mercadopago').send({ type: 'merchant_order' }).expect(200);
    } finally {
      delete process.env.MERCADOPAGO_CLIENT_ID;
      delete process.env.MERCADOPAGO_CLIENT_SECRET;
      delete process.env.MERCADOPAGO_MARKETPLACE_WEBHOOK_SECRET;
    }
  });
});

describe('cobro centralizado (Arena cobra y liquida al organizador)', () => {
  let org: Auth;
  let admin: Auth;
  let organizerId: string;
  let tournamentId: string;
  let paymentId: string;
  let player: Auth;
  const bank = { holderName: 'Ana Pérez', documentId: '45678912', bankName: 'BCP', accountType: 'SAVINGS', accountNumber: '191-12345678-0-12', country: 'pe' };

  it('el organizador sin Mercado Pago activa el cobro a través de Arena con sus datos bancarios', async () => {
    org = await register('central');
    const login = await http.post('/api/auth/login').send({ identifier: 'superadmin', password: 'Arena2026demo' }).expect(200);
    admin = { authorization: `Bearer ${login.body.accessToken}` };

    const { accountNumber: _n, ...withoutNumber } = bank;
    await http.put('/api/me/payout-profile').set(org).send(withoutNumber).expect(400);
    await http.put('/api/me/payout-profile').set(org).send({ ...bank, accountNumber: '12' }).expect(400);
    const saved = await http.put('/api/me/payout-profile').set(org).send(bank).expect(200);
    expect(saved.body).toMatchObject({ enabled: true, bankName: 'BCP', country: 'PE', accountNumberMasked: '•••• 8012' });
    expect(JSON.stringify(saved.body)).not.toContain('12345678');

    // Editar sin número conserva la cuenta guardada
    const edited = await http.put('/api/me/payout-profile').set(org).send({ ...withoutNumber, bankName: 'Interbank' }).expect(200);
    expect(edited.body).toMatchObject({ bankName: 'Interbank', accountNumberMasked: '•••• 8012' });

    const account = await http.get('/api/me/payment-account').set(org).expect(200);
    expect(account.body).toMatchObject({ account: null, canCollect: true, collectionMode: 'PLATFORM' });
    expect(account.body.providers.central).toBe(true);
    const stored = await prisma.organizerPayoutProfile.findFirstOrThrow({ where: { organizer: { user: { username: { startsWith: 'central_' } } } }, orderBy: { createdAt: 'desc' } });
    organizerId = stored.organizerId;
    expect(stored.accountNumberEnc).not.toContain('12345678');
  });

  it('las inscripciones se cobran en la cuenta de Arena con la comisión del plan', async () => {
    const t = await http.post('/api/tournaments').set(org).send(tournament()).expect(201);
    tournamentId = t.body.id;
    player = await register('pcentral', false);
    const joined = await join(tournamentId, player).expect(201);
    paymentId = joined.body.payment.id;
    const p = await prisma.registrationPayment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(p).toMatchObject({ collectionMode: 'PLATFORM', accountId: null, provider: 'SANDBOX' });
    expect(Number(p.platformFee)).toBe(1);
    await http.post(`/api/registration-payments/${paymentId}/sandbox`).set(player).send({ approve: true }).expect(201);
    const reg = await prisma.tournamentRegistration.findUniqueOrThrow({ where: { id: p.registrationId } });
    expect(reg.status).toBe('APPROVED');
  });

  it('el saldo queda retenido hasta que la partida termina', async () => {
    const mine = await http.get('/api/me/payouts').set(org).expect(200);
    expect(mine.body.balances).toEqual([
      expect.objectContaining({ currency: 'PEN', payable: 0, held: { payments: 1, gross: 20, fee: 1, net: 19 } }),
    ]);
    await http.post('/api/admin/payouts').set(admin).send({ organizerId, currency: 'PEN', reference: 'OP-1' }).expect(400);
    // No se puede desactivar con una partida activa con cuota
    const blocked = await http.delete('/api/me/payout-profile').set(org).expect(400);
    expect(blocked.body.message).toContain('partida activa con cuota');
  });

  it('el superadmin ve el saldo, consulta la cuenta y registra la transferencia', async () => {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'FINISHED' } });
    const panel = await http.get('/api/admin/payouts').set(admin).expect(200);
    const row = panel.body.balances.find((b: { organizerId: string }) => b.organizerId === organizerId);
    expect(row).toMatchObject({ currency: 'PEN', payable: 19, eligible: { payments: 1, gross: 20, fee: 1, net: 19 } });
    expect(row.payoutProfile.accountNumberMasked).toBe('•••• 8012');
    expect(JSON.stringify(panel.body)).not.toContain('12345678');

    await http.get('/api/admin/payouts').set(org).expect(403);
    await http.get(`/api/admin/payouts/organizers/${organizerId}/bank`).set(org).expect(403);
    const bankView = await http.get(`/api/admin/payouts/organizers/${organizerId}/bank`).set(admin).expect(200);
    expect(bankView.body.accountNumber).toBe('19112345678012');

    const payout = await http.post('/api/admin/payouts').set(admin).send({ organizerId, currency: 'PEN', reference: 'OP-123456', amount: 999 }).expect(400);
    expect(payout.body.message).toBeDefined(); // el importe no se envía: lo calcula la API
    const done = await http.post('/api/admin/payouts').set(admin).send({ organizerId, currency: 'PEN', reference: 'OP-123456' }).expect(201);
    expect(done.body).toMatchObject({ gross: 20, fee: 1, deductions: 0, amount: 19, reference: 'OP-123456' });
    // Nada más que liquidar
    await http.post('/api/admin/payouts').set(admin).send({ organizerId, currency: 'PEN', reference: 'OP-2' }).expect(400);

    const mine = await http.get('/api/me/payouts').set(org).expect(200);
    expect(mine.body.balances).toEqual([]);
    expect(mine.body.payouts[0]).toMatchObject({ amount: 19, reference: 'OP-123456', _count: { payments: 1 } });
    const notes = await http.get('/api/me/notifications').set(org).expect(200);
    expect(notes.body.items.some((n: { type: string }) => n.type === 'ORGANIZER_PAYOUT_SENT')).toBe(true);
  });

  it('un reembolso de un pago ya liquidado se descuenta de la siguiente liquidación', async () => {
    await payments.apply(paymentId, 'REFUNDED', { reason: 'Contracargo' });
    const mine = await http.get('/api/me/payouts').set(org).expect(200);
    expect(mine.body.balances).toEqual([expect.objectContaining({ currency: 'PEN', deductions: 19, payable: -19 })]);
    await http.post('/api/admin/payouts').set(admin).send({ organizerId, currency: 'PEN', reference: 'OP-3' }).expect(400);
  });

  it('con cuenta propia conectada, los nuevos cobros van al organizador', async () => {
    await http.post('/api/me/payment-account/sandbox').set(org).expect(201);
    const account = await http.get('/api/me/payment-account').set(org).expect(200);
    expect(account.body.collectionMode).toBe('ORGANIZER_ACCOUNT');
    const t = await http.post('/api/tournaments').set(org).send(tournament()).expect(201);
    const joined = await join(t.body.id, await register('pcentral2', false)).expect(201);
    const p = await prisma.registrationPayment.findUniqueOrThrow({ where: { id: joined.body.payment.id } });
    expect(p.collectionMode).toBe('ORGANIZER_ACCOUNT');
    // Con el cobro a través de Arena activo, desconectar Mercado Pago está permitido
    await http.delete('/api/me/payment-account').set(org).expect(200);
  });
});
