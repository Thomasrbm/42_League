import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Infobulle qui SUIT LE CURSEUR. Contrairement au `Tooltip` CSS (fixé au-dessus de
 * l'élément), celle-ci se repositionne à chaque mouvement de souris via un portail
 * sur `document.body` (au-dessus de tout, sans rogner sur les overflow parents).
 *
 * `pointer-events-none` : l'infobulle ne capte jamais la souris (pas de flicker).
 * Hover-only : sur tactile (pas de mousemove) elle ne s'affiche pas — voulu.
 */
export function CursorTooltip({
  content,
  children,
  className,
  disabled = false,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const handleMove = useCallback((e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });
  }, []);
  const handleLeave = useCallback(() => setPos(null), []);

  if (disabled || !content) return <>{children}</>;

  const PAD = 14;
  const W = 280;
  return (
    <span
      className={className}
      onMouseEnter={handleMove}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {children}
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[200] w-max max-w-[280px] rounded-xl border border-gold/30 bg-bg-1/95 px-3 py-2 text-start shadow-2xl backdrop-blur-md"
            style={{
              left: Math.min(pos.x + PAD, window.innerWidth - W - 8),
              top: Math.min(pos.y + 18, window.innerHeight - 12),
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
