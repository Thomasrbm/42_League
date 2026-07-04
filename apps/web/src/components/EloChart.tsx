/**
 * EloChart — courbe ELO « SmoothLineGraph » (réf. démo motion sur :4242)
 *
 *  - Spline monotone (Fritsch–Carlson) : lisse, sans overshoot
 *  - Curseur libre qui glisse exactement sur la courbe (getPointAtLength)
 *  - Tous les points-matchs affichés ; le plus proche grossit sur place
 *  - Repère vertical + odomètre ELO à roulettes + flèche de tendance
 *  - Grille discrète, glow sur la ligne, tooltip qui suit le point actif
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  animate,
  motion,
  useMotionValue, useMotionValueEvent, useTransform,
} from 'framer-motion';
import type { Game, PlayedMatch } from '../lib/api';
import { useT } from '../lib/i18n';
import { useLeagueData } from '../hooks/useLeagueData';
import { Avatar } from './Avatar';

// ─── Types & helpers ──────────────────────────────────────────────────────────

interface EloChartProps {
  matches: PlayedMatch[];
  myLogin: string;
  currentElo: number;
  game?: Game;
  /** @deprecated kept for compatibility — label supprimé dans tous les cas */
  hideStartLabel?: boolean;
  maxPoints?: number;
  height?: number;
}

interface EloPoint {
  elo: number;
  date: string;
  delta: number;
  isStart: boolean;
  opponent?: string;
  scoreFor?: number;
  scoreAgainst?: number;
}

interface MappedPoint extends EloPoint { x: number; y: number; }

function computeEloHistory(matches: PlayedMatch[], myLogin: string, currentElo: number): EloPoint[] {
  const mine = matches
    .filter((m) => (m.playerALogin === myLogin || m.playerBLogin === myLogin) && m.countedForElo)
    .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
  if (mine.length === 0) return [];
  const deltas = mine.map((m) => (m.playerALogin === myLogin ? m.deltaA : m.deltaB));
  const startElo = currentElo - deltas.reduce((s, d) => s + d, 0);
  const points: EloPoint[] = [{ elo: startElo, date: mine[0]?.playedAt ?? '', delta: 0, isStart: true }];
  let elo = startElo;
  for (let i = 0; i < mine.length; i++) {
    const delta = deltas[i] ?? 0;
    const match = mine[i]!;
    const isA = match.playerALogin === myLogin;
    elo += delta;
    points.push({
      elo, date: match.playedAt, delta, isStart: false,
      opponent: isA ? match.playerBLogin : match.playerALogin,
      scoreFor: isA ? match.scoreA : match.scoreB,
      scoreAgainst: isA ? match.scoreB : match.scoreA,
    });
  }
  return points;
}

/** Spline monotone (Fritsch–Carlson) : lisse, sans overshoot. */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return n === 1 ? `M${pts[0]!.x},${pts[0]!.y}` : '';
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const dx: number[] = [], d: number[] = [];
  for (let i = 0; i < n - 1; i++) { const hx = xs[i + 1]! - xs[i]!; dx.push(hx); d.push((ys[i + 1]! - ys[i]!) / hx); }
  const m = new Array<number>(n);
  m[0] = d[0]!; m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; }
    else {
      const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, s = a * a + b * b;
      if (s > 9) { const tt = 3 / Math.sqrt(s); m[i] = tt * a * d[i]!; m[i + 1] = tt * b * d[i]!; }
    }
  }
  let p = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = xs[i]! + dx[i]! / 3, c1y = ys[i]! + m[i]! * dx[i]! / 3;
    const c2x = xs[i + 1]! - dx[i]! / 3, c2y = ys[i + 1]! - m[i + 1]! * dx[i]! / 3;
    p += ` C${c1x},${c1y} ${c2x},${c2y} ${xs[i + 1]},${ys[i + 1]}`;
  }
  return p;
}

function fmtDate(iso: string): string {
  try { return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(iso)); }
  catch { return ''; }
}

const GOLD = '#ffc94a';
const RED = '#ff5366';
const WIN = '#7fd66e';
const LOSS = '#ff5366';

// Rampe d'amplitude du dégradé de ligne : jaune quand ça stagne (petit delta),
// vert de plus en plus vif à mesure que le gain grossit, rouge quand ça descend.
const STAG = '#ffd24a'; // stagnation (jaune)
const GREEN_STRONG = '#2ee06b'; // gros up : beaucoup plus vert
const DELTA_REF = 22; // |delta| atteignant la teinte pleine (K=32 → ~gros up)

