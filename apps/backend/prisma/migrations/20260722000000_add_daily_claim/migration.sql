-- Récolte quotidienne (présence sur le site), indépendante de l'assiduité ranked :
-- jours (UTC) consécutifs où le joueur a réclamé sa récompense (XP + coins).
-- `daily_claim_day` = dernier jour réclamé ("YYYY-MM-DD"), sert d'anti-double-claim.
-- Même tolérance d'1 jour de grâce que l'assiduité. `daily_claim_best` = record.
ALTER TABLE "users" ADD COLUMN "daily_claim_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "daily_claim_best" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "daily_claim_day" TEXT;
