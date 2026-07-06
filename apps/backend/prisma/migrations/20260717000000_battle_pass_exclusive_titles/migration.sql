-- Passe de combat : ~20 TITRES EXCLUSIFS (introuvables en boutique) répartis sur
-- des paliers non configurés, pour garnir le passe sans doublon.
--   * shop_items : active=false → jamais listés/achetables en boutique, mais
--     sérialisés sur la tuile du passe (GET /me/battlepass inclut l'item) et
--     octroyés au claim (grantItemTx).
--   * battle_pass_tier : assignés UNIQUEMENT aux paliers 'none' (ON CONFLICT DO
--     UPDATE ... WHERE reward_kind='none') → ne clobbe JAMAIS une récompense déjà
--     configurée (admin/seed). Paliers choisis hors multiples de 7 (émotes) et de
--     5 (jalons seed) pour tomber sur des paliers vides.

-- 1) Les titres exclusifs (idempotent sur l'id).
INSERT INTO "shop_items" ("id","name","description","category","price","color","rarity","payload","active","sort_order") VALUES
  ('bp_title_01','Bleu du Cluster','Titre exclusif du passe de combat.','title',0,'#9fb4d8','common','{"title":"Bleu du Cluster"}',false,0),
  ('bp_title_02','Padawan du Baby','Titre exclusif du passe de combat.','title',0,'#9fb4d8','common','{"title":"Padawan du Baby"}',false,0),
  ('bp_title_03','Pousse-Bouton','Titre exclusif du passe de combat.','title',0,'#a0c8e8','common','{"title":"Pousse-Bouton"}',false,0),
  ('bp_title_04','Rookie du 42','Titre exclusif du passe de combat.','title',0,'#b8c4de','common','{"title":"Rookie du 42"}',false,0),
  ('bp_title_05','Habitué du Cluster','Titre exclusif du passe de combat.','title',0,'#38bdf8','rare','{"title":"Habitué du Cluster"}',false,0),
  ('bp_title_06','Régulier','Titre exclusif du passe de combat.','title',0,'#38bdf8','rare','{"title":"Régulier"}',false,0),
  ('bp_title_07','Tacticien','Titre exclusif du passe de combat.','title',0,'#34d399','rare','{"title":"Tacticien"}',false,0),
  ('bp_title_08','Mur Défensif','Titre exclusif du passe de combat.','title',0,'#22d3ee','rare','{"title":"Mur Défensif"}',false,0),
  ('bp_title_09','Chirurgien du Tir','Titre exclusif du passe de combat.','title',0,'#60a5fa','rare','{"title":"Chirurgien du Tir"}',false,0),
  ('bp_title_10','As du Cluster','Titre exclusif du passe de combat.','title',0,'#c084fc','epic','{"title":"As du Cluster"}',false,0),
  ('bp_title_11','Cauchemar des Poules','Titre exclusif du passe de combat.','title',0,'#a78bfa','epic','{"title":"Cauchemar des Poules"}',false,0),
  ('bp_title_12','Maître du Goal-Average','Titre exclusif du passe de combat.','title',0,'#d8b4fe','epic','{"title":"Maître du Goal-Average"}',false,0),
  ('bp_title_13','Sniper Légendé','Titre exclusif du passe de combat.','title',0,'#c084fc','epic','{"title":"Sniper Légendé"}',false,0),
  ('bp_title_14','Terreur du Baby','Titre exclusif du passe de combat.','title',0,'#f0abfc','epic','{"title":"Terreur du Baby"}',false,0),
  ('bp_title_15','Empereur du Cluster','Titre exclusif du passe de combat.','title',0,'#ffb020','legendary','{"title":"Empereur du Cluster"}',false,0),
  ('bp_title_16','Légende Vivante','Titre exclusif du passe de combat.','title',0,'#ffb020','legendary','{"title":"Légende Vivante"}',false,0),
  ('bp_title_17','Intouchable','Titre exclusif du passe de combat.','title',0,'#ff8a3d','legendary','{"title":"Intouchable"}',false,0),
  ('bp_title_18','Dieu du Baby','Titre exclusif du passe de combat.','title',0,'#ffd166','legendary','{"title":"Dieu du Baby"}',false,0),
  ('bp_title_19','Boss Final','Titre exclusif du passe de combat.','title',0,'#ff6b6b','legendary','{"title":"Boss Final"}',false,0),
  ('bp_title_20','Mythe du 42','Titre exclusif du passe de combat.','title',0,'rainbow','legendary','{"title":"Mythe du 42"}',false,0)
ON CONFLICT ("id") DO NOTHING;

-- 2) Assignation aux paliers vides (non destructif : WHERE reward_kind='none').
INSERT INTO "battle_pass_tier" ("tier","reward_kind","item_id","updated_at") VALUES
  (2,'item','bp_title_01',CURRENT_TIMESTAMP),
  (3,'item','bp_title_02',CURRENT_TIMESTAMP),
  (6,'item','bp_title_03',CURRENT_TIMESTAMP),
  (9,'item','bp_title_04',CURRENT_TIMESTAMP),
  (11,'item','bp_title_05',CURRENT_TIMESTAMP),
  (13,'item','bp_title_06',CURRENT_TIMESTAMP),
  (16,'item','bp_title_07',CURRENT_TIMESTAMP),
  (18,'item','bp_title_08',CURRENT_TIMESTAMP),
  (22,'item','bp_title_09',CURRENT_TIMESTAMP),
  (26,'item','bp_title_10',CURRENT_TIMESTAMP),
  (29,'item','bp_title_11',CURRENT_TIMESTAMP),
  (33,'item','bp_title_12',CURRENT_TIMESTAMP),
  (37,'item','bp_title_13',CURRENT_TIMESTAMP),
  (41,'item','bp_title_14',CURRENT_TIMESTAMP),
  (46,'item','bp_title_15',CURRENT_TIMESTAMP),
  (52,'item','bp_title_16',CURRENT_TIMESTAMP),
  (58,'item','bp_title_17',CURRENT_TIMESTAMP),
  (66,'item','bp_title_18',CURRENT_TIMESTAMP),
  (74,'item','bp_title_19',CURRENT_TIMESTAMP),
  (88,'item','bp_title_20',CURRENT_TIMESTAMP)
ON CONFLICT ("tier") DO UPDATE
  SET "reward_kind"='item', "item_id"=EXCLUDED."item_id", "coins"=NULL, "consumable_kind"=NULL, "updated_at"=CURRENT_TIMESTAMP
  WHERE "battle_pass_tier"."reward_kind"='none';
