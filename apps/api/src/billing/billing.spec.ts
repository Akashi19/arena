import { describe, expect, it } from 'vitest';
import { addPeriod, buildQuote, classifyChange, promoDiscount, promoProblem, unusedCredit, type CurrentSubscription, type PricedPlan } from './pricing.js';
import { mercadoPagoOutcome, normalizeStripeEvent, signStripePayload, verifyMercadoPagoSignature, verifyStripeSignature } from './providers.js';
import { createHmac } from 'node:crypto';

const plan = (code: string, m: number, y: number): PricedPlan => ({ id: code, code, name: code, priceMonthly: m, priceYearly: y, currency: 'USD' });
const FREE = plan('FREE', 0, 0);
const PRO = plan('PRO', 19, 190);
const BUSINESS = plan('BUSINESS', 79, 790);
const now = new Date('2026-06-16T00:00:00Z');

const sub = (p: PricedPlan, extra: Partial<CurrentSubscription> = {}): CurrentSubscription => ({
  plan: p,
  status: 'ACTIVE',
  billingPeriod: 'MONTHLY',
  currentPeriodStart: new Date('2026-06-01T00:00:00Z'),
  currentPeriodEnd: p === FREE ? null : new Date('2026-07-01T00:00:00Z'),
  graceUntil: null,
  ...extra,
});

