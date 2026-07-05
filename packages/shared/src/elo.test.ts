import { describe, it, expect } from 'vitest';
import {
  calculateBabyfootElo,
  calculateSmashElo,
  calculateChessElo,
  smashTarget,
  K,
  DEFAULT_ELO,
  UPSET_GAP_COEFF,
  WINNER_BONUS_CAP,
  MAX_DELTA_PER_MATCH,
} from './elo.js';

describe('calculateChessElo', () => {
  it('gagnant +, perdant − ; ~16 à ratings égaux (M=1)', () => {
    const r = calculateChessElo(1000, 1000, 'A');
    expect(r.deltaA).toBeGreaterThan(0);
    expect(r.deltaB).toBeLessThan(0);
    expect(r.deltaA).toBe(16); // K/2 à 50/50
  });
  it('un upset rapporte plus que battre un favori', () => {
    const upset = calculateChessElo(900, 1300, 'A'); // l'outsider gagne
    const expected = calculateChessElo(1300, 900, 'A'); // le favori gagne
    expect(upset.deltaA).toBeGreaterThan(expected.deltaA);
  });
  it('symétrie A/B', () => {
    const left = calculateChessElo(1100, 1000, 'A');
    const right = calculateChessElo(1000, 1100, 'B');
    expect(left.deltaA).toBe(right.deltaB);
    expect(left.deltaB).toBe(right.deltaA);
  });
  it('nulle à ratings égaux : ±0', () => {
    const r = calculateChessElo(1000, 1000, 'draw');
    expect(r.deltaA).toBe(0);
    expect(r.deltaB).toBe(0);
  });
  it('nulle : le mieux classé concède des points à l\'outsider', () => {
    const r = calculateChessElo(1300, 900, 'draw');
    expect(r.deltaA).toBeLessThan(0); // favori perd
    expect(r.deltaB).toBeGreaterThan(0); // outsider gagne
    // somme ~ nulle (transfert quasi symétrique)
    expect(Math.abs(r.deltaA + r.deltaB)).toBeLessThanOrEqual(1);
  });
});

describe('calculateSmashElo', () => {
  it('le gagnant gagne des points, le perdant en perd', () => {
    const r = calculateSmashElo(1000, 1000, 'A', 2, 0, 3, 3);
    expect(r.deltaA).toBeGreaterThan(0);
    expect(r.deltaB).toBeLessThan(0);
  });

  it('un sweep 2-0 rapporte plus qu’un 2-1 serré (à ratings égaux)', () => {
    const sweep = calculateSmashElo(1000, 1000, 'A', 2, 0, 3, 3);
    const close = calculateSmashElo(1000, 1000, 'A', 2, 1, 3, 1);
    expect(sweep.deltaA).toBeGreaterThan(close.deltaA);
  });

  it('plus de vies restantes = plus de points (set identique)', () => {
    const dom = calculateSmashElo(1000, 1000, 'A', 2, 1, 3, 3);
    const tight = calculateSmashElo(1000, 1000, 'A', 2, 1, 3, 1);
    expect(dom.deltaA).toBeGreaterThan(tight.deltaA);
  });

  it('symétrie A/B', () => {
    const left = calculateSmashElo(1100, 1000, 'A', 3, 1, 5, 2);
    const right = calculateSmashElo(1000, 1100, 'B', 1, 3, 5, 2);
    expect(left.deltaA).toBe(right.deltaB);
    expect(left.deltaB).toBe(right.deltaA);
  });

  it('smashTarget : Bo3 → 2, Bo5 → 3', () => {
    expect(smashTarget(3)).toBe(2);
    expect(smashTarget(5)).toBe(3);
  });
});

