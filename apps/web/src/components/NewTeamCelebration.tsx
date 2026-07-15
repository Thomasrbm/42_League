/**
 * NewTeamCelebration — overlay plein écran pour la création d'un nouveau duo 2v2.
 *
 * Déclenché depuis Declare2v2GameSheet quand `myTeamIsNew === true`.
 * Permet de nommer l'équipe inline, puis redirige vers /team/:id.
 *
 * Rendu via createPortal (body) pour éviter les conflits avec les transforms
 * des animations de page (même problème que BottomSheet).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Pencil, Check, ArrowRight, X } from 'lucide-react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { useFlash } from '../hooks/useFlash';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { haptic } from '../mobile/feedback/useHaptic';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Player {
  login: string;
  imageUrl?: string | null;
  elo?: number;
}

interface NewTeamCelebrationProps {
  teamId: string;
  teamElo: number;
  player1: Player;
  player2: Player;
  onClose: () => void;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const GOLD_GRAD = 'linear-gradient(135deg, #d4a04a 0%, #8a5e10 50%, #c79122 100%)';

function CelebAvatar({ player, size = 80 }: { player: Player; size?: number }) {
  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center font-display font-black text-[#1a1100] overflow-hidden"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        border: '3px solid rgba(255,201,74,0.7)',
        boxShadow: '0 0 32px rgba(255,201,74,0.5), inset 0 1px 0 rgba(255,247,228,0.3)',
      }}
    >
      {player.imageUrl
        ? <img src={player.imageUrl} alt={player.login} className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center" style={{ background: GOLD_GRAD }}>
            {player.login[0]?.toUpperCase()}
          </div>}
    </div>
  );
}

// ─── Particules ───────────────────────────────────────────────────────────────

const PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * 2 * Math.PI;
  const dist = 120 + Math.random() * 80;
  return {
    id: i,
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    size: 4 + Math.random() * 6,
    color: i % 3 === 0 ? '#ff5366' : i % 3 === 1 ? '#ffc94a' : '#7fd66e',
    delay: Math.random() * 0.3,
  };
});

// ─── Composant principal ──────────────────────────────────────────────────────

export function NewTeamCelebration({
  teamId, teamElo, player1, player2, onClose,
}: NewTeamCelebrationProps) {
  const navigate = useNavigate();
  const t = useT();
  const flash = useFlash();
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 800);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    haptic('success');
  }, []);

  // Si teamId est vide, le duo n'a pas encore été confirmé par tous les joueurs
  // (l'équipe est créée seulement après validation des 4). On navigue vers /teams
  // au lieu de /team/:id pour éviter un 404.
  const teamTarget = teamId ? `/team/${teamId}` : '/teams';

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || !teamId) { handleGoToTeam(); return; }
    setSaving(true);
    try {
      await api.nameTeam(teamId, trimmed);
      flash.show(t('newteam.flash.created').replace('{name}', trimmed));
      haptic('success');
    } catch {
      // Pas bloquant
    } finally {
      setSaving(false);
      handleGoToTeam();
    }
  };

  const handleGoToTeam = () => {
    setDismissed(true);
    setTimeout(() => {
      onClose();
      navigate(teamTarget);
    }, 300);
  };

  // Escape ferme l'overlay (même comportement que le bouton X).
  useEscapeKey(!dismissed, handleGoToTeam);

  const content = (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-label={t('newteam.title')}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(30,22,8,0.97) 0%, rgba(8,6,3,0.99) 100%)',
            backdropFilter: 'blur(12px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleGoToTeam(); }}
        >
          {/* Grille HUD de fond */}
          <div className="absolute inset-0 hud-grid opacity-20 pointer-events-none" />

          {/* Halo conique animé */}
          <motion.div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, ease: 'linear', repeat: Infinity }}
            style={{
              background: 'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(255,201,74,0.15) 60deg, transparent 120deg)',
              filter: 'blur(60px)',
            }}
          />

          {/* Bouton fermer */}
          <button
            type="button"
            onClick={handleGoToTeam}
            aria-label={t('newteam.close')}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-muted-2 hover:text-gold hover:bg-gold/10 transition-colors tap-transparent z-10"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>

          {/* ── Contenu central ── */}
          <div className="relative flex flex-col items-center gap-6 px-6 max-w-sm w-full">

            {/* Titre */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <div className="text-[11px] font-extrabold uppercase tracking-[0.35em] text-gold/70 mb-2">
                ⚡ {t('newteam.kicker')} ⚡
              </div>
              <div
                className="font-display text-4xl sm:text-5xl font-black uppercase tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, #ffd166 0%, #ffa83a 40%, #ffc94a 60%, #ffe08a 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: 'none',
                  filter: 'drop-shadow(0 0 20px rgba(255,201,74,0.6))',
                }}
              >
                {t('newteam.title')}
              </div>
            </motion.div>

            {/* Avatars */}
            <div className="relative flex items-center justify-center gap-0">
              {/* Particules */}
              {PARTICLES.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute rounded-full pointer-events-none"
                  style={{ width: p.size, height: p.size, background: p.color }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0, 1, 0] }}
                  transition={{ delay: 0.5 + p.delay, duration: 1.2, ease: 'easeOut' }}
                />
              ))}

              {/* Player 1 */}
              <motion.div
                initial={{ x: -80, opacity: 0, scale: 0.6 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 22 }}
              >
                <CelebAvatar player={player1} size={76} />
              </motion.div>

              {/* Anneau central */}
              <motion.div
                className="relative mx-3 flex items-center justify-center"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 400, damping: 20 }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-gaming text-sm font-extrabold text-[#1a0d00]"
                  style={{
                    background: 'linear-gradient(135deg, #ffc94a, #e0932a)',
                    boxShadow: '0 0 24px rgba(255,201,74,0.8)',
                  }}
                >
                  &amp;
                </div>
              </motion.div>

              {/* Player 2 */}
              <motion.div
                initial={{ x: 80, opacity: 0, scale: 0.6 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 22 }}
              >
                <CelebAvatar player={player2} size={76} />
              </motion.div>
            </div>

            {/* Noms + ELO */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="text-center space-y-1"
            >
              <div className="font-display text-lg font-black text-text-strong">
                <span className="text-gold">{player1.login}</span>
                <span className="text-muted-2 mx-2 font-normal">&amp;</span>
                <span className="text-gold">{player2.login}</span>
              </div>
              <div className="flex items-center justify-center gap-3 text-[11px] text-muted font-mono">
                {player1.elo !== undefined && (
                  <span className="tabular-nums">{player1.elo} ELO</span>
                )}
                <span className="text-muted-2">→</span>
                <span className="tabular-nums text-gold font-extrabold">{teamElo} {t('newteam.teamElo')}</span>
                <span className="text-muted-2">←</span>
                {player2.elo !== undefined && (
                  <span className="tabular-nums">{player2.elo} ELO</span>
                )}
              </div>
            </motion.div>

            {/* Naming */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.4 }}
              className="w-full space-y-3"
            >
              <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-2 text-center">
                {t('newteam.namePrompt')}
              </div>

              {editingName ? (
                <div className="relative">
                  <Pencil className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gold/60 pointer-events-none" strokeWidth={2.5} />
                  <input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveName(); }}
                    placeholder={`${player1.login} & ${player2.login}`}
                    maxLength={30}
                    className="w-full ps-9 pe-4 py-3 bg-bg-1/80 border-2 border-gold/40 rounded-xl text-sm font-bold text-text-strong placeholder:text-muted/50 focus:border-gold outline-none allow-select transition-all"
                    style={{ caretColor: '#ffc94a' }}
                  />
                  {name.length > 0 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-muted-2 font-mono">
                      {name.length}/30
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="w-full py-3 text-sm text-muted-2 border border-border/60 rounded-xl hover:border-gold/30 hover:text-text transition-colors"
                >
                  + {t('newteam.giveName')}
                </button>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  onClick={() => void handleSaveName()}
                  disabled={saving}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-extrabold uppercase tracking-wider text-sm transition-all tap-transparent"
                  style={{
                    background: 'linear-gradient(135deg, #ffc94a, #e0932a)',
                    color: '#1a0d00',
                    boxShadow: '0 4px 20px rgba(255,201,74,0.4)',
                  }}
                >
                  {name.trim() ? (
                    <>
                      <Check className="w-4 h-4" strokeWidth={3} />
                      {t('newteam.confirm')}
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                      {t('newteam.viewPage')}
                    </>
                  )}
                </motion.button>
                {name.trim() === '' && (
                  <button
                    type="button"
                    onClick={handleGoToTeam}
                    className="px-4 py-3 rounded-xl border border-border/60 text-sm text-muted-2 hover:text-text hover:border-muted/40 transition-colors tap-transparent"
                  >
                    {t('newteam.later')}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
