-- 6e & 7e disciplines : Coding et Pokémon (classements parallèles, binaires gagné/perdu,
-- mécaniquement calqués sur les échecs). Colonnes de stats par joueur + lien d'invitation
-- optionnel sur les défis (métadonnée coding).
ALTER TABLE "users" ADD COLUMN "elo_coding" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "users" ADD COLUMN "matches_played_coding" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "tournaments_won_coding" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "elo_pokemon" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "users" ADD COLUMN "matches_played_pokemon" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "tournaments_won_pokemon" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "challenges" ADD COLUMN "invite_url" TEXT;
