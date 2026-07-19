-- ============================================================
-- MANA FAMILY — INSTALLATION DANS LE SCHÉMA `family`
-- Bundle généré : 11 migrations consolidées, tous les objets Family
-- qualifiés `family.` pour cohabiter avec le civique (schéma public)
-- dans la MÊME base, sans jamais s'y mêler.
-- À exécuter dans le SQL Editor du projet MANA-app.
-- Après : exposer le schéma `family` dans l'API (Settings → API →
-- Exposed schemas), sinon PostgREST ne servira pas les RPC.
-- ============================================================

create schema if not exists family;
grant usage on schema family to anon, authenticated;
set search_path = family, public, pg_temp;

-- ===== 00010000000000_quille.sql =====
-- ============================================================
-- MANA FAMILY — LA QUILLE
-- Schéma fondateur. Le voilage est dans la charpente, pas boulonné après coup.
--
-- Doctrine embarquée (livre blanc v2.7) :
--  * le graphe est centré sur les PERSONNES (astres), jamais sur un foyer payeur
--  * un astre peut appartenir à plusieurs galaxies familiales (famille recomposée)
--  * la mémoire brute n'est JAMAIS effacée par Mana ; chaque astre reste
--    souverain de sa propre lumière (voile, retrait, RGPD sur ses données)
--  * la veille (lueur) est ASYMÉTRIQUE : on enregistre qui a veillé,
--    on n'expose jamais qui n'a pas veillé — aucune vue, aucun count "manquant"
--  * aucun champ de score, de streak, de complétude. Jamais.
-- ============================================================

-- ------------------------------------------------------------
-- ASTRES — les personnes, continues dans le temps
-- ------------------------------------------------------------
create table family.astres (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id),  -- null pour un enfant (accès via adultes) ou un aîné pas encore équipé
  display_name text not null,
  birth_date   date,                            -- fonde is_minor et la remise de majorité
  created_at   timestamptz not null default now()
);

comment on table family.astres is 'Une personne = un astre unique, membre d''un ou plusieurs Cercles. Jamais la propriété d''un foyer.';

-- ------------------------------------------------------------
-- CONSTELLATIONS — une structure familiale vivante
-- ------------------------------------------------------------
create table family.constellations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- MEMBRES — l'appartenance d'un astre à une famille, par Cercle
-- circle_level : 1 = nucléaire, 2 = élargi, 3 = étendu
-- Un enfant en co-parentalité = memberships dans DEUX familles niveau 1.
-- ------------------------------------------------------------
create table family.members (
  id               uuid primary key default gen_random_uuid(),
  constellation_id uuid not null references family.constellations(id),
  astre_id         uuid not null references family.astres(id),
  circle_level     smallint not null check (circle_level in (1, 2, 3)),
  role             text not null check (role in ('parent', 'enfant', 'grand_parent', 'soutien', 'famille')),
  is_guardian      boolean not null default false, -- adulte responsable d'astres mineurs de ce cercle
  created_at       timestamptz not null default now(),
  unique (constellation_id, astre_id)
);

-- ------------------------------------------------------------
-- VOILES — la souveraineté de chaque astre sur sa propre lumière
-- Un voile actif masque la continuité de l'astre aux autres membres
-- de la famille visée, SANS rien détruire : l'archive de l'astre
-- reste entière pour lui-même. Lever un voile est toujours possible.
-- ------------------------------------------------------------
create table family.veils (
  id               uuid primary key default gen_random_uuid(),
  astre_id         uuid not null references family.astres(id),
  constellation_id uuid not null references family.constellations(id),
  veiled_at        timestamptz not null default now(),
  lifted_at        timestamptz,                  -- null = voile actif
  covers_artifacts boolean not null default true -- refus de figurer dans les artefacts (le droit de l'astre > le portefeuille)
);

comment on table family.veils is 'Voiler ≠ effacer. L''astre garde tout ; les autres ne voient plus. L''absence doit être poétique, jamais punitive.';

-- ------------------------------------------------------------
-- TRANSMISSIONS — le cœur du système
-- « D'abord un acte de soin aujourd'hui, par conséquence un acte de mémoire demain. »
-- ------------------------------------------------------------
create table family.transmissions (
  id               uuid primary key default gen_random_uuid(),
  constellation_id uuid not null references family.constellations(id),
  author_astre_id  uuid not null references family.astres(id),
  about_astre_id   uuid references family.astres(id),   -- l'astre concerné (la frise qu'elle alimente) ; null = la famille entière
  kind             text not null check (kind in ('sante', 'ecole', 'emotionnel', 'logistique', 'souvenir')),
  body             text not null,
  created_at       timestamptz not null default now()
  -- Pas de deleted_at : la mémoire brute n'expire jamais. Le retrait d'un
  -- astre passe par le voile ou par l'anonymisation RGPD de SES données.
);

create table family.transmission_recipients (
  transmission_id uuid not null references family.transmissions(id),
  astre_id        uuid not null references family.astres(id),
  veilled_at      timestamptz,                   -- la lueur : renseignée quand l'astre a veillé
  primary key (transmission_id, astre_id)
);

comment on column family.transmission_recipients.veilled_at is
  'ASYMÉTRIE : ce champ ne sert qu''à faire apparaître la lueur. Interdit de l''agréger en "qui n''a pas veillé" — aucune vue, aucun badge, aucun rappel ne doit exposer son absence.';

-- ------------------------------------------------------------
-- RLS — esquisse (à durcir avec le DPO avant toute bêta)
--  * un astre lit les transmissions dont il est auteur ou destinataire,
--    dans les familles où il est membre non voilé
--  * les données d'un astre mineur ne sont lisibles que par les adultes
--    guardians de ses cercles
--  * un voile actif retire la continuité de l'astre des lectures des autres
--    membres, mais jamais de ses propres lectures
-- ------------------------------------------------------------
alter table family.astres                    enable row level security;
alter table family.constellations            enable row level security;
alter table family.members                   enable row level security;
alter table family.veils                     enable row level security;
alter table family.transmissions             enable row level security;
alter table family.transmission_recipients   enable row level security;

-- ===== 00020000000000_membrure.sql =====
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
alter table family.members
  add column started_at timestamptz not null default now(),
  add column ended_at   timestamptz;

alter table family.members
  add constraint members_chronologie check (ended_at is null or ended_at >= started_at);

comment on column family.members.ended_at is
  'null = appartenance courante. Jamais de delete : une appartenance se clôt, elle ne s''efface pas.';

-- ------------------------------------------------------------
-- 2. LA GARDE EST UNE RELATION, PAS UN BOOLÉEN
-- Un adulte n'est pas « gardien de la famille » : il est gardien
-- d'un enfant précis, sur une période précise, avec un périmètre précis.
-- (Le défaut à 18 mois identifié par Codex — recomposée oblige.)
-- ------------------------------------------------------------
alter table family.members drop column is_guardian;

create table family.guardianships (
  id                uuid primary key default gen_random_uuid(),
  guardian_astre_id uuid not null references family.astres(id),
  child_astre_id    uuid not null references family.astres(id),
  constellation_id  uuid not null references family.constellations(id),
  scope             text not null default 'full' check (scope in ('full', 'sante', 'ecole', 'logistique')),
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz,
  constraint guardianships_chronologie check (ends_at is null or ends_at >= starts_at),
  constraint guardianships_pas_soi_meme check (guardian_astre_id <> child_astre_id)
);

