/**
 * En-tête de section doré du profil (barre + libellé + filet dégradé).
 * Partagé entre le profil perso (`ProfilMobile`) et la fiche d'un autre
 * joueur (`PlayerPage`) pour un agencement identique.
 */
export function SectionHeader({ title, badge }: { title: string; badge?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="inline-block w-1 h-3 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
      <span className="font-gaming text-[10px] uppercase tracking-[0.18em] font-extrabold text-gold/90">
        {title}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="font-mono text-[10px] text-muted tabular-nums">· {badge}</span>
      )}
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent ms-2" />
    </div>
  );
}
