import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Crown } from 'lucide-react';
import { SmashCharIcon } from '../../../components/SmashCharIcon';
import { SfCharIcon } from '../../../components/SfCharIcon';
import { SMASH_ROSTER } from '../../../lib/smash';
import { SF_ROSTER } from '../../../lib/sf';
import { mostPlayedChars, type FightingGame } from '../../../lib/chars';
import { useLeagueData } from '../../../hooks/useLeagueData';
import { useT } from '../../../lib/i18n';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { CharPicker, PerGameCharsEditor, type PerGameChars } from './CharPicker';

// Accent par discipline — calque les overrides `--accent-gold` de index.css pour que
// tout le bloc se thème en rouge (Smash) ou orange (Street Fighter) via les classes
// `*-gold`, indépendamment du mode de jeu AMBIANT (utile quand on enregistre un défi
// d'une autre discipline que son mode courant). Une seule source de vérité couleur.
const ACCENT_VARS: Record<FightingGame, CSSProperties> = {
  smash: {
    '--accent-gold': '255 77 92',
    '--accent-gold-dim': '214 54 70',
    '--accent-gold-deep': '120 26 34',
  } as CSSProperties,
  streetfighter: {
    '--accent-gold': '255 122 24',
    '--accent-gold-dim': '214 100 18',
    '--accent-gold-deep': '120 56 8',
  } as CSSProperties,
};

// Lueur thémée par l'accent courant (les ombres Tailwind `shadow-gold-glow` sont
// figées en jaune → on glow via la var pour rester dans la couleur de discipline).
const accentGlow = (alpha: number, radius = 24) =>
  `0 0 ${radius}px rgb(var(--accent-gold) / ${alpha})`;

/** Résultat d'un set, prêt à être envoyé à l'API (declareMatch / recordChallengeResult). */
export interface SmashSetValue {
  bestOf: 3 | 5;
  /** Games gagnés par le déclarant / l'adversaire (le gagnant atteint la cible). */
  scoreSelf: number;
  scoreOpponent: number;
  /** Persos joués — optionnels (encodés par-manche si détaillés). `undefined` si non saisis. */
  charSelf?: string;
  charOpponent?: string;
}

interface SmashSetEditorProps {
  game: FightingGame;
  /** Issue déjà choisie par le parent (victoire = true). Pilote le camp gagnant/perdant. */
  iWon: boolean;
  myLogin?: string;
  oppLogin: string;
  myFavorites?: string[];
  oppFavorites?: string[];
  /** Remonte la config complète du set à chaque changement. */
  onChange: (value: SmashSetValue) => void;
}

/**
 * Saisie d'un set Smash / Street Fighter — composant unique partagé par les trois
 * points d'entrée (« déclarer une game » desktop+mobile, « saisir un score » d'un
 * défi desktop+mobile).
 *
 * Philosophie : *score d'abord* (progressive disclosure). Par défaut on ne saisit
 * que le résultat du set (format + score) → un 2-0 se déclare sans le moindre clic
 * supplémentaire. Les personnages sont OPTIONNELS et se déplient à la demande :
 * d'abord le sien, puis celui de l'adversaire (2ᵉ perso), et enfin, pour les
 * tryhards, un perso différent par manche. Pas de « vies ».
 */
