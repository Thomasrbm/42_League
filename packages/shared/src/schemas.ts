import { z } from 'zod';

export const LoginSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_-]+$/, 'login must match the 42 intra login format');

// Foosball score : le perdant peut descendre sous 0 à cause des gamelles
// (penalty d'auto-but). Borne inférieure -10 = 10 gamelles avant que le
// gagnant n'atteigne 10. Borne supérieure 10 = victoire stricte d'un seul camp.
export const MatchScoreSchema = z.number().int().min(-10).max(10);

// ─── Multi-jeu (babyfoot | smash | chess | streetfighter | flechettes) ───────
export const GameSchema = z.enum(['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes']);
export type Game = z.infer<typeof GameSchema>;
export const SmashBestOfSchema = z.union([z.literal(3), z.literal(5)]);
export const SmashCharSchema = z.string().trim().min(1).max(40);
export const SmashStockSchema = z.number().int().min(1).max(3);
// Perso d'un match : soit un id simple ("mario"), soit un détail PAR MANCHE encodé
// ("mario>luigi>mario"). On relâche donc la longueur max (un Bo5 = jusqu'à 5 ids).
export const MatchCharSchema = z.string().trim().min(1).max(300);

// Personnages favoris (« mains ») configurables par le joueur, par jeu de combat.
// Liste libre (illimitée côté produit) ; cap de sécurité + dédup faits côté route.
// Seules les clés fournies sont mises à jour (PATCH partiel).
export const FAVORITES_MAX = 200;
export const FavoritesUpdateSchema = z
  .object({
    smash: z.array(SmashCharSchema).max(FAVORITES_MAX).optional(),
    streetfighter: z.array(SmashCharSchema).max(FAVORITES_MAX).optional(),
  })
  .strict();
export type FavoritesUpdate = z.infer<typeof FavoritesUpdateSchema>;

/** Champs communs aux déclarations/confirmations, indépendants du jeu. */
const matchScoreShape = {
  scoreSelf: MatchScoreSchema,
  scoreOpponent: MatchScoreSchema,
  game: GameSchema.default('babyfoot'),
  // Smash uniquement. `.nullish()` + transform : les jeux non-smash (babyfoot,
  // échecs) envoient `bestOf: null` → on l'accepte et on le ramène à `undefined`
  // (sinon Zod rejette `null` contre le union de littéraux → 400 à la confirmation).
  bestOf: SmashBestOfSchema.nullish().transform((v) => v ?? undefined),
  charSelf: MatchCharSchema.optional(),
  charOpponent: MatchCharSchema.optional(),
  // Vies (stocks) restantes du gagnant au game décisif.
  stocks: SmashStockSchema.optional(),
};

interface MatchScores {
  scoreSelf: number;
  scoreOpponent: number;
  game: Game;
  bestOf?: number;
  charSelf?: string;
  charOpponent?: string;
}

/**
 * Validation des scores selon le jeu :
 *  - babyfoot : un seul camp atteint 10 ;
 *  - smash / street fighter : set Bo3/Bo5, le gagnant atteint exactement la cible
 *    (2 ou 3), le perdant en dessous. Les PERSOS sont OPTIONNELS : la déclaration
 *    « score d'abord » (cf. SmashSetEditor / progressive disclosure) permet de
 *    valider une game sans renseigner les personnages.
 */
