import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef, useState } from 'react';

export const INFINITE_COIN_LOGINS = new Set(['abidaux', 'throbert']);

export function hasInfiniteCoins(login?: string | null): boolean {
  return !!login && INFINITE_COIN_LOGINS.has(login.toLowerCase());
}

export function CoinCount({
  login,
  value,
  className = '',
}: {
  login?: string | null;
  value: number;
  className?: string;
}) {
  const gains = useCoinGains(value);
  return (
    <span className="relative inline-flex items-center">
      {hasInfiniteCoins(login) ? (
        <InfiniteGlyph className={className} />
      ) : (
        <span className={`tabular-nums ${className}`}>{value}</span>
      )}
      <CoinGains gains={gains} />
    </span>
  );
}

// ── Animation « +N » au gain de coins ────────────────────────────────────────
// Détecte chaque AUGMENTATION du solde et empile une bulle « +montant » qui
// monte à droite du nombre puis s'estompe. Ignore le montage initial et les
// baisses (achats) — feedback uniquement quand on gagne.

interface CoinGain {
  id: number;
  amount: number;
}

function useCoinGains(value: number): CoinGain[] {
  const prev = useRef<number | null>(null);
  const idRef = useRef(0);
  const [gains, setGains] = useState<CoinGain[]>([]);

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === null || value <= before) return;
    const id = (idRef.current += 1);
    const amount = value - before;
    setGains((g) => [...g, { id, amount }]);
    const tm = setTimeout(() => setGains((g) => g.filter((x) => x.id !== id)), 1100);
    return () => clearTimeout(tm);
  }, [value]);

  return gains;
}

function CoinGains({ gains }: { gains: CoinGain[] }) {
  return (
    <span className="absolute left-full top-1/2 ms-1.5 -translate-y-1/2 pointer-events-none select-none">
      <AnimatePresence>
        {gains.map((g) => (
          <motion.span
            key={g.id}
            initial={{ opacity: 0, y: 2, scale: 0.7 }}
            animate={{ opacity: 1, y: -16, scale: 1 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="absolute left-0 top-0 whitespace-nowrap font-gaming text-xs font-extrabold tabular-nums text-gold"
            style={{ textShadow: '0 0 8px rgba(255,201,74,0.8)' }}
          >
            +{g.amount}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

// ── Tracé du ∞ ──────────────────────────────────────────────────────────────
// Lemniscate propre : deux lobes miroir qui se croisent net au centre (100,50)
// dans un espace 200×100. Un seul sous-tracé continu → pas de couture, le glint
// peut faire le tour complet sans rupture.
const INF_PATH =
  'M 100 50 C 76 16, 26 16, 26 50 C 26 84, 76 84, 100 50 C 124 16, 174 16, 174 50 C 174 84, 124 84, 100 50 Z';

// Longueur LOGIQUE imposée via `pathLength` : le navigateur remappe tout le
// calcul de pointillés dessus → le glint qui parcourt le ∞ boucle pile.
const L = 490;
const DUR = 3.4; // secondes par tour complet

// Glints : courtes traînées blanches qui balaient le ruban, décalées d'un
// demi-tour pour un équilibre gauche/droite.
const GLINTS = [
  { len: 46, delay: 0 },
  { len: 30, delay: -DUR / 2 },
];

// Points lumineux en orbite autour du glyphe (remplacent les anciennes étoiles).
const ORBITS = [
  { r: '0.9em', size: '0.16em', dur: 5.5, dir: 1, color: '#c084fc', shadow: 'rgba(192,132,252,0.95)' },
  { r: '0.72em', size: '0.12em', dur: 4, dir: -1, color: '#f472b6', shadow: 'rgba(244,114,182,0.95)' },
  { r: '1.02em', size: '0.1em', dur: 7, dir: 1, color: '#818cf8', shadow: 'rgba(129,140,248,0.95)' },
];

function InfiniteGlyph({ className = '' }: { className?: string }) {
  // IDs uniques par instance → pas de collision de <defs> entre plusieurs glyphes.
  const uid = useId().replace(/:/g, '');
  const sheenId = `sheen-${uid}`;
  const glowId = `glow-${uid}`;

  return (
    <motion.span
      className={`relative inline-flex items-center justify-center align-middle leading-none font-black ${className}`}
      style={{ fontSize: '1.7em' }}
      animate={{ scale: [1, 1.05, 1], y: [0, -0.8, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      aria-label="solde illimité"
      title="Solde illimité — accès fondateur"
    >
      <svg
        viewBox="0 0 200 100"
        width="1.9em"
        height="0.95em"
        aria-hidden
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Arc-en-ciel ancré VIOLET (la couleur des League Coins), élargi
              bleu→indigo→violet→fuchsia→rose. Il FLUE le long du ruban :
              userSpaceOnUse + spreadMethod=repeat + translate animé sur une
              largeur de tuile (80) → écoulement sans couture. */}
          <linearGradient
            id={sheenId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="80"
            y2="0"
            spreadMethod="repeat"
          >
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="14%" stopColor="#818cf8" />
            <stop offset="28%" stopColor="#a78bfa" />
            <stop offset="42%" stopColor="#c084fc" />
            <stop offset="56%" stopColor="#e879f9" />
            <stop offset="70%" stopColor="#f472b6" />
            <stop offset="85%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#60a5fa" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="0 0"
              to="80 0"
              dur={`${DUR}s`}
              repeatCount="indefinite"
            />
          </linearGradient>

          {/* Lueur douce : flou gaussien réutilisé par la couche glow. */}
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Halo qui respire, posé sous le ruban. */}
        <motion.path
          d={INF_PATH}
          pathLength={L}
          fill="none"
          stroke={`url(#${sheenId})`}
          strokeWidth={32}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          animate={{ opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Ruban principal — bien épais, net, peint par le dégradé. */}
        <path
          d={INF_PATH}
          pathLength={L}
          fill="none"
          stroke={`url(#${sheenId})`}
          strokeWidth={22}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Reflet supérieur fin — donne le galbe « tube » brillant. */}
        <path
          d={INF_PATH}
          pathLength={L}
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Glints : traînées blanches qui balaient le ∞. */}
        {GLINTS.map((g, i) => (
          <path
            key={`glint${i}`}
            d={INF_PATH}
            pathLength={L}
            fill="none"
            stroke="#ffffff"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${g.len} ${L - g.len}`}
            style={{
              filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.95))',
              animation: `rgb-path-travel ${DUR}s linear infinite`,
              animationDelay: `${g.delay}s`,
            }}
          />
        ))}
      </svg>

      {/* Points lumineux en orbite — chaque dot tourne autour du centre. */}
      {ORBITS.map((o, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute pointer-events-none"
          style={{ left: '50%', top: '50%', width: 0, height: 0 }}
          animate={{ rotate: 360 * o.dir }}
          transition={{ duration: o.dur, repeat: Infinity, ease: 'linear' }}
        >
          <span
            className="block rounded-full"
            style={{
              width: o.size,
              height: o.size,
              background: o.color,
              boxShadow: `0 0 6px 1px ${o.shadow}`,
              transform: `translate(-50%, -50%) translateY(-${o.r})`,
            }}
          />
        </motion.span>
      ))}
    </motion.span>
  );
}
