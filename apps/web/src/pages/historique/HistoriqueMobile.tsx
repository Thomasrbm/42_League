import { useMemo, useState } from 'react';
import { PullToRefresh } from '../../mobile/primitives/PullToRefresh';
import { SegmentedControl, type SegmentChoice } from '../../mobile/primitives/SegmentedControl';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useI18n, useT } from '../../lib/i18n';
import { SeasonFilterSelect } from '../../components/SeasonFilterSelect';
import { useHistoriqueLogic } from './shared/useHistoriqueLogic';
import { HistoriqueList, type HistoTab } from './shared/HistoriqueList';
import { useGameMode } from '../../hooks/useGameMode';
import { GAME_META } from '../../lib/gameMeta';

export function HistoriqueMobile() {
  const t = useT();
  const { lang } = useI18n();
  const [seasonFilter, setSeasonFilter] = useState('');
  const data = useHistoriqueLogic(seasonFilter);
  const { game } = useGameMode();
  const { leaderboard } = useLeagueData();
  const [tab, setTab] = useState<HistoTab>('global');

  const imgByLogin = useMemo(
    () => new Map(leaderboard.map((u) => [u.login, u.imageUrl] as const)),
    [leaderboard],
  );

  const choices: SegmentChoice<HistoTab>[] = [
    { value: 'global', label: GAME_META[game].label, badge: data.global.length },
    { value: 'mine', label: t('history.tab.mine'), badge: data.mine.length },
  ];

  return (
    <PullToRefresh onRefresh={data.refresh}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <SeasonFilterSelect value={seasonFilter} onChange={setSeasonFilter} />
        </div>
        <SegmentedControl<HistoTab> value={tab} onChange={setTab} choices={choices} />
        <HistoriqueList
          tab={tab}
          data={data}
          imgByLogin={imgByLogin}
          lang={lang}
          emptyText={tab === 'mine' ? t('history.empty.mine') : t('history.empty')}
        />
      </div>
    </PullToRefresh>
  );
}