create index guardianships_par_enfant on guardianships(child_astre_id) where ends_at is null;

comment on table family.guardianships is
  'Relation personne-personne, temporelle, bornée en périmètre. La RLS des enfants s''appuie ici, jamais sur un flag de famille.';

-- ------------------------------------------------------------
-- 3. LES INVARIANTS DEVIENNENT DES CONTRAINTES
-- ------------------------------------------------------------
create unique index astres_user_id_unique on astres(user_id) where user_id is not null;

create unique index veils_un_seul_actif on veils(astre_id, constellation_id) where lifted_at is null;

alter table family.veils
  add constraint veils_chronologie check (lifted_at is null or lifted_at >= veiled_at);

-- L'auteur d'une transmission est membre de la famille où il transmet.
alter table family.transmissions
  add constraint transmissions_author_is_member
  foreign key (constellation_id, author_astre_id)
  references family.members(constellation_id, astre_id);

-- ------------------------------------------------------------
-- 4. L'AUDIENCE FIGÉE ET LA LUEUR POSITIVE-SEULEMENT
-- transmission_grants : qui a reçu (contrat interne, jamais exposé brut).
-- transmission_lueurs : qui a veillé — une table qui ne peut STRUCTURELLEMENT
-- pas dire « qui n'a pas veillé ». L'asymétrie n'est plus une règle : c'est la physique.
-- ------------------------------------------------------------
drop table transmission_recipients;

create table family.transmission_grants (
  transmission_id uuid not null references family.transmissions(id),
  astre_id        uuid not null references family.astres(id),
  primary key (transmission_id, astre_id)
);

create table family.transmission_lueurs (
  transmission_id   uuid not null references family.transmissions(id),
  astre_id          uuid not null references family.astres(id),
  veilled_server_at timestamptz not null default now(),  -- l'horloge du serveur fait foi
  veilled_client_at timestamptz,                          -- trace, jamais affichée telle quelle
  primary key (transmission_id, astre_id),
  foreign key (transmission_id, astre_id)
    references family.transmission_grants(transmission_id, astre_id)
);

comment on table family.transmission_lueurs is
  'Insert-only, monotone (NULL -> lueur, jamais l''inverse). Interdit d''agréger en absence : aucune vue, aucun count « manquant ».';

-- ------------------------------------------------------------
-- 5. L'IMMUABILITÉ PAR TRIGGERS
-- La loi doit survivre aux développeurs pressés — y compris au service role.
-- ------------------------------------------------------------
create or replace function family.mf_interdit() returns trigger
language plpgsql as $$
begin
  raise exception 'Mana Family : % interdit sur % — la mémoire ne s''efface pas, elle se voile.', tg_op, tg_table_name;
end $$;

create trigger transmissions_no_delete before delete on family.transmissions
  for each row execute function family.mf_interdit();
create trigger transmissions_no_update before update on family.transmissions
  for each row execute function family.mf_interdit();
create trigger grants_no_delete before delete on family.transmission_grants
  for each row execute function family.mf_interdit();
create trigger lueurs_no_delete before delete on family.transmission_lueurs
  for each row execute function family.mf_interdit();
create trigger lueurs_no_update before update on family.transmission_lueurs
  for each row execute function family.mf_interdit();

-- ------------------------------------------------------------
-- 6. RLS : DÉNI PAR DÉFAUT, PROJECTION EN CONTRAT
-- Activée sans policies = tout est refusé. Le contrat public de
-- l'incrément 2 ne sera JAMAIS les tables brutes : des RPC/vues de
-- projection (security definer, search_path fixé) serviront des lignes
-- expurgées — « auteur voilé » sans lien stable vers la personne,
-- référence-personne distincte du contenu, exportabilité distincte de
-- la lisibilité (revue Codex, §1-2).
-- ------------------------------------------------------------
alter table family.guardianships        enable row level security;
alter table family.transmission_grants  enable row level security;
alter table family.transmission_lueurs  enable row level security;

-- ===== 00030000000000_greement.sql =====
-- ============================================================
-- MANA FAMILY — LE GRÉEMENT (incrément 2 : multi-appareils)
--
-- Le contrat public n'est JAMAIS les tables brutes (revue Codex) :
-- l'application ne parle qu'aux fonctions RPC ci-dessous, en
-- security definer, avec search_path fixé. RLS reste déni-par-défaut
-- sur toutes les tables.
--
-- Auth : sessions ANONYMES (à activer dans le dashboard :
-- Authentication → Sign In / Providers → Anonymous). Un appareil =
-- une session invisible, reliée à un astre par la clé de famille.
-- Niveau « mer d'essai » assumé (art. 15) : la clé d'invitation est une
-- capacité en clair, à durcir avant toute bêta publique.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonnes du gréement
-- ------------------------------------------------------------
alter table family.astres add column avatar_url text; -- portrait 128px (dataURL), jamais l'original

alter table family.constellations
  add column invite_code text not null unique
  default substr(md5(random()::text || clock_timestamp()::text), 1, 8);

comment on column family.constellations.invite_code is
  'La clé de la maison : chaque proche l''entre une fois sur son appareil. Capacité en clair — durcir (hash + rotation) avant bêta publique.';

-- ------------------------------------------------------------
-- 2. Le lien appareil ↔ astre
-- ------------------------------------------------------------
create table family.device_links (
  user_id          uuid primary key references auth.users(id),
  astre_id         uuid not null references family.astres(id),
  constellation_id uuid not null references family.constellations(id),
  created_at       timestamptz not null default now()
);

alter table family.device_links enable row level security; -- déni par défaut, accès via RPC uniquement

-- ------------------------------------------------------------
-- 3. Les RPC de projection — le seul contrat public
-- ------------------------------------------------------------

create or replace function family.mf_lien() returns device_links
language sql stable security definer set search_path = family, public, pg_temp as $$
  select * from family.device_links where user_id = auth.uid();
$$;

-- Fonder : crée la famille et ses astres, relie l'appareil au sien.
create or replace function family.fonder(p_nom text, p_astres jsonb, p_mon_index int)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare
  v_c uuid; v_code text; v_a jsonb; v_id uuid; v_mon uuid; i int := 0;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  insert into family.constellations(name) values (p_nom) returning id, invite_code into v_c, v_code;
  for v_a in select * from jsonb_array_elements(p_astres) loop
    insert into family.astres(display_name) values (v_a->>'name') returning id into v_id;
    insert into family.members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    if i = p_mon_index then v_mon := v_id; end if;
    i := i + 1;
  end loop;
  if v_mon is null then raise exception 'astre du fondateur introuvable'; end if;
  insert into family.device_links(user_id, astre_id, constellation_id) values (auth.uid(), v_mon, v_c)
    on conflict (user_id) do update set astre_id = excluded.astre_id, constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

