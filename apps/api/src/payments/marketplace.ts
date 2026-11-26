import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { billingConfig, ProviderError } from '../billing/providers.js';

/**
 * Cobro de inscripciones con la cuenta de Mercado Pago de cada organizador (OAuth de marketplace).
 * El dinero va directo al organizador; Arena retiene `marketplace_fee` (comisión del plan).
 * Funciones puras (cifrado, state, comisión, resultado) con pruebas en marketplace.spec.ts.
 */

const MP_API = 'https://api.mercadopago.com';
const MP_AUTH = 'https://auth.mercadopago.com/authorization';

export function marketplaceConfig() {
  const b = billingConfig();
  const clientId = process.env.MERCADOPAGO_CLIENT_ID ?? '';
  const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET ?? '';
  const webhookSecret = process.env.MERCADOPAGO_MARKETPLACE_WEBHOOK_SECRET || b.mercadoPagoWebhookSecret;
  return {
    clientId,
    clientSecret,
    webhookSecret,
    /** Mercado Pago real: requiere la aplicación de marketplace (client id/secret) y su secreto de webhook */
    enabled: !!(clientId && clientSecret && webhookSecret),
    /** Cuenta y pagos de prueba sin dinero real (mismo interruptor que las suscripciones) */
    sandbox: b.sandbox,
    publicApiUrl: b.publicApiUrl,
    publicWebUrl: b.publicWebUrl,
    redirectUri: `${b.publicWebUrl}/dashboard/cobros/mercadopago`,
    holdMinutes: Math.min(Math.max(Number(process.env.REGISTRATION_PAYMENT_HOLD_MINUTES || 30), 10), 1440),
  };
}

/**
 * Cobro centralizado: el jugador paga a la cuenta de Mercado Pago de Arena (MERCADOPAGO_ACCESS_TOKEN) y Arena
 * liquida después el neto al organizador por transferencia. Opción para organizadores sin cuenta propia.
 */
export function centralConfig() {
  const b = billingConfig();
  return {
    token: b.mercadoPagoToken,
    enabled: !!(b.mercadoPagoToken && webhookSecrets().length),
    sandbox: b.sandbox,
  };
}

/** Secretos válidos para la firma de las notificaciones de cobro de inscripciones (marketplace y cuenta de Arena). */
export function webhookSecrets() {
  const b = billingConfig();
  const marketplace = process.env.MERCADOPAGO_MARKETPLACE_WEBHOOK_SECRET || b.mercadoPagoWebhookSecret;
  return [...new Set([marketplace, b.mercadoPagoWebhookSecret].filter(Boolean))];
}

// -------------------------------------------------------------------------------- cifrado de tokens

function encryptionKey() {
  const raw = process.env.PAYMENTS_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('PAYMENTS_ENCRYPTION_KEY debe ser de 32 bytes en base64 (openssl rand -base64 32)');
    return key;
  }
  if (env.isProduction && (marketplaceConfig().enabled || centralConfig().enabled)) {
    throw new Error('Define PAYMENTS_ENCRYPTION_KEY para guardar los tokens de Mercado Pago y los datos bancarios de los organizadores');
  }
  // Desarrollo y pruebas: clave derivada del secreto JWT
  return createHash('sha256').update(`arena-payments:${env.jwt.refreshSecret}`).digest();
}

