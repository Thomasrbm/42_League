import { useEffect, useState } from 'react';
import { api, type Season } from '../lib/api';
import { useT } from '../lib/i18n';

/**
 * Sélecteur de saison pour l'historique (page Historique + profil). Valeurs :
 *   '' = saison en cours (défaut, cohérent avec le reset de saison),
 *   'all' = tout l'historique (toutes saisons),
 *   <id> = une saison passée précise.
 * Self-contained : charge la liste des saisons. Toujours rendu (la distinction
 * « saison en cours » / « toutes » est utile même sans saison passée).
 */
export function SeasonFilterSelect({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const t = useT();
  const [seasons, setSeasons] = useState<Season[]>([]);
  useEffect(() => {
    api.seasons().then(setSeasons).catch(() => {});
  }, []);
  const past = seasons.filter((s) => !s.isActive);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 py-1.5 bg-bg-1 border border-border rounded-lg text-xs font-bold uppercase tracking-wider text-text focus:border-gold outline-none transition-colors ${className}`}
    >
      <option value="">{t('lb.season.currentLong')}</option>
      {past.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value="all">{t('hist.season.all')}</option>
    </select>
  );
}
