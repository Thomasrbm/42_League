import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { SmashCharIcon } from '../../../components/SmashCharIcon';
import { filterRoster, encodeChars } from '../../../lib/chars';
import { useT } from '../../../lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Sélection de personnage (Smash / Street Fighter), partagée par les deux flux de
// déclaration (carte/sheet « déclarer une game » et sheet « résultat d'un défi »).
//
// Par défaut un joueur choisit UN perso pour tout le set. `PerGameCharsEditor`
// ajoute, en option, un détail PAR MANCHE — encodé dans le même champ via
// `encodeChars` (cf. lib/chars.ts), sans migration ni nouveau champ.
// ─────────────────────────────────────────────────────────────────────────────

/** Grille de sélection d'un personnage avec favoris épinglés + recherche. */
export function CharPicker({
  label,
  value,
  onChange,
  roster,
  Icon,
  favorites = [],
  favoritesLabel,
  mostPlayed = [],
}: {
  label: string;
  value: string | null;
  onChange: (id: string) => void;
  roster: { id: string; name: string }[];
  Icon: typeof SmashCharIcon;
  /** Ids épinglés en haut (mes favoris / ceux de l'adversaire). */
  favorites?: string[];
  favoritesLabel?: string;
  /** Ids triés du plus joué au moins joué : remontés en tête de la grille. */
  mostPlayed?: string[];
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  // Ordre de la grille : les persos les plus joués d'abord (en haut à gauche),
  // puis le reste du roster dans son ordre d'origine. Le tri est stable, donc
  // les ex æquo gardent l'ordre du roster.
  const playedRank = new Map(mostPlayed.map((id, i) => [id, i]));
  const shown = [...filterRoster(roster, query)].sort(
    (a, b) =>
      (playedRank.get(a.id) ?? Infinity) - (playedRank.get(b.id) ?? Infinity),
  );
  const cell = (c: { id: string; name: string }) => (
    <button
      key={c.id}
      type="button"
      onClick={() => onChange(c.id)}
      title={c.name}
      className={`rounded-lg transition-all ${
        value === c.id
          ? 'ring-2 ring-gold scale-105'
          : 'opacity-75 hover:opacity-100 ring-1 ring-transparent'
      }`}
    >
      <Icon id={c.id} size={40} className="w-full aspect-square" />
    </button>
  );
  // Favoris connus du roster (ignore les ids obsolètes).
  const favCells = favorites
    .map((id) => roster.find((c) => c.id === id))
    .filter((c): c is { id: string; name: string } => !!c);
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-2">{label}</label>
      {favCells.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-wider text-gold font-bold mb-1">
            {favoritesLabel ?? 'Favoris'}
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 p-1 rounded-lg bg-gold/[0.06] border border-gold/25">
            {favCells.map(cell)}
          </div>
        </div>
      )}
      {/* Recherche / filtre par nom de perso */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-2 pointer-events-none" strokeWidth={2.5} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('favorites.search')}
          className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-bg-1/60 border border-border/60 focus:border-gold outline-none transition-colors"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="×"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded text-muted-2 hover:text-text">
            <X className="w-3 h-3" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="py-5 text-center text-[11px] text-muted-2">{t('favorites.noResult')}</div>
      ) : (
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-44 overflow-y-auto scrollbar-none p-1 rounded-lg bg-bg-1/50 border border-border/50">
          {shown.map(cell)}
        </div>
      )}
    </div>
  );
}

