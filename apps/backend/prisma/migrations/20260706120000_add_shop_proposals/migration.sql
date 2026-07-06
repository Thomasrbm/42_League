-- Propositions de cosmétiques soumises par les joueurs (bannière/titre).
-- Relues par les admins dans /GOD (accept → crée un ShopItem, reject → clôt).
CREATE TABLE "shop_proposals" (
    "id" TEXT NOT NULL,
    "proposer_login" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shop_proposals_status_idx" ON "shop_proposals"("status");
