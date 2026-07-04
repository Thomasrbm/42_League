-- AlterTable: campus on season_standings — fige le campus du joueur au snapshot
-- de saison pour cloisonner les classements de saisons passées par campus.
-- Null sur les anciens snapshots (avant tagging) → ils restent globaux.
ALTER TABLE "season_standings" ADD COLUMN "campus" TEXT;
