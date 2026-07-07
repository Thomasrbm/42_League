-- Backfill one-time : active TOUS les modes de jeu pour les joueurs DÉJÀ inscrits
-- (colonne users.games). Appliquée une seule fois au déploiement via
-- `prisma migrate deploy` — elle ne touche que les lignes existantes ; les
-- nouveaux inscrits gardent le choix de leurs modes à l'onboarding.
-- L'ELO par discipline reste au défaut (1000) pour les modes nouvellement activés.
UPDATE "users"
SET "games" = ARRAY['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes', 'coding', 'pokemon']::text[];
