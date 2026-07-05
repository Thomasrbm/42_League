import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { haptic } from '../../../mobile/feedback/useHaptic';

type Tone = 'amber' | 'gold' | 'red';

interface BigActionButtonProps {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  /** Décor à droite (emojis, flèche…). */
  accessory?: React.ReactNode;
  tone?: Tone;
  onClick: () => void;
}

const TONE_BG: Record<Tone, string> = {
  amber: 'linear-gradient(135deg, #1f2836 0%, #151b26 60%, #0f141c 100%)',
  gold: 'linear-gradient(135deg, #2c2519 0%, #1f1a12 55%, #161209 100%)',
  red: 'linear-gradient(135deg, #2a1818 0%, #1d1111 60%, #150a0a 100%)',
};

interface ToneConfig {
  border: string;
  activeBorder: string;
  iconBg: string;
  iconBorder: string;
  iconGlow: string;
  iconClass: string;
  arrowClass: string;
  boxShadow: string;
}

const TONE_CONFIG: Record<Tone, ToneConfig> = {
  amber: {
    border: 'border-gold/30',
    activeBorder: 'active:border-gold',
    iconBg: 'linear-gradient(135deg, rgba(255,201,74,0.25), rgba(255,201,74,0.08))',
    iconBorder: 'border-gold/50',
    iconGlow: 'inset 0 1px 0 rgba(255,247,228,0.2), 0 0 12px rgba(255,201,74,0.25)',
    iconClass: 'text-gold',
    arrowClass: 'text-gold',
    boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.10), 0 8px 24px -12px rgba(255,201,74,0.4), 0 1px 0 rgba(255,201,74,0.06)',
  },
  gold: {
    border: 'border-gold/30',
    activeBorder: 'active:border-gold',
    iconBg: 'linear-gradient(135deg, rgba(255,201,74,0.25), rgba(255,201,74,0.08))',
    iconBorder: 'border-gold/50',
    iconGlow: 'inset 0 1px 0 rgba(255,247,228,0.2), 0 0 12px rgba(255,201,74,0.25)',
    iconClass: 'text-gold',
    arrowClass: 'text-gold',
    boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.10), 0 8px 24px -12px rgba(255,201,74,0.4), 0 1px 0 rgba(255,201,74,0.06)',
  },
  red: {
    border: 'border-red/30',
    activeBorder: 'active:border-red',
    iconBg: 'linear-gradient(135deg, rgba(255,83,102,0.25), rgba(255,83,102,0.08))',
    iconBorder: 'border-red/50',
    iconGlow: 'inset 0 1px 0 rgba(255,200,200,0.15), 0 0 12px rgba(255,83,102,0.30)',
    iconClass: 'text-red',
    arrowClass: 'text-red',
    boxShadow: 'inset 0 1px 0 rgba(255,120,120,0.08), 0 8px 24px -12px rgba(255,83,102,0.35), 0 1px 0 rgba(255,83,102,0.06)',
  },
};

/**
 * Gros CTA premium réutilisable pour la page Défis (Déclarer / Défier).
 * Reprend le style « plaque dorée biseautée » du screenshot 42 League.
 */
export function BigActionButton({
  Icon,
  title,
  subtitle,
  accessory,
  tone = 'amber',
  onClick,
}: BigActionButtonProps) {
  const cfg = TONE_CONFIG[tone];
  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic('medium');
        onClick();
      }}
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      className={`shine group relative w-full flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl overflow-hidden tap-transparent transition-all border ${cfg.border} ${cfg.activeBorder}`}
      style={{ background: TONE_BG[tone], boxShadow: cfg.boxShadow }}
    >
      <div className="absolute inset-0 hud-diag opacity-50 pointer-events-none" />

      <div className="relative flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center border ${cfg.iconBorder} group-hover:scale-110 transition-transform`}
          style={{ background: cfg.iconBg, boxShadow: cfg.iconGlow }}
        >
          <Icon className={`w-4 h-4 ${cfg.iconClass}`} strokeWidth={2.75} />
        </div>
        <div className="text-left">
          <div className="font-gaming text-sm font-extrabold text-text-strong tracking-wide uppercase">
            {title}
          </div>
          <div className="text-[10px] text-muted uppercase tracking-[0.16em] font-extrabold">
            {subtitle}
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-1.5 text-base opacity-90">
        {accessory}
        <span className={`${cfg.arrowClass} text-lg group-hover:translate-x-1 transition-transform`}>→</span>
      </div>
    </motion.button>
  );
}
