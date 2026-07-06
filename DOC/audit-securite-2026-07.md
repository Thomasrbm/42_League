# Audit sécurité — 42 League (juillet 2026)

Audit complet du backend (`apps/backend`, ~14 k lignes), du front (`apps/web`, 314 fichiers),
de l'extension navigateur et de l'infra (Docker / Caddy). Réalisé en lecture seule sur
`develop` ; correctifs préparés dans la branche isolée `audit/security-hardening`.

## Verdict global

Posture **nettement au-dessus de la moyenne** : tokens HMAC-SHA256 à comparaison constante et
scopes cloisonnés, cookies signés `httpOnly`/`SameSite`/`Secure`, validation Zod systématique,
aucune injection SQL (Prisma paramétré partout), aucun secret commité, headers Caddy complets,
DB jamais exposée à Internet. La suspicion initiale — « le claim de la passe de combat est validé
côté client » — est **infirmée** : tous les crédits (paliers, quêtes, coins, XP, ELO, cash-prize)
sont calculés serveur à partir de constantes serveur + état DB.

**Une seule faille réellement exploitable** (ÉLEVÉE) : course sur le solde de coins. Le reste est
du durcissement défense-en-profondeur.

## Tableau de bord

| # | Sévérité | Titre | Fichier |
|---|----------|-------|---------|
| ECO-1 | 🔴 Élevée | Course sur le solde de coins (TOCTOU / lost-update) | `index.ts:9681,11659,12997` |
| INJ-1 | 🟠 Moyenne | `X-Forwarded-For` parsé à gauche → bypass rate-limit / spoof IP d'audit | `rate-limit.ts:47`, `audit.ts:42` |
| AUTH-1 | 🟠 Moyenne | Aucune révocation : logout n'invalide pas le Bearer 30 j | `tokens.ts:3`, `auth.ts:282` |
| SEC/INJ-2 | 🟠 Moyenne* | `data:image/svg+xml` accepté sur upload cosmétique (stored-XSS si rendu inline) | `schemas.ts:159` |
| AUTH-2 | 🟡 Basse | `x-dev-login` : usurpation possible en **staging** si env mal réglé | `index.ts:152` |
| SEC-1 | 🟡 Basse | Bearer 30 j en `localStorage` + `img-src https:` → exfil beacon sur XSS | `storage.ts:1`, `Caddyfile:26` |
| AUTHZ-1 | 🟡 Basse | Un MODERATOR peut bannir / éditer un ADMIN (seuls les SUPERADMIN protégés) | `index.ts:8179,8102` |
| INJ-3 | 🟡 Basse | PII : `/sf-session/current` expose nom/prénom réel de l'orga sans auth | `index.ts:13650` |
| ECO-2 | 🟡 Basse | Double pari ouvert sur le même match (garde non atomique) | `index.ts:12992` |
| AUTH-3 | 🔵 Info | Nonce OAuth `state` comparé non à temps constant | `auth.ts:198` |
| AUTH-4 | 🔵 Info | Bearer 30 j transmis dans le fragment d'URL (historique navigateur) | `auth.ts:251` |
| ECO-3 | 🔵 Info | `Math.random()` pour la Boîte Mystère (aléa non crypto) | `index.ts:9804` |
| SEC-2 | 🔵 Info | Mot de passe Postgres par défaut `league` (DB non exposée → atténué) | `docker-compose.prod.yml` |
| SEC-3 | 🔵 Info | `innerHTML` avec `declarerLogin` dans le content script extension | `extension/src/content/intra.ts:428` |

\* Moyenne **si** confirmé côté front que les SVG sont rendus inline (`dangerouslySetInnerHTML`/`<object>`).
Le front actuel n'a aucun `dangerouslySetInnerHTML` (grep = 0) → surface faible aujourd'hui, mais à durcir côté backend par principe.

---

## ECO-1 — Course sur le solde de coins 🔴

**Cause.** Les chemins de dépense boutique (`POST /shop/:id/buy`, `index.ts:9681`) et paris
(`POST /bets`, `/bets/match`, `index.ts:12807/12997`) font un check de solde *puis* un débit,
**sans `SELECT … FOR UPDATE`**, alors que les quêtes (`12611`), le FFA (`3826`) et les fléchettes
(`4153`) verrouillent explicitement la ligne user « pour sérialiser les réclamations concurrentes ».
Le garde-fou a été appliqué de façon **incohérente** — c'est une régression, pas un choix.

De plus `grantCoinsTx` (`index.ts:11659`) lit `leagueCoins` puis réécrit une **valeur absolue**
(`data: { leagueCoins: next }`) → *lost update* classique.

**Exploit A — achat à découvert.** Solde 100, deux cosmétiques à 80. Deux `POST /shop/{A}/buy` et
`/shop/{B}/buy` en parallèle : les deux lisent 100, passent `100 < 80 == false`, exécutent chacun
`{ decrement: 80 }` → solde **−60**, possession des deux items. Le plancher `Math.max(0, …)` de
`grantCoinsTx` n'est pas appliqué sur le chemin `decrement` brut.

**Exploit B — création de coins (paris).** Solde 100, deux matches ouverts (le garde `dup` est
par `matchId`). Deux `POST /bets/match {stake:80}` en parallèle : `grantCoinsTx` lit 100 dans les
deux, écrit `20` dans les deux → **80 coins conjurés**, exposition 160 pour un seul débit.

