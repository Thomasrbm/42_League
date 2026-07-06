# Logique métier & concepts — 42 League

Tout ce qui fait « les règles du jeu » : ELO, anti-farming, cycle de vie d'un match, défis,
tournois, ops, rôles, et les schémas de validation partagés. Le code de référence vit dans
`packages/shared/src/` (importé sous `@42-league/shared` par le front **et** le back, en source,
sans build dédié).

---

## 1. Le score d'un match

Le babyfoot se joue en **10 buts**. Particularité : le perdant peut descendre **sous 0** à cause
des *gamelles* (auto-but qui retire un point). D'où :

- `MatchScoreSchema = z.number().int().min(-10).max(10)`.
- Un match valide a **exactement un camp à 10** (refine : `scoreSelf===10 || scoreOpponent===10`,
  et **pas les deux** : `!(scoreSelf===10 && scoreOpponent===10)`). Pas de match nul.
- Le score du perdant va donc de `-10` (10 gamelles) à `9` (10-9 serré).

---

## 2. ELO — `calculateBabyfootElo` (`elo.ts`)

ELO classique **adapté au babyfoot**, avec deux leviers : l'écart de **buts** module le transfert de
base, et l'écart de **rating** ajoute un bonus d'upset asymétrique et non saturant.

> ⚠️ **Refonte (mai 2026).** Le modèle n'est **plus à somme nulle** sur les gros upsets. L'ancienne
> version transférait `P` symétriquement (`+P` / `−P`) ; désormais, quand l'outsider gagne, le perdant
> surcoté encaisse tout le bonus tandis que le gagnant n'en touche qu'une part plafonnée.

### Constantes
- `DEFAULT_ELO = 1000` — note de départ de tout joueur.
- `K = 32` — facteur K de base.
- `UPSET_GAP_COEFF = 0.04` — bonus de points **par point d'écart de rating**, appliqué uniquement
  quand l'outsider l'emporte. Contrairement au facteur de surprise Elo `(1 − E)` qui sature vers
  ~800 pts d'écart, ce terme **ne sature pas** → un rating gonflé fond réellement vers la moyenne.
- `WINNER_BONUS_CAP = 50` — plafond du bonus d'upset encaissé par le **gagnant** (battre un seul boss
  gonflé ne doit pas faire exploser son rating).
- `MAX_DELTA_PER_MATCH = 400` — variation maximale (en magnitude) d'un joueur sur un seul match (garde-fou).

### Signature
```ts
calculateBabyfootElo(ratingA, ratingB, winner: 'A'|'B', scoreA, scoreB): {
  newA, newB, deltaA, deltaB
}
```

### Formule exacte
1. **Probabilité attendue** que le **gagnant** l'emporte :
   `E = 1 / (1 + 10^((ratingPerdant − ratingGagnant) / 400))`
2. **Multiplicateur d'écart de buts** :
   `goalDiff = 10 − scorePerdant` (1 pour un 10-9, jusqu'à 20 pour un 10‑(−10))
   `M = 1 + goalDiff × 0.1` → varie de **1.1** (10-9) à **3.0** (10‑(−10) gamelle totale)
3. **Transfert de base** (façon Elo classique, non arrondi) : `baseP = K × M × (1 − E)`
4. **Bonus d'upset** (proportionnel à l'écart RÉEL, upset uniquement) :
   `gap = max(0, ratingPerdant − ratingGagnant)` ; `gapBonus = gap × UPSET_GAP_COEFF`
5. **Application asymétrique**, bornée par `MAX_DELTA_PER_MATCH` :
   - `gain = round( min( baseP + min(gapBonus, WINNER_BONUS_CAP), 400 ) )` → `deltaGagnant = +gain`
   - `loss = round( min( baseP + gapBonus, 400 ) )` → `deltaPerdant = −loss`

