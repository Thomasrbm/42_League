import type { Lang } from '../i18n';

type Dict = Record<string, string>;

/**
 * Traductions du domaine « about ». Fusionné dans le dictionnaire global par i18n.tsx.
 *
 * Note : les contenus RICHES (JSX avec surlignages <span>) — règles par jeu,
 * système ELO, blurbs d'équipe — ne vivent PAS ici. Ils sont rendus
 * « language-aware » directement dans AboutPage.tsx (sélection par `lang`).
 * Ce fichier ne contient que les chaînes en TEXTE BRUT.
 */
export const dict: Record<Lang, Dict> = {
  fr: {
    // Onglets
    'about.rules.title': 'Règles',
    'about.changelog.title': 'Nouveautés',
    'about.changelog.heading': 'Notes de version',
    'about.changelog.sub': 'Les dernières évolutions de la League.',
    'about.privacy.title': 'Confidentialité',
    'about.tech.title': 'Technique',
    'about.team.title': 'Équipe',
    'about.announcements.title': 'Annonces',
    'about.announcements.heading': 'Dernières annonces',
    'about.announcements.sub': 'Toutes les annonces de la ligue',
    'about.announcements.empty': 'Aucune annonce pour le moment.',
    'announce.popup.next': 'Suivant',
    'announce.popup.ok': "J'ai compris",

    // Navigation
    'about.back.login': 'Connexion',

    // Panneaux — titres & sous-titres
    'about.rules.terrain.title': 'Règles sur le terrain',
    'about.rules.format.title': 'Format du match',
    'about.rules.challenges.title': 'Défis et OPS',
    'about.rules.tournaments.title': 'Tournois',
    'about.elo.title': 'Système ELO',
    'about.elo.sub': 'comment les points sont calculés',
    'about.elo.transferred': 'Points transférés',
    'about.elo.upsetBonus': "bonus d'upset",
    'about.privacy.controller.title': 'Responsable du traitement',
    'about.privacy.collected.title': 'Données collectées',
    'about.privacy.legal.title': 'Base légale',
    'about.privacy.rights.title': 'Vos droits',
    'about.privacy.security.title': 'Sécurité',
    'about.tech.architecture.title': 'Architecture',
    'about.tech.hosting.title': 'Hébergement & déploiement',
    'about.tech.hack.title': 'Friendly hack',
    'about.tech.hack.sub': 'la transparence est volontaire',
    'about.team.devs.title': 'Les développeurs',
    'about.team.devs.sub': "de l'idée au déploiement",

    // Carrousel équipe
    'about.team.intro':
      '42 League est un projet collectif. Chacun y a joué un rôle bien distinct — de la première idée jusqu’à la mise en production.',
    'about.team.intro.hint': '← glisse, scrolle ou clique pour parcourir →',
    'about.team.prev': 'Précédent',
    'about.team.next': 'Suivant',
    'about.team.goto': 'Aller à',

    // Stats de contributions git (carte « ? »)
    'about.stats.aria': 'Voir les lignes de code',
    'about.stats.title': 'Lignes de code',
    'about.stats.added': 'Ajoutées',
    'about.stats.deleted': 'Supprimées',
    'about.stats.net': 'Net',

    // Rôles d'équipe
    'about.role.throbert': 'Founder',
    'about.role.nithomas': 'Parrain',
    'about.role.abidaux': 'Founder',
    'about.role.jagharra': 'Sécurité · Pentester',
    'about.role.rbardet': 'Conseiller UX/UI',
    'about.role.sbonneau': 'Pen tester · Abuser',

    // Privacy — table
    'about.privacy.table.data': 'Donnée',
    'about.privacy.table.source': 'Source',
    'about.privacy.table.retention': 'Conservation',
    'about.privacy.row1.data': 'Login, campus, photo',
    'about.privacy.row1.source': 'API 42 (OAuth)',
    'about.privacy.row1.retention': "Jusqu'à suppression",
    'about.privacy.row2.data': 'Historique de matchs',
    'about.privacy.row2.source': 'Actions utilisateur',
    'about.privacy.row2.retention': 'Durée de la saison',
    'about.privacy.row3.data': 'Cookie de session',
    'about.privacy.row3.source': 'Technique (auth)',
    'about.privacy.row3.retention': '30 jours',
    'about.privacy.row4.data': "Logs d'administration",
    'about.privacy.row4.source': 'Actions admin',
    'about.privacy.row4.retention': '24 mois',
    'about.privacy.collected.intro': 'Les données suivantes sont traitées dans l’application :',
    'about.privacy.rights.intro': 'Conformément au RGPD, vous disposez des droits suivants :',
    'about.privacy.authority': 'Autorité de contrôle : CNIL —',

    // ELO — labels des termes
    'about.elo.term.E.label': 'Probabilité attendue',
    'about.elo.term.K.label': 'Facteur de base',
    'about.elo.term.M.label': "Multiplicateur d'écart de buts",
    'about.elo.term.bonus.label': "Récompense l'exploit",
    'about.elo.example.scored': 'Exemple — tu es à 1000 ELO et tu gagnes 10–5',
    'about.elo.example.unscored': 'Exemple — tu es à 1000 ELO et tu gagnes',
    'about.elo.example.small.title': 'Petit écart',
    'about.elo.example.small.sub': 'tu bats un joueur à 1050 ELO',
    'about.elo.example.big.title': 'Gros écart',
    'about.elo.example.big.sub': 'tu bats un joueur à 1400 ELO',
    'about.elo.example.heLoses': '/ il perd',
  },
  en: {
    // Tabs
    'about.rules.title': 'Rules',
    'about.changelog.title': "What's new",
    'about.changelog.heading': 'Release notes',
    'about.changelog.sub': 'The latest changes to the League.',
    'about.privacy.title': 'Privacy',
    'about.tech.title': 'Tech',
    'about.team.title': 'Team',
    'about.announcements.title': 'News',
    'about.announcements.heading': 'Latest announcements',
    'about.announcements.sub': 'All league announcements',
    'about.announcements.empty': 'No announcements yet.',
    'announce.popup.next': 'Next',
    'announce.popup.ok': 'Got it',

    // Navigation
    'about.back.login': 'Sign in',

    // Panels — titles & subtitles
    'about.rules.terrain.title': 'Rules of play',
    'about.rules.format.title': 'Match format',
    'about.rules.challenges.title': 'Challenges & OPS',
    'about.rules.tournaments.title': 'Tournaments',
    'about.elo.title': 'ELO system',
    'about.elo.sub': 'how points are calculated',
    'about.elo.transferred': 'Points transferred',
    'about.elo.upsetBonus': 'upset bonus',
    'about.privacy.controller.title': 'Data controller',
    'about.privacy.collected.title': 'Data collected',
    'about.privacy.legal.title': 'Legal basis',
    'about.privacy.rights.title': 'Your rights',
    'about.privacy.security.title': 'Security',
    'about.tech.architecture.title': 'Architecture',
    'about.tech.hosting.title': 'Hosting & deployment',
    'about.tech.hack.title': 'Friendly hack',
    'about.tech.hack.sub': 'transparency is intentional',
    'about.team.devs.title': 'The developers',
    'about.team.devs.sub': 'from idea to deployment',

    // Team carousel
    'about.team.intro':
      '42 League is a collective project. Everyone played a distinct role — from the very first idea to production.',
    'about.team.intro.hint': '← swipe, scroll or click to browse →',
    'about.team.prev': 'Previous',
    'about.team.next': 'Next',
    'about.team.goto': 'Go to',

    // Git contribution stats (card « ? »)
    'about.stats.aria': 'View lines of code',
    'about.stats.title': 'Lines of code',
    'about.stats.added': 'Added',
    'about.stats.deleted': 'Deleted',
    'about.stats.net': 'Net',

    // Team roles
    'about.role.throbert': 'Founder',
    'about.role.nithomas': 'Mentor',
    'about.role.abidaux': 'Founder',
    'about.role.jagharra': 'Security · Pentester',
    'about.role.rbardet': 'UX/UI advisor',
    'about.role.sbonneau': 'Pen tester · Abuser',

    // Privacy — table
    'about.privacy.table.data': 'Data',
    'about.privacy.table.source': 'Source',
    'about.privacy.table.retention': 'Retention',
    'about.privacy.row1.data': 'Login, campus, photo',
    'about.privacy.row1.source': '42 API (OAuth)',
    'about.privacy.row1.retention': 'Until deletion',
    'about.privacy.row2.data': 'Match history',
    'about.privacy.row2.source': 'User actions',
    'about.privacy.row2.retention': 'Season duration',
    'about.privacy.row3.data': 'Session cookie',
    'about.privacy.row3.source': 'Technical (auth)',
    'about.privacy.row3.retention': '30 days',
    'about.privacy.row4.data': 'Admin logs',
    'about.privacy.row4.source': 'Admin actions',
    'about.privacy.row4.retention': '24 months',
    'about.privacy.collected.intro': 'The following data is processed in the app:',
    'about.privacy.rights.intro': 'Under the GDPR, you have the following rights:',
    'about.privacy.authority': 'Supervisory authority: CNIL —',

    // ELO — term labels
    'about.elo.term.E.label': 'Expected probability',
    'about.elo.term.K.label': 'Base factor',
    'about.elo.term.M.label': 'Goal-margin multiplier',
    'about.elo.term.bonus.label': 'Rewards the upset',
    'about.elo.example.scored': 'Example — you are at 1000 ELO and you win 10–5',
    'about.elo.example.unscored': 'Example — you are at 1000 ELO and you win',
    'about.elo.example.small.title': 'Small gap',
    'about.elo.example.small.sub': 'you beat a player at 1050 ELO',
    'about.elo.example.big.title': 'Big gap',
    'about.elo.example.big.sub': 'you beat a player at 1400 ELO',
    'about.elo.example.heLoses': '/ they lose',
  },
  es: {
    // Pestañas
    'about.rules.title': 'Reglas',
    'about.changelog.title': 'Novedades',
    'about.changelog.heading': 'Notas de versión',
    'about.changelog.sub': 'Los últimos cambios de la League.',
    'about.privacy.title': 'Privacidad',
    'about.tech.title': 'Técnica',
    'about.team.title': 'Equipo',
    'about.announcements.title': 'Anuncios',
    'about.announcements.heading': 'Últimos anuncios',
    'about.announcements.sub': 'Todos los anuncios de la liga',
    'about.announcements.empty': 'No hay anuncios por ahora.',
    'announce.popup.next': 'Siguiente',
    'announce.popup.ok': 'Entendido',

    // Navegación
    'about.back.login': 'Iniciar sesión',

    // Paneles — títulos y subtítulos
    'about.rules.terrain.title': 'Reglas en la cancha',
    'about.rules.format.title': 'Formato del partido',
    'about.rules.challenges.title': 'Desafíos y OPS',
    'about.rules.tournaments.title': 'Torneos',
    'about.elo.title': 'Sistema ELO',
    'about.elo.sub': 'cómo se calculan los puntos',
    'about.elo.transferred': 'Puntos transferidos',
    'about.elo.upsetBonus': 'bonus de sorpresa',
    'about.privacy.controller.title': 'Responsable del tratamiento',
    'about.privacy.collected.title': 'Datos recopilados',
    'about.privacy.legal.title': 'Base jurídica',
    'about.privacy.rights.title': 'Tus derechos',
    'about.privacy.security.title': 'Seguridad',
    'about.tech.architecture.title': 'Arquitectura',
    'about.tech.hosting.title': 'Alojamiento y despliegue',
    'about.tech.hack.title': 'Friendly hack',
    'about.tech.hack.sub': 'la transparencia es intencionada',
    'about.team.devs.title': 'Los desarrolladores',
    'about.team.devs.sub': 'de la idea al despliegue',

    // Carrusel del equipo
    'about.team.intro':
      '42 League es un proyecto colectivo. Cada uno jugó un papel bien distinto — desde la primera idea hasta la puesta en producción.',
    'about.team.intro.hint': '← desliza, haz scroll o clic para recorrer →',
    'about.team.prev': 'Anterior',
    'about.team.next': 'Siguiente',
    'about.team.goto': 'Ir a',

    // Estadísticas de contribuciones git (tarjeta « ? »)
    'about.stats.aria': 'Ver las líneas de código',
    'about.stats.title': 'Líneas de código',
    'about.stats.added': 'Añadidas',
    'about.stats.deleted': 'Eliminadas',
    'about.stats.net': 'Neto',

    // Roles del equipo
    'about.role.throbert': 'Founder',
    'about.role.nithomas': 'Padrino',
    'about.role.abidaux': 'Founder',
    'about.role.jagharra': 'Seguridad · Pentester',
    'about.role.rbardet': 'Asesor UX/UI',
    'about.role.sbonneau': 'Pen tester · Abuser',

    // Privacidad — tabla
    'about.privacy.table.data': 'Dato',
    'about.privacy.table.source': 'Fuente',
    'about.privacy.table.retention': 'Conservación',
    'about.privacy.row1.data': 'Login, campus, foto',
    'about.privacy.row1.source': 'API 42 (OAuth)',
    'about.privacy.row1.retention': 'Hasta la eliminación',
    'about.privacy.row2.data': 'Historial de partidos',
    'about.privacy.row2.source': 'Acciones del usuario',
    'about.privacy.row2.retention': 'Duración de la temporada',
    'about.privacy.row3.data': 'Cookie de sesión',
    'about.privacy.row3.source': 'Técnica (auth)',
    'about.privacy.row3.retention': '30 días',
    'about.privacy.row4.data': 'Logs de administración',
    'about.privacy.row4.source': 'Acciones de admin',
    'about.privacy.row4.retention': '24 meses',
    'about.privacy.collected.intro': 'Los siguientes datos se tratan en la aplicación:',
    'about.privacy.rights.intro': 'Conforme al RGPD, dispones de los siguientes derechos:',
    'about.privacy.authority': 'Autoridad de control: CNIL —',

    // ELO — etiquetas de términos
    'about.elo.term.E.label': 'Probabilidad esperada',
    'about.elo.term.K.label': 'Factor base',
    'about.elo.term.M.label': 'Multiplicador de diferencia de goles',
    'about.elo.term.bonus.label': 'Premia la sorpresa',
    'about.elo.example.scored': 'Ejemplo — estás a 1000 ELO y ganas 10–5',
    'about.elo.example.unscored': 'Ejemplo — estás a 1000 ELO y ganas',
    'about.elo.example.small.title': 'Diferencia pequeña',
    'about.elo.example.small.sub': 'ganas a un jugador a 1050 ELO',
    'about.elo.example.big.title': 'Diferencia grande',
    'about.elo.example.big.sub': 'ganas a un jugador a 1400 ELO',
    'about.elo.example.heLoses': '/ él pierde',
  },
};
