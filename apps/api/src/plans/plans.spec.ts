import { describe, expect, it, vi } from 'vitest';
import { PlanLimitError, PlanLimitsService } from './plans.js';

const freePlan = {
  id: 'free',
  code: 'FREE',
  name: 'Free',
  maxActiveTournaments: 2,
  maxParticipantsPerTournament: 16,
  maxAdmins: 1,
  features: [{ featureKey: 'BASIC_STATS', enabled: true }],
};
const proPlan = { ...freePlan, id: 'pro', code: 'PRO', name: 'Pro', maxActiveTournaments: 20, maxParticipantsPerTournament: 128, features: [{ featureKey: 'FULL_CUSTOMIZATION', enabled: true }] };

function prismaMock(opts: { subscription?: unknown; activeCount?: number }) {
  return {
    subscription: { findFirst: vi.fn().mockResolvedValue(opts.subscription ?? null) },
    subscriptionPlan: { findUnique: vi.fn().mockResolvedValue(freePlan) },
    tournament: { count: vi.fn().mockResolvedValue(opts.activeCount ?? 0) },
  };
}

describe('PlanLimitsService', () => {
  it('bloquea el tercer torneo activo en FREE con el mensaje esperado', async () => {
    const prisma = prismaMock({ subscription: { status: 'ACTIVE', plan: freePlan }, activeCount: 2 });
    const service = new PlanLimitsService(prisma as never);
    const error = await service.assertCanCreateActiveTournament('org-1').catch((e) => e);
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(error.getResponse()).toMatchObject({ code: 'ACTIVE_TOURNAMENTS_LIMIT', limit: 2, used: 2, plan: 'FREE' });
    expect(error.message).toContain('Has alcanzado el límite de 2 torneos activos de tu plan Free');
  });

  it('permite crear mientras no se alcance el límite', async () => {
    const prisma = prismaMock({ subscription: { status: 'ACTIVE', plan: freePlan }, activeCount: 1 });
    await expect(new PlanLimitsService(prisma as never).assertCanCreateActiveTournament('org-1')).resolves.toBeUndefined();
  });

  it('BUSINESS (límite nulo) no tiene tope de torneos activos', async () => {
    const business = { ...freePlan, code: 'BUSINESS', maxActiveTournaments: null };
    const prisma = prismaMock({ subscription: { status: 'ACTIVE', plan: business }, activeCount: 500 });
    await expect(new PlanLimitsService(prisma as never).assertCanCreateActiveTournament('org-1')).resolves.toBeUndefined();
    expect(prisma.tournament.count).not.toHaveBeenCalled();
  });

  it('valida participantes por torneo según el plan', async () => {
    const prisma = prismaMock({ subscription: { status: 'ACTIVE', plan: freePlan } });
    const service = new PlanLimitsService(prisma as never);
    await expect(service.assertParticipantsWithinPlan('org-1', 16)).resolves.toBeUndefined();
    await expect(service.assertParticipantsWithinPlan('org-1', 17)).rejects.toBeInstanceOf(PlanLimitError);
  });

  it('una suscripción PRO vencida (EXPIRED) cae a las capacidades de FREE', async () => {
    const prisma = prismaMock({ subscription: { status: 'EXPIRED', plan: proPlan } });
    const { plan } = await new PlanLimitsService(prisma as never).effectivePlan('org-1');
    expect(plan.code).toBe('FREE');
  });

  it('PAST_DUE conserva el plan solo dentro del periodo de gracia', async () => {
    const inGrace = prismaMock({ subscription: { status: 'PAST_DUE', graceUntil: new Date(Date.now() + 864e5), plan: proPlan } });
    expect((await new PlanLimitsService(inGrace as never).effectivePlan('o')).plan.code).toBe('PRO');
    const expired = prismaMock({ subscription: { status: 'PAST_DUE', graceUntil: new Date(Date.now() - 864e5), plan: proPlan } });
    expect((await new PlanLimitsService(expired as never).effectivePlan('o')).plan.code).toBe('FREE');
  });

  it('feature flags: FULL_CUSTOMIZATION solo en planes que la incluyen', async () => {
    const free = prismaMock({ subscription: { status: 'ACTIVE', plan: freePlan } });
    expect(await new PlanLimitsService(free as never).hasFeature('o', 'FULL_CUSTOMIZATION')).toBe(false);
    const pro = prismaMock({ subscription: { status: 'ACTIVE', plan: proPlan } });
    expect(await new PlanLimitsService(pro as never).hasFeature('o', 'FULL_CUSTOMIZATION')).toBe(true);
  });
});