### En clair
- **Résultat attendu** (favori qui gagne, ou ratings égaux) : `gap = 0` → bonus nul → transfert
  **symétrique classique** `±baseP` (identique à l'ancienne formule).
- **Upset** (outsider qui gagne) : le perdant gonflé **fond** (perte jusqu'à −400), le gagnant ne
  grimpe que modérément (bonus plafonné à +50 au-dessus du transfert de base). La somme n'est plus nulle.
- **Bonus de marge** : un 10-0 transfère plus qu'un 10-9 ; une gamelle (10‑(−10)) transfère le plus.

### Exemples (1000 vs 1000, donc `E = 0.5`, `gap = 0` → symétrique)
| Score | `M` | `±round(32·M·0.5)` |
|---|---|---|
| 10-9 | 1.1 | **±18** |
| 10-5 | 1.5 | **±24** |
| 10-0 | 2.0 | **±32** (= K) |
| 10‑(−10) | 3.0 | **±48** |

Gros upset (un joueur à **100** bat un joueur à **2800**, 10-0) : `E≈0`, `M=2.0` → `baseP≈64`,
`gap=2700` → `gapBonus=108`. Gagnant `+round(64+min(108,50))=+114`, perdant `−round(64+108)=−172`
(asymétrique : le rating gonflé fond). Si `gapBonus` dépasse 400, le perdant est plafonné à **−400**.

### Invariants verrouillés par les tests (`elo.test.ts`)
- Sur un résultat attendu / ratings égaux : `deltaA + deltaB === 0` (symétrie préservée).
- Deltas entiers ; bornés à `±400` ; aucun NaN/Infinity même pour des ratings 0–15000.

---

## 2 bis. Grades (paliers de classement — `rank.ts`)

Le grade d'un joueur dérive de son ELO, par **discipline**. Barème croissant (`RANK_TIERS`) :

| Grade | `min` ELO | `floor` (cible de reset) | Couleur |
|---|---|---|---|
| **Étain** | 0 | 900 | `#565b61` |
| **Bronze** | 1000 | 1000 | `#cd7f32` |
| **Argent** | 1100 | 1100 | `#dfe4ea` |
| **Or** | 1200 | 1200 | `#ffc94a` |
| **Diamant** | 1400 | 1400 | `#5fd0e0` |
| **Grand Master** | *positionnel* | 1400 | `#c084fc` |

- `rankTier(elo)` = palier le plus élevé dont `min ≤ elo` (Étain sous 1000).
- **Grand Master** est **hors barème ELO** : grade d'élite **positionnel** attribué au **top N**
  (`GRANDMASTER_TOP_N = 5`) du classement de **chaque discipline**, jamais atteint par l'ELO seul
  (`min = Infinity`). `rankTierForRank(elo, rank)` renvoie Grand Master si `1 ≤ rank ≤ 5`, sinon le
  palier ELO classique. Délibérément exclu de `RANK_TIERS` pour ne pas perturber frise, planchers et
  reset de saison.
- `floor` = plancher du grade, **cible de reset** de fin de saison (`seasonResetElo`, §11) : on repart
  au plancher de son grade courant, et les Étains sont remontés au plancher Bronze.

---

## 3. Anti-farming — `shouldCountForElo` (`anti-farming.ts`)

Empêche deux complices de farmer de l'ELO en jouant 50 fois.

- `ANTI_FARMING_WINDOW_DAYS = 7`
- `MAX_COUNTED_PER_PAIR_PER_WINDOW = 2`

```ts
shouldCountForElo(priors: {playedAt, countedForElo}[], newMatchAt): boolean
```
Compte les matchs **déjà comptés** (`countedForElo===true`) de la paire dans la fenêtre glissante
`[newMatchAt − 7j, newMatchAt[`. Retourne `true` si ce compte est `< 2`.

**Conséquence** : une paire peut faire bouger son ELO **au plus 2 fois par 7 jours glissants**.
Les matchs au-delà sont **enregistrés quand même** (`PlayedMatch.countedForElo = false`, deltas 0)
mais ne changent ni l'ELO ni `matchesPlayed`. La fenêtre étant glissante, le quota se rouvre dès
que le plus ancien match compté sort des 7 jours.

> Bornes (testées dans `anti-farming.test.ts`) : `playedAt >= windowStart` inclusif, `< newMatchAt`
> exclusif ; seuls les matchs `countedForElo===true` consomment le quota.

---

## 4. Cycle de vie d'un match

```
DÉCLARATION                CONFIRMATION (par l'adversaire)
PendingMatch  ──────────►  scores miroir ? ──┬── oui → PlayedMatch (+ ELO si compté)
(POST /matches)            (POST .../confirm) └── non → pending supprimé, 409 (à redéclarer)
       │
       └── REJET (POST .../reject) → RejectedMatch (litige tracé), pending supprimé
```

**Validation bilatérale** : le déclarant envoie `{scoreSelf, scoreOpponent}` de **son** point de vue ;
l'adversaire ressaisit `{scoreSelf, scoreOpponent}` du **sien**. La confirmation ne passe que si les
deux saisies sont le miroir l'une de l'autre — sinon le match est annulé (à redéclarer). C'est la
défense anti-spoofing de score (voir `security-patches.md` Patch 001).

---

## 5. Défis (challenges)

Un défi planifie une rencontre **avant** qu'elle ait lieu. États :
`pending → accepted → recorded` (chemin nominal) ou `declined` / `cancelled`.

- **decline** par le challenger = `cancelled` (aucune pénalité).
- **decline** par l'adversaire d'un défi `pending` = `declined` (aucune pénalité).
- **decline** par l'adversaire d'un défi **`accepted`** = **dodge** : `−10 ELO` + `dodgeCount++`.
- **record** (sur un défi `accepted`) crée un `PendingMatch` → on rejoint la confirmation bilatérale.

Le **dodge** matérialise le coût social de se désister après avoir dit oui.

---

## 6. Tournois

Capacité **puissance de 2 uniquement** (`8`, `16`, `32`, `64` ; refonte juin 2026 — le bracket
d'inscription est ainsi toujours plein, jamais d'exempt). `kind` `friendly` ou `official` (officiel
réservé à `isAdmin`). Un tournoi porte une **discipline** (`game`, voir §12) et n'apparaît que dans
le mode correspondant. Il peut être **privé** (`isPrivate` : visible/rejoignable sur invitation
uniquement), porter une **image de couverture** (`imageUrl`) et, s'il est officiel, une **récompense**
de vainqueur (`prize` : `none` | `coins` | cosmétique existant | cosmétique créé à la volée — cf. §13).
États : `registration → in_progress → finished` (ou suppression directe).

**Deux formats** (`format`) :
- **`elimination`** — bracket à élimination directe. `generateBracket` ordonne les joueurs par
  seeding canonique (1 vs dernier…) et place les **byes** face aux têtes de série (qualifiées d'office
  au tour 2). La capacité étant une puissance de 2, l'inscription ne produit pas de bye ; il n'en
  apparaît qu'au bracket des **qualifiés de poules** (taille non puissance de 2). Le nombre de rounds
  est calculé sur les matchs réels, pas la capacité.
- **`pools`** — phase de **poules de 4** (round-robin, répartition en serpent), réservée aux tournois
  de **≥ 12 joueurs** (donc capacité ≥ 16). Quand toutes les poules sont terminées, les **2 premiers
  de chaque poule** (tri victoires → diff. de buts → buts marqués) sont qualifiés et seedés en croisé
  pour le bracket final (deux qualifiés d'une même poule ne se recroisent pas avant la fin).

- Inscription via `join` ; auto-démarrage quand le tournoi est plein (génère bracket **ou** poules
  selon le format), ou `start` manuel par l'organisateur. Tournoi **privé** → pas d'inscription libre.
- L'**organisateur** (ou un `isAdmin`) peut **inviter** un joueur existant via `add-player` ;
  remplir la dernière place déclenche l'auto-démarrage.
- Chaque `TournamentMatch` se joue en **record → confirm** (confirmé par l'**autre** joueur). La
  propagation post-confirmation est centralisée dans `settleConfirmedTournamentMatch` : règlement des
  **paris** du match (§14), avancement du gagnant (poule → rien jusqu'à la fin des poules, puis
  génération du bracket des qualifiés ; bracket → on avance le vainqueur), et à la **finale**
  clôture (`winnerLogin`, `tournamentsWon++` de la discipline, **récompense** officielle, règlement
  des **paris sur le vainqueur**). Génération/avancement/poules dans `apps/backend/src/tournament.ts`
  (testé, voir [TESTING.md](./TESTING.md)).

### Pile-ou-face (duel de bracket)
Avant un duel de bracket, un **pile-ou-face** (`POST .../matches/:matchId/toss`) tire au sort le
**gagnant du toss** (`tossWinnerLogin`, `tossSide` `heads`/`tails`, tiré côté serveur et figé en base
pour être partagé aux deux écrans). Il **désigne simplement le gagnant du tirage** : il n'y a plus de
choix d'avantage dans l'appli — l'avantage (balle, terrain, stage, couleur…) est réglé **dans la vraie
vie**, puis on passe directement à la saisie du score. Peut être lancé par un **participant** ou par un
**officiant** (cf. ci-dessous).

### Match « en cours » & officiant
- **`activeMatchId`** — l'organisateur (ou un `isAdmin`) désigne le duel à jouer *maintenant*
  (`POST .../matches/:matchId/announce`) ; mémorisé sur le tournoi, il déclenche l'écran VERSUS chez
  tous les spectateurs et marque le match « EN COURS » dans l'arbre. Effacé dès le match confirmé. Sans
  objet aux échecs (matchs joués en parallèle).
- **Officiant** — un `isAdmin` (partout) **ou** le **créateur d'un tournoi amical** peut **officier**
  un match sans y jouer : lancer le pile-ou-face et **saisir le score d'autorité** (validé
  immédiatement, sans confirmation de l'adversaire) via la même route que le forçage admin.

### Force admin (« god »)
- **`force-accept`** (`POST /admin/tournaments/:id/invites/:inviteId/force-accept`) — inscrit d'office
  l'invité ; auto-start si la capacité est atteinte (même chemin que `/accept`).
- **`force-result`** (`POST /admin/tournaments/:id/matches/:matchId/force-result`) — pose
  score + gagnant + `confirmedAt`, ferme les paris du match, puis applique **exactement la même
  propagation** que la confirmation normale (`settleConfirmedTournamentMatch` : poules/bracket/finale/
  récompense/paris). Réservé aux `isAdmin` **ou** au créateur d'un tournoi amical (score d'autorité).
  Toute action force est tracée à l'audit.

---

## 7. Ops (« la chasse »)

Mécanique sociale : un joueur (le **traqueur**) déclare un **ops** sur un autre (« je te tiens »).
Durée **24 h** (`OPS_DURATION_MS`, refonte mai 2026), puis **cooldown 7 jours** avant de pouvoir
redéclarer. Règles à la déclaration (`POST /ops`) : 1 seul ops actif par owner ; pas pendant le
cooldown ; cible non hors-jeu ; la cible ne doit pas déjà être engagée (en tant que cible ou owner).
Les transitions (expiration, fin de cooldown) sont pilotées par des `setTimeout` serveur, ré-armés
au démarrage (`scheduleOpsTimers`).

**Matchs forcés.** Pendant les 24 h, la cible doit affronter le traqueur : ses **3 premiers défis**
face à lui (`forcedUsed < OPS_FORCED_MATCHES = 3`) sont *forcés*. **Refuser** un match forcé coûte
**3× la perte d'ELO** d'une défaite estimée (`OPS_REFUSE_MULTIPLIER × estimatedEloLoss(cible, traqueur)`)
au lieu du dodge standard (−10), et incrémente `forcedUsed`. Jouer un match forcé l'incrémente aussi.
Une fois le quota épuisé, l'OPS n'impose plus rien jusqu'à expiration. Les constantes vivent dans
`@42-league/shared` (`elo.ts`), partagées front/back. Côté front, un **OpsRevealOverlay** met en scène
la révélation cinématique de la cible.

---

## 8. Rôles & permissions

Deux notions d'« admin » **distinctes** (voir [SECURITY.md §8](./SECURITY.md)) :
1. **Rôle DB** `USER`/`ADMIN`/`SUPERADMIN` → accès GOD panel + modération. `SUPERADMIN` hardcodé,
   réimposé à chaque login, jamais attribuable par l'API (`SetRoleSchema` n'accepte que `USER`/`ADMIN`).
   La **gestion des saisons** (créer/clôturer, activer, supprimer) est réservée au **`SUPERADMIN`**
   (`requireSuperAdmin`), de même que la gestion des rôles.
2. **Liste `isAdmin()`** (`admins.ts`) → autorise la création de tournois **officiels** (et leur
   récompense), l'**officiation** / le **forçage** de matchs de tournoi, et la pose de **titres**.

Un `bannedAt` non nul bloque la déclaration de match (`assertNotBanned`).

---

## 9. Schémas Zod partagés (`schemas.ts`)

Source de vérité de la validation, utilisée par le back (rejet 400) et le front (UX).

| Schéma | Forme | Contraintes clés |
|---|---|---|
| `LoginSchema` | string | 1–32 car., `^[a-z0-9_-]+$` (format login intra). |
| `MatchScoreSchema` | int | −10 … 10. |
| `GameSchema` | enum | `babyfoot\|smash\|chess\|streetfighter\|flechettes` (défaut `babyfoot`). |
| `DeclareMatchSchema` | `{ opponentLogin, scoreSelf, scoreOpponent, game, bestOf?, char*? }` | score validé **par discipline** (babyfoot 10-x ; smash/SF set Bo3/Bo5 + persos ; échecs 1-0/0-1/nulle). |
| `ConfirmMatchSchema` | `{ scoreSelf, scoreOpponent, game, … }` | idem (mêmes refines par jeu). |
| `RejectMatchSchema` | `{ contestReason, contestMessage }` | reason ∈ `never_played\|wrong_score` ; message 10–500. |
| `DeclareDartsSchema` | `{ startScore, participants[{login, remaining}] }` | startScore `301\|501` ; 2–8 joueurs distincts ; `0 ≤ reste ≤ startScore` ; **un seul** reste à 0. |
| `ConfirmDartsSchema` / `ContestDartsSchema` | `{ remaining }` / `{ claimedRemaining, message? }` | reste 0–501 ; contestation annule la manche. |
| `CreateChallengeSchema` | `{ opponentLogin, scheduledAt }` | ISO + offset ; futur (tolérance 60 s passé). |
| `RecordResultSchema` | `{ scoreSelf, scoreOpponent }` | un camp = 10, pas les deux. |
| `TournamentPrizeSchema` | union `kind` | `none\|coins(1…1M)\|existingItem\|newCosmetic`. |
| `CreateTournamentSchema` | `{ name, capacity, kind, format, game, private, imageUrl?, prize? }` | name 2–60 ; **capacity puissance de 2, 8–64** ; pools ⇒ capacity ≥ 12 (donc 16) ; imageUrl http(s) ≤500 ; `prize` ≠ none ⇒ tournoi officiel. |
| `TournamentRecordSchema` / `TournamentForceResultSchema` | `{ scoreA, scoreB }` | score validé par discipline (`validateTournamentScore`, un vainqueur). |
| `SetTitleSchema` | `{ title }` | string trim ≤40, nullable. |
| `DeclareOpsSchema` | `{ targetLogin }` | login valide. |
| `FeatureRequestSchema` | `{ text }` | 10–500 car. |
| `SetRoleSchema` | `{ role }` | `USER\|ADMIN` (SUPERADMIN **interdit** par l'API). |
| `SetFeatureRequestStatusSchema` | `{ status }` | `pending\|accepted\|rejected`. |

Le package réexporte tout via `src/index.ts` (`export * from './elo.js' | './anti-farming.js' | './schemas.js'`).
`elo.ts` exporte aussi les constantes OPS (`OPS_DURATION_MS`, `OPS_FORCED_MATCHES`, `OPS_REFUSE_MULTIPLIER`)
et `estimatedEloLoss`. Schémas inline côté backend : `CreateSeasonSchema` (`{ name 2–40 }`),
`FollowPrefsSchema` (`{ notifyTournament?, notifyTop3?, notifyTrophy?, notifyOps? }`),
`PlaceBetSchema` (`{ targetType:'tournament', tournamentId, choiceLogin, stake>0 }`),
`ShopGrantSchema` (`{ login, amount:int }`).

---

## 10. Badges & suivi (followers)

**Badges** (catalogue front `apps/web/src/lib/badges.ts`). Le backend renvoie une liste de **codes**
(`badgesFor`) ; le front résout libellé/couleur/icône. Deux origines :
- **Dérivés du runtime** (non stockés) : `founder` (login `throbert`), `superadmin`, `admin` (selon le rôle).
- **Gagnés** (table `UserBadge`) : `beta_tester` (inscrits de la saison bêta), `season_champion`
  (vainqueur d'une saison), etc. Un badge inconnu retombe sur un rendu générique.

**Suivi (followers/following).** Un joueur peut en suivre d'autres (`Follow`) et régler, **par
personne suivie**, quatre préférences de notification : `notifyTournament`, `notifyTop3`,
`notifyTrophy`, `notifyOps`. Les helpers `notifyFollowers` n'alertent que les abonnés ayant la
préférence active. L'entrée top 3 ne notifie qu'à la **transition** (un joueur qui *entre* dans le top 3).

## 11. Saisons, reset ELO & palmarès

Le classement est découpé en **saisons** (`Season` ; une seule active). Tout `PlayedMatch` /
`PlayedFfa` est taggé de sa `seasonId`. Le cycle est réservé au **`SUPERADMIN`** (`requireSuperAdmin`) :
- **Démarrer** une nouvelle saison (`POST /seasons`). S'il y en a déjà une active, elle est **clôturée
  dans la même transaction** (passage instantané à la suivante) :
  - **Snapshot par discipline** : pour chaque jeu (§13), on fige un `SeasonStanding` par joueur inscrit
    au mode (rang, ELO du jeu, W/L de la saison) classé par ELO décroissant.
  - **Badge champion par discipline** : le n°1 de **chaque jeu** reçoit `season_champion`, **cloisonné
    par jeu** (clé `userLogin + code + game`, `seasonId` = saison gagnée).
  - **Reset au plancher de grade** (`seasonResetElo`, voir §2 bis) — on ne repart **pas** d'un plat
    1000 : chaque ELO est ramené au **plancher de son grade courant** (on récompense la progression),
    les Étains (< 1000) étant remontés au plancher **Bronze**. Tous les compteurs de matchs → 0.
    L'historique des matchs est **conservé** (taggé par saison) — seules les notes repartent au plancher.
- **Activer / basculer** (`POST /seasons/:id/activate`) — simple changement de *vue* (cette saison
  devient la courante, les autres `isActive=false`), **sans** reset ni snapshot.
- **Supprimer** (`DELETE /seasons/:id`) — **interdit sur la saison active** (`409` : il faut d'abord
  activer une autre saison). À la suppression d'une saison passée, chaque badge `season_champion`
  pointant cette saison est **re-pointé** vers la plus récente AUTRE saison où le joueur reste rang 1
  de ce jeu (via ses `SeasonStanding`), ou **retiré** s'il n'en gagne plus aucune. Les standings sont
  supprimés et les `PlayedMatch` de la saison voient leur `seasonId` remis à `null`.

Le **palmarès** d'un joueur (`palmaresFor`, exposé sur `/me` et `/users/:login`) agrège ses
`SeasonStanding` (classements finaux par saison, récents d'abord). La première saison est la
« Saison Bêta », créée par migration et rattachée à tout l'historique pré-existant.

---

## 12. Disciplines (game registry — `games.ts`)

Source de vérité **unique et partagée** (front + back) décrivant chaque discipline (`GAMES`, indexé
par `GameId`). Ajouter un jeu = ajouter une entrée (+ sa fonction d'Elo). `GAME_IDS` donne l'ordre
d'affichage, `DEFAULT_GAME = 'babyfoot'` (et valeur des données antérieures au multi-jeu).

| `id` | Libellé | `scoring` | Nulle | Elo |
|---|---|---|---|---|
| `babyfoot` | Babyfoot | `goals` (un camp atteint 10) | non | `calculateBabyfootElo` |
| `smash` | Smash | `sets` (set Bo3/Bo5) | non | `calculateSmashElo` |
| `chess` | Échecs | `binary` (1-0 / 0-1 / nulle) | **oui** | `calculateChessElo` |
| `streetfighter` | Street Fighter | `sets` (set Bo3/Bo5) | non | `calculateSmashElo` |
| `flechettes` | Fléchettes | `darts` (301/501, 2–8 joueurs) | non | `calculateDartsElo` |

Chaque joueur a un ELO et des compteurs **par discipline** (`elo`, `eloSmash`, `eloChess`, `eloSf`,
`eloFlechettes` + `matchesPlayed*`, `tournamentsWon*`). Validation du score de tournoi par
`validateTournamentScore` (un vainqueur obligatoire, pas de nul).

- **Street Fighter** — mécaniquement **identique au Smash** (set Bo3/Bo5, persos, même `calculateSmashElo`),
  mais discipline **distincte** (rating + roster + branding propres).
- **FFA Smash vs Fléchettes** — les deux sont multijoueurs et réutilisent les tables FFA
  (`PendingFfa`/`PlayedFfa`), mais sont **séparés par le filtre `game`** : `/matches/ffa*` ne voit que
  `game='smash'`, `/matches/darts*` que `game='flechettes'`. Front et tournois sont filtrés de même par
  la discipline du mode courant.
- **Règles fléchettes** (`301`/`501`, `DARTS_MIN_PLAYERS=2` … `DARTS_MAX_PLAYERS=8`) — chaque joueur
  part de `startScore` (301 ou 501) et descend ; le déclarant saisit le **reste** de chaque joueur en
  fin de manche. Contraintes (`DeclareDartsSchema`) : `0 ≤ reste ≤ startScore`, **exactement un**
  vainqueur (reste `0`), participants distincts. Le **classement est dérivé** du reste (croissant : 0 =
  1er). L'ELO est pondéré par les **points réalisés** (`scored = startScore − reste`) via
  `calculateDartsElo` (finir juste derrière le 1er → faible perte). Comme le FFA, chaque autre joueur
  **confirme son propre reste** ; toute **contestation annule la manche**.

---

## 13. Économie de League Coin (`leagueCoins`)

Monnaie virtuelle : un **porte-monnaie unique** par joueur (`User.leagueCoins`), alimenté par trois
sources, toujours créditées/débitées via `grantCoinsTx` **dans une transaction** (jamais de solde
négatif : `grantCoinsTx` borne à `0`, et les débits vérifient le solde en amont). Dépensée à la
**Boutique** (`/shop`, `/shop/:id/buy`) pour des cosmétiques (au plus un équipé par catégorie). Glyphe
**∞** (lemniscate animée) à la place du solde pour les comptes à **solde illimité** (front
`INFINITE_COIN_LOGINS = {abidaux, throbert}` — accès fondateur/admin).

**Volet A — gain par match** (`awardMatchEconomyTx`, sur un match **classé** uniquement, jamais sur
dodge / match forcé / non-classé) :
- `COINS_PER_MATCH_PLAYED = 20` (participation) ; `COINS_PER_MATCH_WON = 50` (vainqueur, **remplace** la
  participation).
- Les gains sont **dégressés** par le même facteur anti-farming que l'ELO (`coinFactor`) ; un rematch
  dégressé ne fait **pas** avancer les quêtes (`countForQuests=false`).

**Volet B — quêtes hebdomadaires** (`WEEKLY_QUESTS`, partition par **clé de semaine ISO**
`isoWeekKey`, ex. `2026-W23` — changer de semaine remet compteurs ET réclamations à zéro). Progression
serveur (`WeeklyQuestProgress` : matchs joués, victoires, disciplines distinctes) :

| `id` | Objectif | Récompense |
|---|---|---|
| `two_modes` | jouer **2** disciplines distinctes | 200 |
| `all_modes` | jouer **toutes** les disciplines (`GAME_IDS.length`) | 300 |
| `play_5` | jouer **5** matchs | 150 |
| `win_3` | gagner **3** matchs | 200 |

Réclamation (`POST /quests/:id/claim`) : verrou de ligne `FOR UPDATE` (anti double-claim), exige
l'objectif atteint et non déjà réclamé, crédite la récompense.

**Volet C — paris** : voir §14. **Récompense de tournoi officiel** : `prize.kind='coins'` crédite
`prizeCoins` au vainqueur à la finale (§6).

**Attribution admin** (`POST /admin/shop/grant`, `requireAdmin`) — crédite (ou débite, `amount` négatif,
solde borné à ≥ 0) des coins à un joueur. C'est aujourd'hui la **seule** voie en dehors des trois volets.

---

## 14. Paris (betting — `Bet`)

Un parieur mise des League Coins sur le **vainqueur d'un tournoi** (les paris match par match ont été
retirés ; `targetType` reste le littéral `'tournament'` pour la compat de payload).

- **Marché ouvert** uniquement au **tout début** d'un tournoi **EN COURS** : `status = in_progress`,
  vainqueur inconnu, et **avant le premier résultat** — dès qu'un `TournamentMatch` est confirmé, le
  marché **se ferme**. Pas de paris pendant l'inscription (bracket pas figé) ni après.
- **Pose** (`POST /bets`, `PlaceBetSchema`) : `stake` entier positif débité immédiatement (solde
  vérifié avant) ; le pronostic doit être un **participant** ; un parieur **ne peut pas** parier sur un
  tournoi auquel il joue. **Un seul pari ouvert par tournoi** (anti-doublon) — le pari est **verrouillé
  à la pose**, aucune modification possible.
- **Cote fixe ×2** (`BET_PAYOUT_MULTIPLIER = 2`) : un pari gagnant rapporte **2× la mise** (gain net =
  la mise) ; perdant → 0.
- **Résolution** (`settleBetsTx`/`settleTournamentBetsTx`) : à la **finale**, les paris `open` du
  tournoi passent `won`/`lost` et le payout est crédité — propagation **partagée** avec `force-result`
  (§6).
- **Remboursement** (`refundBetsTx`) : avant toute **suppression** d'un tournoi (annulation unitaire,
  purge/anonymisation de compte), les paris encore `open` sont **remboursés** (statut `refunded`, mise
  rendue) — sinon le cascade effacerait les paris et la mise serait perdue.

Onglet **« Parier »** côté front (profil) pour poser/suivre ses paris.

---

## 15. G.O.A.T (`goat.ts`)

Classement « Greatest Of All Time » : agrège les stats positives d'un joueur en un **score unique
0–100**, calculé **côté front** (`computeGoat`) depuis le leaderboard, l'historique des matchs et les
tournois. Idée : le meilleur de tous les temps n'est pas forcément le n°1 à l'ELO.

**Pondération** (`GOAT_WEIGHTS`, total 100 %) : ELO **40 %**, tournois officiels **16 %**, goal average
**14 %**, écart en victoire **10 %**, série de victoires **10 %**, win rate **6 %**, tournois amicaux
**4 %**. Chaque métrique est **normalisée 0–1** sur la population, pondérée, puis amortie par un
**facteur de fiabilité** (`confidence = min(1, games/10)` — un 10-0 unique ne fait pas un GOAT).

- **ELO all-time persistant** : l'ELO du leaderboard est ramené au plancher de grade à chaque clôture
  de saison ; le GOAT reconstruit donc un ELO **continu** en repartant de 1000 et en ré-appliquant les
  `deltaA`/`deltaB` de **chaque match compté** (l'historique n'est jamais purgé).
- **Scope par saison** : la vue accepte un `leaderboard` + `matches` **scopés** (snapshot d'une saison
  passée filtré par `seasonId`) ; par défaut, données *live*. Sur une **saison passée**, le GOAT est
  recalculé sur ce périmètre figé. Les nulles (échecs) sont exclues du palmarès.
- **Vue « nuage »** : le classement se visualise aussi en **nuage de points 2D** (`LeaderboardScatter`,
  bascule Liste / Nuage), distinct du podium.

---

## 16. Glossaire métier

- **ELO** — note de classement. Départ 1000. Évolue selon le résultat et la marge ; symétrique sur un
  résultat attendu, **asymétrique sur un upset** (le rating surcoté fond, bonus plafonné pour le gagnant).
- **Upset bonus** — bonus proportionnel et non saturant à l'écart de rating quand l'outsider gagne
  (`UPSET_GAP_COEFF`) ; plafonné à +50 côté gagnant, jusqu'à −400 côté perdant gonflé.
- **Gamelle** — auto-but ; fait descendre le score du fautif (jusqu'à −10), d'où le bonus de marge max.
- **Match pending** — déclaré, en attente de confirmation de l'adversaire.
- **Validation bilatérale** — l'adversaire ressaisit le score ; il doit être le miroir, sinon annulation.
- **Anti-farming** — plafond de 2 matchs comptés par paire et par 7 jours.
- **Défi (challenge)** — rencontre planifiée ; peut mener à un match.
- **Dodge** — se désister d'un défi déjà accepté ; pénalité −10 ELO + `dodgeCount++`.
- **Ops (la chasse)** — droit de traque temporaire (**24 h**) d'un joueur sur un autre, avec cooldown 7 j ;
  impose **3 matchs forcés** (refus = 3× la perte d'ELO estimée).
- **Grade** — palier de classement par ELO et par discipline (Étain → Bronze → Argent → Or → Diamant).
- **Grand Master** — grade d'élite **positionnel** (top 5 de chaque discipline), hors barème ELO.
- **Discipline (game)** — mode de jeu (babyfoot, smash, échecs, street fighter, fléchettes) ; ELO,
  compteurs, tournois et classements sont cloisonnés par discipline.
- **Tournoi officiel** — créable seulement par un membre de la liste `isAdmin` ; peut porter une récompense.
- **Tournoi privé** — visible et rejoignable uniquement sur invitation.
- **Format poules** — phase de poules de 4 (≥12 joueurs, capacité ≥16) → bracket des top 2 de chaque poule.
- **Bye** — place vide d'un bracket non-puissance-de-2 : la tête de série passe le 1er tour d'office
  (capacité = puissance de 2, donc bye uniquement au bracket des qualifiés de poules).
- **Pile-ou-face (toss)** — tirage d'avant-duel de bracket ; désigne juste le gagnant (avantage réglé IRL).
- **Officiant** — admin (partout) ou créateur d'un tournoi amical ; lance le toss et saisit le score
  d'autorité sans jouer le match.
- **`activeMatchId`** — match « EN COURS » désigné par l'organisateur ; déclenche l'écran VERSUS.
- **Force admin (god)** — `force-accept` (inscription d'office) / `force-result` (résolution forcée),
  même propagation que la confirmation normale (poules/bracket/finale/récompense/paris).
- **League Coin** — monnaie virtuelle (`leagueCoins`) ; gain par match (20/50), quêtes hebdo, paris ;
  ∞ pour les comptes à solde illimité.
- **Quête hebdo** — objectif par semaine ISO (`two_modes`/`all_modes`/`play_5`/`win_3`) → récompense en coins.
- **Pari (bet)** — mise sur le **vainqueur d'un tournoi** EN COURS, verrouillée à la pose, cote fixe ×2 ;
  un seul pari par tournoi, fermé au 1er résultat ; remboursé si le tournoi est supprimé.
- **Saison** — ère de classement ; sa clôture fige le palmarès, attribue le badge champion **par
  discipline**, et **reset chaque ELO au plancher de son grade** (Étains remontés au plancher Bronze).
- **Palmarès** — classements finaux d'un joueur, saison par saison (`SeasonStanding`).
- **G.O.A.T** — score de carrière 0–100 (ELO 40 %, titres, goal average, séries, win rate) ; ELO
  all-time persistant ; scopable par saison ; vue podium ou « nuage ».
- **Badge** — distinction affichée sur le profil (rôle, fondateur, beta-tester, champion de saison…).
- **Suivi (follow)** — abonnement à un joueur, avec préférences de notification par personne suivie.
- **SUPERADMIN** — rôle hardcodé immuable, non attribuable par l'API ; seul habilité à gérer les saisons.
- **Titre** — libellé cosmétique posé par un admin (≤40 car.).
