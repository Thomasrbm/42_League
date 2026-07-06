-- Prime « gambler » : 150 League Coins offerts une seule fois par tournoi en cours.
-- PK composite (user_login, tournament_id) → idempotence du claim.
CREATE TABLE "tournament_gambler_claim" (
    "user_login" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_gambler_claim_pkey" PRIMARY KEY ("user_login","tournament_id")
);

ALTER TABLE "tournament_gambler_claim"
    ADD CONSTRAINT "tournament_gambler_claim_user_login_fkey"
    FOREIGN KEY ("user_login") REFERENCES "users"("login") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_gambler_claim"
    ADD CONSTRAINT "tournament_gambler_claim_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