function matchScoreRefiner(m: MatchScores, ctx: z.RefinementCtx): void {
  if (m.game === 'chess') {
    // Échecs : victoire 1-0 / 0-1, ou nulle 0-0 (les deux camps à 0).
    const win = (m.scoreSelf === 1 && m.scoreOpponent === 0) ||
      (m.scoreSelf === 0 && m.scoreOpponent === 1);
    const draw = m.scoreSelf === 0 && m.scoreOpponent === 0;
    if (!win && !draw) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'chess score must be 1-0 (win), 0-1 (loss) or 0-0 (draw)' });
    }
    return;
  }
  if (m.game === 'smash' || m.game === 'streetfighter') {
    // Street Fighter == Smash mécaniquement : set Bo3/Bo5. Persos non requis.
    if (!m.bestOf) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bestOf required for set games (3 or 5)' });
      return;
    }
    const target = Math.ceil(m.bestOf / 2);
    const hi = Math.max(m.scoreSelf, m.scoreOpponent);
    const lo = Math.min(m.scoreSelf, m.scoreOpponent);
    if (hi !== target) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `winner must win exactly ${target} games` });
    }
    if (lo < 0 || lo >= target) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'loser games must be between 0 and target-1' });
    }
  } else {
    if (!(m.scoreSelf === 10 || m.scoreOpponent === 10)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'one side must reach 10 goals' });
    }
    if (m.scoreSelf === 10 && m.scoreOpponent === 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'only one side can reach 10 goals' });
    }
  }
}

export const DeclareMatchSchema = z
  .object({ opponentLogin: LoginSchema, ...matchScoreShape })
  .superRefine(matchScoreRefiner);

export type DeclareMatchInput = z.infer<typeof DeclareMatchSchema>;

// Confirmation : pas besoin de re-fournir les persos (déjà posés par le déclarant).
export const ConfirmMatchSchema = z
  .object(matchScoreShape)
  .superRefine(matchScoreRefiner);

export type ConfirmMatchInput = z.infer<typeof ConfirmMatchSchema>;

export const RejectMatchSchema = z.object({
  contestReason: z.enum(['never_played', 'wrong_score']),
  contestMessage: z.string().min(10).max(500),
});

export type RejectMatchInput = z.infer<typeof RejectMatchSchema>;

export const CreateChallengeSchema = z.object({
  opponentLogin: LoginSchema,
  scheduledAt: z
    .string()
    .datetime({ offset: true })
    .refine((s) => new Date(s).getTime() > Date.now() - 60_000, {
      message: 'scheduledAt must be in the future (or within the last minute)',
    }),
  game: GameSchema.default('babyfoot'),
});

export type CreateChallengeInput = z.infer<typeof CreateChallengeSchema>;

export const RecordResultSchema = z
  .object(matchScoreShape)
  .superRefine(matchScoreRefiner);

export type RecordResultInput = z.infer<typeof RecordResultSchema>;

// ─── Boutique : création d'un cosmétique ─────────────────────────────────────
// Partagé entre l'admin Shop GOD (POST /admin/shop/items) et la récompense de
// tournoi officiel (cosmétique custom créé inline). Cap d'octets sur la data-URL
// de bannière (~700 Ko) : évite de gonfler la table et les réponses.
export const MAX_BANNER_DATAURL_LEN = 700_000;
// Rareté d'un objet de boutique — pilote la couleur de sa carte en vitrine.
export const ShopRaritySchema = z.enum(['common', 'rare', 'epic', 'legendary']);
export type ShopRarity = z.infer<typeof ShopRaritySchema>;
export const ShopItemCreateSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().nullish(),
    category: z.enum(['title', 'banner', 'badge', 'consumable']),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'couleur invalide (format #rrggbb)')
      .nullish(),
    rarity: ShopRaritySchema.nullish(),
    price: z.number().int().min(0),
    payload: z.record(z.any()).nullish(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.category === 'banner') {
      // allowUpload = true → bannière personnalisable par le joueur, image non requise à la création.
      const allowUpload = d.payload?.allowUpload === true;
      if (!allowUpload) {
        const img = d.payload && typeof d.payload.image === 'string' ? d.payload.image : '';
        if (!img.startsWith('data:image/')) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bannière : image (data-URL) requise' });
        } else if (img.length > MAX_BANNER_DATAURL_LEN) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bannière trop lourde (max ~700 Ko)' });
        }
      }
    }
    if (d.category === 'consumable') {
      const kind = d.payload && typeof d.payload.kind === 'string' ? d.payload.kind : '';
      if (kind !== 'anti_ops' && kind !== 'elo_mult' && kind !== 'force_duel') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "consommable : payload.kind doit être 'anti_ops', 'elo_mult' ou 'force_duel'" });
      }
    }
  });
