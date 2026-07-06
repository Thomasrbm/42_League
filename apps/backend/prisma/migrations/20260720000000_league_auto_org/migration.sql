-- Auto-organisation des tournois de LIGUE (phase de ligue en cours).
--   * tournament_matches.postponed_at : affiche « remise à plus tard » par
--     l'officiant. Révocable (retour à NULL). Une affiche reportée est retirée
--     de la proposition « prochain match » mais reste jouable et resurgit une
--     fois toutes les autres jouées.
--   * tournament_entries.absent_at : équipe « déclarée absente » par l'officiant.
--     Retrait NEUTRE (aucun forfait/score), révocable (retour à NULL). Ses affiches
--     non jouées sont ignorées de la proposition « prochain match ».
ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "postponed_at" TIMESTAMP(3);
ALTER TABLE "tournament_entries" ADD COLUMN IF NOT EXISTS "absent_at" TIMESTAMP(3);