function mixHex(a: string, b: string, t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => {
    const ca = (pa >> sh) & 0xff, cb = (pb >> sh) & 0xff;
    return Math.round(ca + (cb - ca) * u);
  };
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Couleur d'un point selon l'amplitude de son delta ELO. */
function colorForDelta(d: number): string {
  const n = Math.max(-1, Math.min(1, d / DELTA_REF));
  // ease : garde la teinte jaune sur les petits deltas (stagnation), ne vire au
  // vert/rouge vif que pour les vrais écarts.
  const m = Math.pow(Math.abs(n), 1.5);
  if (d < 0) return mixHex(STAG, RED, m);
  // jaune → vert → vert vif (deux paliers pour un « beaucoup plus vert » au sommet)
  return m < 0.5 ? mixHex(STAG, WIN, m / 0.5) : mixHex(WIN, GREEN_STRONG, (m - 0.5) / 0.5);
}

/** Fondu des couleurs quand on passe d'une case (match) à l'autre. */
const COLOR_T = { duration: 0.4, ease: [0.16, 1, 0.3, 1] } as const;

/**
 * Ressort du « snap aimanté » : fait glisser le repère d'un point à l'autre.
 * Volontairement doux/amorti (pas d'overshoot) pour que l'odomètre ELO défile
 * assez lentement pour être lu chiffre par chiffre.
 */
const SNAP_SPRING = { type: 'spring', stiffness: 80, damping: 20, mass: 1 } as const;

// ─── Sous-composants tooltip ───────────────────────────────────────────────────

/** Flèche diagonale ↗ (victoire) / ↘ (défaite), rotation + couleur fluides. */
function TrendArrow({ up }: { up: boolean }) {
  const c = up ? WIN : LOSS;
  return (
    <motion.span
      className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-md"
      animate={{ rotate: up ? 0 : 90, color: c, backgroundColor: `${c}22` }}
      transition={{ rotate: { type: 'spring', stiffness: 130, damping: 18 }, default: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
      style={{ color: c }}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17 L17 7 M10 7 H17 V14" />
      </svg>
    </motion.span>
  );
}

/** Point du graphe : le plus proche grossit un peu — rayon, jamais déplacé. */
function GraphPoint({ p, color, active }: { p: MappedPoint; color: string; active: boolean }) {
  return (
    <motion.circle
      cx={p.x} cy={p.y} stroke={color} strokeWidth="2.5" initial={false}
      animate={{ r: active ? 5.5 : 3.5, fill: active ? color : '#0b1220' }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    />
  );
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function EloChart({
  matches, myLogin, currentElo,
  game = 'babyfoot',
  hideStartLabel: _hideStartLabel = false,
  maxPoints, height = 100,
}: EloChartProps) {
  const t = useT();
  const { leaderboard, activeSeasonId } = useLeagueData();
  const imageByLogin = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const e of leaderboard) map.set(e.login, e.imageUrl);
    return map;
  }, [leaderboard]);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [W, setW] = useState(360);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => { const w = e[0]?.contentRect.width; if (w && w > 0) setW(w); });
    ro.observe(el);
    setW(el.clientWidth || 360);
    return () => ro.disconnect();
  }, []);

  const history = useMemo(
    // Cloisonnement par saison : la courbe ne montre QUE la saison active (l'ELO
    // est remis au plancher de grade à chaque clôture, le graphe repart donc à zéro
    // chaque saison). `currentElo` étant l'ELO courant (post-reset + deltas de la
    // saison), la reconstruction part bien du plancher de reprise. activeSeasonId
    // null (pas encore chargé / aucune saison) → repli sur tout l'historique.
    () =>
      computeEloHistory(
        matches.filter(
          (m) =>
            (m.game ?? 'babyfoot') === game &&
            (!activeSeasonId || m.seasonId === activeSeasonId),
        ),
        myLogin,
        currentElo,
      ),
    [matches, myLogin, currentElo, game, activeSeasonId],
  );
  const points = useMemo(() => (maxPoints ? history.slice(-maxPoints) : history), [history, maxPoints]);

  const H = height;
  const padX = 14, padTop = 16, padBot = 18;
  const plotH = H - padTop - padBot;
  const baseY = padTop + plotH;

  // ─── Géométrie (spline + points) ──────────────────────────────────────────
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const elos = points.map((p) => p.elo);
    const minE = Math.min(...elos), maxE = Math.max(...elos);
    const range = (maxE - minE) || 80;
    const padV = range * 0.25;
    const yMin = minE - padV, yMax = maxE + padV;
    const yOf = (e: number) => padTop + (1 - (e - yMin) / (yMax - yMin)) * plotH;
    const plotW = W - padX * 2;
    const mapped: MappedPoint[] = points.map((p, i) => ({
      ...p,
      x: padX + (i / Math.max(points.length - 1, 1)) * plotW,
      y: yOf(p.elo),
    }));
    const linePath = monotonePath(mapped);
    const areaPath = `${linePath} L${mapped.at(-1)!.x},${baseY} L${padX},${baseY} Z`;
    return { mapped, linePath, areaPath, yMin, yMax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, W, H]);

  const isUp = (points.at(-1)?.elo ?? 0) >= (points[0]?.elo ?? 0);
  const lineColor = isUp ? GOLD : RED;
  const uid = `${myLogin.replace(/\W/g, '')}-${game}`;

  // Couleur par point selon l'AMPLITUDE du delta ELO : jaune quand ça stagne,
  // vert de plus en plus vif quand le gain est gros, rouge quand ça descend. Le
  // point de départ adopte le delta du premier segment (pas de delta propre). Le
  // dégradé de la ligne interpole ensuite entre ces couleurs → fondu fluide qui
  // « chauffe » en vert sur les gros ups et reste jaune sur les plateaux.
  const trendColors = useMemo(() => {
    const m = geo?.mapped;
    if (!m || m.length === 0) return [] as string[];
    return m.map((p, i) => colorForDelta(i === 0 ? (m[1]?.delta ?? 0) : (p.delta ?? 0)));
  }, [geo]);

  // Stops du dégradé positionnés à l'abscisse exacte de chaque point (userSpace).
  const lineStops = useMemo(() => {
    const m = geo?.mapped;
    if (!m || m.length === 0) return [] as { offset: number; color: string }[];
    const plotW = Math.max(W - padX * 2, 1);
    return m.map((p, i) => ({
      offset: Math.max(0, Math.min(1, (p.x - padX) / plotW)),
      color: trendColors[i] ?? lineColor,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, trendColors, W]);

  // ─── Curseur libre qui glisse sur la courbe ───────────────────────────────
  const mx = useMotionValue(0);
  const cy = useMotionValue(0);
  const idxRef = useRef(0);
  const snapAnim = useRef<ReturnType<typeof animate> | null>(null);
  const [idx, setIdx] = useState(0);
  const [active, setActive] = useState(false);

  // Conversion y-curseur → ELO (inverse du mapping de geo), via ref pour que le
  // useTransform lise toujours les bornes courantes. Donne un odomètre ELO
  // CONTINU : le chiffre glisse au fil du curseur au lieu de sauter d'un point à
  // l'autre au passage du milieu.
  const mapRef = useRef({ yMin: 0, yMax: 0, padTop, plotH, fallback: currentElo });
  mapRef.current = {
    yMin: geo?.yMin ?? 0,
    yMax: geo?.yMax ?? 0,
    padTop,
    plotH,
    fallback: currentElo,
  };
  const liveElo = useTransform(cy, (y) => {
    const m = mapRef.current;
    if (m.yMax <= m.yMin) return m.fallback;
    return m.yMin + (1 - (y - m.padTop) / m.plotH) * (m.yMax - m.yMin);
  });
  const [displayElo, setDisplayElo] = useState(() => Math.round(currentElo));
  useMotionValueEvent(liveElo, 'change', (v) => setDisplayElo(Math.round(v)));

  // y exact sur la courbe pour une position x → le curseur glisse dessus
  const sampleY = (xv: number): number | null => {
    const path = pathRef.current; if (!path) return null;
    const total = path.getTotalLength();
    if (!total) return null;
    let lo = 0, hi = total;
    for (let k = 0; k < 22; k++) {
      const mid = (lo + hi) / 2;
      const pt = path.getPointAtLength(mid);
      if (pt.x < xv) lo = mid; else hi = mid;
    }
    return path.getPointAtLength((lo + hi) / 2).y;
  };
  const nearest = (xv: number): number => {
    const pts = geo?.mapped; if (!pts) return 0;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const dd = Math.abs(pts[i]!.x - xv); if (dd < bd) { bd = dd; best = i; } }
    return best;
  };

  // Pendant le ressort de snap, le curseur glisse sur la courbe : on resuit juste
  // la hauteur Y (l'odomètre ELO en découle, et défile au fil du ressort).
  // L'index est figé sur le point cible dès le survol (cf. onMove) → pas de
  // recalcul ici, ce qui évite tout flicker pendant l'animation.
  useMotionValueEvent(mx, 'change', (xv) => {
    const y = sampleY(xv); if (y != null) cy.set(y);
  });

  // Position initiale = dernier match ; resync quand la géométrie change
  useEffect(() => {
    const pts = geo?.mapped; if (!pts || pts.length < 2) return;
    const last = pts.length - 1;
    idxRef.current = last; setIdx(last);
    const lx = pts[last]!.x;
    mx.set(lx);
    const id = requestAnimationFrame(() => { const y = sampleY(lx); cy.set(y ?? pts[last]!.y); });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  // Snap « aimanté » : on ne déplace pas le repère librement sous la souris, on
  // saute au point le plus proche (la bascule se fait au passage du milieu entre
  // deux points — souris à droite du milieu → point de droite, et inversement).
  // La souris n'est jamais capturée ; c'est juste le repère + l'odomètre qui se
  // calent sur le point via un ressort doux.
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || !geo) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = W / rect.width;
    let xv = (e.clientX - rect.left) * sx;
    xv = Math.max(padX, Math.min(W - padX, xv));
    if (!active) setActive(true);
    const i = nearest(xv);
    if (i === idxRef.current) return; // déjà calé sur ce point → rien à faire
    idxRef.current = i;
    setIdx(i);
    const target = geo.mapped[i];
    if (!target) return;
    snapAnim.current?.stop();
    snapAnim.current = animate(mx, target.x, SNAP_SPRING);
  };

  // Tooltip : suit le curseur, recentré et borné dans la largeur
  const ttHalf = Math.min(104, W / 2);
  const ttX = useTransform(mx, (v) => Math.min(Math.max(v, ttHalf), W - ttHalf));
  // Décalage dynamique de la POINTE : quand la bulle bute sur un bord, son centre
  // (ttX) se fige alors que le curseur (mx) continue. On déplace donc la pointe de
  // l'écart `mx - ttX` pour qu'elle vise toujours le point — bornée pour rester
  // sous la carte. Au centre l'écart est nul → pointe centrée comme avant.
  const arrowDx = useTransform(mx, (m) => {
    const off = m - Math.min(Math.max(m, ttHalf), W - ttHalf);
    const lim = ttHalf - 12;
    return Math.max(-lim, Math.min(lim, off));
  });

  if (points.length < 2 || !geo) {
    // Graphe cloisonné à la saison active : vide = aucun match joué cette saison.
    return (
      <div className="flex items-center justify-center text-xs text-muted-2 italic" style={{ height: H }}>
        {activeSeasonId ? t('profil.eloEmptySeason') : t('profil.notEnoughMatches')}
      </div>
    );
  }

  const cur = geo.mapped[idx] ?? geo.mapped.at(-1)!;
  const curColor = trendColors[idx] ?? lineColor;
  const won = (cur.scoreFor ?? 0) > (cur.scoreAgainst ?? 0);

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height: H }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
        className="overflow-visible"
        style={{ touchAction: 'none' }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(false)}
      >
        <defs>
          <linearGradient id={`a-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
          {/* Dégradé de tendance le long du temps : interpole en douceur entre la
              couleur de chaque point (vert montée / rouge descente). */}
          <linearGradient id={`line-${uid}`} gradientUnits="userSpaceOnUse"
            x1={padX} y1="0" x2={W - padX} y2="0">
            {lineStops.map((s, i) => (
              <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
            ))}
          </linearGradient>
          <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Grille discrète */}
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={padX} x2={W - padX} y1={padTop + g * plotH} y2={padTop + g * plotH}
            stroke="#fff" strokeOpacity="0.06" strokeWidth="1" />
        ))}

        {/* Aire dégradée */}
        <motion.path d={geo.areaPath} fill={`url(#a-${uid})`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.6 }} />

        {/* Ligne — draw animation, teintée par le dégradé de tendance */}
        <motion.path ref={pathRef} d={geo.linePath} fill="none" stroke={`url(#line-${uid})`} strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round" filter={`url(#glow-${uid})`}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />

        {/* Repère vertical qui suit librement le curseur */}
        <motion.line x1={mx} x2={mx} y1={padTop} y2={baseY}
          stroke={curColor} strokeOpacity="0.22" strokeWidth="1.5" strokeDasharray="4 5"
          style={{ opacity: active ? 1 : 0 }} />

        {/* Points-matchs : le plus proche est mis en avant, sur place.
            Chaque point prend la couleur de sa propre tendance. */}
        {geo.mapped.map((p, i) => <GraphPoint key={i} p={p} color={trendColors[i] ?? lineColor} active={idx === i} />)}

        {/* Curseur libre qui glisse sur la courbe */}
        <motion.circle cx={mx} cy={cy} r="7" fill={curColor} fillOpacity="0.18" style={{ opacity: active ? 1 : 0 }} />
        <motion.circle cx={mx} cy={cy} r="4" fill="#0b1220" stroke={curColor} strokeWidth="2.5" style={{ opacity: active ? 1 : 0 }} />
      </svg>

      {/* Tooltip détaillé du match : visible UNIQUEMENT quand la souris est dans
          la zone (pas d'affichage par défaut). Fade out quand on quitte la case. */}
      <motion.div className="pointer-events-none absolute left-0 top-0 z-20"
        style={{ x: ttX, y: cy }}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}>
        {/* Toujours au-dessus du point (flèche dirigée vers le bas, sous la carte). */}
        <div style={{ transform: 'translate(-50%, calc(-100% - 16px))' }}>
          <motion.div className="overflow-hidden rounded-xl bg-slate-900/95 shadow-2xl backdrop-blur"
            style={{ minWidth: 196, borderWidth: 1, borderStyle: 'solid' }}
            animate={{ borderColor: won ? 'rgba(127,214,110,0.4)' : 'rgba(255,83,102,0.4)' }}
            transition={COLOR_T}>
            <motion.div className="h-[2px]" animate={{ backgroundColor: won ? WIN : LOSS }} transition={COLOR_T} />
            {cur.isStart ? (
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Départ</span>
                <span className="font-display text-base font-black tabular-nums text-white">{displayElo}</span>
              </div>
            ) : (
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <motion.div className="rounded-full p-[1.5px]" animate={{ backgroundColor: won ? WIN : LOSS }} transition={COLOR_T}>
                    <Avatar login={cur.opponent ?? '?'} imageUrl={imageByLogin.get(cur.opponent ?? '') ?? null} size="sm" />
                  </motion.div>
                  <div className="min-w-0 leading-tight">
                    <div className="text-[8px] font-bold uppercase tracking-wider text-white/40">vs</div>
                    <div className="max-w-[84px] truncate text-xs font-extrabold text-white">{cur.opponent ?? '?'}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <TrendArrow up={won} />
                    <div className="text-right leading-tight">
                      <motion.div className="font-display text-base font-black tabular-nums" animate={{ color: won ? WIN : LOSS }} transition={COLOR_T}>
                        {displayElo}
                      </motion.div>
                      <div className="text-[8px] font-bold uppercase tracking-wider text-white/40">elo</div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5">
                  <span className="font-mono text-[11px] font-bold tabular-nums text-white/70">{cur.scoreFor}–{cur.scoreAgainst}</span>
                  <span className="flex items-center gap-2">
                    <motion.span className="text-[10px] font-extrabold" animate={{ color: won ? WIN : LOSS }} transition={COLOR_T}>{won ? 'Victoire' : 'Défaite'}</motion.span>
                    <motion.span className="font-mono text-[10px] font-extrabold tabular-nums" animate={{ color: cur.delta >= 0 ? WIN : LOSS }} transition={COLOR_T}>
                      {cur.delta >= 0 ? '+' : ''}{cur.delta}
                    </motion.span>
                  </span>
                </div>
                <div className="mt-1 font-mono text-[8px] text-white/40">{fmtDate(cur.date)}</div>
              </div>
            )}
          </motion.div>
          <motion.div
            style={{ x: arrowDx, rotate: 45 }}
            className="mx-auto mt-[-5px] h-2.5 w-2.5 border-b border-r border-white/10 bg-slate-900/95"
          />
        </div>
      </motion.div>
    </div>
  );
}
