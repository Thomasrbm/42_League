-- Cooldown de 48h + auto-validation + contestation a posteriori.
-- Un match déclaré non confirmé sous 48h est AUTO-VALIDÉ (played_matches.auto_confirmed_at)
-- avec le score du déclarant, puis reste contestable (played_matches.contested_at) :
-- la contestation ouvre un litige rattaché au match compté (rejected_matches.played_match_id).
-- Run with: cd apps/backend && npx prisma migrate deploy

ALTER TABLE "played_matches" ADD COLUMN "auto_confirmed_at" TIMESTAMP(3);
ALTER TABLE "played_matches" ADD COLUMN "auto_confirm_declarer_login" TEXT;
ALTER TABLE "played_matches" ADD COLUMN "contested_at" TIMESTAMP(3);

ALTER TABLE "rejected_matches" ADD COLUMN "played_match_id" TEXT;
