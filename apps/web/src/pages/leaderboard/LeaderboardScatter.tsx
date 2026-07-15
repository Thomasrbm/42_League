import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGesture } from '@use-gesture/react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2, List, ScatterChart, Crown, Shield, ChevronRight } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import type { LeaderboardEntry } from '../../lib/api';
import { useT } from '../../lib/i18n';

/** Marges réservées aux axes (matchs à gauche, ELO en bas) et titres d'axes (px). */
const M = { l: 58, r: 16, t: 22, b: 50 };
/** Marge intérieure pour ne pas coller les têtes aux bords (px). */
const PAD = 30;
/** Rayon « d'occupation » d'une tête (px, base). */
const NODE_R = 24;
/** Côté d'une cellule de regroupement (px, base) — points dans la même cellule = 1 amas. */
const CELL = NODE_R * 1.5;
/** Rayon du déploiement circulaire des membres d'un amas (px, base). */
const FAN_R = NODE_R * 1.9;
/** Espacement du packing serré d'un amas replié (px, base). */
const CLUMP_STEP = 8;
/** Diamètre d'un point d'amas replié (px). */
const DOT = 11;
const SCALE_MIN = 0.5;
const SCALE_MAX = 8;

interface View {
  scale: number;
  tx: number;
  ty: number;
}

/** Handle impératif exposé au parent — « Où suis-je ? » recentre le nuage sur moi. */
export interface LeaderboardScatterHandle {
  /** Renvoie true si le joueur courant a bien été trouvé et ciblé. */
  locateMe: () => boolean;
}