**Correctif recommandé.** Verrouiller la ligne user en début de transaction de dépense
(`SELECT 1 FROM users WHERE login = … FOR UPDATE`, comme les quêtes) **ou** remplacer les écritures
absolues par un update conditionnel atomique `WHERE league_coins >= :amount` (rejet si 0 ligne
affectée) + contrainte `CHECK (league_coins >= 0)`. Idéalement `isolationLevel: 'Serializable'`
avec retry. À compléter par ECO-2 (index unique partiel `(bettorLogin, matchId) WHERE status='open'`).

---

## Détails par axe

### Auth / sessions / tokens
Cœur crypto solide (HMAC-SHA256, `timingSafeEqual`, pas de confusion `alg:none`, scopes auth/sse
cloisonnés, pas d'open redirect, CSRF OAuth couvert par nonce signé). Manque structurel : **pas de
révocation** (AUTH-1) — un Bearer 30 j volé reste valide un mois, logout ne coupe rien côté serveur,
le retrait de droits admin non plus. Correctif : `tokenVersion` en base inclus dans le payload signé,
incrémenté au logout global / changement de rôle / ban.

### Autorisation / IDOR
231 routes cartographiées : **100 % des mutations authentifiées**, **73 routes `/admin/*` toutes
gardées**, IDOR systématiquement bloqués (inventaire scopé par clé composite, tournoi par
`isTournamentManager`, équipe/résultats par appartenance, self-confirm interdit). `SUPERADMIN`
hardcodé, non octroyable par API. Seul défaut : hiérarchie MODERATOR vs ADMIN (AUTHZ-1) — protéger
la cible dont le rôle est ≥ celui de l'acteur, pas seulement les SUPERADMIN.

### Injection / entrée / exposition
Aucun `queryRaw`/`Unsafe`, pas de SSRF (aucun `fetch` dans index.ts hors URLs 42 figées), pas de
path traversal (pas d'upload disque), pas de ReDoS. Pagination bornée partout, body ≤ 1 Mo, SSE
authentifié et ciblé par login (payloads vides = simple signal de refetch, pas de fuite). Deux
points : INJ-1 (spoof XFF → prendre le **dernier** hop derrière Caddy) et INJ-2 (mime SVG).

### Secrets / infra / client
Zéro secret commité, secrets 100 % serveur (VAPID : seule la clé publique côté client), extension
aux permissions serrées (`host_permissions` limité à `intra.42.fr`/`oneleague.fr`, pas de
`<all_urls>`, pont d'auth via `chrome.runtime` et token en fragment `chrome.storage.local` — pas de
`postMessage` vers page). Headers Caddy complets (HSTS preload, CSP, nosniff, COOP, anti-spoof XFF),
pas de sourcemaps web en prod, DB sans port exposé. Résiduels : SEC-1/2/3 (durcissement).

---

## Correctifs déjà appliqués dans `audit/security-hardening`
- **✅ ECO-1 + ECO-2 corrigés** — verrou de ligne `lockUserRowTx` (`SELECT … FOR UPDATE`) au début
  de chaque transaction de dépense (boutique + 3 routes de paris), même idiome que les quêtes/FFA/
  fléchettes. Sérialise les dépenses concurrentes du même joueur → plus d'achat à découvert, de
  création de coins ni de double-pari. Prouvé par `test/shop-race.itest.ts` (achats concurrents :
  invariant solde ≥ 0, jamais plus d'objets que le solde ne permet).
- **✅ INJ-1 corrigé** — `clientIp` (rate-limit) et `extractIp` (audit) prennent désormais le
  DERNIER maillon de `X-Forwarded-For` (celui ajouté par Caddy) au lieu du premier (forgeable).
  *Nuance* : Caddy réécrit déjà `XFF = {remote_host}` (`Caddyfile:40/80`), donc en prod c'était de
  la défense-en-profondeur, pas un exploit vif — mais le fix protège si l'app est un jour exposée
  sans proxy. Tests unitaires mis à jour (anti-spoof).
- **✅ Test d'intégration réparé** : `matches.itest.ts` « 3e match compte pour l'ELO ». Le test partait
  à ELO 1000 et percutait le plancher dur (975) dès le 2e KO 10-3 → `deltaB` écrêté à 0 **par
  conception** (anti-farming de plancher, `elo.ts:22-31`). Corrigé côté test (départ ELO 1300), pas
  côté ELO : modifier le calcul aurait **supprimé** une protection anti-farming réelle.
- **✅ `contributor-stats.json` régénéré** depuis le vrai historique git (repli prod).

Suites après correctifs : **181 tests unitaires + 91 tests d'intégration au vert.**

## Priorisation des correctifs restants
1. **AUTH-1** — `tokenVersion` pour la révocation. *Nécessite une migration de schéma + régénération
   du client Prisma partagé (à coordonner avec l'agent concurrent qui push en prod) et rend la
   vérification de token stateful — à traiter en changement dédié.*
2. **INJ-2** — restreindre le mime des data-URL cosmétiques (après confirmation du rendu SVG front).
3. AUTHZ-1, INJ-3, SEC-1/2/3, AUTH-3/4/5, ECO-3 — durcissements de moindre criticité.