export type ShopItemCreateInput = z.infer<typeof ShopItemCreateSchema>;

// ─── Annonces générales (admin → tous les joueurs) ───────────────────────────
// Une annonce rédigée dans /GOD, affichée une seule fois en popup à la prochaine
// connexion de chaque joueur, puis listée en permanence dans la page À propos.
export const AnnouncementKindSchema = z.enum(['info', 'important', 'event']);
export type AnnouncementKind = z.infer<typeof AnnouncementKindSchema>;
export const AnnouncementCreateSchema = z.object({
  title: z.string().trim().min(1, 'titre requis').max(120, 'titre trop long (max 120)'),
  body: z.string().trim().min(1, 'message requis').max(4000, 'message trop long (max 4000)'),
  kind: AnnouncementKindSchema.optional(),
  active: z.boolean().optional(),
});
export type AnnouncementCreateInput = z.infer<typeof AnnouncementCreateSchema>;

// ─── Récompense de tournoi officiel ──────────────────────────────────────────
// Une seule récompense au choix : aucune | coins | cosmétique existant |
// cosmétique custom créé à la volée (même validation que Shop GOD).
export const TournamentPrizeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('coins'), coins: z.number().int().min(1).max(1_000_000) }),
  z.object({ kind: z.literal('existingItem'), itemId: z.string().min(1) }),
  z.object({ kind: z.literal('newCosmetic'), cosmetic: ShopItemCreateSchema }),
]);
export type TournamentPrizeInput = z.infer<typeof TournamentPrizeSchema>;

