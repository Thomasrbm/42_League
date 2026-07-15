import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Users } from 'lucide-react';
import { Button } from '../../components/Button';
import {
  TournamentPrizePicker,
  buildPrizePayload,
  EMPTY_PRIZE,
  type PrizeFormState,
} from '../../components/tournois/TournamentPrizePicker';
import { PlayerSearch } from '../defis/shared/PlayerSearch';
import { api, type LeaderboardEntry } from '../../lib/api';
import { useFlash } from '../../hooks/useFlash';
import { useLeagueData } from '../../hooks/useLeagueData';
import { haptic } from '../../mobile/feedback/useHaptic';
import { useT } from '../../lib/i18n';

type Capacity = 8 | 16 | 32;
type Mode = '1v1' | '2v2';
type Format = 'elimination' | 'pools' | 'league';

// Poules : disponibles à partir de 12 joueurs (cohérent avec le modal desktop).
const POOLS_MIN = 12;

export function CreateTournamentPage() {
  const navigate = useNavigate();
  const flash = useFlash();
  const { refresh, me, leaderboard, locations } = useLeagueData();
  const t = useT();
  const isAdmin = !!me?.isAdmin;

  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState<number>(8);
  const [format, setFormat] = useState<Format>('elimination');
  const [kind, setKind] = useState<'friendly' | 'official'>('friendly');
  const [mode, setMode] = useState<Mode>('1v1');
  const [partner, setPartner] = useState<LeaderboardEntry | null>(null);
  // L'organisateur participe-t-il ? Décoché par défaut : créer ≠ jouer.
  const [selfJoin, setSelfJoin] = useState(false);
  const [prize, setPrize] = useState<PrizeFormState>(EMPTY_PRIZE);
  // Économie (officiels) : multiplicateur final du pari (2..10) + cash-prize du champion.
  const [betFinalMult, setBetFinalMult] = useState(2);
  const [cashPrize, setCashPrize] = useState('');
  const [busy, setBusy] = useState(false);

  // Coéquipiers candidats : tous les joueurs sauf moi (le créateur).
  const partnerCandidates = leaderboard.filter((p) => p.login !== me?.login);

  const isLeague = format === 'league';
  const poolsAllowed = capacity >= POOLS_MIN;
  // Ligue : nombre de joueurs libre (l'admin compose les affiches). Sinon, les
  // poules retombent en élimination directe si la capacité est trop faible.
  const effectiveFormat: Format = isLeague ? 'league' : poolsAllowed ? format : 'elimination';

  // Coéquipier requis seulement si l'organisateur participe à un 2v2.
  const needsPartner = mode === '2v2' && selfJoin;
  const canSubmit = name.trim().length > 0 && (!needsPartner || !!partner);

  const submit = async () => {
    const n = name.trim();
    if (!n) { haptic('error'); return; }
    if (needsPartner && !partner) {
      flash.show(t('tournois.create.needPartner'), 'error');
      haptic('error');
      return;
    }
    setBusy(true);
    try {
      // Les non-admins ne créent que des amicaux ; la récompense n'est envoyée
      // que pour un officiel (sinon le backend 400).
      const effKind = isAdmin ? kind : 'friendly';
      const prizePayload = effKind === 'official' ? buildPrizePayload(prize) : { kind: 'none' as const };
      const cashBase = cashPrize.trim() ? Math.max(0, Math.round(Number(cashPrize))) : 0;
      const tNew = await api.createTournament({
        name: n,
        capacity,
        kind: effKind,
        format: effectiveFormat,
        mode,
        selfJoin,
        partnerLogin: needsPartner ? partner!.login : undefined,
        prize: prizePayload,
        betFinalMult: effKind === 'official' ? betFinalMult : undefined,
        cashPrizeBase: effKind === 'official' && cashBase > 0 ? cashBase : undefined,
      });
      haptic('success');
      await refresh();
      navigate(`/tournaments/${encodeURIComponent(tNew.id)}`, { replace: true });
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-8 pb-8">

      {/* ── Back ── */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="self-start flex items-center gap-1.5 text-muted text-sm font-semibold active:opacity-60 transition-opacity tap-transparent -ms-0.5"
        aria-label={t('tournois.createPage.back')}
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
        {t('tournois.createPage.back')}
      </button>

      {/* ── Hero visuel ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-2xl overflow-hidden flex flex-col items-center justify-center py-10 gap-3"
        style={{
          background: 'linear-gradient(160deg, rgba(20,184,166,0.18) 0%, rgba(20,184,166,0.04) 60%, transparent 100%)',
          border: '1.5px solid rgba(20,184,166,0.25)',
        }}
      >
        {/* Halo */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(20,184,166,0.12) 0%, transparent 70%)',
          }}
        />
        {/* Bracket SVG décoratif */}
        <svg viewBox="0 0 160 60" className="absolute bottom-0 left-0 right-0 w-full opacity-[0.07]" aria-hidden>
          {[10,10,40,40].map((y,i) => (
            <line key={i} x1={14+(i%2)*24} y1={y} x2={38+(i%2)*24} y2={y} stroke="#14b8a6" strokeWidth="2" strokeLinecap="round"/>
          ))}
          <line x1={38} y1={10} x2={38} y2={40} stroke="#14b8a6" strokeWidth="2"/>
          <line x1={62} y1={10} x2={62} y2={40} stroke="#14b8a6" strokeWidth="2"/>
          <line x1={38} y1={25} x2={80} y2={25} stroke="#14b8a6" strokeWidth="2" strokeLinecap="round"/>
          <line x1={62} y1={25} x2={100} y2={25} stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round"/>
          <text x={112} y={30} fontSize="16" textAnchor="middle">🏆</text>
        </svg>

        <div className="relative z-10 flex flex-col items-center gap-2 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(20,184,166,0.15)', border: '1.5px solid rgba(20,184,166,0.3)' }}
          >
            <span className="text-2xl">⚔️</span>
          </div>
          <h1 className="font-display text-xl font-black text-text-strong tracking-tight">
            {t('tournois.createPage.heroTitle')}
          </h1>
          <p className="text-xs text-muted-2 font-medium">{t('tournois.createPage.heroSub')}</p>
        </div>
      </motion.div>

      {/* ── Formulaire ── */}
      <div className="flex flex-col gap-6">

        {/* Nom */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.08 }}
        >
          <label className="block text-[11px] uppercase tracking-widest text-muted font-bold mb-3">
            {t('tournois.field.name')}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder={t('tournois.createPage.namePlaceholder')}
            maxLength={60}
            className="w-full px-4 py-4 bg-bg-1 border-2 border-border rounded-2xl text-base font-semibold focus:border-teal outline-none text-text-strong placeholder:text-muted/50 transition-all allow-select"
          />
          {name.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] text-muted-2 mt-1.5 text-end"
            >
              {name.length}/60
            </motion.p>
          )}
        </motion.div>

        {/* Mode : 1v1 / 2v2 (babyfoot doubles) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.11 }}
        >
          <label className="block text-[11px] uppercase tracking-widest text-muted font-bold mb-3">
            {t('tournois.field.mode')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            {([
              { m: '1v1' as Mode, icon: User, label: t('tournois.mode.1v1'), sub: t('tournois.mode.1v1.sub') },
              { m: '2v2' as Mode, icon: Users, label: t('tournois.mode.2v2'), sub: t('tournois.mode.2v2.sub') },
            ]).map(({ m, icon: Icon, label, sub }) => {
              const active = mode === m;
              return (
                <motion.button
                  key={m}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    haptic('selection');
                    setMode(m);
                    if (m === '1v1') setPartner(null);
                  }}
                  className={`relative flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border-2 tap-transparent transition-all ${
                    active ? 'border-teal bg-teal/[0.08]' : 'border-border/60 bg-bg-1/50'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${active ? 'text-teal' : 'text-muted-2'}`} strokeWidth={2.2} />
                  <span className={`text-sm font-extrabold ${active ? 'text-teal' : 'text-text-strong'}`}>{label}</span>
                  <span className={`text-[10px] font-medium ${active ? 'text-teal/70' : 'text-muted-2/60'}`}>{sub}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Je participe ? — décoché par défaut : organiser n'oblige pas à jouer */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.115 }}
        >
          <button
            type="button"
            onClick={() => {
              haptic('selection');
              setSelfJoin((v) => {
                if (v) setPartner(null); // on quitte → plus de coéquipier requis
                return !v;
              });
            }}
            className={`w-full flex items-center gap-3 px-4 py-4 rounded-2xl border-2 tap-transparent transition-all text-start ${
              selfJoin ? 'border-teal bg-teal/[0.08]' : 'border-border/60 bg-bg-1/50'
            }`}
          >
            <span
              className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                selfJoin ? 'border-teal bg-teal' : 'border-border'
              }`}
            >
              {selfJoin && (
                <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 20 20" fill="none">
                  <path d="M5 10.5l3.5 3.5L15 6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="flex flex-col">
              <span className={`text-sm font-extrabold ${selfJoin ? 'text-teal' : 'text-text-strong'}`}>
                {t('tournois.field.selfJoin')}
              </span>
              <span className="text-[10px] font-medium text-muted-2/70 mt-0.5">
                {t('tournois.field.selfJoin.hint')}
              </span>
            </span>
          </button>
        </motion.div>

        {/* Coéquipier (2v2) — le créateur engage sa paire (seulement s'il participe) */}
        {mode === '2v2' && selfJoin && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.12 }}
          >
            <label className="block text-[11px] uppercase tracking-widest text-muted font-bold mb-3">
              {t('tournois.field.partner')}
            </label>
            <PlayerSearch
              players={partnerCandidates}
              recentPlayers={[]}
              opponentCounts={{}}
              selected={partner}
              onSelect={setPartner}
              onClear={() => setPartner(null)}
              locations={locations}
              variant="mobile"
            />
          </motion.div>
        )}

        {/* Format : élimination / poules / ligue — choisi AVANT le nombre de joueurs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.13 }}
        >
          <label className="block text-[11px] uppercase tracking-widest text-muted font-bold mb-3">
            {t('tournois.field.format')}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { f: 'elimination' as Format, label: t('tournois.field.format.elim') },
              { f: 'pools' as Format, label: poolsAllowed ? t('tournois.field.format.pools') : t('tournois.field.format.pools.locked') },
              { f: 'league' as Format, label: t('tournois.field.format.league') },
            ]).map(({ f, label }) => {
              const active = effectiveFormat === f;
              return (
                <motion.button
                  key={f}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (f === 'pools' && !poolsAllowed) {
                      flash.show(t('tournois.flash.poolsMin').replace('{n}', String(POOLS_MIN)), 'error');
                      haptic('error');
                      return;
                    }
                    haptic('selection');
                    // En quittant la ligue, recale une capacité libre vers une puissance de 2 valide.
                    if (f !== 'league' && (capacity < 8 || (capacity & (capacity - 1)) !== 0)) setCapacity(8);
                    setFormat(f);
                  }}
                  className={`py-3 rounded-2xl border-2 text-[12px] font-extrabold uppercase tracking-wide tap-transparent transition-all ${
                    active ? 'border-teal bg-teal/[0.08] text-teal' : 'border-border/60 bg-bg-1/50 text-muted-2'
                  }`}
                >
                  {label}
                </motion.button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-2/70 mt-2 leading-relaxed">
            {isLeague
              ? t('tournois.field.format.hint.league')
              : poolsAllowed
              ? effectiveFormat === 'pools' ? t('tournois.field.format.hint.pools') : t('tournois.field.format.hint.elim')
              : t('tournois.field.format.hint.minpools').replace('{n}', String(POOLS_MIN))}
          </p>
        </motion.div>

        {/* Capacité */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.14 }}
        >
          <label className="block text-[11px] uppercase tracking-widest text-muted font-bold mb-3">
            {mode === '2v2' ? t('tournois.field.teams') : t('tournois.field.players')}
          </label>
          {isLeague ? (
            // Ligue : nombre de joueurs libre (min 3) — l'admin compose les affiches.
            <div>
              <input
                type="number"
                min={3}
                max={64}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(3, Math.min(64, Number(e.target.value) || 0)))}
                className="w-28 px-4 py-4 bg-bg-1 border-2 border-border rounded-2xl text-base font-semibold focus:border-teal outline-none text-text-strong transition-all tabular-nums allow-select"
              />
              <p className="text-[10px] text-muted-2/70 mt-2">{t('tournois.field.players.hint.league')}</p>
            </div>
          ) : (
          <div className="grid grid-cols-3 gap-3">
            {([8, 16, 32] as Capacity[]).map((c) => {
              const active = capacity === c;
              return (
                <motion.button
                  key={c}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { haptic('selection'); setCapacity(c); }}
                  className={`relative flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border-2 tap-transparent transition-all overflow-hidden ${
                    active
                      ? 'border-teal bg-teal/[0.08]'
                      : 'border-border/60 bg-bg-1/50'
                  }`}
                >
                  {active && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(20,184,166,0.12) 0%, transparent 70%)',
                    }} />
                  )}
                  {/* Silhouettes joueurs */}
                  <div className="flex items-end gap-0.5 relative z-10">
                    {Array.from({ length: Math.min(c, 6) }).map((_, i) => (
                      <div
                        key={i}
                        className={`rounded-full transition-all ${active ? 'bg-teal' : 'bg-muted-2/40'}`}
                        style={{
                          width: 5,
                          height: 12 + (i % 2) * 4,
                          opacity: active ? 0.7 + (i % 2) * 0.3 : 0.4,
                        }}
                      />
                    ))}
                    {c > 6 && (
                      <span className={`text-[9px] font-black ms-0.5 relative z-10 ${active ? 'text-teal' : 'text-muted-2'}`}>
                        +{c - 6}
                      </span>
                    )}
                  </div>
                  <span className={`font-mono font-black text-3xl tabular-nums relative z-10 ${active ? 'text-teal' : 'text-text-strong'}`}>
                    {c}
                  </span>
                  <div className="relative z-10 text-center">
                    <div className={`text-[11px] font-extrabold uppercase tracking-wide ${active ? 'text-teal' : 'text-muted-2'}`}>
                      {mode === '2v2' ? t('tournois.field.teams') : t('tournois.mobile.players')}
                    </div>
                    <div className={`text-[10px] font-medium mt-0.5 ${active ? 'text-teal/70' : 'text-muted-2/60'}`}>
                      {mode === '2v2'
                        ? `${c * 2} ${t('tournois.mobile.players')}`
                        : c === 8 ? t('tournois.createPage.cap8') : t('tournois.createPage.cap16')}
                    </div>
                  </div>
                  {active && (
                    <motion.div
                      layoutId="capacity-indicator"
                      className="absolute bottom-2 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-teal"
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
          )}
        </motion.div>

        {/* Type (admins) : amical / officiel */}
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.17 }}
          >
            <label className="block text-[11px] uppercase tracking-widest text-muted font-bold mb-3">
              {t('tournois.field.type')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['friendly', 'official'] as const).map((k) => {
                const active = kind === k;
                return (
                  <motion.button
                    key={k}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { haptic('selection'); setKind(k); }}
                    className={`py-3 rounded-2xl border-2 text-[12px] font-extrabold uppercase tracking-wide tap-transparent transition-all ${
                      active ? 'border-teal bg-teal/[0.08] text-teal' : 'border-border/60 bg-bg-1/50 text-muted-2'
                    }`}
                  >
                    {k === 'friendly' ? t('tournois.type.friendly') : t('tournois.type.official')}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Récompense (officiel) */}
        {isAdmin && kind === 'official' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.2 }}
          >
            <label className="block text-[11px] uppercase tracking-widest text-muted font-bold mb-1">
              {t('tournois.field.prize')}
            </label>
            <p className="text-[10px] text-muted-2 mb-3">{t('tournois.field.prize.hint')}</p>
            <TournamentPrizePicker value={prize} onChange={setPrize} />
          </motion.div>
        )}

        {/* Économie (admin · officiel) : multiplicateur de pari + cash-prize par palier */}
        {isAdmin && kind === 'official' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.22 }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-muted font-bold mb-1">
                {t('tournois.field.betMult')}
              </label>
              <p className="text-[10px] text-muted-2 mb-2">{t('tournois.field.betMult.hint')}</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={2}
                  max={10}
                  step={1}
                  value={betFinalMult}
                  onChange={(e) => setBetFinalMult(Number(e.target.value))}
                  className="flex-1 accent-teal"
                />
                <span className="font-mono font-black text-teal text-lg tabular-nums w-10 text-end">×{betFinalMult}</span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-muted font-bold mb-1">
                {t('tournois.field.cashPrize')}
              </label>
              <p className="text-[10px] text-muted-2 mb-2">{t('tournois.field.cashPrize.hint')}</p>
              <div className="relative">
                <img src="/42coin.webp" alt="" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={cashPrize}
                  onChange={(e) => setCashPrize(e.target.value)}
                  placeholder={t('tournois.field.cashPrize.ph')}
                  className="w-full ps-9 pe-4 py-3 bg-bg-1 border-2 border-border rounded-xl text-base font-semibold focus:border-teal outline-none text-text-strong placeholder:text-muted/50 transition-all allow-select"
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.2 }}
          className="flex flex-col gap-3"
        >
          <Button
            loading={busy}
            onClick={submit}
            className="w-full py-4 text-[15px] font-extrabold"
            disabled={!canSubmit}
          >
            {t('tournois.modal.submit')}
          </Button>
          <p className="text-[10px] text-muted/50 text-center font-medium leading-relaxed">
            {t('tournois.createPage.footer')}
          </p>
        </motion.div>

      </div>

      {/* Spacer mobile : dégage le bouton « Créer » de la tab bar fixe (60px +
          safe-area). C'est un VRAI élément, pas un padding-bottom — iOS Safari/
          Chrome ignore le padding-bottom du conteneur scrollable en fin de scroll,
          alors qu'un élément de hauteur réelle est toujours atteignable au scroll.
          Masqué en desktop (sm+), où il n'y a pas de tab bar. */}
      <div
        className="sm:hidden"
        style={{ height: 'calc(60px + env(safe-area-inset-bottom) + 24px)' }}
        aria-hidden
      />
    </div>
  );
}
