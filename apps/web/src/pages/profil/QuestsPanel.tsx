import { useCallback, useEffect, useState } from 'react';
import { Check, Flame } from 'lucide-react';
import { api, type QuestsResponse, type QuestView, type StreakView } from '../../lib/api';
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

/** Carte « Série d'assiduité » : jours consécutifs, bonus ELO, prochain palier de coins. */
function StreakCard({ streak }: { streak: StreakView }) {
  const { current, best, eloActive, next } = streak;
  const pct = next.day > 0 ? Math.min(100, Math.round((current / next.day) * 100)) : 0;
  const toBonus = Math.max(0, 3 - current);
  const hint = eloActive
    ? `Bonus +10% d'ELO actif sur tes gains. Continue jusqu'à J${next.day} → +${next.coins} coins.`
    : current > 0
      ? `Encore ${toBonus} jour${toBonus > 1 ? 's' : ''} pour activer le +10% d'ELO.`
      : "Reviens chaque jour : +10% d'ELO dès 3 jours d'affilée, et des paliers de coins.";
  return (
    <div className="rounded-2xl border border-orange-400/20 bg-gradient-to-br from-orange-500/[0.08] to-bg-1/70 p-4 mb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Flame
            className={`w-7 h-7 shrink-0 ${current > 0 ? 'text-orange-400' : 'text-muted-2'}`}
            fill={current > 0 ? 'currentColor' : 'none'}
            strokeWidth={2}
          />
          <div className="min-w-0">
            <div className="font-extrabold text-text-strong text-sm flex items-center gap-2">
              Série d'assiduité
              {eloActive && (
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-300 bg-orange-500/15 border border-orange-400/30 rounded px-1.5 py-0.5">
                  +10% ELO
                </span>
              )}
            </div>
            <div className="text-[12px] text-muted-2 mt-0.5">
              {current > 0 ? `${current} jour${current > 1 ? 's' : ''} d'affilée` : 'Aucune série en cours'}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-extrabold tabular-nums text-orange-400 leading-none">{current}</div>
          <div className="text-[10px] text-muted-2 mt-1">record {best}</div>
        </div>
      </div>

      {/* Progression vers le prochain palier de coins */}
      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-2 flex-1 rounded-full bg-bg-2/80 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-muted-2 tabular-nums shrink-0 inline-flex items-center gap-1">
          J{next.day} · +{next.coins}
          <img src="/42coin.webp" alt="" className="w-3 h-3" />
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-2 leading-snug">{hint}</p>
    </div>
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
        <CoinAmount value={quest.reward} className="text-gold font-extrabold shrink-0" />
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
  const { me, refresh } = useLeagueData();
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

      {me?.streak && <StreakCard streak={me.streak} />}

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