/** AES-256-GCM: «v1.iv.tag.cifrado» en base64url. */
export function encryptSecret(plain: string, key = encryptionKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptSecret(sealed: string, key = encryptionKey()) {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Token cifrado con formato desconocido');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

// -------------------------------------------------------------------------------- state de OAuth

const stateKey = () => createHash('sha256').update(`arena-oauth-state:${env.jwt.accessSecret}`).digest();

/** State firmado (HMAC) que ata la autorización al organizador y al usuario que la inició; vence en 15 min. */
export function signOAuthState(organizerId: string, userId: string, nowMs = Date.now(), key = stateKey()) {
  const payload = Buffer.from(JSON.stringify({ o: organizerId, u: userId, n: randomBytes(8).toString('hex'), e: nowMs + 15 * 60_000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
}

export function verifyOAuthState(state: string, nowMs = Date.now(), key = stateKey()): { organizerId: string; userId: string } | null {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', key).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { o: string; u: string; e: number };
    if (typeof p.e !== 'number' || p.e < nowMs) return null;
    return { organizerId: p.o, userId: p.u };
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------------------- comisión y resultado

/** Comisión de Arena redondeada a 2 decimales y nunca mayor que el importe. */
export function platformFee(amount: number, percent: number) {
  if (!(amount > 0) || !(percent > 0)) return 0;
  return Math.min(amount, Math.round(amount * percent) / 100);
}

export type PaymentOutcome = 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | null;

/** Estado de un pago de Mercado Pago → efecto sobre la inscripción (null: esperar otra notificación). */
export function registrationOutcome(status: string): PaymentOutcome {
  if (status === 'approved') return 'SUCCEEDED';
  if (status === 'rejected' || status === 'cancelled') return 'FAILED';
  if (status === 'refunded' || status === 'charged_back') return 'REFUNDED';
  return null; // pending, in_process, authorized, in_mediation
}

/** El pago notificado corresponde a lo que Arena cobró (referencia, importe y moneda). */
export function matchesPayment(
  mp: { external_reference?: string | null; transaction_amount?: number | null; currency_id?: string | null },
  expected: { id: string; amount: number; currency: string },
) {
  return (
    mp.external_reference === expected.id &&
    Math.abs(Number(mp.transaction_amount ?? -1) - expected.amount) < 0.005 &&
    (mp.currency_id ?? '').toUpperCase() === expected.currency.toUpperCase()
  );
}

// -------------------------------------------------------------------------------- API de Mercado Pago

export function authorizeUrl(state: string) {
  const c = marketplaceConfig();
  const q = new URLSearchParams({ client_id: c.clientId, response_type: 'code', platform_id: 'mp', state, redirect_uri: c.redirectUri });
  return `${MP_AUTH}?${q}`;
}

export interface MpTokens {
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  user_id: number | string;
  expires_in?: number;
  live_mode?: boolean;
}

async function mp<T>(path: string, init: { method?: string; token?: string; body?: unknown; idempotencyKey?: string }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.idempotencyKey) headers['x-idempotency-key'] = init.idempotencyKey;
  const res = await fetch(`${MP_API}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & { message?: string }) : ({} as T & { message?: string });
  if (!res.ok) {
    const err = new ProviderError(`Mercado Pago respondió ${res.status}${data?.message ? `: ${data.message}` : ''}`);
    (err as ProviderError & { status?: number }).status = res.status;
    throw err;
  }
  return data as T;
}

export function exchangeCode(code: string) {
  const c = marketplaceConfig();
  return mp<MpTokens>('/oauth/token', {
    method: 'POST',
    body: { client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'authorization_code', code, redirect_uri: c.redirectUri },
  });
}

export function refreshTokens(refreshToken: string) {
  const c = marketplaceConfig();
  return mp<MpTokens>('/oauth/token', {
    method: 'POST',
    body: { client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken },
  });
}

export interface PreferenceInput {
  paymentId: string;
  title: string;
  tournamentId: string;
  amount: number;
  currency: string;
  /** Comisión de Arena como marketplace_fee (0 en el cobro centralizado: el pago ya entra a la cuenta de Arena) */
  fee: number;
  expiresAt: Date;
  payerEmail?: string;
}

export function preferenceBody(p: PreferenceInput) {
  const c = marketplaceConfig();
  const back = (estado: string) => `${c.publicWebUrl}/inscripciones/pago/${p.paymentId}?estado=${estado}`;
  return {
    items: [{ id: p.tournamentId, title: p.title.slice(0, 250), quantity: 1, unit_price: p.amount, currency_id: p.currency }],
    external_reference: p.paymentId,
    ...(p.fee > 0 ? { marketplace_fee: p.fee } : {}),
    notification_url: `${c.publicApiUrl}/api/registration-payments/webhooks/mercadopago?ref=${p.paymentId}`,
    back_urls: { success: back('ok'), pending: back('pendiente'), failure: back('error') },
    auto_return: 'approved',
    expires: true,
    expiration_date_to: p.expiresAt.toISOString(),
    ...(p.payerEmail ? { payer: { email: p.payerEmail } } : {}),
    metadata: { registration_payment_id: p.paymentId },
  };
}

export function createPreference(token: string, p: PreferenceInput) {
  return mp<{ id: string; init_point: string; sandbox_init_point?: string }>('/checkout/preferences', {
    method: 'POST',
    token,
    idempotencyKey: p.paymentId,
    body: preferenceBody(p),
  });
}

export function getPayment(token: string, id: string) {
  return mp<{ id: number; status: string; status_detail?: string; external_reference?: string; transaction_amount?: number; currency_id?: string }>(
    `/v1/payments/${encodeURIComponent(id)}`,
    { token },
  );
}

export function refundPayment(token: string, id: string, idempotencyKey: string) {
  return mp<{ id: number; status: string }>(`/v1/payments/${encodeURIComponent(id)}/refunds`, { method: 'POST', token, idempotencyKey, body: {} });
}
