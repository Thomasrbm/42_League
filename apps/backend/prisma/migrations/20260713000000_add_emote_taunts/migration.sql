-- Émote de victoire du joueur (narguage) — null = émote par défaut côté front.
ALTER TABLE "users" ADD COLUMN "taunt_emote" TEXT;

-- Narguage post-match : le perdant d'un 1v1 voit à sa prochaine connexion
-- l'écran versus puis l'émote du vainqueur (figée au moment du match).
CREATE TABLE "emote_taunt" (
    "id" TEXT NOT NULL,
    "loser_login" TEXT NOT NULL,
    "winner_login" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "emote" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_at" TIMESTAMP(3),

    CONSTRAINT "emote_taunt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "emote_taunt_loser_login_seen_at_idx" ON "emote_taunt"("loser_login", "seen_at");

ALTER TABLE "emote_taunt" ADD CONSTRAINT "emote_taunt_loser_login_fkey" FOREIGN KEY ("loser_login") REFERENCES "users"("login") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emote_taunt" ADD CONSTRAINT "emote_taunt_winner_login_fkey" FOREIGN KEY ("winner_login") REFERENCES "users"("login") ON DELETE CASCADE ON UPDATE CASCADE;
