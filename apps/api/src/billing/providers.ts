import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Proveedores de pago de las suscripciones de la plataforma (nunca de cuotas de inscripción).
 * Se usan sus APIs REST directamente; un proveedor solo se habilita si tiene configuradas
 * la clave de API y el secreto de los webhooks.
 */

export type ProviderCode = 'STRIPE' | 'MERCADOPAGO' | 'SANDBOX';

export function billingConfig() {
  const sandboxFlag = process.env.BILLING_SANDBOX;
  return {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    mercadoPagoToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? '',
    mercadoPagoWebhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET ?? '',
    // Pago simulado: activo por defecto fuera de producción
    sandbox: sandboxFlag ? sandboxFlag === 'true' : !env.isProduction,
    publicApiUrl: (process.env.PUBLIC_API_URL || `http://localhost:${env.port}`).replace(/\/$/, ''),
    publicWebUrl: env.publicWebUrl.replace(/\/$/, ''),
  };
}

export function enabledProviders(): ProviderCode[] {
  const c = billingConfig();
  const list: ProviderCode[] = [];
  if (c.stripeSecretKey && c.stripeWebhookSecret) list.push('STRIPE');
  if (c.mercadoPagoToken && c.mercadoPagoWebhookSecret) list.push('MERCADOPAGO');
  if (c.sandbox) list.push('SANDBOX');
  return list;
}

export const PROVIDER_NAME: Record<string, string> = {
  STRIPE: 'Stripe',
  MERCADOPAGO: 'Mercado Pago',
  SANDBOX: 'Pago de prueba',
  MANUAL: 'Sin cobro',
};

// ----------------------------------------------------------------------------- Firma de webhooks

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/** Cabecera `Stripe-Signature: t=…,v1=…`: HMAC-SHA256 de `${t}.${cuerpo}` con tolerancia de 5 minutos. */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, nowMs = Date.now(), toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  return signatures.some((s) => /^[0-9a-f]+$/i.test(s) && safeEqualHex(s, expected));
}

