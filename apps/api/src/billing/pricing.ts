/**
 * Reglas de precios y cambios de plan (funciones puras, sin base de datos).
 *
 * - Subir de plan, pasar de mensual a anual o pagar desde FREE / prueba / pago vencido: cobro inmediato.
 *   Si se viene de un plan de pago vigente se descuenta el saldo no usado del periodo ya pagado.
 * - Bajar de plan o pasar de anual a mensual: queda programado para el fin del periodo pagado.
 * - Pasar a un plan gratuito equivale a cancelar al final del periodo.
 */

export type Period = 'MONTHLY' | 'YEARLY';

export interface PricedPlan {
  id: string;
  code: string;
  name: string;
  priceMonthly: number | string | { toString(): string };
  priceYearly: number | string | { toString(): string };
  currency: string;
}

export interface CurrentSubscription {
  plan: PricedPlan;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  billingPeriod: Period;
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
}

export interface PromoRules {
  code: string;
  percentOff: number | null;
  amountOff: number | string | { toString(): string } | null;
  appliesToPlans: string[];
  isActive: boolean;
  validFrom: Date;
  validUntil: Date | null;
  maxRedemptions: number | null;
  redemptions: number;
}

export type ChangeKind = 'CURRENT' | 'IMMEDIATE' | 'SCHEDULED' | 'TO_FREE';
export type PaymentKind = 'NEW' | 'UPGRADE' | 'RENEWAL';

export const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: PricedPlan['priceMonthly'] | null | undefined) => Number(v ?? 0);

export const isFreePlan = (p: PricedPlan) => num(p.priceMonthly) === 0 && num(p.priceYearly) === 0;

export const priceFor = (p: PricedPlan, period: Period) => round2(num(period === 'YEARLY' ? p.priceYearly : p.priceMonthly));

/** Suma un mes o un año conservando el día (31 ene + 1 mes = 28/29 feb, no 3 mar). */
export function addPeriod(from: Date, period: Period): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  if (period === 'YEARLY') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** La suscripción da acceso al plan (prueba, activa o pago pendiente dentro del periodo de gracia). */
export function isUsable(s: Pick<CurrentSubscription, 'status' | 'graceUntil'>, now: Date) {
  if (s.status === 'TRIAL' || s.status === 'ACTIVE') return true;
  return s.status === 'PAST_DUE' && !!s.graceUntil && s.graceUntil > now;
}

/** Clasifica el cambio solicitado. */
export function classifyChange(
  current: CurrentSubscription,
  target: PricedPlan,
  period: Period,
  now: Date,
): { change: ChangeKind; kind: PaymentKind; withCredit: boolean } {
  const samePlan = current.plan.id === target.id;
  const currentFree = isFreePlan(current.plan);
  if (isFreePlan(target)) return { change: currentFree ? 'CURRENT' : 'TO_FREE', kind: 'NEW', withCredit: false };
  if (current.status === 'PAST_DUE') {
    const renewal = samePlan && current.billingPeriod === period;
    return { change: 'IMMEDIATE', kind: renewal ? 'RENEWAL' : 'UPGRADE', withCredit: false };
  }
  if (currentFree || current.status === 'TRIAL' || !isUsable(current, now)) {
    return { change: 'IMMEDIATE', kind: currentFree ? 'NEW' : 'UPGRADE', withCredit: false };
  }
  // Plan de pago activo
  if (samePlan) {
    if (current.billingPeriod === period) return { change: 'CURRENT', kind: 'RENEWAL', withCredit: false };
    return period === 'YEARLY'
      ? { change: 'IMMEDIATE', kind: 'UPGRADE', withCredit: true }
      : { change: 'SCHEDULED', kind: 'UPGRADE', withCredit: false };
  }
  return num(target.priceMonthly) >= num(current.plan.priceMonthly)
    ? { change: 'IMMEDIATE', kind: 'UPGRADE', withCredit: true }
    : { change: 'SCHEDULED', kind: 'UPGRADE', withCredit: false };
}

/** Motivo por el que un código promocional no aplica, o null si aplica. */
export function promoProblem(p: PromoRules | null, planCode: string, now: Date): string | null {
  if (!p || !p.isActive) return 'El código promocional no existe o no está activo';
  if (p.validFrom > now) return 'El código promocional todavía no está vigente';
  if (p.validUntil && p.validUntil < now) return 'El código promocional ya venció';
  if (p.maxRedemptions !== null && p.redemptions >= p.maxRedemptions) return 'El código promocional ya alcanzó su límite de usos';
  if (p.appliesToPlans.length && !p.appliesToPlans.includes(planCode)) return 'El código promocional no aplica a este plan';
  return null;
}

export function promoDiscount(p: Pick<PromoRules, 'percentOff' | 'amountOff'> | null, list: number) {
  if (!p) return 0;
  const raw = p.percentOff ? (list * p.percentOff) / 100 : num(p.amountOff);
  return round2(Math.min(list, Math.max(0, raw)));
}

/** Saldo proporcional no usado de un periodo ya pagado. */
export function unusedCredit(paid: number, start: Date, end: Date | null, now: Date) {
  if (!end || paid <= 0 || end <= now) return 0;
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  const left = Math.min(total, end.getTime() - Math.max(now.getTime(), start.getTime()));
  return round2((paid * left) / total);
}

export interface Quote {
  change: ChangeKind;
  kind: PaymentKind;
  plan: { id: string; code: string; name: string };
  billingPeriod: Period;
  currency: string;
  listAmount: number;
  discountAmount: number;
  creditAmount: number;
  amount: number;
  /** Para cambios inmediatos: fin del nuevo periodo. Para programados: fecha en que se aplica. */
  effectiveAt: Date | null;
  periodEnd: Date | null;
}

export function buildQuote(input: {
  current: CurrentSubscription;
  target: PricedPlan;
  period: Period;
  now: Date;
  promo: Pick<PromoRules, 'percentOff' | 'amountOff'> | null;
  /** Importe pagado por el periodo vigente (para el crédito). */
  paidForCurrentPeriod: number;
}): Quote {
  const { current, target, period, now } = input;
  const { change, kind, withCredit } = classifyChange(current, target, period, now);
  const listAmount = priceFor(target, period);
  const discountAmount = change === 'IMMEDIATE' ? promoDiscount(input.promo, listAmount) : 0;
  const creditAmount =
    change === 'IMMEDIATE' && withCredit
      ? Math.min(listAmount - discountAmount, unusedCredit(input.paidForCurrentPeriod, current.currentPeriodStart, current.currentPeriodEnd, now))
      : 0;
  const amount = change === 'IMMEDIATE' ? round2(Math.max(0, listAmount - discountAmount - creditAmount)) : 0;
  // Una renovación con pago vencido continúa el periodo anterior; el resto empieza hoy
  const start = kind === 'RENEWAL' && current.currentPeriodEnd ? current.currentPeriodEnd : now;
  return {
    change,
    kind,
    plan: { id: target.id, code: target.code, name: target.name },
    billingPeriod: period,
    currency: target.currency,
    listAmount,
    discountAmount,
    creditAmount: round2(creditAmount),
    amount,
    effectiveAt: change === 'IMMEDIATE' ? now : current.currentPeriodEnd,
    periodEnd: change === 'IMMEDIATE' ? addPeriod(start, period) : null,
  };
}
