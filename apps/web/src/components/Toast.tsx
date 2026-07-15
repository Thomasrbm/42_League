import { useFlash } from '../hooks/useFlash';

export function Toast() {
  const { flash, clear } = useFlash();
  if (!flash.message) return null;
  const isError = flash.kind === 'error';
  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in pointer-events-none">
      <div
        className={
          'pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-2xl border max-w-[90vw] sm:max-w-md text-sm font-semibold backdrop-blur-md ' +
          (isError
            ? 'bg-red/15 border-red/70 text-[#ffb3bf] shadow-red-glow'
            : 'glass-strong border-gold/60 text-text-strong shadow-gold-glow')
        }
        onClick={clear}
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
      >
        <span
          aria-hidden
          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
            isError ? 'bg-red animate-pulse' : 'bg-gold animate-pulse'
          }`}
        />
        <span className="min-w-0 break-words">{flash.message}</span>
        {flash.action && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              flash.action?.run();
              clear();
            }}
            className="shrink-0 ms-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-wide bg-gold/15 border border-gold/50 text-gold hover:bg-gold/25 transition-colors"
          >
            {flash.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
