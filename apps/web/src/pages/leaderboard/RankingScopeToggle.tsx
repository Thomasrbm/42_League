import { useId } from 'react';
import { motion } from 'framer-motion';

export interface ScopeChoice<T extends string> {
  value: T;
  label: string;
}

interface RankingScopeToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  choices: ScopeChoice<T>[];
  className?: string;
}

/**
 * Bascule Solo / 2v2 du classement.
 *
 * Reprend EXACTEMENT l'animation de l'indicateur actif de la sidebar
 * (cf. NavItem dans shell/DesktopShell.tsx) : une pastille de fond dorée
 * + une barre d'accent à gauche, qui glissent vers l'option sélectionnée
 * via framer-motion `layoutId`, avec le même spring
 * (stiffness 500, damping 38, mass 0.7).
 */
export function RankingScopeToggle<T extends string>({
  value,
  onChange,
  choices,
  className = '',
}: RankingScopeToggleProps<T>) {
  // layoutId unique par instance — évite que deux toggles montés en même temps
  // (transition de page) ne se disputent la même pastille/barre.
  const uid = useId();
  const bgLayoutId = `ranking-scope-bg-${uid}`;
  const barLayoutId = `ranking-scope-bar-${uid}`;
  const spring = { type: 'spring' as const, stiffness: 500, damping: 38, mass: 0.7 };

  return (
    <div
      role="tablist"
      className={`relative inline-flex w-full gap-1 p-1 rounded-lg bg-bg-1/80 border border-gold/20 backdrop-blur-md no-select shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] ${className}`}
    >
      {choices.map((c) => {
        const active = c.value === value;
        return (
          <button
            key={c.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => {
              if (active) return;
              onChange(c.value);
            }}
            className={`relative flex-1 flex items-center justify-center h-9 px-3 text-sm font-semibold tracking-wide rounded-lg tap-transparent transition-colors duration-150 min-w-0 ${
              active ? 'text-gold' : 'text-muted-2 hover:text-text'
            }`}
          >
            {/* Pastille de fond qui glisse (copie de desktop-nav-bg) */}
            {active && (
              <motion.span
                layoutId={bgLayoutId}
                className="absolute inset-0 rounded-lg"
                style={{
                  background: 'rgba(255,201,74,0.09)',
                  border: '1px solid rgba(255,201,74,0.22)',
                  boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.10)',
                }}
                transition={spring}
              />
            )}
            {/* Barre d'accent à gauche qui glisse (copie de desktop-nav-bar) */}
            {active && (
              <motion.span
                layoutId={barLayoutId}
                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-e"
                style={{
                  background: 'linear-gradient(to bottom, #ffc94a, #e0a82a)',
                  boxShadow: '0 0 10px rgba(255,201,74,0.6)',
                }}
                transition={spring}
              />
            )}
            <span className="relative z-10 truncate">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
