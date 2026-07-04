import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { GameModesSettings } from '../components/GameModesSettings';
import { Pills } from '../components/Pills';
import { Button } from '../components/Button';
import { FeatureRequestBox } from '../components/FeatureRequestBox';
import { BugReportBox } from '../components/BugReportBox';
import { useAuth } from '../hooks/useAuth';
import { useFlash } from '../hooks/useFlash';
import { useI18n, useT, type Lang } from '../lib/i18n';
import { getApiBase, APP_VERSION, APP_BUILD_DATE } from '../lib/config';
import { getToken } from '../lib/storage';
import { usePerfPref } from '../hooks/usePerf';
import { setPerfPref, type PerfPref } from '../lib/perf';

export function ReglagesPage() {
  const t = useT();
  const { lang, setLang } = useI18n();
  const { signOut, startLogin, login } = useAuth();
  const flash = useFlash();
  const perfPref = usePerfPref();

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/me/export`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `42league-export-${login ?? 'data'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      flash.show(t('settings.exportError'));
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/me/account`, {
        method: 'DELETE',
        headers: token ? { authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      flash.show(t('settings.gdpr.deleted'));
      signOut();
    } catch {
      flash.show(t('settings.deleteError'));
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <FeatureRequestBox />
      <BugReportBox />
      <Panel title={t('panel.settings.title')}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Modes de jeu (adhésion) */}
        <GameModesSettings />

        {/* Langue */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-2 mb-2">
            {t('settings.lang')}
          </label>
          <Pills<Lang>
            value={lang}
            onChange={setLang}
            choices={[
              { value: 'fr', label: t('settings.lang.fr') },
              { value: 'en', label: t('settings.lang.en') },
              { value: 'es', label: t('settings.lang.es') },
            ]}
          />
        </div>

        {/* Qualité graphique (palier de perf adaptatif) */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-2 mb-2">
            {t('settings.quality')}
          </label>
          <Pills<PerfPref>
            value={perfPref}
            onChange={setPerfPref}
            choices={[
              { value: 'auto', label: t('settings.quality.auto') },
              { value: 'full', label: t('settings.quality.high') },
              { value: 'lite', label: t('settings.quality.perf') },
            ]}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-muted-2/70">
            {t('settings.quality.hint')}
          </p>
        </div>

        {/* Compte */}
        <div className="border-t border-gold/20 pt-5">
          <div className="font-gaming text-xs font-extrabold uppercase tracking-[0.18em] text-gold mb-3 flex items-center gap-2">
            <span className="inline-block w-1 h-3 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
            {t('settings.account')}
          </div>
          {login && (
            <div className="text-sm text-muted-2 mb-3">
              {t('settings.connectedAs')} <span className="text-teal font-semibold">{login}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                signOut();
                startLogin();
              }}
            >
              {t('settings.changeAccount')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                signOut();
                flash.show(t('settings.loggedOut'));
              }}
            >
              {t('settings.logout')}
            </Button>
          </div>
        </div>

        {/* Données personnelles (RGPD) */}
        <div className="border-t border-gold/20 pt-5">
          <div className="font-gaming text-xs font-extrabold uppercase tracking-[0.18em] text-gold mb-3 flex items-center gap-2">
            <span className="inline-block w-1 h-3 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
            {t('settings.gdpr.title')}
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              variant="ghost"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? t('settings.gdpr.exporting') : t('settings.gdpr.export')}
            </Button>

            {!deleteConfirm ? (
              <Button variant="ghost" onClick={() => setDeleteConfirm(true)}>
                {t('settings.gdpr.delete')}
              </Button>
            ) : (
              <div className="w-full flex flex-col gap-2 p-3 rounded-xl border border-red/35 bg-red/5">
                <p className="text-xs text-muted-2 leading-relaxed">
                  {t('settings.gdpr.delete.warning')}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? t('settings.gdpr.deleting') : t('settings.gdpr.delete.confirm')}
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>
                    {t('settings.gdpr.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Link
            to="/about"
            className="inline-flex items-center gap-1.5 text-xs text-muted-2 hover:text-gold transition-colors"
          >
            <span className="inline-block w-1 h-1 rounded-full bg-gold/60" />
            {t('settings.gdpr.about')}
          </Link>
        </div>

        {/* À propos */}
        <div className="border-t border-gold/20 pt-5">
          <div className="font-gaming text-xs font-extrabold uppercase tracking-[0.18em] text-gold mb-3 flex items-center gap-2">
            <span className="inline-block w-1 h-3 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
            {t('settings.about.title')}
          </div>
          <Link
            to="/about"
            className="inline-flex items-center gap-1.5 text-xs text-muted-2 hover:text-gold transition-colors"
          >
            <span className="inline-block w-1 h-1 rounded-full bg-gold/60" />
            {t('settings.about.link')}
          </Link>
        </div>

        {/* Version */}
        <div className="border-t border-gold/10 pt-4 flex items-center justify-between">
          <span className="font-gaming text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold/50">
            One League
          </span>
          <div className="text-right leading-snug">
            <span className="font-mono text-[11px] font-bold text-muted-2 tabular-nums">
              v{APP_VERSION}
            </span>
            <span className="block text-[10px] text-muted-2/50 tabular-nums">{APP_BUILD_DATE}</span>
          </div>
        </div>

      </div>
      </Panel>
    </div>
  );
}
