import type { Lang } from './i18n';

export function fmtRelative(iso: string, lang: Lang): { text: string; late: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  const absMin = Math.round(Math.abs(diff) / 60_000);
  const h = Math.floor(absMin / 60);
  if (diff >= 0) {
    if (lang === 'fr') {
      if (absMin < 1) return { text: 'maintenant', late: false };
      if (absMin === 1) return { text: 'dans 1 minute', late: false };
      if (absMin < 60) return { text: `dans ${absMin} min`, late: false };
      return { text: h === 1 ? 'dans 1 heure' : `dans ${h} h`, late: false };
    }
    if (lang === 'es') {
      if (absMin < 1) return { text: 'ahora', late: false };
      if (absMin === 1) return { text: 'en 1 minuto', late: false };
      if (absMin < 60) return { text: `en ${absMin} min`, late: false };
      return { text: h === 1 ? 'en 1 hora' : `en ${h} h`, late: false };
    }
    if (lang === 'ja') {
      if (absMin < 1) return { text: '今', late: false };
      if (absMin < 60) return { text: `${absMin}分後`, late: false };
      return { text: `${h}時間後`, late: false };
    }
    if (lang === 'ar') {
      if (absMin < 1) return { text: 'الآن', late: false };
      if (absMin === 1) return { text: 'خلال دقيقة', late: false };
      if (absMin < 60) return { text: `خلال ${absMin} دقيقة`, late: false };
      return { text: h === 1 ? 'خلال ساعة' : `خلال ${h} ساعة`, late: false };
    }
    if (lang === 'pt') {
      if (absMin < 1) return { text: 'agora', late: false };
      if (absMin === 1) return { text: 'em 1 minuto', late: false };
      if (absMin < 60) return { text: `em ${absMin} min`, late: false };
      return { text: h === 1 ? 'em 1 hora' : `em ${h} h`, late: false };
    }
    if (absMin < 1) return { text: 'now', late: false };
    if (absMin === 1) return { text: 'in 1 minute', late: false };
    if (absMin < 60) return { text: `in ${absMin} min`, late: false };
    return { text: `in ${h}h`, late: false };
  }
  if (lang === 'fr') {
    if (absMin < 1) return { text: "à l'instant", late: false };
    if (absMin === 1) return { text: 'il y a 1 minute', late: true };
    if (absMin < 60) return { text: `il y a ${absMin} min`, late: true };
    return { text: h === 1 ? 'il y a 1 heure' : `il y a ${h} h`, late: true };
  }
  if (lang === 'es') {
    if (absMin < 1) return { text: 'ahora mismo', late: false };
    if (absMin === 1) return { text: 'hace 1 minuto', late: true };
    if (absMin < 60) return { text: `hace ${absMin} min`, late: true };
    return { text: h === 1 ? 'hace 1 hora' : `hace ${h} h`, late: true };
  }
  if (lang === 'ja') {
    if (absMin < 1) return { text: 'たった今', late: false };
    if (absMin < 60) return { text: `${absMin}分前`, late: true };
    return { text: `${h}時間前`, late: true };
  }
  if (lang === 'ar') {
    if (absMin < 1) return { text: 'الآن', late: false };
    if (absMin === 1) return { text: 'قبل دقيقة', late: true };
    if (absMin < 60) return { text: `قبل ${absMin} دقيقة`, late: true };
    return { text: h === 1 ? 'قبل ساعة' : `قبل ${h} ساعة`, late: true };
  }
  if (lang === 'pt') {
    if (absMin < 1) return { text: 'agora mesmo', late: false };
    if (absMin === 1) return { text: 'há 1 minuto', late: true };
    if (absMin < 60) return { text: `há ${absMin} min`, late: true };
    return { text: h === 1 ? 'há 1 hora' : `há ${h} h`, late: true };
  }
  if (absMin < 1) return { text: 'just now', late: false };
  if (absMin === 1) return { text: '1 minute ago', late: true };
  if (absMin < 60) return { text: `${absMin} min ago`, late: true };
  return { text: `${h}h ago`, late: true };
}

export function fmtCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'terminé';
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}j ${hours}h`;
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
}

/**
 * Clé de semaine ISO 8601 (« 2026-W23 ») — identique au calcul serveur. Sert à
 * détecter côté client qu'un achat hebdomadaire (ex. boost « ELO ×2 ») a déjà été
 * consommé cette semaine, sans aller-retour réseau.
 */
export function isoWeekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // lundi=0 … dimanche=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function isoLocalNowPlusMinutes(mins: number): string {
  const d = new Date(Date.now() + mins * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/**
 * Date « en lettres » élégante : « 12 janvier », « 4 février ».
 * L'année n'est ajoutée que si la date n'est pas dans l'année courante.
 */
export function fmtDateLong(iso: string, locale: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(
    locale,
    sameYear
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' },
  );
}

/** Début de journée locale (00:00) en ms — utilitaire pour comparer des jours. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Libellé de jour humain : « Aujourd'hui », « Hier », sinon date en lettres.
 * Idéal pour grouper / dater des cartes d'historique sans bruit numérique.
 */
export function fmtDayLabel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const locale = localeFor(lang);
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  const labels: Record<Lang, [string, string, string]> = {
    fr: ["Aujourd'hui", 'Hier', 'Demain'],
    en: ['Today', 'Yesterday', 'Tomorrow'],
    es: ['Hoy', 'Ayer', 'Mañana'],
    ja: ['今日', '昨日', '明日'],
    ar: ['اليوم', 'أمس', 'غدًا'],
    pt: ['Hoje', 'Ontem', 'Amanhã'],
  };
  if (dayDiff === 0) return labels[lang][0];
  if (dayDiff === 1) return labels[lang][1];
  if (dayDiff === -1) return labels[lang][2];
  return fmtDateLong(iso, locale);
}

/** Locale BCP-47 depuis la langue de l'app. */
function localeFor(lang: Lang): string {
  const map: Record<Lang, string> = {
    fr: 'fr-FR', en: 'en-GB', es: 'es-ES', ja: 'ja-JP', ar: 'ar', pt: 'pt-BR',
  };
  return map[lang];
}

/**
 * Couple de dates pour les historiques de match : la date numérique courte
 * (« 30/05/26 ») suivie, à droite, de la date avec le mois en toutes lettres
 * (« 30 mai »). Localisé selon la langue de l'utilisateur.
 */
export function fmtDatePair(iso: string, lang: Lang): { short: string; long: string } {
  const locale = localeFor(lang);
  return { short: fmtDate(iso, locale), long: fmtDateLong(iso, locale) };
}

/** Heure locale « HH:MM » (zéro-paddé). */
export function fmtTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
