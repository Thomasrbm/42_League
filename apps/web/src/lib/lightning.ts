/**
 * Tracé d'éclair fractal en zig-zag (déplacement de point médian récursif).
 *
 * Partagé par les overlays cinématiques qui dessinent des éclairs SVG
 * (cf. DuelStrikeOverlay, RankUpOverlay) — auparavant dupliqué à l'identique
 * dans chacun.
 *
 * À chaque passe on insère, entre deux points, un point médian décalé
 * perpendiculairement au segment → aspect « vrai éclair ». Retourne un attribut
 * `d` de <path> (commande M…L).
 */
export function makeBolt(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  displace: number,
  depth: number,
): string {
  let pts: Array<[number, number]> = [
    [x0, y0],
    [x1, y1],
  ];
  for (let d = 0; d < depth; d++) {
    const next: Array<[number, number]> = [];
    const amp = displace / (d + 1);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[i + 1]!;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      // décalage perpendiculaire au segment
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const off = (Math.random() - 0.5) * amp;
      next.push([ax, ay], [mx + (-dy / len) * off, my + (dx / len) * off]);
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
  }
  return 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
}
