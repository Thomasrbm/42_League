import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  /** Ligne secondaire optionnelle (explication courte). */
  hint?: string;
  /** CTA optionnel : un état vide est une opportunité d'action, pas un cul-de-sac. */
  cta?: { label: string; to?: string; onClick?: () => void };
  className?: string;
}

/**
 * État vide partagé — remplace les `<p>` ad hoc dispersés dans les pages.
 * Icône dans un médaillon doux + titre + indice + bouton d'action optionnel.
 */
export function EmptyState({ Icon, title, hint, cta, className = '' }: EmptyStateProps) {
  const ctaClass =
    'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider ' +
    'bg-gradient-to-b from-gold to-gold-dim text-bg-0 hover:brightness-105 transition-all shadow-gold-glow';

  return (
    <div className={`flex flex-col items-center justify-center text-center py-10 px-6 ${className}`}>
      <span className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 bg-gold/[0.07] border border-gold/20">
        <Icon className="w-6 h-6 text-gold/60" strokeWidth={1.8} />
      </span>
      <div className="text-sm font-bold text-text-strong">{title}</div>
      {hint && <div className="mt-1 text-xs text-muted-2 max-w-xs leading-relaxed">{hint}</div>}
      {cta &&
        (cta.to ? (
          <Link to={cta.to} className={`mt-4 ${ctaClass}`}>
            {cta.label}
          </Link>
        ) : (
          <button type="button" onClick={cta.onClick} className={`mt-4 ${ctaClass}`}>
            {cta.label}
          </button>
        ))}
    </div>
  );
}
