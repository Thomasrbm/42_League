import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Lock } from 'lucide-react';
import { BottomSheet } from '../../../mobile/primitives/BottomSheet';
import { Button } from '../../../components/Button';
import { api } from '../../../lib/api';
import { useFlash } from '../../../hooks/useFlash';
import { useLeagueData } from '../../../hooks/useLeagueData';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { useT } from '../../../lib/i18n';

type Capacity = 8 | 16 | 32;
type Kind = 'friendly' | 'official';

interface CreateTournamentSheetProps {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}

const CAPACITY_CHOICES: Capacity[] = [8, 16, 32];

/**
 * BottomSheet de création de tournoi.
 * UX flow accompagnée comme la déclaration de game.
 */
export function CreateTournamentSheet({ open, onClose, onDone }: CreateTournamentSheetProps) {
  const flash = useFlash();
  const navigate = useNavigate();
  const { me } = useLeagueData();
  const t = useT();
  const isAdmin = !!me?.isAdmin;

  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState<Capacity>(8);
  const [kind, setKind] = useState<Kind>('friendly');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setCapacity(8);
    setKind('friendly');
    setImageUrl('');
  };

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      flash.show(t('tournois.flash.nameRequiredShort'), 'error');
      haptic('error');
      return;
    }
    setBusy(true);
    try {
      const img = imageUrl.trim();
      const tNew = await api.createTournament({ name: n, capacity, kind, ...(img ? { imageUrl: img } : {}) });
      flash.show(t('tournois.flash.created').replace('{name}', tNew.name));
      haptic('success');
      await onDone();
      reset();
      onClose();
      navigate(`/tournaments/${encodeURIComponent(tNew.id)}`);
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title={
        <div className="flex items-baseline gap-2">
          <span className="gradient-text-brand">{t('tournois.create')}</span>
        </div>
      }
      snap={80}
    >
      <div className="px-5 pt-4 pb-2 space-y-5">
        {/* Type */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-2">
            {t('tournois.field.type')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <KindButton
              active={kind === 'friendly'}
              onClick={() => {
                haptic('selection');
                setKind('friendly');
              }}
              label={t('tournois.type.friendly')}
              hint={t('tournois.sheet.friendly.hint')}
              tone="teal"
            />
            <KindButton
              active={kind === 'official'}
              onClick={() => {
                if (!isAdmin) {
                  flash.show(t('tournois.official.adminsOnly'), 'error');
                  haptic('warning');
                  return;
                }
                haptic('selection');
                setKind('official');
              }}
              label={t('tournois.type.official')}
              hint={isAdmin ? t('tournois.sheet.official.hint.admin') : t('tournois.sheet.official.hint.locked')}
              tone="gold"
              sealed={!isAdmin}
            />
          </div>
        </div>

        {/* Nom */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-2">
            {t('tournois.field.name')}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('tournois.createPage.namePlaceholder')}
            autoFocus
            maxLength={60}
            className="w-full px-4 py-3.5 bg-bg-1 border-2 border-border rounded-xl text-base font-medium focus:border-teal outline-none text-text-strong placeholder:text-muted transition-all shadow-sm focus:shadow-md tap-transparent allow-select"
          />
        </div>

        {/* Image de couverture (optionnel) */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-2">
            {t('tournois.sheet.cover')} <span className="text-muted-2 normal-case">{t('tournois.sheet.cover.optional')}</span>
          </label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            inputMode="url"
            className="w-full px-4 py-3 bg-bg-1 border-2 border-border rounded-xl text-sm font-medium focus:border-teal outline-none text-text-strong placeholder:text-muted transition-all tap-transparent allow-select"
          />
        </div>

        {/* Capacité */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-2">
            {t('tournois.sheet.capacity')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CAPACITY_CHOICES.map((c) => {
              const active = capacity === c;
              return (
                <motion.button
                  key={c}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    haptic('selection');
                    setCapacity(c);
                  }}
                  className={`relative flex flex-col items-center justify-center gap-1 py-4 rounded-xl border-2 tap-transparent transition-all ${
                    active
                      ? 'border-teal bg-teal/10 text-teal shadow-teal-glow'
                      : 'border-border bg-bg-2/50 text-muted-2'
                  }`}
                >
                  <Users className="w-5 h-5" strokeWidth={2.5} />
                  <span className="font-mono font-extrabold text-base tabular-nums">{c}</span>
                  <span className="text-[9px] uppercase tracking-wider font-bold">{t('tournois.mobile.players')}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <Button
          loading={busy}
          onClick={submit}
          className="w-full py-3.5 text-sm"
          disabled={!name.trim()}
        >
          {t('tournois.modal.submit')}
        </Button>

        <p className="text-[10px] text-muted/70 text-center font-medium leading-relaxed pt-1">
          {t('tournois.sheet.footer')}
        </p>
      </div>
    </BottomSheet>
  );
}

interface KindButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  tone: 'teal' | 'gold';
  /** Verrouillé sous un sceau de cire rouge (non-admin). */
  sealed?: boolean;
}

function KindButton({ active, onClick, label, hint, tone, sealed }: KindButtonProps) {
  const activeStyle =
    tone === 'teal' ? 'border-teal bg-teal/10 text-teal' : 'border-gold bg-gold/10 text-gold';
  return (
    <motion.button
      type="button"
      whileTap={!sealed ? { scale: 0.97 } : undefined}
      onClick={onClick}
      aria-disabled={sealed || undefined}
      className={`relative flex flex-col gap-0.5 py-3 px-3 rounded-xl border-2 tap-transparent transition-all text-start ${
        sealed
          ? 'border-red/40 bg-bg-2/50 text-muted-2'
          : active
          ? activeStyle
          : 'border-border bg-bg-2/50 text-muted-2'
      }`}
    >
      <span className={`text-sm font-extrabold uppercase tracking-wide ${sealed ? 'opacity-50' : ''}`}>{label}</span>
      <span className={`text-[10px] font-medium leading-tight ${sealed ? 'opacity-50' : 'opacity-75'}`}>{hint}</span>
      {/* Sceau de cire rouge cadenassé — option réservée aux admins */}
      {sealed && (
        <motion.span
          initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: -8, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="absolute -top-2 -right-2 flex items-center justify-center w-9 h-9 rounded-full"
          style={{
            background: 'radial-gradient(circle at 38% 32%, #d44 0%, #a31818 45%, #7a0e0e 100%)',
            boxShadow: '0 3px 10px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,140,140,0.35), inset 0 -3px 6px rgba(0,0,0,0.45)',
            border: '2px solid rgba(120,8,8,0.9)',
          }}
        >
          <span className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: 'inset 0 0 0 2px rgba(180,30,30,0.55)' }} />
          <Lock className="relative w-4 h-4 text-[#3a0606]" strokeWidth={2.6} fill="rgba(58,6,6,0.25)" />
        </motion.span>
      )}
    </motion.button>
  );
}
