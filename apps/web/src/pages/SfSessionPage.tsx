import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { api, type SfSessionCurrent, type SfSession } from '../lib/api';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function Countdown({ targetDate }: { targetDate: string }) {
  const [diff, setDiff] = useState(() => Math.max(0, new Date(targetDate).getTime() - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      setDiff(Math.max(0, new Date(targetDate).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="flex items-end gap-3 justify-center flex-wrap">
      {days > 0 && (
        <>
          <CountUnit value={days} label="jours" />
          <span className="text-4xl font-mono text-orange-500/50 mb-6">:</span>
        </>
      )}
      <CountUnit value={hours} label="heures" />
      <span className="text-4xl font-mono text-orange-500/50 mb-6">:</span>
      <CountUnit value={minutes} label="min" />
      <span className="text-4xl font-mono text-orange-500/50 mb-6">:</span>
      <CountUnit value={seconds} label="sec" />
    </div>
  );
}

function CountUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <motion.span
        key={value}
        initial={{ opacity: 0.4, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="text-6xl md:text-8xl font-mono font-black tabular-nums leading-none"
        style={{ color: '#ff7a18', textShadow: '0 0 40px rgba(255,122,24,0.4)' }}
      >
        {pad2(value)}
      </motion.span>
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2">{label}</span>
    </div>
  );
}

function OrganizerLine({ session }: { session: SfSession }) {
  const name =
    [session.organizer.firstName, session.organizer.lastName].filter(Boolean).join(' ') ||
    session.organizerLogin;
  return (
    <div className="flex items-center gap-2 justify-center text-zinc-400 text-sm">
      {session.organizer.imageUrl && (
        <img
          src={session.organizer.imageUrl}
          alt=""
          className="w-6 h-6 rounded-full object-cover opacity-80"
        />
      )}
      <span>Organisé par</span>
      <span className="text-zinc-200 font-medium">{name}</span>
    </div>
  );
}

export function SfSessionPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<SfSessionCurrent | null>(null);

  useEffect(() => {
    api
      .getSfSessionCurrent()
      .then(setData)
      .catch(() => setData({ session: null, status: 'none' }));
    const id = setInterval(() => {
      api.getSfSessionCurrent().then(setData).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: '#0a0806' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 60%, rgba(255,122,24,0.07) 0%, transparent 70%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 flex flex-col items-center gap-3"
      >
        <img
          src="/sf-color.webp"
          alt="Street Fighter"
          className="w-20 h-20 object-contain transition-all duration-500"
          style={{ filter: data?.status !== 'active' ? 'grayscale(1) opacity(0.5)' : 'none' }}
        />
        <span className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
          Club Street Fighter
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-center"
      >
        {!data ? (
          <span className="text-zinc-600 font-mono text-sm">Chargement…</span>
        ) : data.status === 'active' && data.session ? (
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 font-mono font-bold uppercase tracking-widest text-sm">
                Session en cours
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-zinc-100">
              Le club SF est{' '}
              <span style={{ color: '#ff7a18' }}>ouvert</span> !
            </h1>
            <OrganizerLine session={data.session} />
            {data.session.description && (
              <p className="text-zinc-400 max-w-md text-center text-sm mt-1">
                {data.session.description}
              </p>
            )}
            {data.session.endTime && (
              <div className="mt-2">
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4 text-center">
                  Fermeture dans
                </p>
                <Countdown targetDate={data.session.endTime} />
              </div>
            )}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/challenges')}
              className="mt-4 px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #ffc08a, #ff7a18, #b8480a)',
                color: '#2a1200',
                boxShadow: '0 4px 24px rgba(255,122,24,0.35)',
              }}
            >
              Jouer maintenant
            </motion.button>
          </div>
        ) : data.status === 'upcoming' && data.session ? (
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl md:text-4xl font-black text-zinc-100">
              Prochaine <span style={{ color: '#ff7a18' }}>session</span>
            </h1>
            <OrganizerLine session={data.session} />
            {data.session.description && (
              <p className="text-zinc-400 max-w-md text-center text-sm">
                {data.session.description}
              </p>
            )}
            <div className="mt-4">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-6 text-center">
                Dans
              </p>
              <Countdown targetDate={data.session.startTime} />
            </div>
            <p className="text-zinc-500 text-sm mt-2">
              {new Date(data.session.startTime).toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <h1 className="text-2xl md:text-4xl font-black text-zinc-500">
              Aucune session programmée
            </h1>
            <p className="text-zinc-600 text-sm max-w-xs text-center">
              Les sessions Street Fighter sont organisées par les membres du club. Revenez bientôt !
            </p>
          </div>
        )}
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        onClick={() => navigate(-1)}
        className="absolute top-6 left-6 text-zinc-600 hover:text-zinc-300 transition-colors text-sm font-mono flex items-center gap-1.5 cursor-pointer"
      >
        ← Retour
      </motion.button>
    </div>
  );
}
