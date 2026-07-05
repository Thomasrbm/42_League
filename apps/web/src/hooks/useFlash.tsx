import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Action optionnelle du toast (pattern « Annuler » post-action). */
export interface FlashAction {
  label: string;
  run: () => void;
}

interface FlashState {
  message: string | null;
  kind: 'info' | 'error';
  action?: FlashAction;
}

interface FlashContextValue {
  flash: FlashState;
  show: (message: string, kind?: 'info' | 'error', action?: FlashAction) => void;
  clear: () => void;
}

const FlashContext = createContext<FlashContextValue | null>(null);

export function FlashProvider({ children }: { children: ReactNode }) {
  const [flash, setFlash] = useState<FlashState>({ message: null, kind: 'info' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // File d'attente : plusieurs messages rapprochés s'enchaînent au lieu de
  // s'écraser (ex. erreurs en cascade d'un « tout récupérer »).
  const queue = useRef<{ message: string; kind: 'info' | 'error'; action?: FlashAction }[]>([]);
  const current = useRef<string | null>(null);

  /** Durée d'affichage proportionnelle à la longueur (3 s → 7 s, ≥5 s si action). */
  const durationFor = (message: string, hasAction: boolean) =>
    Math.min(7000, Math.max(hasAction ? 5000 : 3000, 2200 + message.length * 45));

  const playNext = useCallback(() => {
    const next = queue.current.shift();
    if (!next) {
      current.current = null;
      timer.current = null;
      setFlash({ message: null, kind: 'info' });
      return;
    }
    current.current = next.message;
    setFlash(next);
    timer.current = setTimeout(playNext, durationFor(next.message, !!next.action));
  }, []);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    queue.current = [];
    current.current = null;
    setFlash({ message: null, kind: 'info' });
  }, []);

  const show = useCallback(
    (message: string, kind: 'info' | 'error' = 'info', action?: FlashAction) => {
      // Dédoublonne : même message déjà affiché ou déjà en file → ignoré.
      if (current.current === message || queue.current.some((f) => f.message === message)) return;
      queue.current.push({ message, kind, action });
      if (!timer.current) playNext();
    },
    [playNext],
  );

  const value = useMemo(() => ({ flash, show, clear }), [flash, show, clear]);
  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

export function useFlash(): FlashContextValue {
  const ctx = useContext(FlashContext);
  if (!ctx) throw new Error('useFlash must be used within <FlashProvider>');
  return ctx;
}