export function SmashSetEditor({
  game,
  iWon,
  myLogin,
  oppLogin,
  myFavorites = [],
  oppFavorites = [],
  onChange,
}: SmashSetEditorProps) {
  const t = useT();
  const { matches } = useLeagueData();
  const isSf = game === 'streetfighter';
  const roster = isSf ? SF_ROSTER : SMASH_ROSTER;
  const CharIcon = isSf ? SfCharIcon : SmashCharIcon;
  const meLabel = myLogin ?? t('defis.me');

  const [bestOf, setBestOf] = useState<3 | 5>(3);
  const [loserGames, setLoserGames] = useState(0);
  const [charSelf, setCharSelf] = useState<string | null>(null);
  const [charOpp, setCharOpp] = useState<string | null>(null);
  // Disclosure des persos : repliés par défaut (« juste le score »).
  const [showChars, setShowChars] = useState(false);
  // Un seul picker ouvert à la fois (le mien ou celui de l'adversaire).
  const [activeSide, setActiveSide] = useState<'self' | 'opp' | null>(null);
  const [perGameChars, setPerGameChars] = useState<PerGameChars | null>(null);

  const target = Math.ceil(bestOf / 2);
  const totalGames = target + loserGames;

  const winnerLabel = iWon ? meLabel : oppLogin;
  const loserLabel = iWon ? oppLogin : meLabel;

  // Persos les plus joués (moi / adversaire) → remontés en tête de la grille.
  const myMostPlayed = useMemo(() => mostPlayedChars(matches, myLogin, game), [matches, myLogin, game]);
  const oppMostPlayed = useMemo(() => mostPlayedChars(matches, oppLogin, game), [matches, oppLogin, game]);

  // Remonte la valeur calculée au parent à chaque changement. Le perso final est
  // soit l'unique sélectionné, soit la liste encodée par-manche si elle est active.
  useEffect(() => {
    const cs = perGameChars ? perGameChars.self || charSelf : charSelf;
    const co = perGameChars ? perGameChars.opp || charOpp : charOpp;
    onChange({
      bestOf,
      scoreSelf: iWon ? target : loserGames,
      scoreOpponent: iWon ? loserGames : target,
      charSelf: cs ?? undefined,
      charOpponent: co ?? undefined,
    });
    // onChange est un setter stable côté parent → exclu des deps volontairement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestOf, loserGames, charSelf, charOpp, perGameChars, iWon, target]);

  const pickBestOf = (bo: 3 | 5) => {
    haptic('selection');
    setBestOf(bo);
    setLoserGames((g) => Math.min(g, Math.ceil(bo / 2) - 1));
  };
  const pickLoser = (g: number) => {
    haptic('selection');
    setLoserGames(g);
  };
  const openChars = () => {
    haptic('selection');
    setShowChars(true);
    setActiveSide('self');
  };
  const clearChars = () => {
    haptic('selection');
    setShowChars(false);
    setActiveSide(null);
    setCharSelf(null);
    setCharOpp(null);
  };

  return (
    <div style={ACCENT_VARS[game]} className="space-y-4">
      {/* ── Format : segmented control à indicateur glissant (spring) ─────────── */}
      <div className="flex gap-1 p-1 rounded-xl bg-bg-1/70 border border-border">
        {([3, 5] as const).map((bo) => {
          const on = bestOf === bo;
          return (
            <button
              key={bo}
              type="button"
              onClick={() => pickBestOf(bo)}
              className={`relative flex-1 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-colors tap-transparent ${
                on ? 'text-gold' : 'text-muted-2 hover:text-gold/70'
              }`}
            >
              {on && (
                <motion.span
                  layoutId="smashset-bo-ind"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                  className="absolute inset-0 rounded-lg bg-gold/15 border border-gold/40"
                />
              )}
              <span className="relative z-10">Bo{bo}</span>
            </button>
          );
        })}
      </div>

      {/* ── Score héro : gagnant verrouillé sur la cible · perdant ajustable ──── */}
      <div className="rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/[0.07] to-transparent px-4 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <ScoreSide label={winnerLabel} value={target} accent sublabel={t('defis.winnerTarget')} />
          <span className="font-display text-2xl font-black text-muted-2 leading-none">–</span>
          <ScoreSide label={loserLabel} value={loserGames} />
        </div>
      </div>

      {/* ── Manches concédées par le perdant (0 … cible-1) ───────────────────── */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-2">
          {t('defis.gamesOf')} {loserLabel} {t('defis.loserSuffix')}
        </label>
        <div className="flex gap-2">
          {Array.from({ length: target }, (_, g) => {
            const on = loserGames === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => pickLoser(g)}
                style={on ? { boxShadow: accentGlow(0.28, 18) } : undefined}
                className={`flex-1 py-2.5 rounded-lg border font-display font-black tabular-nums text-lg transition-all active:scale-[0.96] tap-transparent ${
                  on
                    ? 'border-gold/50 bg-gold/15 text-gold'
                    : 'border-border bg-bg-2/40 text-muted-2 hover:border-gold/30'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Persos (optionnel · progressive disclosure) ──────────────────────── */}
      {!showChars ? (
        <button
          type="button"
          onClick={openChars}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gold/40 bg-gold/[0.04] text-gold text-xs font-extrabold uppercase tracking-wide transition-all hover:bg-gold/10 active:scale-[0.99] tap-transparent"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          {t('defis.addChars')}
          <span className="text-[10px] font-bold text-gold/60 normal-case tracking-normal">· {t('defis.optional')}</span>
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted font-bold">
              {t('defis.charsTitle')}{' '}
              <span className="text-muted-2 font-medium normal-case tracking-normal">· {t('defis.optional')}</span>
            </span>
            <button
              type="button"
              onClick={clearChars}
              className="text-[10px] font-bold text-muted-2 hover:text-text transition-colors tap-transparent"
            >
              {t('defis.clear')}
            </button>
          </div>

          {/* Affrontement : deux slots persos cliquables (moi · VS · adversaire). */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <FighterSlot
              char={charSelf}
              label={t('defis.yourChar')}
              active={activeSide === 'self'}
              onClick={() => setActiveSide((s) => (s === 'self' ? null : 'self'))}
              Icon={CharIcon}
            />
            <span className="font-display text-[11px] font-black uppercase tracking-[0.2em] text-muted-2">VS</span>
            <FighterSlot
              char={charOpp}
              label={oppLogin}
              active={activeSide === 'opp'}
              onClick={() => setActiveSide((s) => (s === 'opp' ? null : 'opp'))}
              Icon={CharIcon}
            />
          </div>

          {/* Picker inline du camp actif (animé). */}
          <AnimatePresence initial={false} mode="wait">
            {activeSide && (
              <motion.div
                key={activeSide}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border border-gold/25 bg-gold/[0.04] p-3"
              >
                <CharPicker
                  label={activeSide === 'self' ? t('defis.yourChar') : `${t('defis.charOf')} ${oppLogin}`}
                  value={activeSide === 'self' ? charSelf : charOpp}
                  onChange={(id) => {
                    haptic('selection');
                    if (activeSide === 'self') {
                      setCharSelf(id);
                      // Après MON perso, on invite naturellement à choisir celui de l'adversaire.
                      setActiveSide(charOpp ? null : 'opp');
                    } else {
                      setCharOpp(id);
                      setActiveSide(null);
                    }
                  }}
                  roster={roster}
                  Icon={CharIcon}
                  favorites={activeSide === 'self' ? myFavorites : oppFavorites}
                  favoritesLabel={t('favorites.label')}
                  mostPlayed={activeSide === 'self' ? myMostPlayed : oppMostPlayed}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Persos différents selon la manche — pour les tryhards (≥ 2 manches + 2 persos). */}
          <PerGameCharsEditor
            totalGames={totalGames}
            defaultSelf={charSelf}
            defaultOpp={charOpp}
            roster={roster}
            Icon={CharIcon}
            myFavorites={myFavorites}
            oppFavorites={oppFavorites}
            myMostPlayed={myMostPlayed}
            oppMostPlayed={oppMostPlayed}
            oppLabel={oppLogin}
            onChange={setPerGameChars}
          />
        </motion.div>
      )}
    </div>
  );
}

/** Un camp du score héro (gagnant doré thémé + couronne · perdant neutre). */
function ScoreSide({
  label,
  value,
  accent,
  sublabel,
}: {
  label: string;
  value: number;
  accent?: boolean;
  sublabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] font-extrabold text-muted truncate max-w-full">
        {accent && <Crown className="w-3 h-3 text-gold shrink-0" strokeWidth={2.5} />}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`font-display font-black tabular-nums leading-none text-5xl ${accent ? 'text-gold' : 'text-text-strong'}`}
        style={accent ? { textShadow: accentGlow(0.45) } : undefined}
      >
        {value}
      </span>
      {accent && sublabel && (
        <span className="text-[8px] font-extrabold uppercase tracking-wider text-gold/55">{sublabel}</span>
      )}
    </div>
  );
}

/** Slot perso cliquable : portrait choisi, ou cible en pointillés à remplir. */
function FighterSlot({
  char,
  label,
  active,
  onClick,
  Icon,
}: {
  char: string | null;
  label: string;
  active: boolean;
  onClick: () => void;
  Icon: typeof SmashCharIcon;
}) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1.5 tap-transparent">
      <div
        className={`relative w-16 h-16 rounded-xl grid place-items-center transition-all ${
          active ? 'ring-2 ring-gold scale-105' : char ? 'ring-1 ring-border' : 'border-2 border-dashed border-gold/40'
        }`}
        style={active ? { boxShadow: accentGlow(0.35, 18) } : undefined}
      >
        {char ? (
          <Icon id={char} size={64} className="w-16 h-16 rounded-xl" />
        ) : (
          <Plus className="w-6 h-6 text-gold/70 group-hover:text-gold transition-colors" strokeWidth={2.5} />
        )}
      </div>
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-2 truncate max-w-[5.5rem]">{label}</span>
    </button>
  );
}
