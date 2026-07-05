-- ============================================================
-- MANA FAMILY — LES CATÉGORIES (taxonomie du terrain)
-- Le capitaine, dans une vraie famille, a retaillé les catégories :
-- École → Accompagner (couvre l'enfant qui grandit ET l'aîné qu'on mène
-- au rendez-vous), Logistique → Organiser, et Ensemble (la vie partagée
-- au présent) comble le manque. Register mixte assumé.
-- Fichier re-jouable : migre les données PUIS échange la contrainte.
-- ============================================================

-- 1. Migrer les transmissions déjà écrites (on ne perd jamais une mémoire).
update transmissions set kind = 'accompagner' where kind = 'ecole';
update transmissions set kind = 'organiser'   where kind = 'logistique';

-- 2. Échanger la contrainte de domaine.
alter table transmissions drop constraint if exists transmissions_kind_check;
alter table transmissions add constraint transmissions_kind_check
  check (kind in ('sante', 'emotionnel', 'ensemble', 'accompagner', 'organiser', 'souvenir'));