// Multiplicateur final d'un pari sur le vainqueur : amicaux 2 (fixe), officiels 2..10.
export const BET_FINAL_MULT_MIN = 2;
export const BET_FINAL_MULT_MAX = 10;
export const CreateTournamentSchema = z
  .object({
    name: z.string().min(2).max(60),
    // Capacité. Élimination/poules : puissance de 2 (8, 16, 32, 64) → bracket plein.
    // Ligue : nombre libre (min 3) — l'admin compose les affiches, le bracket final
    // (puissance de 2) est dérivé au moment de la qualification. En 1v1 = nb de
    // joueurs ; en 2v2 = nombre d'ÉQUIPES (donc 2× joueurs). Poules dès 12.
    capacity: z.number().int().min(3).max(64),
    kind: z.enum(['friendly', 'official']).default('friendly'),
    // Mode : 1v1 classique, ou 2v2 (babyfoot doubles — chaque inscription est une paire).
    mode: z.enum(['1v1', '2v2']).default('1v1'),
    // 2v2 uniquement : coéquipier du créateur (il s'inscrit avec sa paire à la création).
    partnerLogin: LoginSchema.optional(),
    // L'organisateur participe-t-il à son propre tournoi ? Décoché par défaut :
    // créer un tournoi n'oblige pas à y jouer. Si true, il est inscrit à la création
    // (et, en 2v2, doit désigner un coéquipier).
    selfJoin: z.boolean().default(false),
    // Format : élimination directe, phase de poules (puis bracket des qualifiés),
    // ou phase de ligue (affiches composées par l'admin, classement au goal average,
    // puis bascule en élimination directe des premiers au goal average).
    format: z.enum(['elimination', 'pools', 'league']).default('elimination'),
    // Discipline du tournoi (babyfoot | smash).
    game: GameSchema.default('babyfoot'),
    // Officiel : multiplicateur final du pari sur le vainqueur (2..10). Défaut 2.
    betFinalMult: z.number().int().min(BET_FINAL_MULT_MIN).max(BET_FINAL_MULT_MAX).optional(),
    // Officiel : cash-prize (coins) du champion ; paliers dérivés au prorata. 0/absent = aucun.
    cashPrizeBase: z.number().int().min(0).max(1_000_000).optional(),
    // Privé = visible et rejoignable uniquement sur invitation (pas d'inscription libre).
    private: z.boolean().default(false),
    // Image de couverture optionnelle (URL). Vide → visuel par défaut généré côté front.
    // Sécurité : `.url()` accepte des schémas dangereux (javascript:, data:, file:…)
    // qui permettent une injection. On restreint donc explicitement à http(s).
    imageUrl: z
      .string()
      .trim()
      .url()
      .max(500)
      .refine((u) => {
        try {
          const p = new URL(u).protocol;
          return p === 'http:' || p === 'https:';
        } catch {
          return false;
        }
      }, "l'URL doit commencer par http:// ou https://")
      .optional(),
    // Récompense du vainqueur — réservée aux tournois officiels (cf. refine).
    prize: TournamentPrizeSchema.optional().default({ kind: 'none' }),
  })
  // Élimination/poules : capacité = puissance de 2 ≥ 8. La ligue échappe à cette
  // règle (nombre de joueurs libre, min 3 imposé par le champ ci-dessus).
  .refine((d) => d.format === 'league' || (d.capacity >= 8 && (d.capacity & (d.capacity - 1)) === 0), {
    message: 'la capacité doit être une puissance de 2 (8, 16, 32, 64)',
    path: ['capacity'],
  })
  .refine((d) => d.format !== 'pools' || d.capacity >= 12, {
    message: 'les poules nécessitent au moins 12 joueurs',
    path: ['format'],
  })
  .refine((d) => d.prize.kind === 'none' || d.kind === 'official', {
    message: 'une récompense ne peut être attachée qu\'à un tournoi officiel',
    path: ['prize'],
  })
  // 2v2 : un coéquipier est obligatoire UNIQUEMENT si l'organisateur participe
  // (il engage alors sa paire). S'il ne participe pas, aucun coéquipier requis.
  .refine((d) => d.mode !== '2v2' || !d.selfJoin || !!d.partnerLogin, {
    message: 'un tournoi 2v2 nécessite de désigner ton coéquipier',
    path: ['partnerLogin'],
  })
  // 2v2 réservé au babyfoot (seule discipline avec un système d'équipes).
  .refine((d) => d.mode !== '2v2' || d.game === 'babyfoot', {
    message: 'le mode 2v2 est réservé au babyfoot',
    path: ['mode'],
  })
  // Réglages d'économie (multiplicateur, cash-prize) réservés aux officiels.
  .refine((d) => d.betFinalMult === undefined || d.kind === 'official', {
    message: 'le multiplicateur de pari ne se règle que sur un tournoi officiel',
    path: ['betFinalMult'],
  })
  .refine((d) => d.cashPrizeBase === undefined || d.cashPrizeBase === 0 || d.kind === 'official', {
    message: 'le cash-prize est réservé aux tournois officiels',
    path: ['cashPrizeBase'],
  });

export type CreateTournamentInput = z.infer<typeof CreateTournamentSchema>;

export const SetTitleSchema = z.object({
  title: z.string().trim().max(40).nullable(),
});

export type SetTitleInput = z.infer<typeof SetTitleSchema>;

export const DeclareOpsSchema = z.object({
  targetLogin: LoginSchema,
});

export type DeclareOpsInput = z.infer<typeof DeclareOpsSchema>;

// Forme du score d'un match de tournoi (range). La règle PAR DISCIPLINE
// (babyfoot 10-x, échecs 1-0, smash set) est validée côté serveur via
// `validateTournamentScore(tournament.game, …)` — cf. packages/shared/games.ts.
export const TournamentRecordSchema = z.object({
  scoreA: MatchScoreSchema,
  scoreB: MatchScoreSchema,
});

export type TournamentRecordInput = z.infer<typeof TournamentRecordSchema>;