-- Hisser : importe une famille locale complète (fondation + histoire),
-- en préservant les dates et les lueurs. Idempotence par clés client.
create or replace function family.importer(p jsonb)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare
  v_c uuid; v_code text; v_a jsonb; v_t jsonb; v_id uuid; v_mon uuid;
  v_map jsonb := '{}'::jsonb; v_r text; v_k text; v_ts text;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  insert into family.constellations(name) values (p->>'name') returning id, invite_code into v_c, v_code;

  for v_a in select * from jsonb_array_elements(p->'astres') loop
    insert into family.astres(display_name, avatar_url)
      values (v_a->>'name', v_a->>'avatarUrl') returning id into v_id;
    insert into family.members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    v_map := v_map || jsonb_build_object(v_a->>'id', v_id::text);
    if (v_a->>'id') = (p->>'meId') then v_mon := v_id; end if;
  end loop;
  if v_mon is null then raise exception 'astre du porteur introuvable'; end if;

  for v_t in select * from jsonb_array_elements(coalesce(p->'transmissions', '[]'::jsonb)) loop
    insert into family.transmissions(constellation_id, author_astre_id, about_astre_id, kind, body, created_at)
      values (
        v_c,
        (v_map->>(v_t->>'authorId'))::uuid,
        (v_map->>(v_t->>'aboutId'))::uuid,
        v_t->>'kind', v_t->>'body', (v_t->>'createdAt')::timestamptz
      ) returning id into v_id;
    for v_r in select * from jsonb_array_elements_text(v_t->'recipientIds') loop
      insert into family.transmission_grants(transmission_id, astre_id)
        values (v_id, (v_map->>v_r)::uuid) on conflict do nothing;
    end loop;
    for v_k, v_ts in select * from jsonb_each_text(coalesce(v_t->'veilles', '{}'::jsonb)) loop
      insert into family.transmission_grants(transmission_id, astre_id)
        values (v_id, (v_map->>v_k)::uuid) on conflict do nothing;
      insert into family.transmission_lueurs(transmission_id, astre_id, veilled_server_at)
        values (v_id, (v_map->>v_k)::uuid, v_ts::timestamptz) on conflict do nothing;
    end loop;
  end loop;

  insert into family.device_links(user_id, astre_id, constellation_id) values (auth.uid(), v_mon, v_c)
    on conflict (user_id) do update set astre_id = excluded.astre_id, constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

-- Rejoindre : la clé de la maison + le choix de son astre.
create or replace function family.rejoindre(p_code text, p_astre uuid)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v_c uuid;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  select id into v_c from family.constellations where invite_code = p_code;
  if v_c is null then raise exception 'clé inconnue'; end if;
  if not exists (select 1 from family.members where constellation_id = v_c and astre_id = p_astre) then
    raise exception 'cet astre n''appartient pas à cette famille';
  end if;
  insert into family.device_links(user_id, astre_id, constellation_id) values (auth.uid(), p_astre, v_c)
    on conflict (user_id) do update set astre_id = excluded.astre_id, constellation_id = excluded.constellation_id;
  return jsonb_build_object('ok', true);
end $$;

-- Les astres d'une famille, AVANT liaison (pour choisir le sien en rejoignant).
create or replace function family.astres_de(p_code text)
returns jsonb
language sql stable security definer set search_path = family, public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level, 'avatarUrl', a.avatar_url
  ) order by m.created_at), '[]'::jsonb)
  from family.constellations c
  join family.members m on m.constellation_id = c.id and m.ended_at is null
  join family.astres a on a.id = m.astre_id
  where c.invite_code = p_code;
$$;

-- Le ciel entier, projeté pour l'astre de l'appareil.
create or replace function family.ma_constellation()
returns jsonb
language plpgsql stable security definer set search_path = family, public, pg_temp as $$
declare v device_links; r jsonb;
begin
  v := family.mf_lien();
  if v is null then return null; end if;
  select jsonb_build_object(
    'name', c.name,
    'inviteCode', c.invite_code,
    'meId', v.astre_id,
    'astres', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level, 'avatarUrl', a.avatar_url
      ) order by m.created_at), '[]'::jsonb)
      from family.members m join family.astres a on a.id = m.astre_id
      where m.constellation_id = c.id and m.ended_at is null
    ),
    'transmissions', (
      select coalesce(jsonb_agg(tx order by (tx->>'createdAt') desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', t.id, 'authorId', t.author_astre_id, 'aboutId', t.about_astre_id,
          'kind', t.kind, 'body', t.body, 'createdAt', t.created_at,
          'forMe', exists (select 1 from family.transmission_grants g where g.transmission_id = t.id and g.astre_id = v.astre_id),
          'veilles', (select coalesce(jsonb_object_agg(l.astre_id, l.veilled_server_at), '{}'::jsonb) from family.transmission_lueurs l where l.transmission_id = t.id)
        ) as tx
        from family.transmissions t
        where t.constellation_id = c.id
          and (t.author_astre_id = v.astre_id
               or exists (select 1 from family.transmission_grants g2 where g2.transmission_id = t.id and g2.astre_id = v.astre_id))
        order by t.created_at desc
        limit 500
      ) s
    )
  ) into r
  from family.constellations c where c.id = v.constellation_id;
  return r;
end $$;

-- Transmettre : idempotent par id client (l'outbox peut rejouer sans risque).
create or replace function family.transmettre(p_id uuid, p_kind text, p_body text, p_about uuid, p_recipients uuid[])
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links;
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  insert into family.transmissions(id, constellation_id, author_astre_id, about_astre_id, kind, body)
    values (p_id, v.constellation_id, v.astre_id, p_about, p_kind, p_body)
    on conflict (id) do nothing;
  insert into family.transmission_grants(transmission_id, astre_id)
    select p_id, m.astre_id from family.members m
    where m.constellation_id = v.constellation_id and m.astre_id = any(p_recipients)
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Veiller : monotone (NULL → date serveur), idempotent, jamais l'inverse.
create or replace function family.veiller(p_tx uuid)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links;
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  insert into family.transmission_lueurs(transmission_id, astre_id)
  select p_tx, v.astre_id
  where exists (select 1 from family.transmission_grants g where g.transmission_id = p_tx and g.astre_id = v.astre_id)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Poser un portrait (membre de la même famille — réalité d'un appareil familial).
create or replace function family.poser_portrait(p_astre uuid, p_url text)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links;
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from family.members where constellation_id = v.constellation_id and astre_id = p_astre) then
    raise exception 'astre hors de la famille';
  end if;
  update family.astres set avatar_url = p_url where id = p_astre;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- 4. Permissions : le contrat public, et rien d'autre
-- ------------------------------------------------------------
-- Par défaut Postgres accorde EXECUTE à PUBLIC : on révoque tout, puis on
-- n'accorde qu'aux sessions (les sessions anonymes portent le rôle authenticated).
revoke execute on function family.mf_lien()                                    from public, anon, authenticated;
revoke execute on function family.fonder(text, jsonb, int)                     from public, anon;
revoke execute on function family.importer(jsonb)                              from public, anon;
revoke execute on function family.rejoindre(text, uuid)                        from public, anon;
revoke execute on function family.astres_de(text)                              from public, anon;
revoke execute on function family.ma_constellation()                           from public, anon;
revoke execute on function family.transmettre(uuid, text, text, uuid, uuid[])  from public, anon;
revoke execute on function family.veiller(uuid)                                from public, anon;
revoke execute on function family.poser_portrait(uuid, text)                   from public, anon;

grant execute on function family.fonder(text, jsonb, int)                      to authenticated;
grant execute on function family.importer(jsonb)                               to authenticated;
grant execute on function family.rejoindre(text, uuid)                         to authenticated;
grant execute on function family.astres_de(text)                               to authenticated;
grant execute on function family.ma_constellation()                            to authenticated;
grant execute on function family.transmettre(uuid, text, text, uuid, uuid[])   to authenticated;
grant execute on function family.veiller(uuid)                                 to authenticated;
grant execute on function family.poser_portrait(uuid, text)                    to authenticated;

-- ===== 00040000000000_racines.sql =====
-- ============================================================
-- MANA FAMILY — LES RACINES (dates de naissance, anniversaires, arbre)
-- La colonne astres.birth_date existe depuis la quille ; on l'ouvre
-- au contrat public : fondation, import, lecture, et pose après coup.
-- ============================================================

-- Le petit nom de la maison — la couche intime de la Présence.
-- Le prénom reste la voix de la Mémoire (galaxie, profil) ; le surnom, celle du quotidien.
alter table family.astres add column if not exists nickname text;

-- Poser (ou corriger) une date de naissance — même cercle de confiance que le portrait.
create or replace function family.poser_naissance(p_astre uuid, p_date date)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links;
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from family.members where constellation_id = v.constellation_id and astre_id = p_astre) then
    raise exception 'astre hors de la famille';
  end if;
  update family.astres set birth_date = p_date where id = p_astre;
  return jsonb_build_object('ok', true);
