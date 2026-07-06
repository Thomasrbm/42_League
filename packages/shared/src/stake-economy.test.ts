import { describe, it, expect } from 'vitest';
import {
  stakeBetMultiplier,
  stakeBetPayout,
  stakeWinnerPayout,
  STAKE_MULT_CAP,
  STAKE_MULT_BASE,
} from './stake-economy.js';

describe('stakeBetMultiplier (audace, plafonné)', () => {
  it('croît avec la mise : 1 + mise / BASE', () => {
    expect(stakeBetMultiplier(STAKE_MULT_BASE)).toBeCloseTo(2); // 250 → ×2
    expect(stakeBetMultiplier(500)).toBeCloseTo(3); // 500 → ×3
  });
  it('plafonne à STAKE_MULT_CAP', () => {
    expect(stakeBetMultiplier(1000)).toBeCloseTo(STAKE_MULT_CAP); // 1 + 1000/250 = 5
    expect(stakeBetMultiplier(10_000)).toBe(STAKE_MULT_CAP); // écrêté
  });
  it('vaut 0 pour une mise nulle/négative', () => {
    expect(stakeBetMultiplier(0)).toBe(0);
    expect(stakeBetMultiplier(-100)).toBe(0);
  });
  it("récompense l'audace : miser gros sur soi = plus gros gain pour ses parieurs", () => {
    expect(stakeBetMultiplier(600)).toBeGreaterThan(stakeBetMultiplier(300));
  });
});

describe('stakeBetPayout (parieur extérieur, cote fixe)', () => {
  it('mise × cote du vainqueur', () => {
    // parie 100 sur un participant ayant misé 500 (×3) → 300.
    expect(stakeBetPayout(100, 500)).toBe(300);
  });
  it('0 si mise nulle', () => {
    expect(stakeBetPayout(0, 500)).toBe(0);
  });
});

describe('stakeWinnerPayout (participant gagnant)', () => {
  it('sa mise + mise adverse + bonus 25% sur sa mise', () => {
    // A mise 500, bat B (200) → 500 + 200 + round(0.25·500)=125 = 825.
    expect(stakeWinnerPayout(500, 200)).toBe(825);
  });
  it('gain net = mise adverse + bonus (la mise propre est récupérée)', () => {
    const own = 400;
    const opp = 300;
    expect(stakeWinnerPayout(own, opp) - own).toBe(opp + Math.round(own * 0.25));
  });
  it('le bonus participant reste < cote des parieurs sur lui', () => {
    // Sur une mise de 500, le participant touche ×1.25 sur sa mise, alors qu'un
    // parieur sur lui touche ×3 — l'implication doit tenir pour toute mise ≥ BASE/3.
    const own = 500;
    const participantMult = stakeWinnerPayout(own, 0) / own; // 1.25
    expect(participantMult).toBeLessThan(stakeBetMultiplier(own));
  });
});