// Forçage admin du résultat d'un match de tournoi : même forme de score que la
// saisie normale (validation par discipline appliquée côté serveur).
export const TournamentForceResultSchema = z.object({
  scoreA: MatchScoreSchema,
  scoreB: MatchScoreSchema,
});

export type TournamentForceResultInput = z.infer<typeof TournamentForceResultSchema>;

// ── Phase de ligue ───────────────────────────────────────────────────────────
// Affiche composée par l'admin : deux participants (logins capitaines en 2v2)
// distincts. `leg` = manche : 0 = aller (défaut), 1 = retour. Le retour n'est
// autorisé que si l'aller entre la même paire existe déjà (cf. backend).
export const LeagueMatchCreateSchema = z
  .object({
    playerALogin: LoginSchema,
    playerBLogin: LoginSchema,
    leg: z.union([z.literal(0), z.literal(1)]).default(0),
  })
  .refine((d) => d.playerALogin !== d.playerBLogin, {
    message: 'un match oppose deux participants différents',
    path: ['playerBLogin'],
  });

export type LeagueMatchCreateInput = z.infer<typeof LeagueMatchCreateSchema>;

// Édition d'un score de match de ligue déjà confirmé (admin/officiant) — correction
// d'erreur de saisie. Le classement se recalcule à l'affichage ; les paris du match
// sont re-réglés si le vainqueur change (cf. backend).
export const TournamentEditScoreSchema = z.object({
  scoreA: z.number().int().min(0).max(999),
  scoreB: z.number().int().min(0).max(999),
});

export type TournamentEditScoreInput = z.infer<typeof TournamentEditScoreSchema>;

// Bascule de la phase de ligue vers l'élimination directe : nombre de qualifiés
// (nombre LIBRE 2..64) → taille du bracket des premiers au goal average. Le bracket
// gère les byes : pas besoin d'une puissance de 2 (un nombre quelconque est admis,
// arrondi à la puissance de 2 supérieure avec byes aux têtes de série).
export const LeagueFinalizeSchema = z.object({
  qualifyCount: z.number().int().min(2).max(64),
});

export type LeagueFinalizeInput = z.infer<typeof LeagueFinalizeSchema>;

// Réglage du nombre d'équipes qualifiées (persisté sur le tournoi), modifiable au
// fil de la phase de ligue. Même borne libre que la bascule finale.
export const LeagueQualifyCountSchema = z.object({
  qualifyCount: z.number().int().min(2).max(64),
});

export type LeagueQualifyCountInput = z.infer<typeof LeagueQualifyCountSchema>;

export const FeatureRequestSchema = z.object({
  text: z.string().min(10, 'description must be at least 10 characters').max(500),
});

export type FeatureRequestInput = z.infer<typeof FeatureRequestSchema>;

export const BugReportSchema = z.object({
  text: z.string().min(10, 'description must be at least 10 characters').max(500),
});

export type BugReportInput = z.infer<typeof BugReportSchema>;

export const SetBugReportStatusSchema = z.object({
  status: z.enum(['open', 'resolved', 'closed']),
});

export type SetBugReportStatusInput = z.infer<typeof SetBugReportStatusSchema>;

// SUPERADMIN only — 'SUPERADMIN' role cannot be granted via API (garde-fou critique).
// MODERATOR est accordable (entre USER et ADMIN, avec permissions fines).
export const SetRoleSchema = z.object({
  role: z.enum(['USER', 'MODERATOR', 'ADMIN']),
});

export type SetRoleInput = z.infer<typeof SetRoleSchema>;

export const SetFeatureRequestStatusSchema = z.object({
  status: z.enum(['pending', 'accepted', 'rejected']),
});

export type SetFeatureRequestStatusInput = z.infer<typeof SetFeatureRequestStatusSchema>;

// ─── Babyfoot 2v2 ─────────────────────────────────────────────────────────────
// Ces schémas sont EXCLUSIFS au Babyfoot (le jeu est implicitement 'babyfoot').
// Les règles de score sont identiques au 1v1 : un camp doit atteindre 10 buts.

