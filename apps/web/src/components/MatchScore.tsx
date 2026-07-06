import type { Game } from '../lib/api';
import { GAME_META } from '../lib/gameMeta';
import { GAME_EMOJI } from '../lib/gameVisuals';

/**
 * ─── MatchScore — Atomic Design ─────────────────────────────────────────────
 *
 * Brique réutilisable d'affichage d'un résultat de match.
 * Encapsule la logique par discipline :
 *  - Babyfoot  : "10-4" (score numérique, gagnant en or)
 *  - Smash     : "2-1 Bo3" (games du set, persos si dispo)
 *  - Échecs    : pill "Victoire" / "Défaite" (pas de score brut 1-0)
 *
 * Usage :
 *   <MatchScore
 *     game="chess"
 *     winnerScore={1}
 *     loserScore={0}
 *     myPerspective="win" | "loss"
 *   />
 */

export type MatchPerspective = 'win' | 'loss' | 'draw';

interface MatchScoreProps {
  game?: Game;
  winnerScore: number;
  loserScore: number;
  /** Perspective du joueur qui consulte : 'win' si il a gagné, 'loss' sinon. */
  myPerspective: MatchPerspective;
  /** Format du set Smash (Bo3/Bo5) */
  bestOf?: number | null;
  /** Pour le mode liste compacte */
  compact?: boolean;
}

// ─── Icône de jeu ─────────────────────────────────────────────────────────────

export function GameIcon({ game, size = 'sm' }: { game?: Game; size?: 'xs' | 'sm' | 'md' }) {
  const cls = size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base';
  if (!game || game === 'babyfoot') return null; // babyfoot = défaut, pas d'icône
  return (
    <span className={`${cls} leading-none opacity-80 flex-shrink-0`} title={game}>
      {game === 'smash' ? '🎮' : game === 'streetfighter' ? '🥊' : GAME_EMOJI[game]}
    </span>
  );
}

// ─── Pill de discipline ────────────────────────────────────────────────────────
// Affichée pour TOUTES les disciplines (babyfoot inclus), colorée à la couleur du
// mode de jeu (source de vérité : GAME_META). L'encart marque le label de la partie.

export function GamePill({ game }: { game?: Game }) {
  const g = game ?? 'babyfoot';
  const meta = GAME_META[g];
  if (!meta) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-[0.12em] border leading-none"
      style={{ color: meta.color, backgroundColor: meta.bgColor, borderColor: `${meta.color}40` }}
    >
      <span aria-hidden>{GAME_EMOJI[g]}</span>
      {meta.label}
    </span>
  );
}

// ─── Score principal ───────────────────────────────────────────────────────────

export function MatchScore({ game, winnerScore, loserScore, myPerspective, bestOf, compact = false }: MatchScoreProps) {
  const won = myPerspective === 'win';
  const draw = myPerspective === 'draw';

  // ── Binaire (échecs / coding / pokémon) : pill lisible (Victoire / Nulle /
  // Défaite), pas de score chiffré. La nulle n'apparaît qu'aux échecs. ──────────
  if (game === 'chess' || game === 'coding' || game === 'pokemon') {
    const emoji = GAME_EMOJI[game];
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span
          className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border leading-none ${
            draw
              ? 'bg-gold/10 border-gold/30 text-gold'
              : won
                ? 'bg-teal/10 border-teal/30 text-teal'
                : 'bg-red/10 border-red/30 text-red'
          }`}
        >
          {draw ? `${emoji} Nulle` : won ? `${emoji} Victoire` : `${emoji} Défaite`}
        </span>
      </div>
    );
  }

  // ── Smash / Street Fighter : "W-L Bo3/Bo5" ────────────────────────────────
  if (game === 'smash' || game === 'streetfighter') {
    const myGames = won ? winnerScore : loserScore;
    const oppGames = won ? loserScore : winnerScore;
    const boLabel = bestOf ? ` Bo${bestOf}` : '';
    return (
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="font-display font-black tabular-nums text-[13px]">
          <span className={won ? 'text-teal' : 'text-text-strong'}>{myGames}</span>
          <span className="text-muted opacity-50 mx-0.5">-</span>
          <span className={won ? 'text-text-strong' : 'text-red'}>{oppGames}</span>
        </span>
        {boLabel && !compact && (
          <span className="text-[9px] text-muted-2 font-mono font-bold">{boLabel}</span>
        )}
      </div>
    );
  }

  // ── Babyfoot : score numérique classique ───────────────────────────────────
  const myScore = won ? winnerScore : loserScore;
  const oppScore = won ? loserScore : winnerScore;
  return (
    <div className="font-display font-black tabular-nums text-[13px] flex-shrink-0">
      <span className={won ? 'text-teal' : 'text-text-strong'}>{myScore}</span>
      <span className="text-muted opacity-50 mx-0.5">–</span>
      <span className={won ? 'text-text-strong' : 'text-red'}>{oppScore}</span>
    </div>
  );
}
