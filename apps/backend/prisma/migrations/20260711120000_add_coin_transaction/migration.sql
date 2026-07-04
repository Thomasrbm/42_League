-- Journal des mouvements de coins (suivi GOD) : une ligne par crédit/débit d'un
-- joueur. Historique pur — jamais lu pour recalculer un solde (User.league_coins
-- reste la source de vérité). `amount` = delta réel signé, `balance_after` = solde
-- après le mouvement, `type` = source, `ref_id`/`meta` = contexte d'affichage.
CREATE TABLE "coin_transaction" (
    "id" TEXT NOT NULL,
    "user_login" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "ref_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coin_transaction_user_login_created_at_idx" ON "coin_transaction"("user_login", "created_at");
CREATE INDEX "coin_transaction_type_idx" ON "coin_transaction"("type");

ALTER TABLE "coin_transaction" ADD CONSTRAINT "coin_transaction_user_login_fkey" FOREIGN KEY ("user_login") REFERENCES "users"("login") ON DELETE CASCADE ON UPDATE CASCADE;
