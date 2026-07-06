/**
 * Économie des émotes de victoire (narguage) — MÊME liste et MÊMES règles que
 * le backend (TAUNT_EMOTES / tauntEmoteUnlockLevel dans apps/backend/src/index.ts),
 * à garder en synchro :
 *  - index 0        : émote par défaut de tout le monde ;
 *  - index 1-2      : gratuites ;
 *  - index 3 et +   : débloquées par le passe de combat, une tous les 7 niveaux
 *                     (niveau 7, 14, 21, … 119).
 */
export const TAUNT_EMOTES = [
  '😂', '💀', '🤡', '😎', '🥱', '🐐', '🔥', '🕺', '🧂', '😭',
  // Nouveaux paliers de passe (niveaux 56, 63, 70, … 119).
  '🤖', '👽', '🦍', '🥷', '🦅', '🎯', '⚡', '👻', '🍕', '🌟',
] as const;

export const DEFAULT_TAUNT_EMOTE = TAUNT_EMOTES[0];

/** Nombre d'émotes gratuites (défaut inclus) en tête de liste. */
export const FREE_TAUNT_EMOTES = 3;

/** Une émote payante se débloque tous les N niveaux de passe. */
export const TAUNT_EMOTE_LEVEL_STEP = 7;

/** Niveau de passe requis pour équiper l'émote (0 = gratuite). */
export function tauntEmoteUnlockLevel(emote: string): number {
  const idx = (TAUNT_EMOTES as readonly string[]).indexOf(emote);
  if (idx < FREE_TAUNT_EMOTES) return 0;
  return (idx - FREE_TAUNT_EMOTES + 1) * TAUNT_EMOTE_LEVEL_STEP;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phrases de narguage — affichées sous l'émote de victoire. `{winner}` est
// remplacé par le nom du vainqueur. Chaque émote a ses répliques dédiées (le ton
// colle à l'emoji : le clown se moque du niveau, la tête de mort enterre, etc.),
// plus un pot commun générique. Choix DÉTERMINISTE par narguage (cf. tauntPhrase)
// pour rester stable au re-render / skip.
// ─────────────────────────────────────────────────────────────────────────────
const GENERIC_TAUNT_PHRASES = [
  '{winner} se rit de toi.',
  'Celui qui rigole, c’est {winner}.',
  '{winner} t’a passé dessus.',
  'Reviens quand tu sauras jouer.',
  '{winner} t’a mis une leçon.',
] as const;

const TAUNT_PHRASES: Record<string, readonly string[]> = {
  '😂': ['{winner} se marre encore.', 'Celui qui rigole, c’est {winner} — pas toi.', 'C’était pour rire, ce match ?'],
  '💀': ['R.I.P. ta dignité.', '{winner} t’a enterré.', 'C’est mort, remballe.'],
  '🤡': ['Ton niveau est clownesque.', '{winner} t’a transformé en cirque.', 'Honk honk — bien joué le clown.'],
  '😎': ['Trop facile pour {winner}.', '{winner} n’a même pas transpiré.', 'Classe. Toi, moins.'],
  '🥱': ['{winner} s’est ennuyé.', 'Réveille-moi quand tu marques.', 'Bâillement… c’était gagné d’avance.'],
  '🐐': ['{winner}, le vrai GOAT.', 'Tu affrontais une légende.', 'GOAT status : {winner}.'],
  '🔥': ['{winner} t’a carbonisé.', 'Ça brûle, hein ?', '{winner} est en feu, toi en cendres.'],
  '🕺': ['{winner} danse sur ta défaite.', 'La victoire se fête — sans toi.', 'Petite danse pour {winner}.'],
  '🧂': ['Salé, le petit ? {winner} en rajoute.', 'Passe-moi le sel de tes larmes.', '{winner} t’assaisonne.'],
  '😭': ['Pleure pas, ça arrive… souvent.', '{winner} t’a fait chialer.', 'Les larmes, c’est gratuit au moins.'],
  // ── Nouveaux paliers de passe ──
  '🤖': ['{winner} a joué en mode automatique.', 'Calcul terminé : {winner} gagne.', 'Résistance futile face à {winner}.'],
  '👽': ['{winner} vient d’une autre planète.', 'Niveau extraterrestre pour {winner}.', 'Tu n’étais pas de ce monde… celui de {winner}.'],
  '🦍': ['{winner} a tapé fort.', 'Domination bestiale de {winner}.', 'La jungle appartient à {winner}.'],
  '🥷': ['{winner} t’a éliminé sans un bruit.', 'Tu n’as rien vu venir de {winner}.', 'Ombre fatale : {winner}.'],
  '🦅': ['{winner} t’a fondu dessus.', 'Vue d’aigle, proie facile.', '{winner} plane, tu rampes.'],
  '🎯': ['{winner} ne rate jamais.', 'En plein dans le mille, {winner}.', 'Cible atteinte : ton ego, par {winner}.'],
  '⚡': ['{winner} t’a foudroyé.', 'Trop rapide pour toi, {winner}.', 'Éclair de génie signé {winner}.'],
  '👻': ['{winner} t’a hanté.', 'Tu as vu un fantôme ? C’était {winner}.', 'Disparais — {winner} l’a déjà fait de toi.'],
  '🍕': ['{winner} t’a mangé une part.', 'Chaud devant : {winner} se régale.', 'Tu es la garniture, {winner} le chef.'],
  '🌟': ['{winner} brille au sommet.', 'Une étoile est née : {winner}.', 'Fais un vœu — {winner} l’a déjà exaucé.'],
  // ── Émotes secrètes (easter eggs) ──
  '🌈': ['{winner} maîtrise TOUS les modes.', 'Aucune discipline ne résiste à {winner}.', 'Touche-à-tout, {winner} t’a touché.'],
  '🎲': ['{winner} joue sur tous les tableaux.', 'Le hasard n’y est pour rien, {winner}.', '{winner} varie les plaisirs — à tes dépens.'],
  '🥉': ['{winner} a du métal dans la vitrine.', 'Déjà 3 trophées pour {winner}.', 'Le podium connaît {winner}.'],
  '🥈': ['{winner} collectionne l’argenterie.', '5 titres et ça continue, {winner}.', 'Range tes excuses, {winner} range ses coupes.'],
  '🥇': ['{winner} vit sur la plus haute marche.', 'Dix tournois. DIX. {winner} ne rigole pas.', 'L’or, c’est la couleur de {winner}.'],
  '💎': ['Grade Diamant : bienvenue chez {winner}.', '{winner} brille, toi tu ternis.', 'Inaccessible — comme {winner}.'],
  '🧨': ['{winner} enchaîne sans jamais lâcher.', 'La mèche est courte, {winner} explose.', 'Série en cours : {winner} carbure.'],
  '🌪️': ['{winner} est une tempête ininterrompue.', '30 jours d’affilée — {winner} ne dort jamais.', 'Tu es passé dans l’œil du cyclone {winner}.'],
  '🎖️': ['{winner} a le grade et les états de service.', 'Vétéran confirmé : {winner}.', 'Respecte les galons de {winner}.'],
  '🦖': ['{winner} est un prédateur préhistorique.', '200 matchs au compteur pour {winner}.', 'Espèce en voie de te dominer : {winner}.'],
  '🚀': ['{winner} a décollé, toi non.', 'Niveau maximum : destination {winner}.', 'Hors d’atteinte — {winner} est en orbite.'],
};

/** Petit hash déterministe d'une chaîne (stable au re-render). */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Phrase de narguage pour un couple (émote, vainqueur), choisie de façon
 * déterministe via `seed` (ex. l'id du narguage) → même phrase à chaque rendu.
 */
export function tauntPhrase(emote: string, winner: string, seed: string): string {
  const pool = TAUNT_PHRASES[emote] ?? GENERIC_TAUNT_PHRASES;
  const phrase = pool[hashStr(seed + emote) % pool.length] ?? GENERIC_TAUNT_PHRASES[0];
  return phrase.replace(/\{winner\}/g, winner);
}
