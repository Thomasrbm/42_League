import { useMemo, useState } from 'react';
import { RankingScopeToggle } from './RankingScopeToggle';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useT } from '../../lib/i18n';

// Cloisonnement par campus des classements. Par défaut, un joueur ne voit que les
// gens de SON campus ; la vue « Inter-campus » (accessible à tous) affiche tout le
// monde — cloisonnée à la manière des saisons (un sélecteur dédié, pas un calcul
// d'ELO distinct : l'ELO reste global, on ne filtre que l'affichage).
export type CampusScope = 'mine' | 'all';

/** Y a-t-il au moins une ligne portant une info de campus ? */
export function hasCampusInfo(rows: ReadonlyArray<{ campus?: string | null }>): boolean {
  return rows.some((r) => !!r.campus);
}

/**
 * Filtre des lignes par campus selon le scope courant.
 *  • scope='all'        → tout (inter-campus).
 *  • pas de myCampus    → tout (impossible de cibler un campus).
 *  • lignes sans campus → tout (anciens snapshots non taggés : restent globaux).
 *  • sinon              → uniquement les lignes du campus du joueur.
 */
export function filterByCampus<T extends { campus?: string | null }>(
  rows: T[],
  scope: CampusScope,
  myCampus: string | null | undefined,
): T[] {
  if (scope === 'all' || !myCampus) return rows;
  if (!hasCampusInfo(rows)) return rows; // legacy : aucun campus connu → global
  return rows.filter((r) => r.campus === myCampus);
}

/**
 * État partagé du sélecteur de campus. `scope` démarre sur 'mine' (un joueur voit
 * son campus par défaut) ; s'il n'a pas de campus, on bascule d'office sur 'all'.
 */
export function useCampusScope() {
  const { me } = useLeagueData();
  const myCampus = me?.user?.campus ?? null;
  const [scope, setScope] = useState<CampusScope>('mine');
  // Sans campus rattaché, « Mon campus » n'a pas de sens → vue inter-campus de fait.
  const effective: CampusScope = myCampus ? scope : 'all';
  return { scope: effective, setScope, myCampus };
}

/**
 * Bascule « Mon campus / Inter-campus ». Masquée si le joueur n'a pas de campus
 * (rien à cloisonner). Même look que les autres bascules du classement.
 */
export function CampusScopeToggle({
  value,
  onChange,
  myCampus,
  className = '',
}: {
  value: CampusScope;
  onChange: (v: CampusScope) => void;
  myCampus: string | null | undefined;
  className?: string;
}) {
  const t = useT();
  const choices = useMemo(
    () => [
      { value: 'mine' as CampusScope, label: myCampus || t('lb.campus.mine') },
      { value: 'all' as CampusScope, label: t('lb.campus.all') },
    ],
    [myCampus, t],
  );
  if (!myCampus) return null;
  return (
    <div className={`w-full sm:w-[240px] ${className}`}>
      <RankingScopeToggle<CampusScope> value={value} onChange={onChange} choices={choices} />
    </div>
  );
}