end $$;

-- Fonder : accepte birthDate (facultatif) pour chaque astre.
create or replace function family.fonder(p_nom text, p_astres jsonb, p_mon_index int)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare
  v_c uuid; v_code text; v_a jsonb; v_id uuid; v_mon uuid; i int := 0;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  insert into family.constellations(name) values (p_nom) returning id, invite_code into v_c, v_code;
  for v_a in select * from jsonb_array_elements(p_astres) loop
    insert into family.astres(display_name, birth_date)
      values (v_a->>'name', (v_a->>'birthDate')::date) returning id into v_id;
    insert into family.members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    if i = p_mon_index then v_mon := v_id; end if;
    i := i + 1;
  end loop;
  if v_mon is null then raise exception 'astre du fondateur introuvable'; end if;
  insert into family.device_links(user_id, astre_id, constellation_id) values (auth.uid(), v_mon, v_c)
    on conflict (user_id) do update set astre_id = excluded.astre_id, constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

-- Importer : idem.
create or replace function family.importer(p jsonb)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare
  v_c uuid; v_code text; v_a jsonb; v_t jsonb; v_id uuid; v_mon uuid;
  v_map jsonb := '{}'::jsonb; v_r text; v_k text; v_ts text;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  insert into family.constellations(name) values (p->>'name') returning id, invite_code into v_c, v_code;

  for v_a in select * from jsonb_array_elements(p->'astres') loop
    insert into family.astres(display_name, avatar_url, birth_date)
      values (v_a->>'name', v_a->>'avatarUrl', (v_a->>'birthDate')::date) returning id into v_id;
    insert into family.members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    v_map := v_map || jsonb_build_object(v_a->>'id', v_id::text);
    if (v_a->>'id') = (p->>'meId') then v_mon := v_id; end if;
  end loop;
  if v_mon is null then raise exception 'astre du porteur introuvable'; end if;

  for v_t in select * from jsonb_array_elements(coalesce(p->'transmissions', '[]'::jsonb)) loop
    insert into family.transmissions(constellation_id, author_astre_id, about_astre_id, kind, body, created_at)
      values (
        v_c,
        (v_map->>(v_t->>'authorId'))::uuid,
        (v_map->>(v_t->>'aboutId'))::uuid,
        v_t->>'kind', v_t->>'body', (v_t->>'createdAt')::timestamptz
      ) returning id into v_id;
    for v_r in select * from jsonb_array_elements_text(v_t->'recipientIds') loop
      insert into family.transmission_grants(transmission_id, astre_id)
        values (v_id, (v_map->>v_r)::uuid) on conflict do nothing;
    end loop;
    for v_k, v_ts in select * from jsonb_each_text(coalesce(v_t->'veilles', '{}'::jsonb)) loop
      insert into family.transmission_grants(transmission_id, astre_id)
        values (v_id, (v_map->>v_k)::uuid) on conflict do nothing;
      insert into family.transmission_lueurs(transmission_id, astre_id, veilled_server_at)
        values (v_id, (v_map->>v_k)::uuid, v_ts::timestamptz) on conflict do nothing;
    end loop;
  end loop;

  insert into family.device_links(user_id, astre_id, constellation_id) values (auth.uid(), v_mon, v_c)
    on conflict (user_id) do update set astre_id = excluded.astre_id, constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

-- astres_de : expose birthDate.
create or replace function family.astres_de(p_code text)
returns jsonb
language sql stable security definer set search_path = family, public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
    'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname
  ) order by m.created_at), '[]'::jsonb)
  from family.constellations c
  join family.members m on m.constellation_id = c.id and m.ended_at is null
  join family.astres a on a.id = m.astre_id
  where c.invite_code = p_code;
$$;

-- Projection de la famille : expose birthDate.
create or replace function family.ma_constellation()
returns jsonb
language plpgsql stable security definer set search_path = family, public, pg_temp as $$
declare v device_links; r jsonb;
begin
  v := family.mf_lien();
  if v is null then return null; end if;
  select jsonb_build_object(
    'name', c.name,
    'inviteCode', c.invite_code,
    'meId', v.astre_id,
    'astres', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
        'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname
      ) order by m.created_at), '[]'::jsonb)
      from family.members m join family.astres a on a.id = m.astre_id
      where m.constellation_id = c.id and m.ended_at is null
    ),
    'transmissions', (
      select coalesce(jsonb_agg(tx order by (tx->>'createdAt') desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', t.id, 'authorId', t.author_astre_id, 'aboutId', t.about_astre_id,
          'kind', t.kind, 'body', t.body, 'createdAt', t.created_at,
          'forMe', exists (select 1 from family.transmission_grants g where g.transmission_id = t.id and g.astre_id = v.astre_id),
          'veilles', (select coalesce(jsonb_object_agg(l.astre_id, l.veilled_server_at), '{}'::jsonb) from family.transmission_lueurs l where l.transmission_id = t.id)
        ) as tx
        from family.transmissions t
        where t.constellation_id = c.id
          and (t.author_astre_id = v.astre_id
               or exists (select 1 from family.transmission_grants g2 where g2.transmission_id = t.id and g2.astre_id = v.astre_id))
        order by t.created_at desc
        limit 500
      ) s
    )
  ) into r
  from family.constellations c where c.id = v.constellation_id;
  return r;
end $$;

-- Modifier le profil d'un astre : prénom, surnom (le petit nom, intime),
-- naissance, place dans la famille. Même cercle de confiance que le portrait.
drop function if exists family.modifier_profil(uuid, text, date, text);
create or replace function family.modifier_profil(p_astre uuid, p_nom text, p_surnom text, p_date date, p_role text)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links;
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from family.members where constellation_id = v.constellation_id and astre_id = p_astre) then
    raise exception 'astre hors de la famille';
  end if;
  if p_nom is not null and length(trim(p_nom)) > 0 then
    update family.astres set display_name = trim(p_nom) where id = p_astre;
  end if;
  if p_surnom is not null then
    update family.astres set nickname = nullif(trim(p_surnom), '') where id = p_astre; -- '' efface le surnom
  end if;
  if p_date is not null then
    update family.astres set birth_date = p_date where id = p_astre;
  end if;
  if p_role is not null then
    update family.members set
      role = p_role,
      circle_level = case p_role when 'grand_parent' then 2 when 'soutien' then 2 when 'famille' then 3 else 1 end
    where constellation_id = v.constellation_id and astre_id = p_astre;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function family.poser_naissance(uuid, date) from public, anon;