/** Un amas = un ou plusieurs joueurs regroupés sur un même point du nuage. */
interface Cluster {
  id: string;
  bx: number; // position horizontale de base (px) — dérivée de l'ELO
  by: number; // position verticale de base (px) — dérivée du nombre de matchs
  members: LeaderboardEntry[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 5 graduations linéaires régulières entre min et max. */
function ticks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

/**
 * Décalage (base px) du i-ème membre déployé en cercle autour du centre d'un amas.
 * Le rayon grandit légèrement quand l'amas est dense pour éviter les recouvrements.
 */
/** Rayon (base px) de l'éventail déployé d'un amas de `total` membres. */
const fanRadius = (total: number) => FAN_R * (total > 6 ? 1 + (total - 6) * 0.12 : 1);

function fanOffset(i: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 0, y: 0 };
  const r = fanRadius(total);
  // On démarre en haut (-90°) et on tourne dans le sens horaire.
  const a = -Math.PI / 2 + (i / total) * Math.PI * 2;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

/**
 * Décalage (base px) du i-ème point dans un amas REPLIÉ : packing en spirale dorée
 * (phyllotaxie) → un petit paquet serré et régulier, jamais un seul point fusionné.
 */
function clumpOffset(i: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 0, y: 0 };
  const golden = 2.399963229728653; // angle d'or (rad)
  const r = CLUMP_STEP * Math.sqrt(i);
  const a = i * golden;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

/** Rayon approximatif (base px) d'un amas replié de `total` points. */
const clumpRadius = (total: number) => (total <= 1 ? 0 : CLUMP_STEP * Math.sqrt(total - 1) + DOT / 2);

/**
 * Vue « nuage de points » du classement — vrai nuage 2D.
 *
 *  • Axe HORIZONTAL = ELO (droite = fort). Haute cardinalité → deux joueurs ne
 *    tombent quasiment jamais sur la même verticale.
 *  • Axe VERTICAL = nombre de matchs (haut = actif).
 *
 * Quand plusieurs joueurs se superposent, ils forment un petit AMAS de points
 * serrés ; au survol l'amas se déploie en éventail (vraies têtes).
 * Molette / pincement pour zoomer, glisser pour se déplacer.
 */
export const LeaderboardScatter = forwardRef<
  LeaderboardScatterHandle,
  {
    entries: LeaderboardEntry[];
    myLogin?: string;
    /** Win rate (0–100) par login — affiché dans l'infobulle. */
    winRates?: Map<string, number>;
    className?: string;
  }
>(function LeaderboardScatter({ entries, myLogin, winRates, className = '' }, ref) {
  const t = useT();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  /** Login de la tête survolée (pour l'infobulle). */
  const [hovered, setHovered] = useState<string | null>(null);
  /** Amas actuellement « déployé » en cercle (par hover ou clic). */
  const [openCluster, setOpenCluster] = useState<string | null>(null);

  // Mesure du conteneur (responsive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Domaines : ELO (axe X) et nombre de matchs (axe Y).
  const domain = useMemo(() => {
    let eMin = Infinity, eMax = -Infinity, mMin = Infinity, mMax = -Infinity;
    for (const e of entries) {
      if (e.elo < eMin) eMin = e.elo;
      if (e.elo > eMax) eMax = e.elo;
      const m = e.matchesPlayed ?? 0;
      if (m < mMin) mMin = m;
      if (m > mMax) mMax = m;
    }
    if (!Number.isFinite(eMin)) { eMin = 1000; eMax = 1000; }
    if (!Number.isFinite(mMin)) { mMin = 0; mMax = 1; }
    const eSpan = eMax - eMin || 1;
    const mSpan = mMax - mMin || 1;
    return {
      eMin: eMin - eSpan * 0.06, eMax: eMax + eSpan * 0.06,
      mMin: Math.max(0, mMin - mSpan * 0.08), mMax: mMax + mSpan * 0.08,
    };
  }, [entries]);

  const plotW = Math.max(10, size.w - M.l - M.r);
  const plotH = Math.max(10, size.h - M.t - M.b);

  // ELO → abscisse de base (px). Droite = ELO élevé.
  const xOfElo = (elo: number) => {
    const nx = domain.eMax > domain.eMin ? (elo - domain.eMin) / (domain.eMax - domain.eMin) : 0.5;
    return PAD + nx * (plotW - 2 * PAD);
  };
  // Nombre de matchs → ordonnée de base (px). Haut = beaucoup de matchs.
  const yOfMatches = (m: number) => {
    const ny = domain.mMax > domain.mMin ? (m - domain.mMin) / (domain.mMax - domain.mMin) : 0.5;
    return PAD + (1 - ny) * (plotH - 2 * PAD);
  };

  // Regroupement (bucketing) : chaque joueur tombe dans une cellule de la grille
  // selon sa position réelle (ELO, matchs). Ceux d'une même cellule forment UN amas
  // — affiché comme un petit paquet de points serrés (pas un seul point fusionné).
  const clusters = useMemo<Cluster[]>(() => {
    const sorted = [...entries].sort((a, b) => b.elo - a.elo || a.login.localeCompare(b.login));
    const buckets = new Map<string, { sx: number; sy: number; members: LeaderboardEntry[] }>();
    for (const e of sorted) {
      const bx = clamp(xOfElo(e.elo), PAD, plotW - PAD);
      const by = clamp(yOfMatches(e.matchesPlayed ?? 0), PAD, plotH - PAD);
      const key = `${Math.round(bx / CELL)},${Math.round(by / CELL)}`;
      const b = buckets.get(key);
      if (b) {
        b.sx += bx;
        b.sy += by;
        b.members.push(e);
      } else {
        buckets.set(key, { sx: bx, sy: by, members: [e] });
      }
    }
    return Array.from(buckets.entries()).map(([id, b]) => ({
      id,
      bx: b.sx / b.members.length,
      by: b.sy / b.members.length,
      members: b.members,
    }));
    // xOfElo / yOfMatches dépendent de plotW/plotH/domain → déps explicites
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, plotW, plotH, domain.eMin, domain.eMax, domain.mMin, domain.mMax]);

  // base → coordonnées écran locales (dans la zone de tracé).
  const toLocal = (bx: number, by: number) => ({
    lx: view.tx + bx * view.scale,
    ly: view.ty + by * view.scale,
  });

  // Zoom centré sur un point écran (relatif au conteneur).
  const zoomAt = (factor: number, cx: number, cy: number) => {
    setView((v) => {
      const next = clamp(v.scale * factor, SCALE_MIN, SCALE_MAX);
      const k = next / v.scale;
      const px = cx - M.l;
      const py = cy - M.t;
      return { scale: next, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  };

  useGesture(
    {
      onDrag: ({ offset: [ox, oy], tap }) => {
        // Un vrai glissement (pas un tap sur une tête) referme l'amas déployé.
        if (!tap) setOpenCluster(null);
        setView((v) => ({ ...v, tx: ox, ty: oy }));
      },
      onWheel: ({ event, delta: [, dy] }) => {
        event.preventDefault();
        setOpenCluster(null);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        zoomAt(Math.exp(-dy * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
      },
      onPinch: ({ offset: [s], origin: [ox, oy], memo }) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return memo;
        const prev = (memo as number) ?? view.scale;
        zoomAt(s / prev, ox - rect.left, oy - rect.top);
        return s;
      },
    },
    {
      target: containerRef,
      eventOptions: { passive: false },
      drag: { from: () => [view.tx, view.ty], filterTaps: true },
      pinch: { from: () => [view.scale, 0], scaleBounds: { min: SCALE_MIN, max: SCALE_MAX } },
    },
  );

  const reset = () => setView({ scale: 1, tx: 0, ty: 0 });
  const eloTicks = ticks(domain.eMin, domain.eMax, 5);
  const matchTicks = Array.from(new Set(ticks(domain.mMin, domain.mMax, 5).map((v) => Math.round(v))));

  // Position écran (base) de la tête survolée, pour l'infobulle — qu'elle soit
  // dans un amas replié ou déployée en cercle.
  const hoveredPos = useMemo(() => {
    if (!hovered) return null;
    for (const c of clusters) {
      const idx = c.members.findIndex((m) => m.login === hovered);
      if (idx < 0) continue;
      const entry = c.members[idx];
      if (c.members.length === 1 || openCluster !== c.id) return { entry, bx: c.bx, by: c.by };
      const off = fanOffset(idx, c.members.length);
      return { entry, bx: c.bx + off.x, by: c.by + off.y };
    }
    return null;
  }, [hovered, openCluster, clusters]);

  // ─── « Où suis-je ? » — recentre/zoome le nuage sur le joueur courant ───────
  // Le parent ne connaît pas l'état interne (pan/zoom) du nuage ; on expose donc
  // une commande impérative. La transition est tweenée pour un « vol » fluide
  // (le rendu applique tx/ty/scale sans transition CSS, sinon le drag laggerait).
  const viewRef = useRef(view);
  viewRef.current = view;
  const tweenRef = useRef<number | null>(null);

  const animateTo = useCallback((target: View) => {
    if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current);
    const from = viewRef.current;
    const start = performance.now();
    const DUR = 480;
    const ease = (p: number) => 1 - Math.pow(1 - p, 3); // easeOutCubic
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / DUR);
      const k = ease(p);
      setView({
        scale: from.scale + (target.scale - from.scale) * k,
        tx: from.tx + (target.tx - from.tx) * k,
        ty: from.ty + (target.ty - from.ty) * k,
      });
      tweenRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    tweenRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => {
    if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current);
  }, []);

  const locateMe = useCallback((): boolean => {
    if (!myLogin) return false;
    const c = clusters.find((cl) => cl.members.some((m) => m.login === myLogin));
    if (!c) return false;
    // Amas à plusieurs : on le déploie pour que ma vraie tête soit visible…
    const idx = c.members.findIndex((m) => m.login === myLogin);
    const multi = c.members.length > 1;
    if (multi) setOpenCluster(c.id);
    // …et on vise la position déployée (éventail) plutôt que le centre de l'amas.
    const off = multi ? fanOffset(idx, c.members.length) : { x: 0, y: 0 };
    const bx = c.bx + off.x;
    const by = c.by + off.y;
    const scale = clamp(Math.max(viewRef.current.scale, 2), SCALE_MIN, SCALE_MAX);
    animateTo({ scale, tx: plotW / 2 - bx * scale, ty: plotH / 2 - by * scale });
    return true;
  }, [myLogin, clusters, plotW, plotH, animateTo]);

  useImperativeHandle(ref, () => ({ locateMe }), [locateMe]);

  return (
    <div className={`relative ${className}`}>
      {/* Contrôles de zoom */}
      <div className="absolute top-2 right-2 z-30 flex flex-col gap-1.5">
        <ZoomBtn label={t('lb.scatter.zoomIn')} onClick={() => zoomAt(1.3, size.w / 2, size.h / 2)}>
          <ZoomIn className="w-4 h-4" strokeWidth={2.5} />
        </ZoomBtn>
        <ZoomBtn label={t('lb.scatter.zoomOut')} onClick={() => zoomAt(1 / 1.3, size.w / 2, size.h / 2)}>
          <ZoomOut className="w-4 h-4" strokeWidth={2.5} />
        </ZoomBtn>
        <ZoomBtn label={t('lb.scatter.reset')} onClick={reset}>
          <Maximize2 className="w-4 h-4" strokeWidth={2.5} />
        </ZoomBtn>
      </div>

      {/* Légende + explication — ancrée en BAS À DROITE pour ne pas chevaucher
          les axes/points (l'angle haut-gauche est occupé par l'axe Matchs). */}
      <div className="absolute bottom-2 right-2 z-20 pointer-events-none flex flex-col items-end gap-1 text-end max-w-[60%]">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-2">
          {t('lb.scatter.legendTop')}
        </div>
        <div className="flex items-center justify-end gap-2 text-[9px] text-muted-2/80 font-medium">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold/70" />
          {t('lb.scatter.legendBest')}
          <span className="opacity-40">·</span>
          <span>{t('lb.scatter.legendCluster')}</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden rounded-xl card-hud cursor-grab active:cursor-grabbing select-none touch-none"
      >
        {/* Cadre des axes — vraies flèches SVG longeant tout le graphique */}
        <svg
          className="absolute inset-0 pointer-events-none text-gold/45"
          width={size.w}
          height={size.h}
          style={{ overflow: 'visible' }}
          aria-hidden
        >
          <defs>
            <marker
              id="lb-axis-arrow"
              markerUnits="userSpaceOnUse"
              markerWidth="12"
              markerHeight="12"
              refX="8.5"
              refY="6"
              orient="auto"
            >
              <path d="M0,0 L10,6 L0,12 Z" fill="currentColor" />
            </marker>
          </defs>
          {/* Axe Y — vertical, flèche vers le haut */}
          <line
            x1={M.l} y1={M.t + plotH} x2={M.l} y2={M.t - 4}
            stroke="currentColor" strokeWidth="1.5" markerEnd="url(#lb-axis-arrow)"
          />
          {/* Axe X — horizontal, flèche vers la droite */}
          <line
            x1={M.l} y1={M.t + plotH} x2={M.l + plotW + 4} y2={M.t + plotH}
            stroke="currentColor" strokeWidth="1.5" markerEnd="url(#lb-axis-arrow)"
          />
        </svg>

        {/* Axe Y — nombre de matchs : graduations chiffrées + traits. */}
        <div
          className="absolute left-0 overflow-hidden pointer-events-none"
          style={{ width: M.l, top: M.t, height: plotH }}
        >
          {matchTicks.map((v, i) => (
            <div
              key={i}
              className="absolute right-0 -translate-y-1/2 flex items-center gap-1"
              style={{ top: view.ty + yOfMatches(v) * view.scale }}
            >
              <span className="font-mono text-[9px] text-muted-2 tabular-nums">{v}</span>
              {/* Trait de graduation */}
              <span className="w-1.5 h-px bg-border" />
            </div>
          ))}
        </div>

        {/* Titre de l'axe Y — « Matchs », vertical le long du bord gauche */}
        <div
          className="absolute left-0 pointer-events-none flex items-center justify-center"
          style={{ width: 14, top: M.t, height: plotH }}
        >
          <span
            className="font-bold uppercase tracking-[0.16em] text-[9px] text-gold/70"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {t('lb.scatter.axisY')}
          </span>
        </div>

        {/* Zone du nuage (clippée) */}
        <div
          className="absolute overflow-hidden"
          style={{ left: M.l, top: M.t, width: plotW, height: plotH }}
        >
          {/* Lignes de grille — matchs (horizontales) */}
          {matchTicks.map((v, i) => (
            <div
              key={`h${i}`}
              className="absolute left-0 right-0 h-px bg-gold/[0.06]"
              style={{ top: view.ty + yOfMatches(v) * view.scale }}
            />
          ))}

          {/* Lignes de grille — ELO (verticales) */}
          {eloTicks.map((v, i) => (
            <div
              key={`v${i}`}
              className="absolute top-0 bottom-0 w-px bg-gold/[0.05]"
              style={{ left: view.tx + xOfElo(v) * view.scale }}
            />
          ))}

          {/* Amas de joueurs — paquet de points serrés, déployé en éventail au survol */}
          {clusters.map((c) => {
            const { lx, ly } = toLocal(c.bx, c.by);
            const open = openCluster === c.id;
            const multi = c.members.length > 1;
            const meIdx = myLogin != null ? c.members.findIndex((m) => m.login === myLogin) : -1;
            const containsMe = meIdx >= 0;

            const openFan = () => multi && setOpenCluster(c.id);
            const closeFan = () => setOpenCluster((o) => (o === c.id ? null : o));

            // Rayon (écran, px) de la zone de survol CONTINUE de l'amas. Sans elle,
            // la zone sensible se limite à l'union des têtes : déployées en éventail,
            // les trous entre elles déclenchent un mouseleave → l'amas se replie puis
            // se redéploie en boucle (clignotement). Le disque comble ces trous : tant
            // que la souris reste dans l'amas (replié ou déployé), il reste ouvert.
            const hitR = open
              ? fanRadius(c.members.length) * view.scale + 26
              : CLUMP_STEP * Math.sqrt(Math.max(0, c.members.length - 1)) * view.scale + DOT / 2 + 6;

            return (
              <div
                key={c.id}
                className="absolute"
                style={{ left: lx, top: ly, zIndex: open ? 45 : containsMe ? 20 : 10 }}
                onMouseEnter={openFan}
                onMouseLeave={() => {
                  closeFan();
                  setHovered((h) => (c.members.some((m) => m.login === h) ? null : h));
                }}
              >
                {/* Zone de survol continue (invisible) — comble les trous de l'éventail
                    pour éviter le clignotement. Sous les têtes (rendu avant), donc ne
                    capte le pointeur que dans les espaces vides entre elles. */}
                {multi && (
                  <span
                    aria-hidden
                    className="absolute rounded-full"
                    style={{
                      left: 0,
                      top: 0,
                      width: hitR * 2,
                      height: hitR * 2,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                )}
                <AnimatePresence>
                  {c.members.map((e, i) => {
                    const spread = open && multi;
                    // Replié multi → packing serré ; déployé → éventail ; seul → centre.
                    const off = !multi ? { x: 0, y: 0 } : spread ? fanOffset(i, c.members.length) : clumpOffset(i, c.members.length);
                    // Replié multi = petit point ; déployé / seul = vraie tête.
                    const asDot = multi && !spread;
                    const isMe = e.login === myLogin;
                    const isHover = e.login === hovered;
                    return (
                      // motion.div : porte le déplacement (clump ⇆ éventail). L'enfant
                      // gère le centrage via translate CSS (non animé) → pas de conflit.
                      <motion.div
                        key={e.login}
                        className="absolute"
                        style={{ left: 0, top: 0, zIndex: isMe ? 3 : 1 }}
                        initial={false}
                        animate={{ x: off.x * view.scale, y: off.y * view.scale, opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 32, mass: 0.6 }}
                      >
                        <button
                          type="button"
                          onMouseEnter={() => { if (!asDot) setHovered(e.login); }}
                          onMouseLeave={() => setHovered((h) => (h === e.login ? null : h))}
                          onClick={(ev) => {
                            // Amas replié à plusieurs : 1er clic = déploie, ne navigue pas.
                            if (multi && !open) {
                              ev.stopPropagation();
                              openFan();
                              return;
                            }
                            navigate(`/player/${encodeURIComponent(e.login)}`);
                          }}
                          className="block -translate-x-1/2 -translate-y-1/2 rounded-full transition-shadow"
                          aria-label={`${e.login} · ${e.elo} ELO`}
                        >
                          {asDot ? (
                            <span
                              className="block rounded-full"
                              style={{
                                width: DOT,
                                height: DOT,
                                background: isMe ? '#ffc94a' : 'rgba(255,201,74,0.5)',
                                boxShadow: isMe
                                  ? '0 0 0 1.5px rgba(255,201,74,0.9), 0 0 8px rgba(255,201,74,0.6)'
                                  : '0 0 0 1px rgba(8,10,14,0.85)',
                              }}
                            />
                          ) : (
                            <Avatar
                              login={e.login}
                              imageUrl={e.imageUrl}
                              size={isMe || isHover ? 'md' : 'sm'}
                              className={
                                isMe
                                  ? 'ring-2 ring-gold ring-offset-2 ring-offset-bg-1 shadow-gold-glow'
                                  : isHover
                                    ? 'ring-2 ring-gold/70 ring-offset-2 ring-offset-bg-1'
                                    : 'ring-1 ring-border'
                              }
                            />
                          )}
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* Compteur d'amas replié — centré au-dessus du paquet de points */}
                {multi && !open && (
                  <span
                    className="absolute z-20 pointer-events-none flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-gold text-bg-1 text-[9px] font-extrabold tabular-nums shadow-md ring-1 ring-bg-1"
                    style={{ left: 0, top: -(clumpRadius(c.members.length) + 8), transform: 'translate(-50%, -50%)' }}
                  >
                    ×{c.members.length}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Axe X — ELO : graduations + traits, en bas. */}
        <div
          className="absolute overflow-hidden pointer-events-none"
          style={{ left: M.l, width: plotW, top: M.t + plotH, height: M.b }}
        >
          {eloTicks.map((v, i) => (
            <div
              key={i}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
              style={{ left: view.tx + xOfElo(v) * view.scale }}
            >
              {/* Trait de graduation */}
              <span className="w-px h-1.5 bg-border" />
              <span className="mt-0.5 font-mono text-[9px] text-muted-2 tabular-nums">{Math.round(v)}</span>
            </div>
          ))}
          {/* Titre de l'axe X — « ELO », centré sous les graduations */}
          <span className="absolute left-1/2 -translate-x-1/2 bottom-0.5 font-bold uppercase tracking-[0.16em] text-[9px] text-gold/70">
            {t('lb.scatter.axisX')}
          </span>
        </div>

        {/* Infobulle (hors zone clippée pour ne pas être coupée) */}
        {hoveredPos && hoveredPos.entry && (
          <ScatterTooltip
            entry={hoveredPos.entry}
            winRate={winRates?.get(hoveredPos.entry.login)}
            left={M.l + toLocal(hoveredPos.bx, hoveredPos.by).lx}
            top={M.t + toLocal(hoveredPos.bx, hoveredPos.by).ly - 26}
          />
        )}
      </div>
    </div>
  );
});

function ScatterTooltip({ entry, winRate, left, top }: { entry: LeaderboardEntry; winRate?: number; left: number; top: number }) {
  const t = useT();
  return (
    <div
      className="absolute z-50 pointer-events-none -translate-x-1/2 -translate-y-full"
      style={{ left, top }}
    >
      <div className="card-hud rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-xl">
        <div className="text-xs font-extrabold text-text-strong leading-tight">{entry.login}</div>
        <div className="text-[10px] font-mono tabular-nums text-muted-2 leading-tight">
          #{entry.rank} · <span className="text-gold font-bold">{entry.elo}</span> ELO ·{' '}
          {entry.matchesPlayed} {t('lb.scatter.matches')}
          {winRate != null && <> · {Math.round(winRate)}% WR</>}
        </div>
      </div>
    </div>
  );
}

function ZoomBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-lg card-hud text-muted-2 hover:text-gold hover:border-gold/40 transition-colors"
    >
      {children}
    </button>
  );
}

// ─── Bascule Liste / Nuage ──────────────────────────────────────────────────

export type RankingView = 'list' | 'graph' | 'goat';

export function RankingViewToggle({
  view,
  onChange,
  showGoat = true,
}: {
  view: RankingView;
  onChange: (v: RankingView) => void;
  /** Masque la vue G.O.A.T (saison beta sans historique de matchs taggé). */
  showGoat?: boolean;
}) {
  const t = useT();
  return (
    <div className="inline-flex gap-1 p-1 rounded-lg bg-bg-2/60 border border-border/40">
      <ToggleBtn active={view === 'list'} onClick={() => onChange('list')} Icon={List}>
        {t('lb.view.list')}
      </ToggleBtn>
      <ToggleBtn active={view === 'graph'} onClick={() => onChange('graph')} Icon={ScatterChart}>
        {t('lb.view.graph')}
      </ToggleBtn>
      {/* G.O.A.T : 3ᵉ vue inline (plus de navigation vers une page séparée). */}
      {showGoat && (
        <ToggleBtn active={view === 'goat'} onClick={() => onChange('goat')} Icon={Crown}>
          G.O.A.T
        </ToggleBtn>
      )}
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof List;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-[0.12em] transition-all duration-150 border ${
        active ? 'bg-gold/10 border-gold/30 text-gold' : 'border-transparent text-muted-2 hover:text-text'
      }`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
      {children}
    </button>
  );
}

/**
 * Bouton d'accès à la page Frise des grades (/grades) — pensé pour vivre dans
 * la même barre d'outils que RankingViewToggle. Pastille dorée distincte (action
 * de navigation, pas une bascule de vue) avec chevron pour le signaler.
 */
export function GradesNavButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => navigate('/grades')}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-extrabold uppercase tracking-[0.12em] bg-gold/10 border border-gold/30 text-gold hover:bg-gold/15 hover:border-gold/50 transition-colors tap-transparent ${className}`}
    >
      <Shield className="w-3.5 h-3.5" strokeWidth={2.5} />
      {t('lb.grades')}
      <ChevronRight className="w-3 h-3 opacity-60 -me-0.5" strokeWidth={2.5} />
    </button>
  );
}