describe('addPeriod', () => {
  it('conserva el día y ajusta fin de mes', () => {
    expect(addPeriod(new Date('2026-01-31T10:00:00Z'), 'MONTHLY').toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addPeriod(new Date('2028-02-29T00:00:00Z'), 'YEARLY').toISOString()).toBe('2029-02-28T00:00:00.000Z');
    expect(addPeriod(new Date('2026-12-15T00:00:00Z'), 'MONTHLY').toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });
});

describe('classifyChange', () => {
  it('desde FREE el pago es inmediato y sin crédito', () => {
    expect(classifyChange(sub(FREE), PRO, 'MONTHLY', now)).toEqual({ change: 'IMMEDIATE', kind: 'NEW', withCredit: false });
  });
  it('subir de plan es inmediato con crédito; bajar queda programado', () => {
    expect(classifyChange(sub(PRO), BUSINESS, 'MONTHLY', now)).toMatchObject({ change: 'IMMEDIATE', withCredit: true });
    expect(classifyChange(sub(BUSINESS), PRO, 'MONTHLY', now).change).toBe('SCHEDULED');
  });
  it('mensual → anual es inmediato; anual → mensual programado; mismo plan y periodo es el actual', () => {
    expect(classifyChange(sub(PRO), PRO, 'YEARLY', now).change).toBe('IMMEDIATE');
    expect(classifyChange(sub(PRO, { billingPeriod: 'YEARLY' }), PRO, 'MONTHLY', now).change).toBe('SCHEDULED');
    expect(classifyChange(sub(PRO), PRO, 'MONTHLY', now).change).toBe('CURRENT');
  });
  it('pasar a un plan gratuito equivale a cancelar al final del periodo', () => {
    expect(classifyChange(sub(PRO), FREE, 'MONTHLY', now).change).toBe('TO_FREE');
    expect(classifyChange(sub(FREE), FREE, 'MONTHLY', now).change).toBe('CURRENT');
  });
  it('con pago vencido, el mismo plan es una renovación', () => {
    expect(classifyChange(sub(PRO, { status: 'PAST_DUE' }), PRO, 'MONTHLY', now)).toMatchObject({ change: 'IMMEDIATE', kind: 'RENEWAL' });
  });
});

describe('promociones y crédito', () => {
  const promo = { code: 'X', percentOff: 50, amountOff: null, appliesToPlans: [], isActive: true, validFrom: new Date('2026-01-01'), validUntil: null, maxRedemptions: 2, redemptions: 0 };
  it('valida vigencia, usos y planes', () => {
    expect(promoProblem(promo, 'PRO', now)).toBeNull();
    expect(promoProblem({ ...promo, redemptions: 2 }, 'PRO', now)).toMatch(/límite/);
    expect(promoProblem({ ...promo, validUntil: new Date('2026-02-01') }, 'PRO', now)).toMatch(/venció/);
    expect(promoProblem({ ...promo, appliesToPlans: ['BUSINESS'] }, 'PRO', now)).toMatch(/no aplica/);
    expect(promoProblem(null, 'PRO', now)).toMatch(/no existe/);
  });
  it('el descuento nunca supera el precio', () => {
    expect(promoDiscount({ percentOff: 50, amountOff: null }, 19)).toBe(9.5);
    expect(promoDiscount({ percentOff: null, amountOff: 100 }, 19)).toBe(19);
  });
  it('crédito proporcional al tiempo no usado', () => {
    expect(unusedCredit(30, new Date('2026-06-01Z'), new Date('2026-07-01Z'), now)).toBe(15);
    expect(unusedCredit(30, new Date('2026-06-01Z'), new Date('2026-06-10Z'), now)).toBe(0);
  });
  it('cotización de PRO → BUSINESS descuenta el saldo de PRO', () => {
    const q = buildQuote({ current: sub(PRO), target: BUSINESS, period: 'MONTHLY', now, promo: null, paidForCurrentPeriod: 19 });
    expect(q).toMatchObject({ change: 'IMMEDIATE', listAmount: 79, creditAmount: 9.5, amount: 69.5 });
  });
  it('una renovación vencida continúa el periodo anterior', () => {
    const q = buildQuote({ current: sub(PRO, { status: 'PAST_DUE' }), target: PRO, period: 'MONTHLY', now, promo: null, paidForCurrentPeriod: 19 });
    expect(q.periodEnd?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(q.amount).toBe(19);
  });
});

describe('firmas de webhooks', () => {
  it('Stripe: acepta la firma correcta y rechaza cuerpo alterado, secreto distinto o marca vieja', () => {
    const body = '{"id":"evt_1"}';
    const header = signStripePayload(body, 'whsec_test', now.getTime());
    expect(verifyStripeSignature(body, header, 'whsec_test', now.getTime())).toBe(true);
    expect(verifyStripeSignature(body + ' ', header, 'whsec_test', now.getTime())).toBe(false);
    expect(verifyStripeSignature(body, header, 'otro', now.getTime())).toBe(false);
    expect(verifyStripeSignature(body, header, 'whsec_test', now.getTime() + 10 * 60_000)).toBe(false);
    expect(verifyStripeSignature(body, undefined, 'whsec_test')).toBe(false);
  });
  it('Mercado Pago: valida el manifiesto id / request-id / ts', () => {
    const ts = String(now.getTime());
    const v1 = createHmac('sha256', 'mp_secret').update(`id:123;request-id:req-1;ts:${ts};`).digest('hex');
    const ok = { dataId: '123', requestId: 'req-1', signature: `ts=${ts},v1=${v1}` };
    expect(verifyMercadoPagoSignature(ok, 'mp_secret', now.getTime())).toBe(true);
    expect(verifyMercadoPagoSignature({ ...ok, dataId: '124' }, 'mp_secret', now.getTime())).toBe(false);
    expect(verifyMercadoPagoSignature(ok, 'otro', now.getTime())).toBe(false);
  });
  it('normaliza eventos', () => {
    const e = normalizeStripeEvent({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: { paymentId: 'p1' }, payment_status: 'paid', amount_total: 1900, currency: 'usd', payment_intent: 'pi_1' } },
    });
    expect(e).toMatchObject({ outcome: 'SUCCEEDED', paymentId: 'p1', amount: 19, currency: 'USD', providerPaymentId: 'pi_1' });
    expect(mercadoPagoOutcome('approved')).toBe('SUCCEEDED');
    expect(mercadoPagoOutcome('in_process')).toBeNull();
  });
});