grant execute on function family.poser_naissance(uuid, date) to authenticated;
revoke execute on function family.modifier_profil(uuid, text, text, date, text) from public, anon;
grant execute on function family.modifier_profil(uuid, text, text, date, text) to authenticated;

-- ===== 00050000000000_calendriers.sql =====
-- ============================================================
-- MANA FAMILY — CALENDRIERS PERSONNELS
-- Le temps est commun ; les calendriers sont des couches choisies.
-- Aucune tradition n'est activée par défaut, et le protocole reste neutre.
-- ============================================================

-- Prérequis auto-réparant : cette migration projette le surnom (colonne
-- nickname de 00040). Si 00040 n'a pas encore tourné, on la crée ici pour
-- que l'ordre ne piège plus. Idempotent.
alter table family.astres add column if not exists nickname text;

alter table family.astres
  add column if not exists calendar_preferences jsonb not null default '{"enabled":[]}'::jsonb;

alter table family.astres drop constraint if exists astres_calendar_preferences_object;
alter table family.astres
  add constraint astres_calendar_preferences_object
  check (jsonb_typeof(calendar_preferences) = 'object');

comment on column family.astres.calendar_preferences is
  'Préférences personnelles de lecture du temps. Structure extensible : {"enabled": [calendar_key...]}. Vide par défaut.';

create or replace function family.mf_calendar_keys(p_keys text[]) returns text[]
language sql immutable set search_path = family, public, pg_temp as $$
  select coalesce(array_agg(k order by pos), '{}'::text[])
  from unnest(coalesce(p_keys, '{}'::text[])) with ordinality as t(k, pos)
  where k = any (array[
    'civil',
    'country_holidays',
    'commune_events',
    'association_events',
    'personal_events',
    'moon_phases',
    'tides',
    'agricultural',
    'celtic',
    'christian',
    'muslim',
    'jewish',
    'buddhist',
    'hindu'
  ]::text[]);
$$;

create or replace function family.modifier_calendriers(p_astre uuid, p_calendriers text[])
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links; v_keys text[];
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from family.members where constellation_id = v.constellation_id and astre_id = p_astre) then
    raise exception 'astre hors de la famille';
  end if;
  v_keys := mf_calendar_keys(p_calendriers);
  update family.astres
    set calendar_preferences = jsonb_build_object('enabled', to_jsonb(v_keys))
    where id = p_astre;
  return jsonb_build_object('ok', true);
end $$;

-- astres_de : expose les calendriers personnels pour le choix d'appareil.
create or replace function family.astres_de(p_code text)
returns jsonb
language sql stable security definer set search_path = family, public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
    'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname,
    'calendarIds', coalesce(a.calendar_preferences->'enabled', '[]'::jsonb)
  ) order by m.created_at), '[]'::jsonb)
  from family.constellations c
  join family.members m on m.constellation_id = c.id and m.ended_at is null
  join family.astres a on a.id = m.astre_id
  where c.invite_code = p_code;
$$;

-- Projection de la famille : expose les calendriers personnels sans en faire une règle commune.
create or replace function family.ma_constellation()
returns jsonb
language plpgsql stable security definer set search_path = family, public, pg_temp as $$
declare v device_links; r jsonb;
begin
  v := family.mf_lien();
  if v is null then return null; end if;
  select jsonb_build_object(
    'name', c.name,
    'inviteCode', c.invite_code,
    'meId', v.astre_id,
    'astres', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
        'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname,
        'calendarIds', coalesce(a.calendar_preferences->'enabled', '[]'::jsonb)
      ) order by m.created_at), '[]'::jsonb)
      from family.members m join family.astres a on a.id = m.astre_id
      where m.constellation_id = c.id and m.ended_at is null
    ),
    'transmissions', (
      select coalesce(jsonb_agg(tx order by (tx->>'createdAt') desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', t.id, 'authorId', t.author_astre_id, 'aboutId', t.about_astre_id,
          'kind', t.kind, 'body', t.body, 'createdAt', t.created_at,
          'forMe', exists (select 1 from family.transmission_grants g where g.transmission_id = t.id and g.astre_id = v.astre_id),
          'veilles', (select coalesce(jsonb_object_agg(l.astre_id, l.veilled_server_at), '{}'::jsonb) from family.transmission_lueurs l where l.transmission_id = t.id)
        ) as tx
        from family.transmissions t
        where t.constellation_id = c.id
          and (t.author_astre_id = v.astre_id
               or exists (select 1 from family.transmission_grants g2 where g2.transmission_id = t.id and g2.astre_id = v.astre_id))
        order by t.created_at desc
        limit 500
      ) s
    )
  ) into r
  from family.constellations c where c.id = v.constellation_id;
  return r;
end $$;

revoke execute on function family.mf_calendar_keys(text[]) from public, anon, authenticated;
revoke execute on function family.modifier_calendriers(uuid, text[]) from public, anon;
grant execute on function family.modifier_calendriers(uuid, text[]) to authenticated;

-- ===== 00060000000000_categories.sql =====
-- ============================================================
-- MANA FAMILY — LES CATÉGORIES (taxonomie du terrain)
-- Le capitaine, dans une vraie famille, a retaillé les catégories :
-- École → Accompagner (couvre l'enfant qui grandit ET l'aîné qu'on mène
-- au rendez-vous), Logistique → Organiser, et Ensemble (la vie partagée
-- au présent) comble le manque. Register mixte assumé.
-- Fichier re-jouable : migre les données PUIS échange la contrainte.
-- ============================================================

-- 1. Migrer les transmissions déjà écrites (on ne perd jamais une mémoire).
update family.transmissions set kind = 'accompagner' where kind = 'ecole';
update family.transmissions set kind = 'organiser'   where kind = 'logistique';

-- 2. Échanger la contrainte de domaine.
alter table family.transmissions drop constraint if exists transmissions_kind_check;
alter table family.transmissions add constraint transmissions_kind_check
  check (kind in ('sante', 'emotionnel', 'ensemble', 'accompagner', 'organiser', 'souvenir'));

-- ===== 00070000000000_jardin.sql =====
-- ============================================================
-- MANA FAMILY — LE JARDIN
-- « Un enfant est un astre unique, membre de plusieurs Cercles 1 si sa
-- vie se déroule dans deux maisons » (livre blanc §3). La charpente
-- centrée-personnes le permettait ; l'accès le bridait à une galaxie.
-- Ici : un appareil peut appartenir à plusieurs galaxies, avec une
-- galaxie active à la fois. Re-jouable.
-- ============================================================

-- 0. Prérequis auto-réparant : si une migration antérieure a été éditée
--    après avoir été jouée, la colonne du surnom peut manquer. mes_galaxies
--    en a besoin. Idempotent.
alter table family.astres add column if not exists nickname text;

