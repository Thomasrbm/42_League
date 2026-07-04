-- AlterTable: user_payload on shop_inventory — stocke l'image uploadée par le joueur
-- pour les bannières personnalisables (payload.allowUpload = true).
ALTER TABLE "shop_inventory" ADD COLUMN "user_payload" JSONB;
