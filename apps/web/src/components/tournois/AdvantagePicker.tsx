/**
 * AdvantagePicker — le gagnant du pile-ou-face choisit son avantage (adapté au jeu).
 *
 * Aucune config `games` importée ici : l'objet `advantage` (label/options/
 * complementary) est fourni par le parent, tout comme `t`.
 *
 *  - `isWinner && !pick`  → grille d'options cliquables (icon + label) → onPick.
 *  - `pick` renseigné     → résumé « Tu prends X » (+ « adversaire prend l'autre »
 *                           si complementary), du point de vue du joueur courant.
 *  - `!isWinner && !pick`  → « {name} choisit son avantage… ».
 */
import { motion } from 'framer-motion';

export interface AdvantagePickerProps {
  advantage: {
    label: string;
    options: { key: string; label: string; icon: string }[];
    complementary: boolean;
  };
  isWinner: boolean;
  pick: string | null;
  opponentName: string;
  onPick: (key: string) => void;
  t: (k: string) => string;
}

export default function AdvantagePicker({
  advantage,
  isWinner,
  pick,
  opponentName,
  onPick,
  t,
}: AdvantagePickerProps) {
  const chosen = pick ? advantage.options.find((o) => o.key === pick) ?? null : null;
  // L'option complémentaire qui revient à l'adversaire (si applicable).
  const other =
    advantage.complementary && pick
      ? advantage.options.find((o) => o.key !== pick) ?? null
      : null;

  // ── Avantage déjà choisi : résumé ───────────────────────────────────────────
  if (pick) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 py-2 text-center"
      >
        {isWinner ? (
          <p className="text-sm font-extrabold text-text">
            <span className="text-lg me-1">{chosen?.icon}</span>
            {t('tourn.duel.youGet').replace('{label}', chosen?.label ?? pick)}
          </p>
        ) : (
          <p className="text-sm font-extrabold text-text">
            {t('tourn.duel.opponentGets')
              .replace('{name}', opponentName)
              .replace('{label}', chosen?.label ?? pick)}
          </p>
        )}

        {other && (
          <p className="text-xs text-muted-2">
            <span className="me-1">{other.icon}</span>
            {isWinner
              ? t('tourn.duel.opponentGets')
                  .replace('{name}', opponentName)
                  .replace('{label}', other.label)
              : t('tourn.duel.youGet').replace('{label}', other.label)}
          </p>
        )}
      </motion.div>
    );
  }

  // ── En attente du choix de l'adversaire ─────────────────────────────────────
  if (!isWinner) {
    return (
      <p className="text-xs uppercase tracking-wider text-muted-2 animate-pulse text-center py-2">
        {t('tourn.duel.waitingPick').replace('{name}', opponentName)}
      </p>
    );
  }

  // ── À nous de choisir : grille d'options ────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <p className="text-xs uppercase tracking-wider text-gold font-extrabold">
        {t('tourn.duel.yourPick')}
      </p>
      <p className="text-[11px] text-muted-2 text-center">{advantage.label}</p>

      <div className="flex flex-wrap justify-center gap-2">
        {advantage.options.map((o) => (
          <motion.button
            key={o.key}
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => onPick(o.key)}
            className="flex flex-col items-center gap-1 rounded-xl px-4 py-3 min-w-[88px]
              bg-card border border-border text-text
              transition-all duration-150
              hover:border-gold/60 hover:bg-gold/5 hover:shadow-[inset_0_0_0_1px_rgba(255,201,74,0.2)]"
          >
            <span className="text-2xl leading-none">{o.icon}</span>
            <span className="text-[11px] font-bold uppercase tracking-wide">{o.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
