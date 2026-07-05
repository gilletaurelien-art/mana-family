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
-- une session invisible, reliée à un astre par la clé de constellation.
-- Niveau « mer d'essai » assumé (art. 15) : la clé d'invitation est une
-- capacité en clair, à durcir avant toute bêta publique.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonnes du gréement
-- ------------------------------------------------------------
alter table astres add column avatar_url text; -- portrait 128px (dataURL), jamais l'original

alter table constellations
  add column invite_code text not null unique
  default substr(md5(random()::text || clock_timestamp()::text), 1, 8);

comment on column constellations.invite_code is
  'La clé de la maison : chaque proche l''entre une fois sur son appareil. Capacité en clair — durcir (hash + rotation) avant bêta publique.';

-- ------------------------------------------------------------
-- 2. Le lien appareil ↔ astre
-- ------------------------------------------------------------
create table device_links (
  user_id          uuid primary key references auth.users(id),
  astre_id         uuid not null references astres(id),
  constellation_id uuid not null references constellations(id),
  created_at       timestamptz not null default now()
);

alter table device_links enable row level security; -- déni par défaut, accès via RPC uniquement

-- ------------------------------------------------------------
-- 3. Les RPC de projection — le seul contrat public
-- ------------------------------------------------------------

create or replace function mf_lien() returns device_links
language sql stable security definer set search_path = public, pg_temp as $$
  select * from device_links where user_id = auth.uid();
$$;

-- Fonder : crée la constellation et ses astres, relie l'appareil au sien.
create or replace function fonder(p_nom text, p_astres jsonb, p_mon_index int)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c uuid; v_code text; v_a jsonb; v_id uuid; v_mon uuid; i int := 0;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  insert into constellations(name) values (p_nom) returning id, invite_code into v_c, v_code;
  for v_a in select * from jsonb_array_elements(p_astres) loop
    insert into astres(display_name) values (v_a->>'name') returning id into v_id;
    insert into members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    if i = p_mon_index then v_mon := v_id; end if;
    i := i + 1;
  end loop;
  if v_mon is null then raise exception 'astre du fondateur introuvable'; end if;
  insert into device_links(user_id, astre_id, constellation_id) values (auth.uid(), v_mon, v_c)
    on conflict (user_id) do update set astre_id = excluded.astre_id, constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

-- Hisser : importe une constellation locale complète (fondation + histoire),
-- en préservant les dates et les lueurs. Idempotence par clés client.
create or replace function importer(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c uuid; v_code text; v_a jsonb; v_t jsonb; v_id uuid; v_mon uuid;
  v_map jsonb := '{}'::jsonb; v_r text; v_k text; v_ts text;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  insert into constellations(name) values (p->>'name') returning id, invite_code into v_c, v_code;

  for v_a in select * from jsonb_array_elements(p->'astres') loop
    insert into astres(display_name, avatar_url)
      values (v_a->>'name', v_a->>'avatarUrl') returning id into v_id;
    insert into members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    v_map := v_map || jsonb_build_object(v_a->>'id', v_id::text);
    if (v_a->>'id') = (p->>'meId') then v_mon := v_id; end if;
  end loop;
  if v_mon is null then raise exception 'astre du porteur introuvable'; end if;

  for v_t in select * from jsonb_array_elements(coalesce(p->'transmissions', '[]'::jsonb)) loop
    insert into transmissions(constellation_id, author_astre_id, about_astre_id, kind, body, created_at)
      values (
        v_c,
        (v_map->>(v_t->>'authorId'))::uuid,
        (v_map->>(v_t->>'aboutId'))::uuid,
        v_t->>'kind', v_t->>'body', (v_t->>'createdAt')::timestamptz
      ) returning id into v_id;
    for v_r in select * from jsonb_array_elements_text(v_t->'recipientIds') loop
      insert into transmission_grants(transmission_id, astre_id)
        values (v_id, (v_map->>v_r)::uuid) on conflict do nothing;
    end loop;
    for v_k, v_ts in select * from jsonb_each_text(coalesce(v_t->'veilles', '{}'::jsonb)) loop
      insert into transmission_grants(transmission_id, astre_id)
        values (v_id, (v_map->>v_k)::uuid) on conflict do nothing;
      insert into transmission_lueurs(transmission_id, astre_id, veilled_server_at)
        values (v_id, (v_map->>v_k)::uuid, v_ts::timestamptz) on conflict do nothing;
    end loop;
  end loop;

  insert into device_links(user_id, astre_id, constellation_id) values (auth.uid(), v_mon, v_c)
    on conflict (user_id) do update set astre_id = excluded.astre_id, constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

-- Rejoindre : la clé de la maison + le choix de son astre.
create or replace function rejoindre(p_code text, p_astre uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_c uuid;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  select id into v_c from constellations where invite_code = p_code;
  if v_c is null then raise exception 'clé inconnue'; end if;
  if not exists (select 1 from members where constellation_id = v_c and astre_id = p_astre) then
    raise exception 'cet astre n''appartient pas à cette constellation';
  end if;
  insert into device_links(user_id, astre_id, constellation_id) values (auth.uid(), p_astre, v_c)
    on conflict (user_id) do update set astre_id = excluded.astre_id, constellation_id = excluded.constellation_id;
  return jsonb_build_object('ok', true);
end $$;

-- Les astres d'une constellation, AVANT liaison (pour choisir le sien en rejoignant).
create or replace function astres_de(p_code text)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level, 'avatarUrl', a.avatar_url
  ) order by m.created_at), '[]'::jsonb)
  from constellations c
  join members m on m.constellation_id = c.id and m.ended_at is null
  join astres a on a.id = m.astre_id
  where c.invite_code = p_code;
