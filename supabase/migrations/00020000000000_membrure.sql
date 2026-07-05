-- ============================================================
-- MANA FAMILY — LA MEMBRURE
-- Renforts structurels issus de la revue Codex (05/07/2026).
-- La base est vierge : on corrige la charpente maintenant,
-- pas dans dix-huit mois sous charge.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LE TEMPS ENTRE DANS LES APPARTENANCES
-- L'audience d'une transmission se fige au moment où elle est faite ;
-- une scission de famille ne réécrit jamais l'histoire.
-- On ne supprime jamais un membre : on clôt son appartenance.
-- ------------------------------------------------------------
alter table members
  add column started_at timestamptz not null default now(),
  add column ended_at   timestamptz;

alter table members
  add constraint members_chronologie check (ended_at is null or ended_at >= started_at);

comment on column members.ended_at is
  'null = appartenance courante. Jamais de delete : une appartenance se clôt, elle ne s''efface pas.';

-- ------------------------------------------------------------
-- 2. LA GARDE EST UNE RELATION, PAS UN BOOLÉEN
-- Un adulte n'est pas « gardien de la famille » : il est gardien
-- d'un enfant précis, sur une période précise, avec un périmètre précis.
-- (Le défaut à 18 mois identifié par Codex — recomposée oblige.)
-- ------------------------------------------------------------
alter table members drop column is_guardian;

create table guardianships (
  id                uuid primary key default gen_random_uuid(),
  guardian_astre_id uuid not null references astres(id),
  child_astre_id    uuid not null references astres(id),
  constellation_id  uuid not null references constellations(id),
  scope             text not null default 'full' check (scope in ('full', 'sante', 'ecole', 'logistique')),
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz,
  constraint guardianships_chronologie check (ends_at is null or ends_at >= starts_at),
  constraint guardianships_pas_soi_meme check (guardian_astre_id <> child_astre_id)
);

create index guardianships_par_enfant on guardianships(child_astre_id) where ends_at is null;

comment on table guardianships is
  'Relation personne-personne, temporelle, bornée en périmètre. La RLS des enfants s''appuie ici, jamais sur un flag de famille.';

-- ------------------------------------------------------------
-- 3. LES INVARIANTS DEVIENNENT DES CONTRAINTES
-- ------------------------------------------------------------
create unique index astres_user_id_unique on astres(user_id) where user_id is not null;

create unique index veils_un_seul_actif on veils(astre_id, constellation_id) where lifted_at is null;

alter table veils
  add constraint veils_chronologie check (lifted_at is null or lifted_at >= veiled_at);

-- L'auteur d'une transmission est membre de la famille où il transmet.
alter table transmissions
  add constraint transmissions_author_is_member
  foreign key (constellation_id, author_astre_id)
  references members(constellation_id, astre_id);

-- ------------------------------------------------------------
-- 4. L'AUDIENCE FIGÉE ET LA LUEUR POSITIVE-SEULEMENT
-- transmission_grants : qui a reçu (contrat interne, jamais exposé brut).
-- transmission_lueurs : qui a veillé — une table qui ne peut STRUCTURELLEMENT
-- pas dire « qui n'a pas veillé ». L'asymétrie n'est plus une règle : c'est la physique.
-- ------------------------------------------------------------
drop table transmission_recipients;

create table transmission_grants (
  transmission_id uuid not null references transmissions(id),
  astre_id        uuid not null references astres(id),
  primary key (transmission_id, astre_id)
);

create table transmission_lueurs (
  transmission_id   uuid not null references transmissions(id),
  astre_id          uuid not null references astres(id),
  veilled_server_at timestamptz not null default now(),  -- l'horloge du serveur fait foi
  veilled_client_at timestamptz,                          -- trace, jamais affichée telle quelle
  primary key (transmission_id, astre_id),
  foreign key (transmission_id, astre_id)
    references transmission_grants(transmission_id, astre_id)
);

comment on table transmission_lueurs is
  'Insert-only, monotone (NULL -> lueur, jamais l''inverse). Interdit d''agréger en absence : aucune vue, aucun count « manquant ».';

-- ------------------------------------------------------------
-- 5. L'IMMUABILITÉ PAR TRIGGERS
-- La loi doit survivre aux développeurs pressés — y compris au service role.
-- ------------------------------------------------------------
create or replace function mf_interdit() returns trigger
language plpgsql as $$
begin
  raise exception 'Mana Family : % interdit sur % — la mémoire ne s''efface pas, elle se voile.', tg_op, tg_table_name;
end $$;

create trigger transmissions_no_delete before delete on transmissions
  for each row execute function mf_interdit();
create trigger transmissions_no_update before update on transmissions
  for each row execute function mf_interdit();
create trigger grants_no_delete before delete on transmission_grants
  for each row execute function mf_interdit();
create trigger lueurs_no_delete before delete on transmission_lueurs
  for each row execute function mf_interdit();
create trigger lueurs_no_update before update on transmission_lueurs
  for each row execute function mf_interdit();

-- ------------------------------------------------------------
-- 6. RLS : DÉNI PAR DÉFAUT, PROJECTION EN CONTRAT
-- Activée sans policies = tout est refusé. Le contrat public de
-- l'incrément 2 ne sera JAMAIS les tables brutes : des RPC/vues de
-- projection (security definer, search_path fixé) serviront des lignes
-- expurgées — « auteur voilé » sans lien stable vers la personne,
-- référence-personne distincte du contenu, exportabilité distincte de
-- la lisibilité (revue Codex, §1-2).
-- ------------------------------------------------------------
alter table guardianships        enable row level security;
alter table transmission_grants  enable row level security;
alter table transmission_lueurs  enable row level security;
