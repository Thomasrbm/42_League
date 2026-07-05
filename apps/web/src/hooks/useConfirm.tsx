import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useT } from '../lib/i18n';

export interface ConfirmOptions {
  title: string;
  message: string;
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface ActiveConfirm {
  opts: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [active, setActive] = useState<ActiveConfirm | null>(null);
  const okRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => setActive({ opts, resolve })),
    [],
  );

  const finish = useCallback(
    (v: boolean) => {
      if (active) active.resolve(v);
      setActive(null);
    },
    [active],
  );

  useKeyboardConfirm(active != null, finish);
  useFocusOnMount(okRef, active != null);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {active && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 backdrop-blur-md animate-fade-in">
          <div
            className="flex min-h-full items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) finish(false);
            }}
          >
          <div
            className="card-hud relative rounded-2xl p-5 sm:p-6 w-full max-w-md animate-pop"
            style={{
              boxShadow:
                '0 18px 48px rgba(0,0,0,0.65), 0 0 36px rgba(255,201,74,0.18), inset 0 1px 0 rgba(255,215,120,0.1)',
              border: '1px solid rgba(255,201,74,0.3)',
            }}
          >
            <div className="font-gaming text-xs font-extrabold uppercase tracking-[0.18em] text-gold mb-3 flex items-center gap-2">
              <span className="inline-block w-1 h-3 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
              {active.opts.title}
            </div>
            <div className="text-sm leading-relaxed text-text">
              {active.opts.message}
            </div>
            {active.opts.warning && (
              <div className="mt-3 bg-red/[0.08] border border-red/45 text-[#ffb3bf] px-3 py-2.5 rounded-lg text-xs leading-snug">
                {active.opts.warning}
              </div>
            )}
            <div className="flex gap-2.5 justify-end mt-5">
              <button
                onClick={() => finish(false)}
                className="font-extrabold text-xs uppercase tracking-wider px-4 py-2 rounded-lg border border-border text-muted-2 hover:text-gold hover:border-gold/50 hover:bg-gold/5 transition-all"
              >
                {active.opts.cancelLabel ?? t('confirm.cancel')}
              </button>
              <button
                ref={okRef}
                onClick={() => finish(true)}
                className={
                  'shine relative overflow-hidden font-extrabold text-xs uppercase tracking-wider px-4 py-2 rounded-lg transition-all border ' +
                  (active.opts.danger
                    ? 'bg-gradient-to-b from-red to-red-deep text-white border-red/50 hover:shadow-red-glow'
                    : 'bg-gradient-to-b from-[#ffa83a] to-[#c5520a] text-[#1a0d00] border-[#ffc966]/60 hover:brightness-105 hover:shadow-[0_0_18px_rgba(255,128,32,0.5)]')
                }
              >
                <span className="relative z-10">{active.opts.confirmLabel ?? t('confirm.ok')}</span>
              </button>
            </div>
          </div>
        </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

function useKeyboardConfirm(active: boolean, finish: (v: boolean) => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'Enter') finish(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, finish]);
}

function useFocusOnMount(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (active) requestAnimationFrame(() => ref.current?.focus());
  }, [active, ref]);
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx.confirm;
}
