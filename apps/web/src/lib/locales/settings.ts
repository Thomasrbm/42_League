import type { Lang } from '../i18n';

type Dict = Record<string, string>;

/**
 * Traductions du domaine « Réglages » + noms des modes de jeu.
 * Fusionné dans le dictionnaire global par i18n.tsx.
 */
export const dict: Record<Lang, Dict> = {
  fr: {
    // Noms canoniques des modes de jeu
    'game.babyfoot': 'Babyfoot',
    'game.smash': 'Smash',
    'game.chess': 'Échecs',
    'game.streetfighter': 'Street Fighter',
    'game.flechettes': 'Fléchettes',
    'game.coding': 'Coding',
    'game.pokemon': 'Pokémon',

    // Réglages — modes de jeu
    'settings.gameModes.title': 'Modes de jeu',
    'settings.gameModes.hint': 'Tu apparais dans les classements et stats des modes activés.',
    'settings.gameModes.minOne': 'Au moins un mode doit rester actif',

    // Réglages — qualité graphique (palier de perf, cf. lib/perf.ts)
    'settings.quality': 'Qualité graphique',
    'settings.quality.hint':
      'Auto réduit les effets si l’appareil rame, sans rien changer sur les machines puissantes.',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'Élevée',
    'settings.quality.perf': 'Performance',

    // Réglages — notifications push
    'settings.push': 'Notifications push',
    'settings.push.enable': 'Activer sur cet appareil',
    'settings.push.disable': 'Désactiver sur cet appareil',
    'settings.push.enabled': 'Notifications activées — tu seras prévenu même app fermée.',
    'settings.push.disabled': 'Notifications désactivées sur cet appareil.',
    'settings.push.denied':
      'Les notifications sont bloquées par le navigateur. Autorise-les dans les réglages du site pour les activer.',
    'settings.push.error': 'Impossible d’activer les notifications.',
    'settings.push.hint':
      'Défis reçus, scores à valider, matchs de tournoi : prévenu même quand l’app est fermée.',

    // Réglages — cinématiques automatiques
    'settings.cinematics': 'Cinématiques automatiques',
    'settings.cinematics.on': 'Activées',
    'settings.cinematics.off': 'Désactivées',
    'settings.cinematics.hint':
      'Level-up, récompense débloquée, rage, réactions… Les animations liées à tes actions directes (et le narguage) restent.',

    // Réglages — émote de victoire (narguage post-1v1)
    'settings.tauntEmote': 'Émote de victoire',
    'settings.tauntEmote.hint':
      'Montrée au joueur que tu bats en 1v1, à sa prochaine connexion (après l’écran versus).',
    'settings.tauntEmote.saved': 'Émote enregistrée !',
    'settings.tauntEmote.error': 'Impossible d’enregistrer l’émote.',

    // Réglages — compte / divers
    'settings.connectedAs': 'Connecté en tant que',
    'settings.exportError': "Erreur lors de l'export.",
    'settings.deleteError': 'Erreur lors de la suppression.',

    // Sélecteur d'univers (FAB)
    'settings.universe': 'Univers',
    'settings.close': 'Fermer',
    'settings.currentUniverse': 'Univers actuel',
    'settings.changeGame': 'Changer de jeu.',
  },
  en: {
    'game.babyfoot': 'Babyfoot',
    'game.smash': 'Smash',
    'game.chess': 'Chess',
    'game.streetfighter': 'Street Fighter',
    'game.flechettes': 'Darts',
    'game.coding': 'Coding',
    'game.pokemon': 'Pokémon',

    'settings.gameModes.title': 'Game modes',
    'settings.gameModes.hint': 'You appear in the leaderboards and stats of the modes you enable.',
    'settings.gameModes.minOne': 'At least one mode must stay active',

    'settings.quality': 'Graphics quality',
    'settings.quality.hint':
      'Auto trims effects only when the device struggles — nothing changes on powerful machines.',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'High',
    'settings.quality.perf': 'Performance',

    'settings.push': 'Push notifications',
    'settings.push.enable': 'Enable on this device',
    'settings.push.disable': 'Disable on this device',
    'settings.push.enabled': 'Notifications on — you’ll be pinged even with the app closed.',
    'settings.push.disabled': 'Notifications disabled on this device.',
    'settings.push.denied':
      'Notifications are blocked by the browser. Allow them in the site settings to enable.',
    'settings.push.error': 'Could not enable notifications.',
    'settings.push.hint':
      'Challenges received, scores to confirm, tournament matches: pinged even when the app is closed.',

    'settings.cinematics': 'Automatic cinematics',
    'settings.cinematics.on': 'Enabled',
    'settings.cinematics.off': 'Disabled',
    'settings.cinematics.hint':
      'Level-up, reward unlocked, rage, reactions… Animations tied to your direct actions (and taunts) stay.',

    'settings.tauntEmote': 'Victory emote',
    'settings.tauntEmote.hint':
      'Shown to the player you beat in a 1v1, on their next visit (after the versus screen).',
    'settings.tauntEmote.saved': 'Emote saved!',
    'settings.tauntEmote.error': 'Could not save the emote.',

    'settings.connectedAs': 'Signed in as',
    'settings.exportError': 'Export failed.',
    'settings.deleteError': 'Deletion failed.',

    'settings.universe': 'Universe',
    'settings.close': 'Close',
    'settings.currentUniverse': 'Current universe',
    'settings.changeGame': 'Change game.',
  },
  es: {
    'game.babyfoot': 'Babyfoot',
    'game.smash': 'Smash',
    'game.chess': 'Ajedrez',
    'game.streetfighter': 'Street Fighter',
    'game.flechettes': 'Dardos',
    'game.coding': 'Coding',
    'game.pokemon': 'Pokémon',

    'settings.gameModes.title': 'Modos de juego',
    'settings.gameModes.hint': 'Apareces en las clasificaciones y estadísticas de los modos activados.',
    'settings.gameModes.minOne': 'Al menos un modo debe permanecer activo',

    'settings.quality': 'Calidad gráfica',
    'settings.quality.hint':
      'Auto reduce los efectos solo si el dispositivo va lento, sin cambiar nada en equipos potentes.',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'Alta',
    'settings.quality.perf': 'Rendimiento',

    'settings.push': 'Notificaciones push',
    'settings.push.enable': 'Activar en este dispositivo',
    'settings.push.disable': 'Desactivar en este dispositivo',
    'settings.push.enabled': 'Notificaciones activadas — te avisaremos incluso con la app cerrada.',
    'settings.push.disabled': 'Notificaciones desactivadas en este dispositivo.',
    'settings.push.denied':
      'El navegador bloquea las notificaciones. Permítelas en los ajustes del sitio para activarlas.',
    'settings.push.error': 'No se pudieron activar las notificaciones.',
    'settings.push.hint':
      'Desafíos recibidos, resultados por confirmar, partidos de torneo: aviso incluso con la app cerrada.',

    'settings.cinematics': 'Cinemáticas automáticas',
    'settings.cinematics.on': 'Activadas',
    'settings.cinematics.off': 'Desactivadas',
    'settings.cinematics.hint':
      'Subida de nivel, recompensa, rabia, reacciones… Las animaciones de tus acciones directas (y las burlas) se mantienen.',

    'settings.tauntEmote': 'Emote de victoria',
    'settings.tauntEmote.hint':
      'Se muestra al jugador que vences en 1v1 en su próxima visita (tras la pantalla de versus).',
    'settings.tauntEmote.saved': '¡Emote guardado!',
    'settings.tauntEmote.error': 'No se pudo guardar el emote.',

    'settings.connectedAs': 'Conectado como',
    'settings.exportError': 'Error al exportar.',
    'settings.deleteError': 'Error al eliminar.',

    'settings.universe': 'Universo',
    'settings.close': 'Cerrar',
    'settings.currentUniverse': 'Universo actual',
    'settings.changeGame': 'Cambiar de juego.',
  },
};
