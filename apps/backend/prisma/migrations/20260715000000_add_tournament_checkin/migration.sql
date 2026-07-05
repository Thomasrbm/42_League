-- Check-in de tournoi : « je suis là » avant le lancement (null = pas pointé).
ALTER TABLE "tournament_entries" ADD COLUMN "checked_in_at" TIMESTAMP(3);
