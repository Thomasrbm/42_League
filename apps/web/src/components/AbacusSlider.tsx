import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface AbacusSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

const TRACK_PADDING_PX = 28;

type BeadTone = 'neg' | 'zero' | 'pos';

function toneFor(value: number): BeadTone {
  if (value < 0) return 'neg';
  if (value === 0) return 'zero';
  return 'pos';
}

// Gradient de sphère 3D — highlight à 30% 22% pour un éclairage top-left premium
const BEAD_GRADIENT: Record<BeadTone, string> = {
  neg: 'radial-gradient(circle at 30% 22%, #ffcdd5 0%, #ff6878 22%, #e8263c 52%, #7a0618 100%)',
  zero: 'radial-gradient(circle at 30% 22%, #f0ebe0 0%, #bfb49e 28%, #7a6e58 58%, #241e14 100%)',
  pos: 'radial-gradient(circle at 30% 22%, #fff6cc 0%, #ffd34a 22%, #c88c10 52%, #3e2600 100%)',
};

const BEAD_HALO: Record<BeadTone, string> = {
  neg: 'radial-gradient(circle, rgba(232,38,60,0.30) 0%, transparent 68%)',
  zero: 'radial-gradient(circle, rgba(120,108,90,0.22) 0%, transparent 68%)',
  pos: 'radial-gradient(circle, rgba(255,201,74,0.34) 0%, transparent 68%)',
};

const READOUT_COLOR: Record<BeadTone, string> = {
  neg: 'text-red',
  zero: 'text-muted-2',
  pos: 'text-gold',
};

const READOUT_GLOW: Record<BeadTone, string> = {
  neg: '0 0 28px rgba(255,83,102,0.50)',
  zero: 'none',
  pos: '0 0 28px rgba(255,201,74,0.55)',
};

function beadShadow(tone: BeadTone, dragging: boolean): string {
  const r = dragging ? 32 : 20;
  const a = dragging ? 0.75 : 0.55;
  const glow =
    tone === 'neg'
      ? `0 0 ${r}px rgba(232,38,60,${a})`
      : tone === 'zero'
        ? `0 0 ${dragging ? 22 : 14}px rgba(120,108,90,${dragging ? 0.42 : 0.28})`
        : `0 0 ${r}px rgba(255,193,50,${a})`;
  return `${glow}, 0 ${dragging ? 12 : 8}px ${dragging ? 20 : 14}px rgba(0,0,0,0.60), inset -3px -4px 8px rgba(0,0,0,0.38), inset 2px 2px 5px rgba(255,255,255,0.32)`;
}

// ─── Bouton −/+ avec maintien enfoncé (répétition automatique) ──────────────

interface StepButtonProps {
  direction: -1 | 1;
  disabled: boolean;
  tone: BeadTone;
  onStep: () => void;
}

