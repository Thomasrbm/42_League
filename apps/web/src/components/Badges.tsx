import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, type LucideIcon } from 'lucide-react';
import { badgeDef } from '../lib/badges';
import { badgeIcon } from '../lib/badgeIcons';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { CursorTooltip } from './CursorTooltip';
import type { EquippedBadge } from '../lib/api';

/** Def de rendu d'un badge (catalogue OU badge acheté en boutique). */
export interface BadgeRenderDef {
  label: string;
  color: string;
  icon: LucideIcon;
  description?: string;
  /** Comment l'obtenir (infobulle de profil). */
  obtain?: string;
  /** Badge unique (un seul porteur) plutôt qu'obtenable. */
  unique?: boolean;
}

/** Convertit un badge acheté (icône = nom string) en def de rendu. */
function defFromEquipped(b: EquippedBadge): BadgeRenderDef {
  return {
    label: b.label,
    color: b.color ?? '#a9b6c9',
    icon: badgeIcon(b.icon),
    obtain: 'Badge cosmétique disponible en boutique.',
  };
}

/** Contenu de l'infobulle d'un badge : libellé, statut (unique/obtenable) et moyen. */
function badgeTooltipContent(b: BadgeRenderDef) {
  return (
    <>
      <div className="text-xs font-extrabold" style={{ color: b.color }}>
        {b.label}
      </div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-gold/80">
        {b.unique ? 'Badge unique' : 'Badge obtenable'}
      </div>
      {b.obtain && <div className="mt-1 text-[11px] leading-snug text-muted-2">{b.obtain}</div>}
    </>
  );
}

/**
 * Pastille de badge — façon badge ELO mais teintée selon le badge, avec un léger
 * dégradé animé (sheen) qui balaie en continu pour donner de la vie.
 *
 * `def` (badge acheté, inline) prime sur `code` (badge du catalogue).
 */
export function BadgeChip({
  code,
  def,
  size = 'sm',
  iconOnly = false,
  richTooltip = false,
  onClick,
}: {
  code?: string;
  def?: BadgeRenderDef;
  size?: 'xs' | 'sm' | 'md';
  /** Pastille ronde icône-seule (label dans la modale) — gain de place à côté
   *  d'un nom, évite que le label pousse / tronque le texte voisin. */
  iconOnly?: boolean;
  /** Infobulle riche qui SUIT LE CURSEUR (unique/obtenable + comment) — profils. */
  richTooltip?: boolean;
  onClick?: () => void;
}) {
  const b = def ?? badgeDef(code ?? '');
  const Icon = b.icon;
  const commonStyle = {
    color: b.color,
    borderColor: `${b.color}55`,
    // Dégradé tricolore (teinte du badge) balayé en boucle → effet brillant.
    background: `linear-gradient(110deg, ${b.color}14 0%, ${b.color}33 45%, ${b.color}14 70%)`,
    backgroundSize: '220% 100%',
  } as const;
  const sheen = {
    animate: { backgroundPosition: ['0% 0%', '220% 0%'] },
    transition: { duration: 3.2, repeat: Infinity, ease: 'linear' as const },
  };
  // Sans infobulle riche, on garde l'attribut natif `title` ; avec, on le retire
  // pour ne pas doubler l'infobulle du navigateur sous celle qui suit le curseur.
  const nativeTitle = richTooltip ? undefined : b.label;

  let chip: React.ReactNode;
  if (iconOnly) {
    const boxCls = size === 'xs' ? 'w-5 h-5' : size === 'md' ? 'w-7 h-7' : 'w-6 h-6';
    const iconCls = size === 'xs' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
    const cls = `inline-flex items-center justify-center rounded-full border shrink-0 ${boxCls}`;
    const inner = <Icon className={iconCls} strokeWidth={2.6} />;
    // Sans onClick : pastille NON interactive (span) — autorise l'imbrication dans
    // un lien/bouton (lignes de classement, hover-card) sans HTML invalide.
    chip = onClick ? (
      <motion.button type="button" onClick={onClick} title={nativeTitle} aria-label={b.label} className={cls} style={commonStyle} {...sheen}>
        {inner}
      </motion.button>
    ) : (
      <motion.span role="img" title={nativeTitle} aria-label={b.label} className={cls} style={commonStyle} {...sheen}>
        {inner}
      </motion.span>
    );
  } else {
    const sizeCls =
      size === 'xs'
        ? 'text-[8px] px-1.5 py-0.5 gap-0.5'
        : size === 'md'
          ? 'text-xs px-3 py-1.5 gap-1.5'
          : 'text-[10px] px-2 py-0.5 gap-1';
    const iconCls = size === 'xs' ? 'w-2.5 h-2.5' : size === 'md' ? 'w-4 h-4' : 'w-3 h-3';
    const cls = `inline-flex items-center rounded-full font-extrabold uppercase tracking-[0.1em] border leading-none ${sizeCls}`;
    const inner = (
      <>
        <Icon className={iconCls} strokeWidth={2.6} />
        {b.label}
      </>
    );
    chip = onClick ? (
      <motion.button type="button" onClick={onClick} title={nativeTitle} aria-label={b.label} className={cls} style={commonStyle} {...sheen}>
        {inner}
      </motion.button>
    ) : (
      <motion.span role="img" title={nativeTitle} aria-label={b.label} className={cls} style={commonStyle} {...sheen}>
        {inner}
      </motion.span>
    );
  }

  if (!richTooltip) return <>{chip}</>;
  return <CursorTooltip content={badgeTooltipContent(b)}>{chip}</CursorTooltip>;
}

