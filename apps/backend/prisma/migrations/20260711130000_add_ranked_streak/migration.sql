-- Série d'assiduité ranked : jours (UTC) consécutifs avec ≥1 match classé.
-- `ranked_streak_day` = dernier jour joué ("YYYY-MM-DD"). Tolérance 1 jour de grâce
-- (reset après 2 jours sans jouer). ≥3 jours → +10% sur les gains d'ELO ; paliers
-- de coins à J3/J7/J14/J30. `ranked_streak_best` = record perso.
ALTER TABLE "users" ADD COLUMN "ranked_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "ranked_streak_best" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "ranked_streak_day" TEXT;
