import { Coins } from 'lucide-react';
import { Panel } from '../components/Panel';
import { TrophiesSection } from '../components/TrophiesSection';
import { useT } from '../lib/i18n';

export function TropheesPage() {
  const t = useT();
  return (
    <Panel title={t('trophy.title')} sub={t('trophy.sub')} accent="medal">
      {/* Encart pédagogique : à quoi servent les trophées ? (revenus passifs).
          Chiffres alignés sur TrophiesSection (25 coins/trophée/semaine,
          podium hebdo 1200/700/350) — app interne FR, texte en dur assumé. */}
      <div className="relative mb-5 rounded-2xl border border-gold/35 bg-gold/[0.06] px-4 py-4 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{ background: 'radial-gradient(ellipse at top left, rgb(var(--accent-gold) / 0.12), transparent 60%)' }}
        />
        <div className="relative flex items-start gap-3">
          <span className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border border-gold/40 bg-gold/10 text-gold">
            <Coins className="w-5 h-5" strokeWidth={2.2} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-gaming text-sm font-extrabold uppercase tracking-[0.12em] text-gold">
              Les trophées, c’est du cash
            </h3>
            <p className="text-[12px] text-muted-2 leading-snug mt-1">
              Les trophées sont le <span className="font-bold text-text-strong">Hall of Fame</span> de
              la saison — et ils rapportent des League Coins <span className="font-bold text-text-strong">passifs</span> :
              chaque trophée détenu te verse <span className="text-gold font-bold">25 coins par semaine</span>,
              cumulables sans limite.
            </p>
            <p className="text-[12px] text-muted-2 leading-snug mt-1">
              Bonus : le podium des plus titrés touche une prime hebdo —{' '}
              <span className="text-gold font-bold">🥇 1 200</span> ·{' '}
              <span className="text-gold/90 font-bold">🥈 700</span> ·{' '}
              <span className="text-gold/80 font-bold">🥉 350</span>. Garde tes trophées pour encaisser !
            </p>
          </div>
        </div>
      </div>

      <TrophiesSection title="" />
    </Panel>
  );
}