-- 1. Un appareil peut être relié à plusieurs galaxies (une ligne par galaxie).
alter table family.device_links drop constraint if exists device_links_pkey;
alter table family.device_links add primary key (user_id, constellation_id);

-- 2. La galaxie active sur cet appareil (le jardin a toujours une allée éclairée).
create table if not exists family.device_current (
  user_id          uuid primary key references auth.users(id),
  constellation_id uuid not null references family.constellations(id)
);
alter table family.device_current enable row level security;

-- Semer l'active à partir des liens déjà existants (personne ne se perd).
insert into family.device_current (user_id, constellation_id)
  select user_id, constellation_id from family.device_links
  on conflict (user_id) do nothing;

-- 3. family.mf_lien() suit désormais la galaxie active.
create or replace function family.mf_lien() returns device_links
language sql stable security definer set search_path = family, public, pg_temp as $$
  select dl.*
  from family.device_links dl
  join family.device_current dc on dc.user_id = dl.user_id and dc.constellation_id = dl.constellation_id
  where dl.user_id = auth.uid();
$$;

-- 4. Fonder / rejoindre / importer AJOUTENT une galaxie (au lieu de remplacer)
--    et la rendent active.
create or replace function family.fonder(p_nom text, p_astres jsonb, p_mon_index int)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare
  v_c uuid; v_code text; v_a jsonb; v_id uuid; v_mon uuid; i int := 0;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  insert into family.constellations(name) values (p_nom) returning id, invite_code into v_c, v_code;
  for v_a in select * from jsonb_array_elements(p_astres) loop
    insert into family.astres(display_name, birth_date)
      values (v_a->>'name', (v_a->>'birthDate')::date) returning id into v_id;
    insert into family.members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    if i = p_mon_index then v_mon := v_id; end if;
    i := i + 1;
  end loop;
  if v_mon is null then raise exception 'astre du fondateur introuvable'; end if;
  insert into family.device_links(user_id, astre_id, constellation_id) values (auth.uid(), v_mon, v_c)
    on conflict (user_id, constellation_id) do update set astre_id = excluded.astre_id;
  insert into family.device_current(user_id, constellation_id) values (auth.uid(), v_c)
    on conflict (user_id) do update set constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

create or replace function family.rejoindre(p_code text, p_astre uuid)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v_c uuid;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  select id into v_c from family.constellations where invite_code = p_code;
  if v_c is null then raise exception 'clé inconnue'; end if;
  if not exists (select 1 from family.members where constellation_id = v_c and astre_id = p_astre) then
    raise exception 'cet astre n''appartient pas à cette galaxie';
  end if;
  insert into family.device_links(user_id, astre_id, constellation_id) values (auth.uid(), p_astre, v_c)
    on conflict (user_id, constellation_id) do update set astre_id = excluded.astre_id;
  insert into family.device_current(user_id, constellation_id) values (auth.uid(), v_c)
    on conflict (user_id) do update set constellation_id = excluded.constellation_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function family.importer(p jsonb)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare
  v_c uuid; v_code text; v_a jsonb; v_t jsonb; v_id uuid; v_mon uuid;
  v_map jsonb := '{}'::jsonb; v_r text; v_k text; v_ts text;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  insert into family.constellations(name) values (p->>'name') returning id, invite_code into v_c, v_code;
  for v_a in select * from jsonb_array_elements(p->'astres') loop
    insert into family.astres(display_name, avatar_url, birth_date)
      values (v_a->>'name', v_a->>'avatarUrl', (v_a->>'birthDate')::date) returning id into v_id;
    insert into family.members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    v_map := v_map || jsonb_build_object(v_a->>'id', v_id::text);
    if (v_a->>'id') = (p->>'meId') then v_mon := v_id; end if;
  end loop;
  if v_mon is null then raise exception 'astre du porteur introuvable'; end if;
  for v_t in select * from jsonb_array_elements(coalesce(p->'transmissions', '[]'::jsonb)) loop
    insert into family.transmissions(constellation_id, author_astre_id, about_astre_id, kind, body, created_at)
      values (
        v_c, (v_map->>(v_t->>'authorId'))::uuid, (v_map->>(v_t->>'aboutId'))::uuid,
        v_t->>'kind', v_t->>'body', (v_t->>'createdAt')::timestamptz
      ) returning id into v_id;
    for v_r in select * from jsonb_array_elements_text(v_t->'recipientIds') loop
      insert into family.transmission_grants(transmission_id, astre_id)
        values (v_id, (v_map->>v_r)::uuid) on conflict do nothing;
    end loop;
    for v_k, v_ts in select * from jsonb_each_text(coalesce(v_t->'veilles', '{}'::jsonb)) loop
      insert into family.transmission_grants(transmission_id, astre_id)
        values (v_id, (v_map->>v_k)::uuid) on conflict do nothing;
      insert into family.transmission_lueurs(transmission_id, astre_id, veilled_server_at)
        values (v_id, (v_map->>v_k)::uuid, v_ts::timestamptz) on conflict do nothing;
    end loop;
  end loop;
  insert into family.device_links(user_id, astre_id, constellation_id) values (auth.uid(), v_mon, v_c)
    on conflict (user_id, constellation_id) do update set astre_id = excluded.astre_id;
  insert into family.device_current(user_id, constellation_id) values (auth.uid(), v_c)
    on conflict (user_id) do update set constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

-- 5. Les galaxies de cet appareil, et la bascule.
create or replace function family.mes_galaxies()
returns jsonb
language sql stable security definer set search_path = family, public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'constellationId', c.id,
    'name', c.name,
    'inviteCode', c.invite_code,
    'monNom', a.display_name,
    'monSurnom', a.nickname,
    'active', (dc.constellation_id = c.id)
  ) order by c.name), '[]'::jsonb)
  from family.device_links dl
  join family.constellations c on c.id = dl.constellation_id
  join family.astres a on a.id = dl.astre_id
  left join family.device_current dc on dc.user_id = dl.user_id
  where dl.user_id = auth.uid();
$$;

create or replace function family.activer_galaxie(p_constellation uuid)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  if not exists (select 1 from family.device_links where user_id = auth.uid() and constellation_id = p_constellation) then
    raise exception 'galaxie non reliée à cet appareil';
  end if;
  insert into family.device_current(user_id, constellation_id) values (auth.uid(), p_constellation)
    on conflict (user_id) do update set constellation_id = excluded.constellation_id;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function family.mes_galaxies()            from public, anon;
grant  execute on function family.mes_galaxies()            to authenticated;
revoke execute on function family.activer_galaxie(uuid)     from public, anon;
grant  execute on function family.activer_galaxie(uuid)     to authenticated;

-- ===== 00080000000000_adresse.sql =====
-- ============================================================
-- MANA FAMILY — L'ADRESSE (pays + code postal)
-- Facultatif, jamais exigé. Prépare les futures branches (événements de
-- la commune, proximité, entraide de voisinage). Migration corrective :
-- on ne réédite jamais une migration jouée, on en écrit une nouvelle.
-- ============================================================

alter table family.astres add column if not exists country     text;
alter table family.astres add column if not exists postal_code text;

-- 1. modifier_profil gagne pays + code postal (garde surnom).
drop function if exists family.modifier_profil(uuid, text, text, date, text);