function StepButton({ direction, disabled, tone, onStep }: StepButtonProps) {
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startHold = () => {
    onStep();
    holdRef.current = setInterval(onStep, 120);
  };
  const stopHold = () => {
    if (holdRef.current !== null) {
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
  };
  useEffect(() => stopHold, []);

  const activeColor = tone === 'neg' ? 'rgba(232,38,60,0.22)' : tone === 'pos' ? 'rgba(255,193,50,0.22)' : 'rgba(120,108,90,0.18)';
  const glowColor  = tone === 'neg' ? 'rgba(232,38,60,0.55)'  : tone === 'pos' ? 'rgba(255,193,50,0.55)'  : 'rgba(120,108,90,0.40)';
  const textColor  = tone === 'neg' ? '#ff6878' : tone === 'pos' ? '#ffd34a' : '#a7b1c2';

  return (
    <button
      type="button"
      aria-label={direction === -1 ? 'Moins' : 'Plus'}
      disabled={disabled}
      onPointerDown={(e) => { e.preventDefault(); if (!disabled) startHold(); }}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      className="flex-shrink-0 relative grid place-items-center w-10 h-10 rounded-full select-none touch-none
                 transition-all duration-150 active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
      style={{
        background: 'linear-gradient(145deg, #1e1a14 0%, #0e0c09 100%)',
        boxShadow: `inset 0 1px 0 rgba(255,215,120,0.12), inset 0 -1px 0 rgba(0,0,0,0.5), 0 4px 10px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,215,120,0.14)`,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Halo coloré actif — s'allume au hover/focus */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-150 pointer-events-none
                   group-hover:opacity-100"
        style={{ background: activeColor }}
      />
      {/* Symbole */}
      <span
        className="relative z-10 font-black text-lg leading-none select-none"
        style={{ color: textColor, textShadow: disabled ? 'none' : `0 0 10px ${glowColor}` }}
      >
        {direction === -1 ? '−' : '+'}
      </span>
    </button>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export function AbacusSlider({ value, onChange, min = -10, max = 9 }: AbacusSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const clamp = useCallback((n: number) => Math.max(min, Math.min(max, n)), [min, max]);

  const valueFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return min;
      const rect = track.getBoundingClientRect();
      const usable = rect.width - TRACK_PADDING_PX * 2;
      if (usable <= 0) return min;
      const x = Math.max(0, Math.min(usable, clientX - rect.left - TRACK_PADDING_PX));
      return clamp(Math.round(min + (x / usable) * (max - min)));
    },
    [min, max, clamp],
  );

  const commitFromPointer = (clientX: number) => {
    const next = valueFromPointer(clientX);
    if (next !== value) onChange(next);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    commitFromPointer(e.clientX);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    commitFromPointer(e.clientX);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 :
      e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (step !== 0) {
      e.preventDefault();
      const next = clamp(value + step);
      if (next !== value) onChange(next);
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); onChange(min); }
    else if (e.key === 'End') { e.preventDefault(); onChange(max); }
  };

  const ratio = max === min ? 0 : (value - min) / (max - min);
  const tone = toneFor(value);

  const step = useCallback(
    (dir: -1 | 1) => {
      const next = clamp(value + dir);
      if (next !== value) onChange(next);
    },
    [value, clamp, onChange],
  );

  return (
    <div className="select-none">
      {/* Affichage numérique */}
      <div className="flex items-end justify-center mb-4 h-14">
        <span
          key={value}
          className={`text-6xl font-black tracking-tighter leading-none animate-bead-pulse ${READOUT_COLOR[tone]}`}
          style={{ textShadow: READOUT_GLOW[tone] }}
        >
          {value}
        </span>
      </div>

      {/* Tige + perle + boutons −/+ */}
      <div className="flex items-center gap-2">
        <StepButton direction={-1} disabled={value <= min} tone={tone} onStep={() => step(-1)} />
        <div className="flex-1 min-w-0">
        <div
          ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label="Score du perdant (gamelles autorisées)"
        className={`relative h-16 px-7 touch-none outline-none rounded focus-visible:ring-2 focus-visible:ring-gold/60 ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Tige */}
        <div
          className="absolute top-1/2 left-7 right-7 h-[6px] -translate-y-1/2 rounded-full"
          style={{
            background:
              'linear-gradient(to bottom, #090b10 0%, #26303f 18%, #7c8698 45%, #a7b1c2 52%, #7c8698 60%, #1f2836 82%, #090b10 100%)',
            boxShadow:
              '0 1px 0 rgba(255,247,228,0.16) inset, 0 -1px 0 rgba(0,0,0,0.65) inset, 0 8px 14px rgba(0,0,0,0.6), 0 0 22px rgba(255,201,74,0.08)',
          }}
        />
        {/* Embouts */}
        {(['left-6', 'right-6'] as const).map((side) => (
          <div
            key={side}
            className={`absolute top-1/2 ${side} w-2 h-3 -translate-y-1/2 rounded-sm`}
            style={{
              background: 'linear-gradient(to bottom, #26303f, #090b10 60%, #151b26)',
              boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.18), 0 2px 4px rgba(0,0,0,0.55)',
            }}
          />
        ))}

        {/* Repères de valeur */}
        {ticks.map((tick) => {
          const tickRatio = (tick - min) / (max - min);
          const isMajor = tick === min || tick === max || tick === 0;
          const isNear = Math.abs(tick - value) <= 1;
          return (
            <button
              key={tick}
              type="button"
              tabIndex={-1}
              aria-label={`Score ${tick}`}
              onClick={(e) => { e.stopPropagation(); onChange(tick); }}
              className="absolute top-1/2 -translate-x-1/2 cursor-pointer bg-transparent border-0 p-0"
              style={{
                left: `calc(${TRACK_PADDING_PX}px + ${tickRatio} * (100% - ${TRACK_PADDING_PX * 2}px))`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                className={`mx-auto rounded-full transition-all duration-200 ${
                  isMajor
                    ? 'w-[3px] h-5 bg-muted-2/70'
                    : isNear
                      ? 'w-[2px] h-3.5 bg-muted/80'
                      : 'w-[2px] h-2.5 bg-muted/40'
                }`}
              />
            </button>
          );
        })}

        {/* Perle */}
        <div
          className="absolute top-1/2 pointer-events-none z-10"
          style={{
            left: `calc(${TRACK_PADDING_PX}px + ${ratio} * (100% - ${TRACK_PADDING_PX * 2}px))`,
            transform: 'translate(-50%, -50%)',
            transition: dragging
              ? 'left 80ms cubic-bezier(0.22, 1, 0.36, 1)'
              : 'left 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {/* Halo */}
          <div
            className={`absolute inset-0 rounded-full transition-all duration-300 ${
              dragging ? 'scale-[1.65] opacity-100' : 'scale-100 opacity-0'
            }`}
            style={{ background: BEAD_HALO[tone] }}
          />
          {/* Sphère */}
          <div
            className={`relative w-11 h-11 rounded-full transition-transform duration-150 ${
              dragging ? 'scale-[1.10]' : 'scale-100'
            }`}
            style={{
              background: BEAD_GRADIENT[tone],
              boxShadow: beadShadow(tone, dragging),
            }}
          >
            {/* Highlight spéculaire */}
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                top: 6,
                left: 8,
                width: 13,
                height: 9,
                background: 'radial-gradient(ellipse, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0) 70%)',
                filter: 'blur(0.4px)',
              }}
            />
            {/* Reflet secondaire bas-droit (donne le volume) */}
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                bottom: 7,
                right: 7,
                width: 6,
                height: 4,
                background: 'radial-gradient(ellipse, rgba(255,255,255,0.18) 0%, transparent 100%)',
                filter: 'blur(0.8px)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Repères min / 0 / max */}
      <div className="flex justify-between text-[10px] text-muted mt-2 px-5 font-mono font-bold opacity-70 tracking-wider">
        <span>{min}</span>
        {min < 0 && max > 0 && (
          <span className={tone === 'zero' ? 'text-muted-2' : ''}>0</span>
        )}
        <span>{max}</span>
      </div>
        </div>{/* flex-1 */}
        <StepButton direction={1} disabled={value >= max} tone={tone} onStep={() => step(1)} />
      </div>{/* flex row */}
    </div>
  );
}
