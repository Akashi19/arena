import { describe, expect, it } from 'vitest';
import { platformSource, supportedLevel } from './levels.js';

describe('supportedLevel', () => {
  it('sin evidencia mínima no respalda ningún nivel', () => {
    expect(supportedLevel(null)).toBeNull();
    expect(supportedLevel({ matchesPlayed: 4, winRate: 100, tournamentsWon: 2 })).toBeNull();
  });

  it('respalda el nivel más alto cuyos umbrales se cumplen', () => {
    expect(supportedLevel({ matchesPlayed: 5, winRate: 0, tournamentsWon: 0 })).toBe('BEGINNER');
    expect(supportedLevel({ matchesPlayed: 8, winRate: 35, tournamentsWon: 0 })).toBe('INTERMEDIATE');
    expect(supportedLevel({ matchesPlayed: 15, winRate: 50, tournamentsWon: 0 })).toBe('ADVANCED');
    expect(supportedLevel({ matchesPlayed: 30, winRate: 58, tournamentsWon: 1 })).toBe('EXPERT');
    expect(supportedLevel({ matchesPlayed: 60, winRate: 65, tournamentsWon: 3 })).toBe('PROFESSIONAL');
  });

  it('exige todos los criterios: muchas partidas sin títulos no llegan a experto', () => {
    expect(supportedLevel({ matchesPlayed: 100, winRate: 80, tournamentsWon: 0 })).toBe('ADVANCED');
    expect(supportedLevel({ matchesPlayed: 100, winRate: 80, tournamentsWon: 1 })).toBe('EXPERT');
    expect(supportedLevel({ matchesPlayed: 20, winRate: 30, tournamentsWon: 0 })).toBe('BEGINNER');
  });
});

describe('platformSource', () => {
  it('describe la evidencia en lenguaje claro', () => {
    expect(platformSource({ matchesPlayed: 12, winRate: 58.33, tournamentsWon: 0 })).toBe(
      'Estadísticas oficiales: 12 partidas, 58% de victorias',
    );
    expect(platformSource({ matchesPlayed: 30, winRate: 60, tournamentsWon: 1 })).toContain('1 título');
  });
});