/** Pastille « +N » repliant les badges en trop — ouvre la modale au clic. */
function OverflowChip({
  count,
  size = 'sm',
  iconOnly = false,
  onClick,
}: {
  count: number;
  size?: 'xs' | 'sm' | 'md';
  iconOnly?: boolean;
  onClick?: () => void;
}) {
  // En mode icône-seule, pastille ronde de même gabarit que les icônes.
  const sizeCls = iconOnly
    ? `${size === 'xs' ? 'w-5 h-5 text-[8px]' : size === 'md' ? 'w-7 h-7 text-[10px]' : 'w-6 h-6 text-[9px]'} justify-center px-0`
    : size === 'xs'
      ? 'text-[8px] px-1.5 py-0.5'
      : size === 'md'
        ? 'text-xs px-2.5 py-1.5'
        : 'text-[10px] px-2 py-0.5';
  return (
    <button
      type="button"
      onClick={onClick}
      title={`+${count}`}
      className={`inline-flex items-center shrink-0 rounded-full font-extrabold tabular-nums leading-none border border-gold/35 bg-gold/10 text-gold/90 ${sizeCls}`}
    >
      +{count}
    </button>
  );
}

/**
 * Rangée de badges d'un joueur. Cliquer ouvre une modale listant tous ses badges
 * avec leur description (« clique sur le badge pour voir ceux qu'on a »).
 *
 * Ne déborde JAMAIS : au plus `max` pastilles sont affichées, le reste est replié
 * dans un « +N » cliquable (évite que trop de badges cassent / chevauchent la mise
 * en page, notamment à côté du nom sur mobile).
 */
export function BadgesRow({
  codes,
  extra,
  size = 'sm',
  max = 3,
  iconOnly = false,
  richTooltip = false,
}: {
  codes: string[];
  /** Badge(s) acheté(s) & équipé(s) (boutique), rendus avec leur def inline. */
  extra?: EquippedBadge[];
  size?: 'xs' | 'sm' | 'md';
  /** Nb max de pastilles affichées avant de replier le reste dans un « +N ». */
  max?: number;
  /** Pastilles rondes icône-seule (label dans la modale) — pour les espaces serrés
   *  comme la rangée à côté du nom sur les cartes héro mobiles. */
  iconOnly?: boolean;
  /** Infobulle riche qui suit le curseur sur chaque pastille (profils). */
  richTooltip?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const extras = extra ?? [];
  const safeCodes = codes ?? [];
  const total = safeCodes.length + extras.length;
  if (total === 0) return null;

  // Liste unifiée (catalogue + boutique), dans l'ordre d'affichage.
  const chips = [
    ...safeCodes.map((code) => (
      <BadgeChip key={code} code={code} size={size} iconOnly={iconOnly} richTooltip={richTooltip} onClick={() => setOpen(true)} />
    )),
    ...extras.map((b) => (
      <BadgeChip key={`shop-${b.code}`} def={defFromEquipped(b)} size={size} iconOnly={iconOnly} richTooltip={richTooltip} onClick={() => setOpen(true)} />
    )),
  ];
  const visible = chips.slice(0, max);
  const overflow = total - visible.length;

  return (
    <>
      {/* flex-nowrap + min-w-0 : la rangée ne casse pas sur plusieurs lignes et ne
          pousse pas le reste de la carte ; au-delà de `max` on replie en « +N ». */}
      <div className="flex flex-nowrap items-center gap-1.5 min-w-0">
        {visible}
        {overflow > 0 && (
          <OverflowChip count={overflow} size={size} iconOnly={iconOnly} onClick={() => setOpen(true)} />
        )}
      </div>
      <AnimatePresence>
        {open && <BadgesModal codes={safeCodes} extra={extras} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

function BadgesModal({
  codes,
  extra = [],
  onClose,
}: {
  codes: string[];
  extra?: EquippedBadge[];
  onClose: () => void;
}) {
  // La modale n'est montée que lorsqu'elle est ouverte → `active` toujours vrai.
  useEscapeKey(true, onClose);
  const total = codes.length + extra.length;
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Badges"
      className="fixed inset-0 z-[130] overflow-y-auto bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex min-h-full items-center justify-center p-4" onClick={onClose}>
      <motion.div
        className="card-hud rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        initial={{ scale: 0.94, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 10 }}
        transition={{ type: 'spring', stiffness: 360, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gold/15 bg-bg-2/50">
          <span className="font-gaming text-xs uppercase tracking-[0.16em] text-gold font-extrabold">
            Badges · {total}
          </span>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-muted hover:text-red hover:bg-red/10 transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
        <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {[
            ...codes.map((code) => ({ key: code, b: badgeDef(code) as BadgeRenderDef })),
            ...extra.map((e) => ({ key: `shop-${e.code}`, b: defFromEquipped(e) })),
          ].map(({ key, b }) => {
            const Icon = b.icon;
            return (
              <div key={key} className="flex items-center gap-3 p-2.5 rounded-xl bg-bg-2/40 border border-border/40">
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
                  style={{ color: b.color, background: `${b.color}1a`, border: `1px solid ${b.color}40` }}
                >
                  <Icon className="w-5 h-5" strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold" style={{ color: b.color }}>
                    {b.label}
                  </div>
                  <div className="text-[11px] text-muted-2 leading-snug">{b.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
      </div>
    </motion.div>
  );
}
