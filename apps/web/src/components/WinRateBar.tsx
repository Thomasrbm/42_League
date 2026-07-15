import { useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';

interface WinRateBarProps {
  wins: number;
  losses: number;
  /**
   * `full` (défaut, desktop) : % réservé de chaque côté (alignement colonne).
   * `compact` (mobile) : barre large + un seul % à droite → plus de place aux libellés.
   */
  variant?: 'full' | 'compact';
}

/**
 * Étiquette d'un segment selon la place réelle disponible (en px) :
 * - assez large  → « 12 Victoires » (mot complet)
 * - moyen        → « 12 V » (nombre + espace + lettre, jamais collés)
 * - étroit       → « V » (lettre seule)
 * - trop petit   → rien
 */
function segmentLabel(px: number, count: number, full: string, letter: string): string {
  if (count <= 0) return '';
  if (px >= 88) return `${count} ${full}`;
  if (px >= 40) return `${count} ${letter}`;
  if (px >= 20) return letter;
  return '';
}

/**
 * Barre de win rate façon OP.GG — partagée desktop / mobile.
 * - Segment doré (victoires) + segment rouge (défaites), proportionnels.
 * - À 100 % (resp. 0 %) la barre est entièrement dorée (resp. rouge).
 * - Les libellés s'adaptent à la largeur réelle (mot complet → nombre+lettre → lettre).
 */
export function WinRateBar({ wins, losses, variant = 'full' }: WinRateBarProps) {
  const t = useT();
  const barRef = useRef<HTMLSpanElement>(null);
  const [barW, setBarW] = useState(0);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarW(el.clientWidth));
    ro.observe(el);
    setBarW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const games = wins + losses;
  if (games === 0) return <span className="text-muted/40 text-xs">—</span>;

  const winRate = Math.round((wins / games) * 100);
  const lossPct = 100 - winRate;
  const high = winRate > 50;

  const W = t('lb.abbr.win');
  const L = t('lb.abbr.loss');
  const winFull = wins === 1 ? t('lb.win.full1') : t('lb.win.full');
  const lossFull = losses === 1 ? t('lb.loss.full1') : t('lb.loss.full');

  // Largeur (px) effective de chaque segment pour décider du libellé.
  const winPx = losses === 0 ? barW : (barW * winRate) / 100;
  const lossPx = wins === 0 ? barW : (barW * lossPct) / 100;

  const bar = (
    <span
      ref={barRef}
      className="flex h-[18px] flex-1 min-w-[84px] overflow-hidden rounded-md text-[10px] font-bold leading-none ring-1 ring-black/30"
    >
      {winRate > 0 && (
        <span
          className="flex h-full shrink-0 items-center justify-start overflow-hidden whitespace-nowrap px-1.5 text-[#1a1100]"
          style={{ width: losses === 0 ? '100%' : `${winRate}%`, background: 'rgba(255,201,74,0.92)' }}
        >
          {segmentLabel(winPx, wins, winFull, W)}
        </span>
      )}
      {lossPct > 0 && (
        <span
          className="flex h-full flex-1 items-center justify-end overflow-hidden whitespace-nowrap px-1.5 text-white"
          style={{ background: 'rgba(255,83,102,0.85)' }}
        >
          {segmentLabel(lossPx, losses, lossFull, L)}
        </span>
      )}
    </span>
  );

  if (variant === 'compact') {
    return (
      <span className="flex w-full items-center gap-2">
        {bar}
        <span
          className="shrink-0 text-xs font-extrabold tabular-nums"
          style={{ color: high ? '#ffc94a' : '#ff5366' }}
        >
          {winRate}%
        </span>
      </span>
    );
  }

  return (
    <span className="flex w-full items-center gap-1.5">
      <span
        className="w-8 shrink-0 text-end text-xs font-extrabold tabular-nums"
        style={{ color: '#ffc94a' }}
      >
        {high ? `${winRate}%` : ''}
      </span>
      {bar}
      <span
        className="w-8 shrink-0 text-start text-xs font-extrabold tabular-nums"
        style={{ color: '#ff5366' }}
      >
        {high ? '' : `${winRate}%`}
      </span>
    </span>
  );
}
