import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../lib/i18n';

export function LoginPage() {
  const t = useT();
  const { startLogin } = useAuth();

  return (
    <main className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Vignette + grille HUD */}
      <div className="absolute inset-0 bg-gold-vignette pointer-events-none" />
      <div className="absolute inset-0 hud-grid opacity-50 pointer-events-none" />

      <div
        className="relative max-w-md w-full card-hud rounded-2xl p-6 sm:p-8 text-center overflow-hidden"
        style={{
          border: '1px solid rgba(255,201,74,0.4)',
          boxShadow:
            '0 24px 56px rgba(0,0,0,0.65), 0 0 60px rgba(255,201,74,0.18), inset 0 1px 0 rgba(255,215,120,0.15)',
        }}
      >
        {/* Tubes laiton en haut et en bas */}
        <div className="absolute top-0 left-6 right-6 h-[2px] brass-pipe rounded-full" />
        <div className="absolute bottom-0 left-6 right-6 h-[2px] brass-pipe rounded-full" />

        <div className="relative">
          <img
            src="/logo-wordmark.webp"
            alt="42 League"
            width={700}
            height={233}
            className="w-64 max-w-full h-auto mx-auto mb-2 select-none drop-shadow-[0_3px_12px_rgba(255,201,74,0.3)]"
            draggable={false}
          />
          <div className="text-[10px] text-brass/80 uppercase tracking-[0.22em] mb-8 font-extrabold">
            Babyfoot · Ranked
          </div>

          <h1 className="font-gaming text-xl font-extrabold text-text-strong mb-3 uppercase tracking-wide">
            {t('anon.title')}
          </h1>
          <p className="text-sm text-muted-2 leading-relaxed mb-6">{t('anon.text')}</p>

          <Button onClick={startLogin} full size="lg">
            {t('anon.cta')}
          </Button>

          {/* Bloc rassurant : comment marche l'OAuth de 42 (pour les sceptiques) */}
          <div className="mt-6 text-start card-hud rounded-xl p-4 border border-brass/20">
            <div className="flex items-center gap-2 mb-2">
              <span aria-hidden className="text-brass text-sm">🔒</span>
              <h2 className="font-gaming text-xs font-extrabold text-text-strong uppercase tracking-wide">
                {t('login.how.title')}
              </h2>
            </div>
            <p className="text-[11px] text-brass/90 font-semibold mb-1.5">
              {t('login.how.reassure')}
            </p>
            <p className="text-[11px] text-muted-2 leading-relaxed mb-3">
              {t('login.how.steps')}
            </p>
            <ul className="flex flex-col gap-1.5">
              <li>
                <a
                  href="https://api.intra.42.fr/apidoc/guides/web_application_flow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-brass underline underline-offset-2 hover:text-text-strong transition-colors"
                >
                  {t('login.how.link42')} ↗
                </a>
              </li>
              <li>
                <a
                  href="https://oauth.net/2/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-brass underline underline-offset-2 hover:text-text-strong transition-colors"
                >
                  {t('login.how.linkOauth')} ↗
                </a>
              </li>
              <li>
                <Link
                  to="/about"
                  className="text-[11px] text-brass underline underline-offset-2 hover:text-text-strong transition-colors"
                >
                  {t('login.how.linkPrivacy')}
                </Link>
              </li>
            </ul>
          </div>

          <p className="text-[10px] text-muted-2/60 mt-4 leading-relaxed">
            {t('login.privacy')}{' '}
            <Link to="/about" className="underline underline-offset-2 hover:text-muted-2 transition-colors">
              {t('login.privacyLink')}
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
