-- Migration : « matchs à enjeu » (matchs à parier).
-- Un duel programmé où les deux participants misent une grosse somme ; une fois
-- annoncé, les autres joueurs parient sur l'issue (Bet.target_type='stake').
-- Run with: cd apps/backend && npx prisma migrate deploy
-- Or (dev):  cd apps/backend && npx prisma migrate dev --name add_stake_matches

-- CreateTable
CREATE TABLE "stake_matches" (
    "id"              TEXT             NOT NULL,
    "game"            TEXT             NOT NULL,
    "player_a_login"  TEXT             NOT NULL,
    "player_b_login"  TEXT             NOT NULL,
    "stake_a"         INTEGER          NOT NULL,
    "stake_b"         INTEGER          NOT NULL DEFAULT 0,
    "mult_a"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mult_b"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status"          TEXT             NOT NULL DEFAULT 'pending',
    "scheduled_at"    TIMESTAMP(3)     NOT NULL,
    "announced_at"    TIMESTAMP(3),
    "report_a_winner" TEXT,
    "report_b_winner" TEXT,
    "score_a"         INTEGER,
    "score_b"         INTEGER,
    "winner_login"    TEXT,
    "settled_at"      TIMESTAMP(3),
    "created_at"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stake_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stake_matches_status_scheduled_at_idx" ON "stake_matches"("status", "scheduled_at");
CREATE INDEX "stake_matches_player_a_login_idx" ON "stake_matches"("player_a_login");
CREATE INDEX "stake_matches_player_b_login_idx" ON "stake_matches"("player_b_login");

-- AddForeignKey (nettoie les matchs à enjeu si un participant est supprimé)
ALTER TABLE "stake_matches"
    ADD CONSTRAINT "stake_matches_player_a_login_fkey"
    FOREIGN KEY ("player_a_login") REFERENCES "users"("login")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stake_matches"
    ADD CONSTRAINT "stake_matches_player_b_login_fkey"
    FOREIGN KEY ("player_b_login") REFERENCES "users"("login")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Bet : lien vers le match à enjeu parié (target_type='stake').
ALTER TABLE "bets" ADD COLUMN "stake_match_id" TEXT;

-- CreateIndex
CREATE INDEX "bets_stake_match_id_status_idx" ON "bets"("stake_match_id", "status");

-- AddForeignKey
ALTER TABLE "bets"
    ADD CONSTRAINT "bets_stake_match_id_fkey"
    FOREIGN KEY ("stake_match_id") REFERENCES "stake_matches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