export function signStripePayload(rawBody: string, secret: string, nowMs = Date.now()) {
  const t = Math.floor(nowMs / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex')}`;
}

/**
 * Cabecera `x-signature: ts=…,v1=…` de Mercado Pago: HMAC-SHA256 del manifiesto
 * `id:{data.id};request-id:{x-request-id};ts:{ts};` (se omiten las partes ausentes).
 */
export function verifyMercadoPagoSignature(
  input: { dataId?: string; requestId?: string; signature?: string },
  secret: string,
  nowMs = Date.now(),
  toleranceSec = 600,
) {
  if (!input.signature || !secret) return false;
  const parts = Object.fromEntries(input.signature.split(',').map((p) => p.trim().split('=') as [string, string]));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !/^\d+$/.test(ts) || !v1) return false;
  // Mercado Pago envía ts en milisegundos o segundos según la versión
  const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  if (Math.abs(nowMs - tsMs) > toleranceSec * 1000) return false;
  const dataId = input.dataId && /^[a-z0-9]+$/i.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId;
  let manifest = '';
  if (dataId) manifest += `id:${dataId};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest, 'utf8').digest('hex');
  return /^[0-9a-f]+$/i.test(v1) && safeEqualHex(v1, expected);
}

// ----------------------------------------------------------------------------- Creación del checkout

export interface CheckoutInput {
  paymentId: string;
  idempotencyKey: string;
  amount: number;
  currency: string;
  description: string;
  customerEmail: string;
}

export class ProviderError extends Error {}

const returnUrl = (paymentId: string, estado: string) => `${billingConfig().publicWebUrl}/dashboard/suscripcion/pago/${paymentId}?estado=${estado}`;

export async function createCheckout(provider: ProviderCode, input: CheckoutInput): Promise<{ url: string; providerRef?: string }> {
  const c = billingConfig();
  if (provider === 'SANDBOX') return { url: `${c.publicWebUrl}/dashboard/suscripcion/pago/${input.paymentId}` };

  if (provider === 'STRIPE') {
    const form = new URLSearchParams({
      mode: 'payment',
      success_url: returnUrl(input.paymentId, 'ok'),
      cancel_url: returnUrl(input.paymentId, 'cancelado'),
      client_reference_id: input.paymentId,
      customer_email: input.customerEmail,
      'metadata[paymentId]': input.paymentId,
      'payment_intent_data[metadata][paymentId]': input.paymentId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': input.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(Math.round(input.amount * 100)),
      'line_items[0][price_data][product_data][name]': input.description,
    });
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${c.stripeSecretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': input.idempotencyKey,
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; id?: string; error?: { message?: string } };
    if (!res.ok || !body.url) throw new ProviderError(body.error?.message ?? `Stripe respondió ${res.status}`);
    return { url: body.url, providerRef: body.id };
  }

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${c.mercadoPagoToken}`,
      'content-type': 'application/json',
      'x-idempotency-key': input.idempotencyKey,
    },
    body: JSON.stringify({
      items: [{ id: input.paymentId, title: input.description, quantity: 1, unit_price: input.amount, currency_id: input.currency }],
      payer: { email: input.customerEmail },
      external_reference: input.paymentId,
      notification_url: `${c.publicApiUrl}/api/billing/webhooks/mercadopago`,
      back_urls: { success: returnUrl(input.paymentId, 'ok'), failure: returnUrl(input.paymentId, 'rechazado'), pending: returnUrl(input.paymentId, 'pendiente') },
      auto_return: 'approved',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { init_point?: string; id?: string; message?: string };
  if (!res.ok || !body.init_point) throw new ProviderError(body.message ?? `Mercado Pago respondió ${res.status}`);
  return { url: body.init_point, providerRef: body.id };
}

/** Consulta un pago en Mercado Pago: la notificación solo trae el id, el estado se lee de la API. */
export async function fetchMercadoPagoPayment(id: string) {
  const c = billingConfig();
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${c.mercadoPagoToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new ProviderError(`Mercado Pago respondió ${res.status}`);
  return (await res.json()) as {
    id: number;
    status: string;
    status_detail?: string;
    external_reference?: string;
    transaction_amount?: number;
    currency_id?: string;
  };
}

// ----------------------------------------------------------------------------- Eventos normalizados

export interface BillingEvent {
  provider: 'STRIPE' | 'MERCADOPAGO' | 'SANDBOX';
  eventId: string;
  type: string;
  paymentId: string | null;
  outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | null;
  amount?: number;
  currency?: string;
  providerPaymentId?: string;
  failureReason?: string;
  payload: unknown;
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      client_reference_id?: string | null;
      metadata?: Record<string, string>;
      payment_status?: string;
      payment_intent?: string | null;
      amount_total?: number | null;
      currency?: string | null;
    };
  };
}

/** Traduce un evento de Stripe (ya verificado) al formato interno. */
export function normalizeStripeEvent(e: StripeEvent): BillingEvent {
  const o = e.data?.object ?? ({} as StripeEvent['data']['object']);
  const paymentId = o.metadata?.paymentId ?? o.client_reference_id ?? null;
  let outcome: BillingEvent['outcome'] = null;
  if (e.type === 'checkout.session.completed') outcome = o.payment_status === 'paid' ? 'SUCCEEDED' : null;
  else if (e.type === 'checkout.session.async_payment_succeeded') outcome = 'SUCCEEDED';
  else if (e.type === 'checkout.session.async_payment_failed') outcome = 'FAILED';
  else if (e.type === 'checkout.session.expired') outcome = 'CANCELLED';
  return {
    provider: 'STRIPE',
    eventId: e.id,
    type: e.type,
    paymentId,
    outcome,
    amount: o.amount_total != null ? o.amount_total / 100 : undefined,
    currency: o.currency ? o.currency.toUpperCase() : undefined,
    providerPaymentId: o.payment_intent ?? o.id,
    failureReason: outcome === 'FAILED' ? 'El proveedor rechazó el pago' : undefined,
    payload: e,
  };
}

export function mercadoPagoOutcome(status: string): BillingEvent['outcome'] {
  if (status === 'approved') return 'SUCCEEDED';
  if (status === 'rejected') return 'FAILED';
  if (status === 'cancelled' || status === 'refunded' || status === 'charged_back') return 'CANCELLED';
  return null; // pending, in_process, authorized: se espera otra notificación
}