describe('calculateBabyfootElo', () => {
  it('le gagnant gagne des points, le perdant en perd', () => {
    const r = calculateBabyfootElo(1000, 1000, 'A', 10, 5);
    expect(r.deltaA).toBeGreaterThan(0);
    expect(r.deltaB).toBeLessThan(0);
  });

  it('les nouveaux ratings sont cohérents avec les deltas', () => {
    const r = calculateBabyfootElo(1000, 1200, 'A', 10, 3);
    expect(r.newA).toBe(1000 + r.deltaA);
    expect(r.newB).toBe(1200 + r.deltaB);
  });

  it('fonctionne si B est le gagnant', () => {
    const r = calculateBabyfootElo(1000, 1000, 'B', 5, 10);
    expect(r.deltaB).toBeGreaterThan(0);
    expect(r.deltaA).toBeLessThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Résultats SYMÉTRIQUES (pas d'upset) : ratings égaux ou favori qui gagne.
  // Le bonus d'écart de rating est nul → transfert classique somme-nulle.
  // ─────────────────────────────────────────────────────────────────────────
  describe('résultats attendus : transfert symétrique (somme nulle)', () => {
    it('ratings égaux 10-0 → ±32 (E=0.5, M=2)', () => {
      // 1200 vs 1200 : loin du plancher 975, le transfert reste symétrique.
      const r = calculateBabyfootElo(1200, 1200, 'A', 10, 0);
      expect(r.deltaA).toBe(32);
      expect(r.deltaB).toBe(-32);
      expect(r.deltaA + r.deltaB).toBe(0);
    });

    it('ratings égaux 10-9 → ±18 (E=0.5, M=1.1)', () => {
      const r = calculateBabyfootElo(1000, 1000, 'A', 10, 9);
      expect(r.deltaA).toBe(18);
      expect(r.deltaB).toBe(-18);
    });

    it('ratings égaux 10-5 → ±24 (E=0.5, M=1.5)', () => {
      const r = calculateBabyfootElo(1000, 1000, 'A', 10, 5);
      expect(r.deltaA).toBe(24);
      expect(r.deltaB).toBe(-24);
    });

    it('favori 1200 bat 1000, 10-5 → ±12 (pas de bonus, gap côté perdant)', () => {
      const r = calculateBabyfootElo(1200, 1000, 'A', 10, 5);
      expect(r.deltaA).toBe(12);
      expect(r.deltaB).toBe(-12);
      expect(r.deltaA + r.deltaB).toBe(0);
    });

    it('favori 1400 bat 1000, 10-0 → ±6', () => {
      const r = calculateBabyfootElo(1400, 1000, 'A', 10, 0);
      expect(r.deltaA).toBe(6);
      expect(r.deltaB).toBe(-6);
    });

    it('le favori extrême (2800 bat 100, 10-0) gagne ~0', () => {
      const r = calculateBabyfootElo(2800, 100, 'A', 10, 0);
      expect(r.deltaA + 0).toBe(0);
      expect(r.deltaB + 0).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Écart de BUTS : un écrasement transfère plus qu'un match serré.
  // ─────────────────────────────────────────────────────────────────────────
  describe('écart de buts (multiplicateur M)', () => {
    it('un écart de buts plus grand transfère plus de points', () => {
      const close = calculateBabyfootElo(1000, 1000, 'A', 10, 9); // Δ=1
      const crush = calculateBabyfootElo(1000, 1000, 'A', 10, 0); // Δ=10
      expect(crush.deltaA).toBeGreaterThan(close.deltaA);
    });

    it('le gain croît (au sens large) quand le score du perdant baisse', () => {
      const scores = [9, 7, 5, 3, 1, 0, -5, -10];
      let previous = -Infinity;
      for (const ls of scores) {
        const r = calculateBabyfootElo(1000, 1000, 'A', 10, ls);
        expect(r.deltaA).toBeGreaterThanOrEqual(previous);
        previous = r.deltaA;
      }
    });

    it('gamelle 10--10 à rating égal → ±48 (M=3)', () => {
      // 1200 vs 1200 : loin du plancher 975 (à 1000 la perte serait bornée à -25).
      const r = calculateBabyfootElo(1200, 1200, 'A', 10, -10);
      expect(r.deltaA).toBe(48);
      expect(r.deltaB).toBe(-48);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PLANCHER 975 & anti-farm de plancher.
  // ─────────────────────────────────────────────────────────────────────────
  describe('plancher ELO 975 (étain) et anti-farm', () => {
    it("le perdant ne descend jamais sous 975 (borne la perte)", () => {
      const r = calculateBabyfootElo(1000, 1000, 'A', 10, -10); // perte brute -48
      expect(r.newB).toBe(975);
      expect(r.deltaB).toBe(-25);
    });

    it('un rating hérité déjà sous 975 ne perd plus de points', () => {
      const r = calculateBabyfootElo(1200, 950, 'A', 10, 0);
      expect(r.deltaB).toBe(0);
      expect(r.newB).toBe(950);
    });

    it('battre un joueur au plancher (≤985) rapporte très peu', () => {
      const farm = calculateBabyfootElo(1000, 975, 'A', 10, 0);
      const normal = calculateBabyfootElo(1000, 1000, 'A', 10, 0);
      expect(farm.deltaA).toBeGreaterThanOrEqual(1);
      expect(farm.deltaA).toBeLessThanOrEqual(8);
      expect(farm.deltaA).toBeLessThan(normal.deltaA / 2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UPSETS : l'écart RÉEL de rating amplifie la perte du surcoté (non saturant).
  // ─────────────────────────────────────────────────────────────────────────
  describe('amplification des upsets (bonus proportionnel à l\'écart de rating)', () => {
    it("l'outsider qui gagne touche plus qu'un favori qui gagne (mêmes scores)", () => {
      const upset = calculateBabyfootElo(1000, 1400, 'A', 10, 5);
      const favorite = calculateBabyfootElo(1400, 1000, 'A', 10, 5);
      expect(upset.deltaA).toBeGreaterThan(favorite.deltaA);
    });

    it('plus l\'écart de rating est grand, plus le perdant perd (non saturant)', () => {
      // Au-delà de ~800 pts, l'Elo classique sature ; ici la perte continue de croître.
      const small = calculateBabyfootElo(1000, 1800, 'A', 10, 5);
      const huge = calculateBabyfootElo(1000, 6000, 'A', 10, 5);
      expect(Math.abs(huge.deltaB)).toBeGreaterThan(Math.abs(small.deltaB));
    });

    it('petit upset 900 bat 1200, 10-5 → ±53 (bonus modéré, reste symétrique)', () => {
      // baseP = round? E=0.15098, baseP=32*1.5*0.84902=40.75 ; gapBonus=300*0.04=12
      // gain = loss = round(40.75 + 12) = 53  (bonus 12 < WINNER_BONUS_CAP)
      const r = calculateBabyfootElo(900, 1200, 'A', 10, 5);
      expect(r.deltaA).toBe(53);
      expect(r.deltaB).toBe(-53);
    });

    it('gros upset 100 bat 2800, 10-0 → gagnant +114, perdant -172 (asymétrique)', () => {
      // baseP≈64 ; gapBonus=2700*0.04=108
      // gain = round(64 + min(108,50)) = 114 ; loss = round(64 + 108) = 172
      const r = calculateBabyfootElo(100, 2800, 'A', 10, 0);
      expect(r.deltaA).toBe(114);
      expect(r.deltaB).toBe(-172);
    });

    it('upset énorme 1100 bat 15000, 10-5 : le perdant prend le plafond -400', () => {
      // gapBonus=13900*0.04=556 → loss plafonnée à MAX_DELTA_PER_MATCH
      // gain = round(48 + min(556,50)) = 98
      const r = calculateBabyfootElo(1100, 15000, 'A', 10, 5);
      expect(r.deltaB).toBe(-MAX_DELTA_PER_MATCH);
      expect(r.deltaA).toBe(98);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bornes & garde-fous
  // ─────────────────────────────────────────────────────────────────────────
  describe('bornes et garde-fous', () => {
    it('aucune variation ne dépasse MAX_DELTA_PER_MATCH en magnitude', () => {
      const ratings = [100, 1000, 5000, 15000, 50000];
      const loserScores = [-10, 0, 5, 9];
      for (const ra of ratings) {
        for (const rb of ratings) {
          for (const ls of loserScores) {
            const r = calculateBabyfootElo(ra, rb, 'A', 10, ls);
            expect(Math.abs(r.deltaA)).toBeLessThanOrEqual(MAX_DELTA_PER_MATCH);
            expect(Math.abs(r.deltaB)).toBeLessThanOrEqual(MAX_DELTA_PER_MATCH);
          }
        }
      }
    });

    it('le gain du gagnant ne dépasse jamais baseP + WINNER_BONUS_CAP (hors plafond global)', () => {
      // 100 bat 2800 10-0 : baseP≈64, cap bonus 50 → gain ≤ 114
      const r = calculateBabyfootElo(100, 2800, 'A', 10, 0);
      expect(r.deltaA).toBeLessThanOrEqual(64 + WINNER_BONUS_CAP);
    });

    it('le perdant perd toujours au moins autant que le gagnant ne gagne (upset)', () => {
      const r = calculateBabyfootElo(100, 2800, 'A', 10, 0);
      expect(Math.abs(r.deltaB)).toBeGreaterThanOrEqual(r.deltaA);
    });

    it('aucun NaN ni Infinity pour des ratings extrêmes', () => {
      const extremes = [0, 1, 100, 2800, 5000, 10000, 50000];
      for (const ra of extremes) {
        for (const rb of extremes) {
          const r = calculateBabyfootElo(ra, rb, 'A', 10, 0);
          expect(Number.isFinite(r.deltaA)).toBe(true);
          expect(Number.isFinite(r.deltaB)).toBe(true);
          expect(Number.isFinite(r.newA)).toBe(true);
          expect(Number.isFinite(r.newB)).toBe(true);
        }
      }
    });

    it('les deltas sont des entiers', () => {
      const ratings = [100, 1000, 1300, 2500, 15000];
      for (const ra of ratings) {
        for (const rb of ratings) {
          const r = calculateBabyfootElo(ra, rb, 'A', 10, 3);
          expect(Number.isInteger(r.deltaA)).toBe(true);
          expect(Number.isInteger(r.deltaB)).toBe(true);
        }
      }
    });

    it('newA et newB cohérents avec les deltas sur une large matrice', () => {
      const ratings = [100, 800, 1000, 1500, 2800, 15000];
      const loserScores = [-10, -1, 0, 5, 9];
      for (const ra of ratings) {
        for (const rb of ratings) {
          for (const ls of loserScores) {
            const r = calculateBabyfootElo(ra, rb, 'A', 10, ls);
            expect(r.newA).toBe(ra + r.deltaA);
            expect(r.newB).toBe(rb + r.deltaB);
          }
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Symétrie A/B : le vrai gagnant obtient le même résultat quel que soit son label.
  // ─────────────────────────────────────────────────────────────────────────
  describe('symétrie A/B', () => {
    const cases: Array<[number, number, number]> = [
      [1000, 1000, 5],
      [1200, 1000, 0],
      [1000, 1400, 5],
      [800, 1600, 9],
      [2800, 100, 0],
      [100, 2800, -10],
      [1500, 1500, 7],
    ];

    for (const [a, b, s] of cases) {
      it(`(${a},${b},'A',10,${s}) ↔ (${b},${a},'B',${s},10)`, () => {
        const left = calculateBabyfootElo(a, b, 'A', 10, s);
        const right = calculateBabyfootElo(b, a, 'B', s, 10);
        expect(left.deltaA).toBe(right.deltaB);
        expect(left.deltaB).toBe(right.deltaA);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Constantes
  // ─────────────────────────────────────────────────────────────────────────
  describe('constantes du module', () => {
    it('K vaut 32', () => expect(K).toBe(32));
    it('DEFAULT_ELO vaut 1000', () => expect(DEFAULT_ELO).toBe(1000));
    it('UPSET_GAP_COEFF vaut 0.04', () => expect(UPSET_GAP_COEFF).toBe(0.04));
    it('WINNER_BONUS_CAP vaut 50', () => expect(WINNER_BONUS_CAP).toBe(50));
    it('MAX_DELTA_PER_MATCH vaut 400', () => expect(MAX_DELTA_PER_MATCH).toBe(400));
  });
});
