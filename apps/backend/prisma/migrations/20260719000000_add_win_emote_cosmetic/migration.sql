-- Émote de victoire (narguage) façon COSMÉTIQUE de boutique — catégorie 'win_emote'.
--   * payload catalogue : { emoji, phrase } → figés sur l'objet.
--   * payload.allowUpload = true → objet « custom » : l'ACHETEUR rédige son propre
--     emoji + sa phrase (validés par un admin, cf. cosmetic_requests), stockés dans
--     shop_inventory.user_payload et prioritaires sur le catalogue.
-- Un seul win_emote équipé à la fois (règle « un équipé par catégorie »), prioritaire
-- sur l'émote de passe (users.taunt_emote) au moment du narguage.

-- 1) Phrase portée par le narguage lui-même (figée au moment du match, comme l'emoji).
--    Null = pas de phrase custom → le front génère une punchline déterministe.
ALTER TABLE "emote_taunt" ADD COLUMN IF NOT EXISTS "phrase" TEXT;

-- 2) L'objet « custom » à 3000 coins : débloque la rédaction de SA propre émote de
--    victoire (emoji + phrase), validée par un admin avant application.
INSERT INTO "shop_items" ("id","name","description","category","price","color","rarity","payload","active","sort_order") VALUES
  ('win_emote_custom','Émote de victoire custom','Après achat : choisis TON emoji et TA punchline de narguage (validés par un admin).','win_emote',3000,'#ffd166','legendary','{"allowUpload":true}',true,0)
ON CONFLICT ("id") DO NOTHING;

-- 3) Quelques émotes de victoire prêtes à l'emploi (la punchline supporte {winner}).
INSERT INTO "shop_items" ("id","name","description","category","price","color","rarity","payload","active","sort_order") VALUES
  ('win_emote_flame','Brasier','Émote de victoire : tu pars en fumée.','win_emote',600,'#fb923c','common','{"emoji":"🔥","phrase":"{winner} t''a réduit en cendres"}',true,0),
  ('win_emote_crown','Couronné','Émote de victoire : le trône est pris.','win_emote',900,'#facc15','rare','{"emoji":"👑","phrase":"{winner} règne, incline-toi"}',true,0),
  ('win_emote_clown','Cirque','Émote de victoire : bienvenue au spectacle.','win_emote',900,'#f472b6','rare','{"emoji":"🤡","phrase":"Niveau clownesque, {winner} a bien ri"}',true,0),
  ('win_emote_skull','Fatal','Émote de victoire : game over.','win_emote',1200,'#a78bfa','epic','{"emoji":"💀","phrase":"{winner} t''a achevé"}',true,0),
  ('win_emote_goat','G.O.A.T.','Émote de victoire : le meilleur, tout simplement.','win_emote',1800,'#22d3ee','epic','{"emoji":"🐐","phrase":"{winner} est d''un autre niveau"}',true,0)
ON CONFLICT ("id") DO NOTHING;
