import { useCallback, useMemo, useState } from 'react';
import { Swords } from 'lucide-react';
import { Button } from '../../../components/Button';
import { TimePicker } from '../../../components/TimePicker';
import { api, type LeaderboardEntry } from '../../../lib/api';
import { useFlash } from '../../../hooks/useFlash';
import { useI18n, useT } from '../../../lib/i18n';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { PlayerSearch } from './PlayerSearch';

function defaultWhen(): Date {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(Math.round(d.getMinutes() / 5) * 5, 0, 0);
  return d;
}

interface Challenge2v2FlowProps {
  others: LeaderboardEntry[];
  recentOpponents: LeaderboardEntry[];
  opponentCounts: Record<string, number>;
  myLogin: string | undefined;
  locations?: Map<string, string>;
  onSubmitted: () => Promise<void> | void;
  variant?: 'desktop' | 'mobile';
}

/**
 * Flow « Défier en 2v2 » (Babyfoot) : le challenger choisit son coéquipier + 2
 * adversaires, puis programme un créneau. Les 2 adversaires devront accepter.
 */
export function Challenge2v2Flow({
  others,
  recentOpponents,
  opponentCounts,
  myLogin,
  locations,
  onSubmitted,
  variant = 'desktop',
}: Challenge2v2FlowProps) {
  const flash = useFlash();
  const { lang } = useI18n();
  const t = useT();

  const [partner, setPartner] = useState<LeaderboardEntry | null>(null);
  const [opponent1, setOpponent1] = useState<LeaderboardEntry | null>(null);
  const [opponent2, setOpponent2] = useState<LeaderboardEntry | null>(null);
  const [when, setWhen] = useState<Date>(defaultWhen);
  const [busy, setBusy] = useState(false);

  const excluded = useMemo(
    () =>
      new Set(
        [myLogin ?? '', partner?.login ?? '', opponent1?.login ?? '', opponent2?.login ?? ''].filter(Boolean),
      ),
    [myLogin, partner, opponent1, opponent2],
  );
  const pool = (extra: string | undefined) =>
    others.filter((p) => !excluded.has(p.login) || p.login === extra);
  const recentPool = useMemo(
    () => recentOpponents.filter((p) => !excluded.has(p.login)),
    [recentOpponents, excluded],
  );

  const allSelected = !!partner && !!opponent1 && !!opponent2;

  const handleSubmit = useCallback(async () => {
    if (!partner || !opponent1 || !opponent2) return;
    setBusy(true);
    try {
      await api.createChallenge2v2({
        partnerLogin: partner.login,
        opponentLogin: opponent1.login,
        opponentPartnerLogin: opponent2.login,
        scheduledAt: when.toISOString(),
      });
      flash.show(t('defis.challengeSent2v2'));
      haptic('success');
      await onSubmitted();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
    } finally {
      setBusy(false);
    }
  }, [partner, opponent1, opponent2, when, flash, onSubmitted, t]);

  return (
    <div className="flex flex-col gap-5">
      {/* Mon coéquipier */}
      <div className="rounded-2xl border border-gold/25 p-4 space-y-3" style={{ background: 'rgba(255,201,74,0.04)' }}>
        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold">{t('defis.myTeam')}</div>
        <div className="relative z-30">
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1.5">
            {t('defis.myTeammate')}
          </label>
          <PlayerSearch
            variant={variant}
            players={pool(partner?.login)}
            recentPlayers={recentPool}
            opponentCounts={opponentCounts}
            selected={partner}
            onSelect={setPartner}
            onClear={() => setPartner(null)}
            locations={locations}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 -my-1">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red/40 to-red/40" />
        <span className="font-gaming text-xs font-extrabold text-red/80 uppercase tracking-widest px-1">VS</span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-red/40 to-red/40" />
      </div>

      {/* Équipe adverse */}
      <div className="rounded-2xl border border-red/25 p-4 space-y-3" style={{ background: 'rgba(255,83,102,0.04)' }}>
        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-red">{t('defis.opponentTeam')}</div>
        <div className="relative z-20">
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1.5">
            {t('defis.opponent1')}
          </label>
          <PlayerSearch
            variant={variant}
            players={pool(opponent1?.login)}
            recentPlayers={recentPool}
            opponentCounts={opponentCounts}
            selected={opponent1}
            onSelect={setOpponent1}
            onClear={() => setOpponent1(null)}
            locations={locations}
          />
        </div>
        <div className="relative z-10">
          <label className="block text-[9px] font-bold text-muted uppercase tracking-wider mb-1.5">
            {t('defis.opponent2')}
          </label>
          <PlayerSearch
            variant={variant}
            players={pool(opponent2?.login)}
            recentPlayers={recentPool}
            opponentCounts={opponentCounts}
            selected={opponent2}
            onSelect={setOpponent2}
            onClear={() => setOpponent2(null)}
            locations={locations}
          />
        </div>
      </div>

      {allSelected && (
        <div className="relative animate-slide-down">
          <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-4 text-center">
            {t('defis.when')}
          </label>
          <TimePicker value={when} onChange={setWhen} lang={lang} />
          <div className="mt-5">
            <Button size="md" loading={busy} onClick={() => void handleSubmit()} className="w-full py-3.5 text-sm font-bold shadow-lg">
              <Swords className="w-4 h-4 me-1.5" strokeWidth={2.5} />
              {t('defis.sendChallenge')}
            </Button>
          </div>
          <p className="mt-3 text-[10px] text-muted/70 leading-relaxed text-center font-medium">
            {t('defis.opponents2MustAccept')}
          </p>
        </div>
      )}
    </div>
  );
}
