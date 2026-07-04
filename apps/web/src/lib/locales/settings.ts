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

    'settings.gameModes.title': 'Game modes',
    'settings.gameModes.hint': 'You appear in the leaderboards and stats of the modes you enable.',
    'settings.gameModes.minOne': 'At least one mode must stay active',

    'settings.quality': 'Graphics quality',
    'settings.quality.hint':
      'Auto trims effects only when the device struggles — nothing changes on powerful machines.',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'High',
    'settings.quality.perf': 'Performance',

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

    'settings.gameModes.title': 'Modos de juego',
    'settings.gameModes.hint': 'Apareces en las clasificaciones y estadísticas de los modos activados.',
    'settings.gameModes.minOne': 'Al menos un modo debe permanecer activo',

    'settings.quality': 'Calidad gráfica',
    'settings.quality.hint':
      'Auto reduce los efectos solo si el dispositivo va lento, sin cambiar nada en equipos potentes.',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'Alta',
    'settings.quality.perf': 'Rendimiento',

    'settings.connectedAs': 'Conectado como',
    'settings.exportError': 'Error al exportar.',
    'settings.deleteError': 'Error al eliminar.',

    'settings.universe': 'Universo',
    'settings.close': 'Cerrar',
    'settings.currentUniverse': 'Universo actual',
    'settings.changeGame': 'Cambiar de juego.',
  },
};