/** Petite tuile perso d'une manche — ouvre l'éditeur de cette manche au clic. */
function SlotTile({
  char,
  active,
  onClick,
  Icon,
}: {
  char: string | undefined;
  active: boolean;
  onClick: () => void;
  Icon: typeof SmashCharIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg p-0.5 border transition-all ${
        active
          ? 'border-gold ring-1 ring-gold scale-105'
          : 'border-border/60 hover:border-gold/50'
      }`}
    >
      {char ? (
        <Icon id={char} size={28} className="block" />
      ) : (
        <div className="w-7 h-7 grid place-items-center text-muted-2 text-xs">?</div>
      )}
    </button>
  );
}

/** Persos encodés par-manche (cf. encodeChars), ou null si « par manche » désactivé. */
export interface PerGameChars {
  self: string;
  opp: string;
}

/**
 * Éditeur OPTIONNEL des persos par manche. Affiché sous les deux sélecteurs « par
 * défaut » dès qu'il y a ≥ 2 manches. Désactivé → `onChange(null)` (le perso unique
 * s'applique partout). Activé → `onChange({ self, opp })` avec les listes encodées.
 */
export function PerGameCharsEditor({
  totalGames,
  defaultSelf,
  defaultOpp,
  roster,
  Icon,
  myFavorites = [],
  oppFavorites = [],
  myMostPlayed = [],
  oppMostPlayed = [],
  oppLabel,
  onChange,
}: {
  totalGames: number;
  defaultSelf: string | null;
  defaultOpp: string | null;
  roster: { id: string; name: string }[];
  Icon: typeof SmashCharIcon;
  myFavorites?: string[];
  oppFavorites?: string[];
  myMostPlayed?: string[];
  oppMostPlayed?: string[];
  oppLabel: string;
  onChange: (chars: PerGameChars | null) => void;
}) {
  const t = useT();
  const [perGame, setPerGame] = useState(false);
  const [gamesSelf, setGamesSelf] = useState<string[]>([]);
  const [gamesOpp, setGamesOpp] = useState<string[]>([]);
  const [editSlot, setEditSlot] = useState<{ g: number; side: 'self' | 'opp' } | null>(null);

  // (Re)synchronise les listes : chaque manche démarre sur le perso par défaut, et
  // on ajuste la taille quand le format / nombre de manches change.
  useEffect(() => {
    if (!perGame) {
      setEditSlot(null);
      return;
    }
    setGamesSelf((prev) => Array.from({ length: totalGames }, (_, i) => prev[i] || defaultSelf || ''));
    setGamesOpp((prev) => Array.from({ length: totalGames }, (_, i) => prev[i] || defaultOpp || ''));
    setEditSlot((s) => (s && s.g >= totalGames ? null : s));
  }, [perGame, totalGames, defaultSelf, defaultOpp]);

  // Remonte la valeur encodée (ou null) au parent.
  useEffect(() => {
    if (!perGame) onChange(null);
    else onChange({ self: encodeChars(gamesSelf), opp: encodeChars(gamesOpp) });
    // onChange est un setter stable côté parent → exclu des deps volontairement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perGame, gamesSelf, gamesOpp]);

  // Désactivé tant que les persos par défaut ne sont pas choisis, ou < 2 manches.
  if (totalGames < 2 || !defaultSelf || !defaultOpp) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-bg-1/40 p-3">
      <button
        type="button"
        onClick={() => setPerGame((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="text-[11px] font-extrabold text-text-strong">🎭 Persos différents selon la manche ?</span>
        <span
          className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            perGame ? 'border-gold/50 bg-gold/10 text-gold' : 'border-border bg-bg-2/40 text-muted-2'
          }`}
        >
          {perGame ? 'Activé' : 'Même perso partout'}
        </span>
      </button>

      {perGame && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] text-muted-2 leading-snug">Touche un perso pour le changer sur cette manche.</p>
          {Array.from({ length: totalGames }, (_, gi) => (
            <div key={gi} className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted w-16 shrink-0">
                Manche {gi + 1}
              </span>
              <SlotTile
                char={gamesSelf[gi]}
                active={editSlot?.g === gi && editSlot.side === 'self'}
                onClick={() => setEditSlot({ g: gi, side: 'self' })}
                Icon={Icon}
              />
              <span className="text-[10px] font-bold text-muted-2">vs</span>
              <SlotTile
                char={gamesOpp[gi]}
                active={editSlot?.g === gi && editSlot.side === 'opp'}
                onClick={() => setEditSlot({ g: gi, side: 'opp' })}
                Icon={Icon}
              />
            </div>
          ))}

          {editSlot && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <CharPicker
                label={`Manche ${editSlot.g + 1} · ${
                  editSlot.side === 'self' ? t('defis.yourChar') : `${t('defis.charOf')} ${oppLabel}`
                }`}
                value={editSlot.side === 'self' ? gamesSelf[editSlot.g] ?? null : gamesOpp[editSlot.g] ?? null}
                onChange={(id) => {
                  const { g, side } = editSlot;
                  if (side === 'self') setGamesSelf((a) => a.map((x, i) => (i === g ? id : x)));
                  else setGamesOpp((a) => a.map((x, i) => (i === g ? id : x)));
                }}
                roster={roster}
                Icon={Icon}
                favorites={editSlot.side === 'self' ? myFavorites : oppFavorites}
                favoritesLabel={t('favorites.label')}
                mostPlayed={editSlot.side === 'self' ? myMostPlayed : oppMostPlayed}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