$$;

-- Le ciel entier, projeté pour l'astre de l'appareil.
create or replace function ma_constellation()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v device_links; r jsonb;
begin
  v := mf_lien();
  if v is null then return null; end if;
  select jsonb_build_object(
    'name', c.name,
    'inviteCode', c.invite_code,
    'meId', v.astre_id,
    'astres', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level, 'avatarUrl', a.avatar_url
      ) order by m.created_at), '[]'::jsonb)
      from members m join astres a on a.id = m.astre_id
      where m.constellation_id = c.id and m.ended_at is null
    ),
    'transmissions', (
      select coalesce(jsonb_agg(tx order by (tx->>'createdAt') desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', t.id, 'authorId', t.author_astre_id, 'aboutId', t.about_astre_id,
          'kind', t.kind, 'body', t.body, 'createdAt', t.created_at,
          'recipientIds', (select coalesce(jsonb_agg(g.astre_id), '[]'::jsonb) from transmission_grants g where g.transmission_id = t.id),
          'veilles', (select coalesce(jsonb_object_agg(l.astre_id, l.veilled_server_at), '{}'::jsonb) from transmission_lueurs l where l.transmission_id = t.id)
        ) as tx
        from transmissions t
        where t.constellation_id = c.id
          and (t.author_astre_id = v.astre_id
               or exists (select 1 from transmission_grants g2 where g2.transmission_id = t.id and g2.astre_id = v.astre_id))
        order by t.created_at desc
        limit 500
      ) s
    )
  ) into r
  from constellations c where c.id = v.constellation_id;
  return r;
end $$;

-- Transmettre : idempotent par id client (l'outbox peut rejouer sans risque).
create or replace function transmettre(p_id uuid, p_kind text, p_body text, p_about uuid, p_recipients uuid[])
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  insert into transmissions(id, constellation_id, author_astre_id, about_astre_id, kind, body)
    values (p_id, v.constellation_id, v.astre_id, p_about, p_kind, p_body)
    on conflict (id) do nothing;
  insert into transmission_grants(transmission_id, astre_id)
    select p_id, m.astre_id from members m
    where m.constellation_id = v.constellation_id and m.astre_id = any(p_recipients)
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Veiller : monotone (NULL → date serveur), idempotent, jamais l'inverse.
create or replace function veiller(p_tx uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  insert into transmission_lueurs(transmission_id, astre_id)
  select p_tx, v.astre_id
  where exists (select 1 from transmission_grants g where g.transmission_id = p_tx and g.astre_id = v.astre_id)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Poser un portrait (membre de la même constellation — réalité d'un appareil familial).
create or replace function poser_portrait(p_astre uuid, p_url text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from members where constellation_id = v.constellation_id and astre_id = p_astre) then
    raise exception 'astre hors de la constellation';
  end if;
  update astres set avatar_url = p_url where id = p_astre;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- 4. Permissions : le contrat public, et rien d'autre
-- ------------------------------------------------------------
-- Par défaut Postgres accorde EXECUTE à PUBLIC : on révoque tout, puis on
-- n'accorde qu'aux sessions (les sessions anonymes portent le rôle authenticated).
revoke execute on function mf_lien()                                    from public, anon, authenticated;
revoke execute on function fonder(text, jsonb, int)                     from public, anon;
revoke execute on function importer(jsonb)                              from public, anon;
revoke execute on function rejoindre(text, uuid)                        from public, anon;
revoke execute on function astres_de(text)                              from public, anon;
revoke execute on function ma_constellation()                           from public, anon;
revoke execute on function transmettre(uuid, text, text, uuid, uuid[])  from public, anon;
revoke execute on function veiller(uuid)                                from public, anon;
revoke execute on function poser_portrait(uuid, text)                   from public, anon;

grant execute on function fonder(text, jsonb, int)                      to authenticated;
grant execute on function importer(jsonb)                               to authenticated;
grant execute on function rejoindre(text, uuid)                         to authenticated;
grant execute on function astres_de(text)                               to authenticated;
grant execute on function ma_constellation()                            to authenticated;
grant execute on function transmettre(uuid, text, text, uuid, uuid[])   to authenticated;
grant execute on function veiller(uuid)                                 to authenticated;
grant execute on function poser_portrait(uuid, text)                    to authenticated;
