import { useState, useEffect } from 'react';
import { Button } from './Button';
import { useT } from '../lib/i18n';

interface ContestModalProps {
  declarerLogin: string;
  score: string;
  busy: boolean;
  onSubmit: (reason: 'never_played' | 'wrong_score', message: string) => void;
  onClose: () => void;
}

export function ContestModal({
  declarerLogin,
  score,
  busy,
  onSubmit,
  onClose,
}: ContestModalProps) {
  const t = useT();
  const [reason, setReason] = useState<'never_played' | 'wrong_score' | null>(null);
  const [message, setMessage] = useState('');
  const canSubmit = reason !== null && message.trim().length >= 10 && !busy;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 backdrop-blur-md animate-fade-in">
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
      <div
        className="relative card-hud border-red/40 rounded-2xl p-5 sm:p-6 w-full max-w-md animate-pop overflow-hidden"
        style={{
          boxShadow:
            '0 18px 48px rgba(0,0,0,0.7), 0 0 40px rgba(255,83,102,0.18), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Filigrane rouge sourd */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background:
              'radial-gradient(ellipse at top, rgba(255,83,102,0.12) 0%, transparent 60%)',
          }}
        />

        {/* Title */}
        <div className="relative flex items-start justify-between mb-4">
          <div>
            <div className="font-gaming text-xs font-extrabold uppercase tracking-[0.18em] text-red mb-1 flex items-center gap-1.5">
              <span className="inline-block w-1 h-3 bg-red rounded-sm" />
              {t('contest.title')}
            </div>
            <div className="text-[11px] text-muted-2">
              <span className="font-semibold text-text-strong">{declarerLogin}</span>
              {' '}{t('contest.declared')}{' '}
              <span className="font-bold tabular-nums text-text-strong">{score}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('confirm.cancel')}
            className="text-muted hover:text-gold transition-colors text-xl leading-none w-10 h-10 flex items-center justify-center rounded-full hover:bg-gold/10"
          >
            ×
          </button>
        </div>

        {/* Trust warning */}
        <div className="relative mb-4 bg-red/[0.08] border border-red/30 rounded-lg px-3 py-2.5 text-[11px] text-[#ffb3bf] leading-relaxed">
          ⚠ {t('contest.trustWarning')}
        </div>

        {/* Reason selector */}
        <div className="relative mb-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted font-extrabold mb-2">
            {t('contest.reason')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'never_played', label: t('contest.reason.neverPlayed'), icon: '🚫' },
              { value: 'wrong_score', label: t('contest.reason.wrongScore'), icon: '❌' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setReason(opt.value)}
                className={`p-3 rounded-lg border text-left transition-all duration-200 active:scale-[0.98] ${
                  reason === opt.value
                    ? 'border-red/70 bg-red/15 text-text-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                    : 'border-border bg-bg-2/40 text-muted-2 hover:border-red/40 hover:bg-bg-2'
                }`}
              >
                <div className="text-lg mb-1">{opt.icon}</div>
                <div className="text-[11px] font-semibold leading-tight">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div className="relative mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted font-extrabold">
              {t('contest.explain')} <span className="text-red">*</span>
            </div>
            <div className={`text-[10px] tabular-nums ${message.length < 10 ? 'text-red/70' : 'text-muted'}`}>
              {message.length} / 500
            </div>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 500))}
            placeholder={t('contest.placeholder')}
            rows={3}
            className="w-full px-3 py-2.5 bg-bg-0 border border-border rounded-lg text-sm focus:border-red/70 focus:shadow-[inset_0_0_0_1px_rgba(255,83,102,0.2)] outline-none resize-none text-text-strong placeholder:text-muted transition-all leading-relaxed"
          />
          {message.length > 0 && message.trim().length < 10 && (
            <p className="mt-1 text-[10px] text-red/70">{t('contest.minChars')}</p>
          )}
        </div>

        {/* Actions */}
        <div className="relative flex gap-2">
          <Button
            variant="danger"
            size="md"
            loading={busy}
            disabled={!canSubmit}
            onClick={() => reason && onSubmit(reason, message.trim())}
            className="flex-1"
          >
            {t('contest.submit')}
          </Button>
          <Button size="md" variant="ghost" onClick={onClose}>
            {t('confirm.cancel')}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
