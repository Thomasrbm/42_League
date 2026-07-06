-- Récompense du créateur + requêtes de cosmétiques personnalisés.
--
-- 1) shop_proposals : récompense DEMANDÉE par le proposeur (attribution / coins /
--    xp), ajustable par l'admin à l'acceptation.
ALTER TABLE "shop_proposals" ADD COLUMN IF NOT EXISTS "reward_kind" TEXT;
ALTER TABLE "shop_proposals" ADD COLUMN IF NOT EXISTS "reward_amount" INTEGER;

-- 2) shop_items : auteur crédité (attribution d'une proposition acceptée).
ALTER TABLE "shop_items" ADD COLUMN IF NOT EXISTS "creator_login" TEXT;

-- 3) cosmetic_requests : file de validation des créations d'acheteurs (items
--    « Choisissez… », payload.allowUpload). Rien n'est appliqué avant acceptation.
CREATE TABLE IF NOT EXISTS "cosmetic_requests" (
  "id"          TEXT NOT NULL,
  "user_login"  TEXT NOT NULL,
  "item_id"     TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cosmetic_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cosmetic_requests_status_idx" ON "cosmetic_requests" ("status");
CREATE INDEX IF NOT EXISTS "cosmetic_requests_user_login_item_id_idx" ON "cosmetic_requests" ("user_login", "item_id");
