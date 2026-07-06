import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api, type QuestsResponse, type QuestView } from '../../lib/api';
import { trackEvent } from '../../lib/analytics';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useT } from '../../lib/i18n';
import { SectionHeader } from './shared/SectionHeader';

/** Petit montant en coins avec l'icône 42coin. */
function CoinAmount({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <img src="/42coin.webp" alt="" className="w-4 h-4" />
      {value}
    </span>
  );
}

function QuestRow({
  quest,
  onClaim,
  claiming,
}: {
  quest: QuestView;
  onClaim: (id: string) => void;
  claiming: boolean;
}) {
  const t = useT();
  const pct = quest.target > 0 ? Math.min(100, Math.round((quest.progress / quest.target) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-gold/15 bg-bg-1/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-extrabold text-text-strong text-sm">
            {t(`quest.${quest.id}.name`)}
          </div>
          <div className="text-[12px] text-muted-2 mt-0.5">{t(`quest.${quest.id}.desc`)}</div>
        </div>
        {/* Récompenses : gros gain d'XP (mis en avant) + coins. */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-md bg-[#2cc3ff]/15 border border-[#2cc3ff]/30 px-1.5 py-0.5 text-[#7fe0ff] text-[11px] font-black tabular-nums">
            +{quest.xpReward} XP
          </span>
          <CoinAmount value={quest.reward} className="text-gold font-extrabold" />
        </div>
      </div>

      {/* Barre de progression */}
      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-2 flex-1 rounded-full bg-bg-2/80 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold to-gold-dim transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-muted-2 tabular-nums shrink-0">
          {quest.progress}/{quest.target}
        </span>
      </div>

      {/* Action */}
      <div className="mt-3">
        {quest.claimed ? (
          <div className="flex items-center justify-center gap-1.5 h-9 rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 text-xs font-extrabold uppercase tracking-[0.14em]">
            <Check className="w-4 h-4" strokeWidth={3} />
            {t('quests.claimed')}
          </div>
        ) : (
          <button
            type="button"
            disabled={!quest.claimable || claiming}
            onClick={() => onClaim(quest.id)}
            className={`w-full h-9 rounded-xl text-xs font-extrabold uppercase tracking-[0.14em] tap-transparent transition-colors ${
              quest.claimable
                ? 'border border-gold/40 bg-gold/15 text-gold hover:bg-gold/25'
                : 'border border-white/5 bg-white/[0.02] text-muted-2 cursor-not-allowed'
            }`}
          >
            {t('quests.claim')}
          </button>
        )}
      </div>
    </div>
  );
}

export function QuestsPanel() {
  const t = useT();
  const { refresh } = useLeagueData();
  const [data, setData] = useState<QuestsResponse | null>(null);
  const [error, setError] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .quests()
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleClaim = useCallback(
    async (id: string) => {
      setClaiming(id);
      try {
        await api.claimQuest(id);
        trackEvent('quest.claim');
        // Recharge l'état serveur (solde + statut réclamé) et le porte-monnaie global.
        load();
        void refresh();
      } catch {
        load();
      } finally {
        setClaiming(null);
      }
    },
    [load, refresh],
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1">
        <SectionHeader title={t('quests.title')} />
        {data && <CoinAmount value={data.coins} className="text-gold font-extrabold" />}
      </div>
      <p className="text-[12px] text-muted-2 px-1 mb-3">{t('quests.subtitle')}</p>

      {error && <div className="text-center text-muted-2 py-8 text-sm">{t('quests.error')}</div>}
      {!error && !data && (
        <div className="text-center text-muted-2 py-8 text-sm">{t('quests.loading')}</div>
      )}
      {!error && data && (
        <div className="space-y-3">
          {data.quests.map((q) => (
            <QuestRow key={q.id} quest={q} onClaim={handleClaim} claiming={claiming === q.id} />
          ))}
        </div>
      )}
    </section>
  );
}
