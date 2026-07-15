/**
 * TeamEloChart — même moteur SVG bezier que EloChart, adapté aux équipes 2v2.
 *
 * Reçoit directement des `TeamEloPoint[]` (calculés côté serveur) au lieu de
 * reconstruire l'historique depuis des PlayedMatch individuels.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import type { TeamEloPoint } from '../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCubicPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0]!.x} ${pts[0]!.y}` : '';
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const curr = pts[i]!;
    const t = 0.35;
    const cp1x = prev.x + (curr.x - prev.x) * t;
    const cp2x = curr.x - (curr.x - prev.x) * t;
    d += ` C ${cp1x} ${prev.y}, ${cp2x} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(iso));
  } catch {
    return '';
  }
}

const GOLD = '#ffc94a';
const RED = '#ff5366';

// ─── Composant ────────────────────────────────────────────────────────────────

interface TeamEloChartProps {
  points: TeamEloPoint[];
  height?: number;
  /** Identifiant unique pour les IDs SVG (évite les conflits entre charts). */
  uid: string;
}

export function TeamEloChart({ points, height = 160, uid }: TeamEloChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(360);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width;
      if (w && w > 0) setW(w);
    });
    ro.observe(el);
    setW(el.clientWidth || 360);
    return () => ro.disconnect();
  }, []);

  const mouseX = useMotionValue(-1);
  const springX = useSpring(mouseX, { stiffness: 300, damping: 30, mass: 0.5 });
  const [hovered, setHovered] = useState<number | null>(null);

  const H = height;
  const padL = 4; const padR = 4; const padTop = 12; const padBot = 8;
  const plotH = H - padTop - padBot;

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-2 italic"
        style={{ height: H }}
      >
        Pas encore assez de matches pour afficher une courbe.
      </div>
    );
  }

  const eloValues = points.map((p) => p.elo);
  const minElo = Math.min(...eloValues);
  const maxElo = Math.max(...eloValues);
  const range = maxElo - minElo || 80;
  const padV = range * 0.25;
  const yMin = minElo - padV;
  const yMax = maxElo + padV;

  const yOf = (elo: number) => padTop + (1 - (elo - yMin) / (yMax - yMin)) * plotH;

  const mapped = points.map((p, i) => ({
    x: padL + (i / Math.max(points.length - 1, 1)) * (W - padL - padR),
    y: yOf(p.elo),
    ...p,
  }));

  const isUp = (points.at(-1)?.elo ?? 0) >= (points[0]?.elo ?? 0);
  const lineColor = isUp ? GOLD : RED;
  const gradId = `tec-${uid}`;

  const linePath = buildCubicPath(mapped);
  const areaPath =
    linePath +
    ` L ${mapped.at(-1)!.x} ${H - padBot} L ${padL} ${H - padBot} Z`;

  const hoveredPt = hovered !== null ? mapped[hovered] : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    mouseX.set(relX);
    let best = 0; let bestDist = Infinity;
    mapped.forEach((p, i) => {
      const d = Math.abs(p.x - relX);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setHovered(best);
  };

  const dotCx = useTransform(springX, () => hoveredPt?.x ?? -100);

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height: H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHovered(null); mouseX.set(-1); }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="85%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gradient fill */}
        <motion.path
          d={areaPath}
          fill={`url(#${gradId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />

        {/* Main line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        />

        {/* Last point dot */}
        {(() => {
          const last = mapped.at(-1)!;
          return (
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
              <circle cx={last.x} cy={last.y} r={5} fill={lineColor} stroke="rgba(8,10,14,0.9)" strokeWidth="2" />
              <circle cx={last.x} cy={last.y} r={9} fill={lineColor} fillOpacity="0.12" />
            </motion.g>
          );
        })()}

        {/* Cursor line */}
        {hoveredPt && (
          <line
            x1={hoveredPt.x} y1={padTop}
            x2={hoveredPt.x} y2={H - padBot}
            stroke={lineColor}
            strokeWidth="1"
            strokeOpacity="0.35"
            strokeDasharray="3 3"
          />
        )}

        {/* Cursor dot */}
        {hoveredPt && (
          <motion.circle
            cx={dotCx}
            cy={hoveredPt.y}
            r="5"
            fill={hoveredPt.delta >= 0 ? GOLD : RED}
            stroke="rgba(8,10,14,0.85)"
            strokeWidth="2"
          />
        )}

        <rect
          x={padL} y={padTop}
          width={W - padL - padR} height={plotH}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
        />
      </svg>

      {/* Tooltip */}
      {hoveredPt && (
        <div
          className="absolute z-20 pointer-events-none -translate-x-1/2 rounded-xl overflow-hidden"
          style={{
            left: Math.min(Math.max(hoveredPt.x, 80), W - 80),
            top: Math.max(hoveredPt.y - 84, 0),
            background: 'linear-gradient(145deg, rgba(24,20,12,0.97) 0%, rgba(14,12,7,0.99) 100%)',
            border: `1px solid ${hoveredPt.delta >= 0 ? 'rgba(255,201,74,0.4)' : 'rgba(255,83,102,0.4)'}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,215,120,0.06)',
            backdropFilter: 'blur(20px)',
            minWidth: 128,
          }}
        >
          <div className="h-[2px]" style={{ background: hoveredPt.delta >= 0 ? GOLD : RED }} />
          <div className="px-3 py-2 space-y-0.5">
            <div className="flex items-baseline gap-2">
              <span
                className="font-display text-base font-black tabular-nums"
                style={{ color: hoveredPt.delta >= 0 ? GOLD : RED }}
              >
                {hoveredPt.elo}
              </span>
              <span className="text-[9px] text-muted uppercase tracking-wider">ELO</span>
              <span
                className={`ms-auto text-[11px] font-mono font-extrabold tabular-nums ${
                  hoveredPt.delta >= 0 ? 'text-[#7fd66e]' : 'text-red'
                }`}
              >
                {hoveredPt.delta >= 0 ? '+' : ''}{hoveredPt.delta}
              </span>
            </div>
            <div className="text-[10px] text-muted-2 font-semibold">
              vs {hoveredPt.opponentPlayer1Login} &amp; {hoveredPt.opponentPlayer2Login}
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[9px] font-extrabold uppercase tracking-wider ${
                  hoveredPt.won ? 'text-gold' : 'text-red'
                }`}
              >
                {hoveredPt.won ? 'Victoire' : 'Défaite'}
              </span>
              <span className="text-[9px] text-muted font-mono">
                {hoveredPt.scoreTeam}–{hoveredPt.scoreOpponent}
              </span>
            </div>
            <div className="text-[9px] text-muted font-mono opacity-60">
              {fmtDate(hoveredPt.playedAt)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
