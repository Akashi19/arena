import { describe, expect, it } from 'vitest';
import { completionRate, reputationLevel, weightedScore } from './reputation.js';

describe('motor de reputación', () => {
  it('aplica la ponderación 25/25/20/15/15 con dos decimales', () => {
    expect(weightedScore({ organization: 5, punctuality: 5, communication: 5, transparency: 5, experience: 5 })).toBe(5);
    expect(weightedScore({ organization: 4, punctuality: 3, communication: 5, transparency: 2, experience: 1 })).toBe(3.2);
    // 4.6*0.25 + 4.2*0.25 + 3.9*0.2 + 4.1*0.15 + 4.4*0.15 = 1.15 + 1.05 + 0.78 + 0.615 + 0.66 = 4.255
    expect(weightedScore({ organization: 4.6, punctuality: 4.2, communication: 3.9, transparency: 4.1, experience: 4.4 })).toBe(4.26);
  });

  it('exige 10 valoraciones y 5 torneos completados para un nivel consolidado', () => {
    expect(reputationLevel(5, 9, 20)).toBe('NEW');
    expect(reputationLevel(5, 50, 4)).toBe('NEW');
    expect(reputationLevel(4.8, 10, 5)).toBe('TOP');
    expect(reputationLevel(4.79, 10, 5)).toBe('EXCELLENT');
    expect(reputationLevel(4.5, 10, 5)).toBe('EXCELLENT');
    expect(reputationLevel(4.49, 10, 5)).toBe('GOOD');
    expect(reputationLevel(4, 10, 5)).toBe('GOOD');
    expect(reputationLevel(3.99, 10, 5)).toBe('INITIAL');
    expect(reputationLevel(2.1, 10, 5)).toBe('INITIAL');
  });

  it('el cumplimiento excluye partidas en curso y cancelaciones no computables', () => {
    expect(completionRate(9, 1)).toBe(90);
    expect(completionRate(2, 1)).toBe(66.67);
    expect(completionRate(0, 0)).toBe(0);
  });
});
