import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  matchesPayment,
  platformFee,
  preferenceBody,
  registrationOutcome,
  signOAuthState,
  verifyOAuthState,
} from './marketplace.js';

describe('cobro de inscripciones: funciones puras', () => {
  it('cifra y descifra tokens con AES-256-GCM y detecta manipulación', () => {
    const key = randomBytes(32);
    const sealed = encryptSecret('APP_USR-123-token', key);
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('APP_USR');
    expect(decryptSecret(sealed, key)).toBe('APP_USR-123-token');
    // Dos cifrados del mismo texto son distintos (IV aleatorio)
    expect(encryptSecret('APP_USR-123-token', key)).not.toBe(sealed);
    const parts = sealed.split('.');
    parts[3] = Buffer.from('otro-contenido').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow();
  });

  it('el state de OAuth está firmado, ligado al organizador y vence', () => {
    const key = randomBytes(32);
    const now = Date.UTC(2026, 10, 10, 12);
    const state = signOAuthState('org-1', 'user-1', now, key);
    expect(verifyOAuthState(state, now + 60_000, key)).toEqual({ organizerId: 'org-1', userId: 'user-1' });
    expect(verifyOAuthState(state, now + 16 * 60_000, key)).toBeNull();
    expect(verifyOAuthState(state, now, randomBytes(32))).toBeNull();
    const [payload, sig] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ o: 'org-2', u: 'user-1', n: 'x', e: now + 60_000 })).toString('base64url');
    expect(verifyOAuthState(`${forged}.${sig}`, now, key)).toBeNull();
    expect(verifyOAuthState(`${payload}`, now, key)).toBeNull();
  });

  it('calcula la comisión de Arena con dos decimales', () => {
    expect(platformFee(50, 5)).toBe(2.5);
    expect(platformFee(19.99, 3)).toBe(0.6);
    expect(platformFee(100, 0)).toBe(0);
    expect(platformFee(0, 10)).toBe(0);
    expect(platformFee(10, 150)).toBe(10);
  });

  it('traduce el estado de Mercado Pago al efecto sobre la inscripción', () => {
    expect(registrationOutcome('approved')).toBe('SUCCEEDED');
    expect(registrationOutcome('rejected')).toBe('FAILED');
    expect(registrationOutcome('cancelled')).toBe('FAILED');
    expect(registrationOutcome('refunded')).toBe('REFUNDED');
    expect(registrationOutcome('charged_back')).toBe('REFUNDED');
    expect(registrationOutcome('in_process')).toBeNull();
    expect(registrationOutcome('pending')).toBeNull();
  });

  it('solo acepta pagos con la misma referencia, importe y moneda', () => {
    const expected = { id: 'pay-1', amount: 25, currency: 'PEN' };
    expect(matchesPayment({ external_reference: 'pay-1', transaction_amount: 25, currency_id: 'PEN' }, expected)).toBe(true);
    expect(matchesPayment({ external_reference: 'pay-2', transaction_amount: 25, currency_id: 'PEN' }, expected)).toBe(false);
    expect(matchesPayment({ external_reference: 'pay-1', transaction_amount: 2.5, currency_id: 'PEN' }, expected)).toBe(false);
    expect(matchesPayment({ external_reference: 'pay-1', transaction_amount: 25, currency_id: 'USD' }, expected)).toBe(false);
  });

  it('la preferencia lleva comisión, referencia, vencimiento y la URL de notificación', () => {
    const expiresAt = new Date('2026-11-10T12:30:00Z');
    const body = preferenceBody({ paymentId: 'pay-1', title: 'Inscripción: Copa', tournamentId: 't-1', amount: 25, currency: 'PEN', fee: 1.25, expiresAt });
    expect(body.marketplace_fee).toBe(1.25);
    expect(body.external_reference).toBe('pay-1');
    expect(body.items[0]).toMatchObject({ unit_price: 25, currency_id: 'PEN', quantity: 1 });
    expect(body.expires).toBe(true);
    expect(body.expiration_date_to).toBe('2026-11-10T12:30:00.000Z');
    expect(body.notification_url).toMatch(/\/api\/registration-payments\/webhooks\/mercadopago\?ref=pay-1$/);
    expect(body.back_urls.success).toMatch(/\/inscripciones\/pago\/pay-1\?estado=ok$/);
  });
});
