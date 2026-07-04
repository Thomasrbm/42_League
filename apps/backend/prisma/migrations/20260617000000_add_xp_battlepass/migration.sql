-- XP cumulée à vie sur l'utilisateur (pilote le niveau & le passe de combat).
ALTER TABLE "users" ADD COLUMN "xp" INTEGER NOT NULL DEFAULT 0;

-- Journal des mouvements d'XP (historique pur, jamais relu pour un total).
CREATE TABLE "xp_transaction" (
    "id" TEXT NOT NULL,
    "user_login" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "ref_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "xp_transaction_user_login_created_at_idx" ON "xp_transaction"("user_login", "created_at");
CREATE INDEX "xp_transaction_type_idx" ON "xp_transaction"("type");

ALTER TABLE "xp_transaction" ADD CONSTRAINT "xp_transaction_user_login_fkey" FOREIGN KEY ("user_login") REFERENCES "users"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- Paliers configurés du passe de combat (tier == niveau).
CREATE TABLE "battle_pass_tier" (
    "tier" INTEGER NOT NULL,
    "reward_kind" TEXT NOT NULL,
    "item_id" TEXT,
    "coins" INTEGER,
    "consumable_kind" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "battle_pass_tier_pkey" PRIMARY KEY ("tier")
);

ALTER TABLE "battle_pass_tier" ADD CONSTRAINT "battle_pass_tier_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "shop_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Octrois de paliers (idempotence de l'auto-grant : un palier une seule fois).
CREATE TABLE "battle_pass_claim" (
    "user_login" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_pass_claim_pkey" PRIMARY KEY ("user_login", "tier")
);

ALTER TABLE "battle_pass_claim" ADD CONSTRAINT "battle_pass_claim_user_login_fkey" FOREIGN KEY ("user_login") REFERENCES "users"("login") ON DELETE CASCADE ON UPDATE CASCADE;
