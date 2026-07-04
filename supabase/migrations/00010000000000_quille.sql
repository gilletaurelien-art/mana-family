-- ============================================================
-- MANA FAMILY — LA QUILLE
-- Schéma fondateur. Le voilage est dans la charpente, pas boulonné après coup.
--
-- Doctrine embarquée (livre blanc v2.7) :
--  * le graphe est centré sur les PERSONNES (astres), jamais sur un foyer payeur
--  * un astre peut appartenir à plusieurs constellations (famille recomposée)
--  * la mémoire brute n'est JAMAIS effacée par Mana ; chaque astre reste
--    souverain de sa propre lumière (voile, retrait, RGPD sur ses données)
--  * la veille (lueur) est ASYMÉTRIQUE : on enregistre qui a veillé,
--    on n'expose jamais qui n'a pas veillé — aucune vue, aucun count "manquant"
--  * aucun champ de score, de streak, de complétude. Jamais.
-- ============================================================

-- ------------------------------------------------------------
-- ASTRES — les personnes, continues dans le temps
-- ------------------------------------------------------------
create table astres (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id),  -- null pour un enfant (accès via adultes) ou un aîné pas encore équipé
  display_name text not null,
  birth_date   date,                            -- fonde is_minor et la remise de majorité
  created_at   timestamptz not null default now()
);

comment on table astres is 'Une personne = un astre unique, membre d''un ou plusieurs Cercles. Jamais la propriété d''un foyer.';

-- ------------------------------------------------------------
-- CONSTELLATIONS — une structure familiale vivante
-- ------------------------------------------------------------
create table constellations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- MEMBRES — l'appartenance d'un astre à une constellation, par Cercle
-- circle_level : 1 = nucléaire, 2 = élargi, 3 = étendu
-- Un enfant en co-parentalité = memberships dans DEUX constellations niveau 1.
-- ------------------------------------------------------------
create table members (
  id               uuid primary key default gen_random_uuid(),
  constellation_id uuid not null references constellations(id),
  astre_id         uuid not null references astres(id),
  circle_level     smallint not null check (circle_level in (1, 2, 3)),
  role             text not null check (role in ('parent', 'enfant', 'grand_parent', 'soutien', 'famille')),
  is_guardian      boolean not null default false, -- adulte responsable d'astres mineurs de ce cercle
  created_at       timestamptz not null default now(),
  unique (constellation_id, astre_id)
);

-- ------------------------------------------------------------
-- VOILES — la souveraineté de chaque astre sur sa propre lumière
-- Un voile actif masque la continuité de l'astre aux autres membres
-- de la constellation visée, SANS rien détruire : l'archive de l'astre
-- reste entière pour lui-même. Lever un voile est toujours possible.
-- ------------------------------------------------------------
create table veils (
  id               uuid primary key default gen_random_uuid(),
  astre_id         uuid not null references astres(id),
  constellation_id uuid not null references constellations(id),
  veiled_at        timestamptz not null default now(),
  lifted_at        timestamptz,                  -- null = voile actif
  covers_artifacts boolean not null default true -- refus de figurer dans les artefacts (le droit de l'astre > le portefeuille)
);

comment on table veils is 'Voiler ≠ effacer. L''astre garde tout ; les autres ne voient plus. L''absence doit être poétique, jamais punitive.';

-- ------------------------------------------------------------
-- TRANSMISSIONS — le cœur du système
-- « D'abord un acte de soin aujourd'hui, par conséquence un acte de mémoire demain. »
-- ------------------------------------------------------------
create table transmissions (
  id               uuid primary key default gen_random_uuid(),
  constellation_id uuid not null references constellations(id),
  author_astre_id  uuid not null references astres(id),
  about_astre_id   uuid references astres(id),   -- l'astre concerné (la frise qu'elle alimente) ; null = la famille entière
  kind             text not null check (kind in ('sante', 'ecole', 'emotionnel', 'logistique', 'souvenir')),
  body             text not null,
  created_at       timestamptz not null default now()
  -- Pas de deleted_at : la mémoire brute n'expire jamais. Le retrait d'un
  -- astre passe par le voile ou par l'anonymisation RGPD de SES données.
);

create table transmission_recipients (
  transmission_id uuid not null references transmissions(id),
  astre_id        uuid not null references astres(id),
  veilled_at      timestamptz,                   -- la lueur : renseignée quand l'astre a veillé
  primary key (transmission_id, astre_id)
);

comment on column transmission_recipients.veilled_at is
  'ASYMÉTRIE : ce champ ne sert qu''à faire apparaître la lueur. Interdit de l''agréger en "qui n''a pas veillé" — aucune vue, aucun badge, aucun rappel ne doit exposer son absence.';

-- ------------------------------------------------------------
-- RLS — esquisse (à durcir avec le DPO avant toute bêta)
--  * un astre lit les transmissions dont il est auteur ou destinataire,
--    dans les constellations où il est membre non voilé
--  * les données d'un astre mineur ne sont lisibles que par les adultes
--    guardians de ses cercles
--  * un voile actif retire la continuité de l'astre des lectures des autres
--    membres, mais jamais de ses propres lectures
-- ------------------------------------------------------------
alter table astres                    enable row level security;
alter table constellations            enable row level security;
alter table members                   enable row level security;
alter table veils                     enable row level security;
alter table transmissions             enable row level security;
alter table transmission_recipients   enable row level security;
