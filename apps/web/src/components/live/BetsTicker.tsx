import { motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from '../Avatar';
import type { LiveBet } from '../../lib/api';

// Bandeau des mises du tournoi (« {parieur} mise {N} 🪙 sur {champion} »).
// Quand les mises DÉBORDENT du conteneur, on défile en boucle : on duplique la
// liste et on translate de -50 % pour un ruban sans couture. Quand elles tiennent
// à l'écran, on les affiche UNE seule fois, statiques — sinon la copie de la boucle
// resterait visible et chaque mise apparaîtrait en double.

const STATUS_TINT: Record<string, string> = {
  won: 'text-[#7fd66e]',
  lost: 'text-red/70',
  refunded: 'text-muted-2',
  open: 'text-gold',
};

function BetItem({ b }: { b: LiveBet }) {
  return (
    <div className="flex items-center gap-[0.5vw] shrink-0">
      <Avatar login={b.bettor} imageUrl={b.bettorImageUrl} size="xs" />
      <span className="text-[1.5vh] text-text font-semibold">{b.bettor}</span>
      <span className="text-[1.3vh] text-muted-2">mise</span>
      <span className={`text-[1.5vh] font-mono font-bold tabular-nums ${STATUS_TINT[b.status] ?? 'text-gold'}`}>
        {b.stake} 🪙
      </span>
      <span className="text-[1.3vh] text-muted-2">sur</span>
      <span className="text-[1.5vh] text-gold font-bold">{b.choice}</span>
      <span className="text-border mx-[0.5vw]">•</span>
    </div>
  );
}

export function BetsTicker({ bets }: { bets: LiveBet[] }) {
  const items = bets.slice(0, 40);
  const containerRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  // On mesure une copie UNIQUE (le « sizer » invisible) : si elle est plus large
  // que le conteneur, on bascule en mode défilant (avec duplication). Sinon, une
  // seule copie statique suffit (pas de doublon visible).
  useLayoutEffect(() => {
    const c = containerRef.current;
    const sizer = sizerRef.current;
    if (!c || !sizer) return;
    setOverflow(sizer.scrollWidth > c.clientWidth + 4);
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex items-center h-full px-[2vw] text-[1.4vh] text-muted-2 uppercase tracking-[0.2em]">
        <span className="text-gold me-[1vw]">◈ Paris</span> Aucune mise pour l'instant — ouvre le marché !
      </div>
    );
  }

  // Boucle fluide : durée ∝ nombre d'items (chaque mise ~3.2 s à l'écran).
  const duration = Math.max(18, items.length * 3.2);
  const rendered = overflow ? [...items, ...items] : items;

  return (
    <div ref={containerRef} className="relative flex items-center h-full overflow-hidden">
      {/* Sizer invisible : une seule copie, sert uniquement à mesurer le débordement. */}
      <div
        ref={sizerRef}
        aria-hidden
        className="invisible pointer-events-none absolute top-0 left-0 flex items-center gap-[2vw] whitespace-nowrap ps-[16vw]"
      >
        {items.map((b) => (
          <BetItem key={`sizer-${b.id}`} b={b} />
        ))}
      </div>

      <div className="absolute left-0 z-10 h-full flex items-center px-[1.2vw] bg-gradient-to-r from-bg-0 via-bg-0/90 to-transparent">
        <span className="text-[1.5vh] font-gaming font-black uppercase tracking-[0.18em] text-gold">◈ Mises en direct</span>
      </div>
      <motion.div
        className="flex items-center gap-[2vw] whitespace-nowrap ps-[16vw]"
        animate={overflow ? { x: ['0%', '-50%'] } : { x: 0 }}
        transition={overflow ? { duration, ease: 'linear', repeat: Infinity } : { duration: 0 }}
      >
        {rendered.map((b, i) => (
          <BetItem key={`${b.id}-${i}`} b={b} />
        ))}
      </motion.div>
    </div>
  );
}