create or replace function family.modifier_profil(
  p_astre uuid, p_nom text, p_surnom text, p_date date, p_role text,
  p_pays text, p_code_postal text
)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links;
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from family.members where constellation_id = v.constellation_id and astre_id = p_astre) then
    raise exception 'astre hors de la famille';
  end if;
  if p_nom is not null and length(trim(p_nom)) > 0 then
    update family.astres set display_name = trim(p_nom) where id = p_astre;
  end if;
  if p_surnom is not null then
    update family.astres set nickname = nullif(trim(p_surnom), '') where id = p_astre; -- '' efface le surnom
  end if;
  if p_date is not null then
    update family.astres set birth_date = p_date where id = p_astre;
  end if;
  if p_role is not null then
    update family.members set
      role = p_role,
      circle_level = case p_role when 'grand_parent' then 2 when 'soutien' then 2 when 'famille' then 3 else 1 end
    where constellation_id = v.constellation_id and astre_id = p_astre;
  end if;
  if p_pays is not null then
    update family.astres set country = nullif(trim(p_pays), '') where id = p_astre;
  end if;
  if p_code_postal is not null then
    update family.astres set postal_code = nullif(trim(p_code_postal), '') where id = p_astre;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function family.modifier_profil(uuid, text, text, date, text, text, text) from public, anon;
grant  execute on function family.modifier_profil(uuid, text, text, date, text, text, text) to authenticated;

-- 2. Les lectures projettent l'adresse (versions les plus récentes, étendues).
create or replace function family.astres_de(p_code text)
returns jsonb
language sql stable security definer set search_path = family, public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
    'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname,
    'country', a.country, 'postalCode', a.postal_code
  ) order by m.created_at), '[]'::jsonb)
  from family.constellations c
  join family.members m on m.constellation_id = c.id and m.ended_at is null
  join family.astres a on a.id = m.astre_id
  where c.invite_code = p_code;
$$;

-- NOTE : cette migration ne redéfinit PAS ma_constellation. La colonne
-- adresse suffit ; ma_constellation la projette déjà (versions 00090+).
-- Éviter de la redéfinir ici protège le « happens_on » de la chronologie,
-- dont la version la plus récente vit dans 00090. Ordre neutralisé.

-- ===== 00090000000000_chronologie.sql =====
-- ============================================================
-- MANA FAMILY — LA CHRONOLOGIE (le « quand »)
-- Une transmission a désormais deux temps : celui où on l'écrit
-- (created_at, immuable) et celui qu'elle CONCERNE (happens_on,
-- facultatif). Le passé à gauche, le présent au centre, le futur à
-- droite. Fixé à l'écriture — cohérent avec l'immuabilité (une
-- transmission est un acte, on ne le corrige pas, on en écrit un autre).
-- Migration corrective.
-- ============================================================

alter table family.transmissions add column if not exists happens_on date;

-- transmettre gagne le « quand » (facultatif).
drop function if exists family.transmettre(uuid, text, text, uuid, uuid[]);

create or replace function family.transmettre(
  p_id uuid, p_kind text, p_body text, p_about uuid, p_recipients uuid[], p_happens_on date
)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links;
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  insert into family.transmissions(id, constellation_id, author_astre_id, about_astre_id, kind, body, happens_on)
    values (p_id, v.constellation_id, v.astre_id, p_about, p_kind, p_body, p_happens_on)
    on conflict (id) do nothing;
  insert into family.transmission_grants(transmission_id, astre_id)
    select p_id, m.astre_id from family.members m
    where m.constellation_id = v.constellation_id and m.astre_id = any(p_recipients)
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function family.transmettre(uuid, text, text, uuid, uuid[], date) from public, anon;
grant  execute on function family.transmettre(uuid, text, text, uuid, uuid[], date) to authenticated;

-- ma_constellation projette happensOn (version la plus récente, étendue).
create or replace function family.ma_constellation()
returns jsonb
language plpgsql stable security definer set search_path = family, public, pg_temp as $$
declare v device_links; r jsonb;
begin
  v := family.mf_lien();
  if v is null then return null; end if;
  select jsonb_build_object(
    'name', c.name,
    'inviteCode', c.invite_code,
    'meId', v.astre_id,
    'astres', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
        'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname,
        'calendarIds', coalesce(a.calendar_preferences->'enabled', '[]'::jsonb),
        'country', a.country, 'postalCode', a.postal_code
      ) order by m.created_at), '[]'::jsonb)
      from family.members m join family.astres a on a.id = m.astre_id
      where m.constellation_id = c.id and m.ended_at is null
    ),
    'transmissions', (
      select coalesce(jsonb_agg(tx order by (tx->>'createdAt') desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', t.id, 'authorId', t.author_astre_id, 'aboutId', t.about_astre_id,
          'kind', t.kind, 'body', t.body, 'createdAt', t.created_at, 'happensOn', t.happens_on,
          'forMe', exists (select 1 from family.transmission_grants g where g.transmission_id = t.id and g.astre_id = v.astre_id),
          'veilles', (select coalesce(jsonb_object_agg(l.astre_id, l.veilled_server_at), '{}'::jsonb) from family.transmission_lueurs l where l.transmission_id = t.id)
        ) as tx
        from family.transmissions t
        where t.constellation_id = c.id
          and (t.author_astre_id = v.astre_id
               or exists (select 1 from family.transmission_grants g2 where g2.transmission_id = t.id and g2.astre_id = v.astre_id))
        order by t.created_at desc
        limit 500
      ) s
    )
  ) into r
  from family.constellations c where c.id = v.constellation_id;
  return r;
end $$;

-- ===== 00100000000000_nom_doux.sql =====
-- ============================================================
-- MANA FAMILY — LE NOM DOUX (relationnel)
-- « Ton père reste la même personne ; toi tu le vois Papa, ta mère
-- Chéri, ses petits-enfants Papi. » (Corvus)
-- Le nom doux n'est PAS sur la fiche du membre : il vit dans la RELATION
-- entre celui qui regarde et celui qu'il nomme. Le prénom reste l'identité ;
-- le nom doux est une préférence d'affichage propre à chacun.
-- ============================================================

create table if not exists family.noms_doux (
  viewer_astre_id uuid not null references family.astres(id),  -- qui regarde (moi)
  target_astre_id uuid not null references family.astres(id),  -- qui je nomme
  nom_doux        text not null,
  primary key (viewer_astre_id, target_astre_id)
);
alter table family.noms_doux enable row level security; -- accès via RPC uniquement

-- Nommer : poser, changer ou effacer (chaîne vide) mon nom doux pour un proche.
create or replace function family.nommer(p_target uuid, p_nom_doux text)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links;
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from family.members where constellation_id = v.constellation_id and astre_id = p_target) then
    raise exception 'ce proche n''est pas dans la famille';
  end if;
  if p_nom_doux is null or length(trim(p_nom_doux)) = 0 then
    delete from family.noms_doux where viewer_astre_id = v.astre_id and target_astre_id = p_target;
  else
    insert into family.noms_doux(viewer_astre_id, target_astre_id, nom_doux)
      values (v.astre_id, p_target, trim(p_nom_doux))
      on conflict (viewer_astre_id, target_astre_id) do update set nom_doux = excluded.nom_doux;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function family.nommer(uuid, text) from public, anon;