const babyfootScoreRefiner = (
  m: { scoreSelf: number; scoreOpponent: number },
  ctx: z.RefinementCtx,
) => {
  if (!(m.scoreSelf === 10 || m.scoreOpponent === 10)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'one side must reach 10 goals' });
  }
  if (m.scoreSelf === 10 && m.scoreOpponent === 10) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'only one side can reach 10 goals' });
  }
};

export const Declare2v2MatchSchema = z
  .object({
    partnerLogin:   LoginSchema, // coéquipier du déclarant (équipe 1)
    opponentLogin:  LoginSchema, // premier joueur de l'équipe adverse
    opponent2Login: LoginSchema, // coéquipier de l'adversaire (équipe 2)
    scoreSelf:      MatchScoreSchema,
    scoreOpponent:  MatchScoreSchema,
  })
  .superRefine((m, ctx) => {
    const logins = [m.partnerLogin, m.opponentLogin, m.opponent2Login];
    if (new Set(logins).size !== logins.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'all four players must be different' });
    }
    babyfootScoreRefiner(m, ctx);
  });

export type Declare2v2MatchInput = z.infer<typeof Declare2v2MatchSchema>;

export const Confirm2v2MatchSchema = z
  .object({
    scoreSelf:     MatchScoreSchema,
    scoreOpponent: MatchScoreSchema,
  })
  .superRefine(babyfootScoreRefiner);

export type Confirm2v2MatchInput = z.infer<typeof Confirm2v2MatchSchema>;

// Défi 2v2 (Babyfoot) : le challenger nomme les 4 joueurs (lui + son coéquipier
// contre 2 adversaires) et programme un créneau. Seuls les 2 adversaires acceptent.
export const CreateChallenge2v2Schema = z
  .object({
    partnerLogin:         LoginSchema, // coéquipier du challenger
    opponentLogin:        LoginSchema, // premier adversaire
    opponentPartnerLogin: LoginSchema, // coéquipier de l'adversaire
    scheduledAt: z
      .string()
      .datetime({ offset: true })
      .refine((s) => new Date(s).getTime() > Date.now() - 60_000, {
        message: 'scheduledAt must be in the future (or within the last minute)',
      }),
  })
  .superRefine((m, ctx) => {
    const logins = [m.partnerLogin, m.opponentLogin, m.opponentPartnerLogin];
    if (new Set(logins).size !== logins.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'all four players must be different' });
    }
  });

export type CreateChallenge2v2Input = z.infer<typeof CreateChallenge2v2Schema>;

// ─── Smash FFA (Free-For-All, 3+ joueurs) ────────────────────────────────────
// EXCLUSIF au Smash. Le déclarant propose le classement final complet (ordre du
// tableau `ranking` : ranking[0] = 1er … dernier élément = dernier). Les positions
// sont DÉRIVÉES de l'ordre côté serveur (position = index + 1) → unicité et
// contiguïté 1..N garanties par construction. Chaque AUTRE participant confirme
// ensuite UNIQUEMENT sa propre position ; une contestation annule tout le FFA.

export const FFA_MIN_PLAYERS = 3;
// Limite d'un lobby Smash Ultimate.
export const FFA_MAX_PLAYERS = 8;

export const DeclareFfaSchema = z
  .object({
    game: z.literal('smash').default('smash'),
    ranking: z.array(LoginSchema).min(FFA_MIN_PLAYERS).max(FFA_MAX_PLAYERS),
  })
  .superRefine((m, ctx) => {
    if (new Set(m.ranking).size !== m.ranking.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tous les participants doivent être différents', path: ['ranking'] });
    }
  });

export type DeclareFfaInput = z.infer<typeof DeclareFfaSchema>;

// Confirmation de SA propre place : on renvoie la position attendue pour détecter
// une dérive (si le classement a changé entre l'affichage et le clic → mismatch).
export const ConfirmFfaPositionSchema = z.object({
  position: z.number().int().min(1).max(FFA_MAX_PLAYERS),
});