grant  execute on function family.nommer(uuid, text) to authenticated;

-- ma_constellation : chaque proche reçoit le nom doux que MOI (le porteur)
-- lui ai donné. Copie exacte de la version 00090 + le seul ajout du nomDoux.
create or replace function family.ma_constellation()
returns jsonb
language plpgsql stable security definer set search_path = family, public, pg_temp as $$
declare v device_links; r jsonb;
begin
  v := family.mf_lien();
  if v is null then return null; end if;
  select jsonb_build_object(
    'name', c.name,
    'inviteCode', c.invite_code,
    'meId', v.astre_id,
    'astres', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
        'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname,
        'calendarIds', coalesce(a.calendar_preferences->'enabled', '[]'::jsonb),
        'country', a.country, 'postalCode', a.postal_code,
        'nomDoux', (select nd.nom_doux from family.noms_doux nd
                    where nd.viewer_astre_id = v.astre_id and nd.target_astre_id = a.id)
      ) order by m.created_at), '[]'::jsonb)
      from family.members m join family.astres a on a.id = m.astre_id
      where m.constellation_id = c.id and m.ended_at is null
    ),
    'transmissions', (
      select coalesce(jsonb_agg(tx order by (tx->>'createdAt') desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', t.id, 'authorId', t.author_astre_id, 'aboutId', t.about_astre_id,
          'kind', t.kind, 'body', t.body, 'createdAt', t.created_at, 'happensOn', t.happens_on,
          'forMe', exists (select 1 from family.transmission_grants g where g.transmission_id = t.id and g.astre_id = v.astre_id),
          'veilles', (select coalesce(jsonb_object_agg(l.astre_id, l.veilled_server_at), '{}'::jsonb) from family.transmission_lueurs l where l.transmission_id = t.id)
        ) as tx
        from family.transmissions t
        where t.constellation_id = c.id
          and (t.author_astre_id = v.astre_id
               or exists (select 1 from family.transmission_grants g2 where g2.transmission_id = t.id and g2.astre_id = v.astre_id))
        order by t.created_at desc
        limit 500
      ) s
    )
  ) into r
  from family.constellations c where c.id = v.constellation_id;
  return r;
end $$;

-- ===== 00110000000000_pieces_jointes.sql =====
-- ============================================================
-- MANA FAMILY — LES PIÈCES JOINTES (une photo par transmission)
-- La photo est compressée côté client (~1600px, JPEG) puis déposée
-- dans un bucket PRIVÉ. La table ne garde que le chemin (image_url) —
-- jamais les octets : le carnet reste léger même après mille photos.
-- Lecture d'une pièce jointe = exactement le même droit que lire la
-- transmission qui la porte (auteur ou destinataire). Rien n'est public.
-- Cohérent avec la doctrine : rien n'expire, aucune suppression.
-- ============================================================

alter table family.transmissions add column if not exists image_url text;

-- ------------------------------------------------------------
-- 1. Le bucket privé + ses règles d'accès
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pieces-jointes', 'pieces-jointes', false, 3145728,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- L'objet est nommé « <transmission_id>.jpg ». On lie donc le droit de
-- LIRE l'octet au droit de lire la transmission : auteur ou destinataire.
drop policy if exists "pj lire si transmission accessible" on storage.objects;
create policy "pj lire si transmission accessible"
on storage.objects for select to authenticated
using (
  bucket_id = 'pieces-jointes'
  and exists (
    select 1 from family.transmissions t
    where t.id = split_part(name, '.', 1)::uuid
      and (
        t.author_astre_id = (select astre_id from family.mf_lien())
        or exists (
          select 1 from family.transmission_grants g
          where g.transmission_id = t.id
            and g.astre_id = (select astre_id from family.mf_lien())
        )
      )
  )
);

-- Écriture : réservée à un appareil relié à une famille (l'octet précède
-- la ligne — la lecture, elle, reste fermée tant que la transmission
-- n'existe pas et ne la « débloque » pas). On ne verrouille pas par
-- propriétaire (`owner` peut n'être pas encore posé au moment du CHECK) :
-- la sécurité qui compte est celle de la LECTURE, ci-dessus.
drop policy if exists "pj écrire (membre relié)" on storage.objects;
create policy "pj écrire (membre relié)"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pieces-jointes'
  and (select astre_id from family.mf_lien()) is not null
);

-- ------------------------------------------------------------
-- 2. transmettre gagne la pièce jointe (facultative)
-- ------------------------------------------------------------
drop function if exists family.transmettre(uuid, text, text, uuid, uuid[], date);

create or replace function family.transmettre(
  p_id uuid, p_kind text, p_body text, p_about uuid, p_recipients uuid[],
  p_happens_on date, p_image text default null
)
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links;
begin
  v := family.mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  insert into family.transmissions(id, constellation_id, author_astre_id, about_astre_id, kind, body, happens_on, image_url)
    values (p_id, v.constellation_id, v.astre_id, p_about, p_kind, p_body, p_happens_on, p_image)
    on conflict (id) do nothing;
  insert into family.transmission_grants(transmission_id, astre_id)
    select p_id, m.astre_id from family.members m
    where m.constellation_id = v.constellation_id and m.astre_id = any(p_recipients)
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function family.transmettre(uuid, text, text, uuid, uuid[], date, text) from public, anon;
grant  execute on function family.transmettre(uuid, text, text, uuid, uuid[], date, text) to authenticated;

-- ------------------------------------------------------------
-- 3. ma_constellation projette imageUrl (le chemin ; le client signe)
-- ------------------------------------------------------------
create or replace function family.ma_constellation()
returns jsonb
language plpgsql stable security definer set search_path = family, public, pg_temp as $$
declare v device_links; r jsonb;
begin
  v := family.mf_lien();
  if v is null then return null; end if;
  select jsonb_build_object(
    'name', c.name,
    'inviteCode', c.invite_code,
    'meId', v.astre_id,
    'astres', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
        'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname,
        'calendarIds', coalesce(a.calendar_preferences->'enabled', '[]'::jsonb),
        'country', a.country, 'postalCode', a.postal_code
      ) order by m.created_at), '[]'::jsonb)
      from family.members m join family.astres a on a.id = m.astre_id
      where m.constellation_id = c.id and m.ended_at is null
    ),
    'transmissions', (
      select coalesce(jsonb_agg(tx order by (tx->>'createdAt') desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', t.id, 'authorId', t.author_astre_id, 'aboutId', t.about_astre_id,
          'kind', t.kind, 'body', t.body, 'imageUrl', t.image_url,
          'createdAt', t.created_at, 'happensOn', t.happens_on,
          'forMe', exists (select 1 from family.transmission_grants g where g.transmission_id = t.id and g.astre_id = v.astre_id),
          'veilles', (select coalesce(jsonb_object_agg(l.astre_id, l.veilled_server_at), '{}'::jsonb) from family.transmission_lueurs l where l.transmission_id = t.id)
        ) as tx
        from family.transmissions t
        where t.constellation_id = c.id
          and (t.author_astre_id = v.astre_id
               or exists (select 1 from family.transmission_grants g2 where g2.transmission_id = t.id and g2.astre_id = v.astre_id))
        order by t.created_at desc
        limit 500
      ) s
    )
  ) into r
  from family.constellations c where c.id = v.constellation_id;
  return r;
end $$;