export type ConfirmFfaPositionInput = z.infer<typeof ConfirmFfaPositionSchema>;

// Contestation : le joueur indique sa position RÉELLE revendiquée → annule le FFA.
export const ContestFfaSchema = z.object({
  claimedPosition: z.number().int().min(1).max(FFA_MAX_PLAYERS),
  message: z.string().trim().max(500).optional(),
});

export type ContestFfaInput = z.infer<typeof ContestFfaSchema>;

// ─── Fléchettes (301 / 501, 2 à 8 joueurs) ───────────────────────────────────
// EXCLUSIF aux fléchettes. Chaque joueur part de `startScore` (301 ou 501) et
// descend ; le vainqueur atteint 0. Le déclarant saisit, pour chaque joueur, ses
// POINTS RESTANTS à la fin (vainqueur = 0). Le classement est DÉRIVÉ du reste
// (croissant : 0 = 1er). L'Elo est pondéré par les points réalisés (cf.
// calculateDartsElo dans elo.ts) : finir proche du vainqueur → faible perte.
// Comme le FFA, chaque AUTRE participant confirme ENSUITE son propre reste ; une
// contestation annule toute la manche.

export const DARTS_MIN_PLAYERS = 2;
export const DARTS_MAX_PLAYERS = 8;
/** Scores de départ autorisés aux fléchettes. */
export const DartsStartScoreSchema = z.union([z.literal(301), z.literal(501)]);
export type DartsStartScore = z.infer<typeof DartsStartScoreSchema>;

const DartsParticipantSchema = z.object({
  login: LoginSchema,
  // Points RESTANTS à la fin (0 = a fini = vainqueur).
  remaining: z.number().int().min(0).max(501),
});

export const DeclareDartsSchema = z
  .object({
    game: z.literal('flechettes').default('flechettes'),
    startScore: DartsStartScoreSchema,
    participants: z.array(DartsParticipantSchema).min(DARTS_MIN_PLAYERS).max(DARTS_MAX_PLAYERS),
  })
  .superRefine((m, ctx) => {
    const logins = m.participants.map((p) => p.login);
    if (new Set(logins).size !== logins.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tous les participants doivent être différents', path: ['participants'] });
    }
    // Points restants bornés par le score de départ.
    if (m.participants.some((p) => p.remaining > m.startScore)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'le reste ne peut pas dépasser le score de départ', path: ['participants'] });
    }
    // Exactement UN vainqueur (reste 0), les autres strictement positifs.
    const winners = m.participants.filter((p) => p.remaining === 0);
    if (winners.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'un seul joueur doit finir à 0 (le vainqueur)', path: ['participants'] });
    }
  });

export type DeclareDartsInput = z.infer<typeof DeclareDartsSchema>;

// Confirmation de SON propre reste : on renvoie le reste attendu pour détecter
// une dérive (si la saisie a changé entre l'affichage et le clic → mismatch).
export const ConfirmDartsSchema = z.object({
  remaining: z.number().int().min(0).max(501),
});

export type ConfirmDartsInput = z.infer<typeof ConfirmDartsSchema>;

// Contestation : le joueur indique son reste RÉEL revendiqué → annule la manche.
export const ContestDartsSchema = z.object({
  claimedRemaining: z.number().int().min(0).max(501),
  message: z.string().trim().max(500).optional(),
});

export type ContestDartsInput = z.infer<typeof ContestDartsSchema>;

// ─── SF Session (club sessions) ──────────────────────────────────────────────

export const CreateSfSessionSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  durationHours: z.number().positive().max(24).optional(),
  description: z.string().max(300).optional(),
});
export type CreateSfSession = z.infer<typeof CreateSfSessionSchema>;

export const UpdateSfSessionSchema = z.object({
  endTime: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
  description: z.string().max(300).optional(),
});
export type UpdateSfSession = z.infer<typeof UpdateSfSessionSchema>;
