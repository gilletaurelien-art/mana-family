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
alter table astres add column if not exists nickname text;

-- 1. Un appareil peut être relié à plusieurs galaxies (une ligne par galaxie).
alter table device_links drop constraint if exists device_links_pkey;
alter table device_links add primary key (user_id, constellation_id);

-- 2. La galaxie active sur cet appareil (le jardin a toujours une allée éclairée).
create table if not exists device_current (
  user_id          uuid primary key references auth.users(id),
  constellation_id uuid not null references constellations(id)
);
alter table device_current enable row level security;

-- Semer l'active à partir des liens déjà existants (personne ne se perd).
insert into device_current (user_id, constellation_id)
  select user_id, constellation_id from device_links
  on conflict (user_id) do nothing;

-- 3. mf_lien() suit désormais la galaxie active.
create or replace function mf_lien() returns device_links
language sql stable security definer set search_path = public, pg_temp as $$
  select dl.*
  from device_links dl
  join device_current dc on dc.user_id = dl.user_id and dc.constellation_id = dl.constellation_id
  where dl.user_id = auth.uid();
$$;

-- 4. Fonder / rejoindre / importer AJOUTENT une galaxie (au lieu de remplacer)
--    et la rendent active.
create or replace function fonder(p_nom text, p_astres jsonb, p_mon_index int)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c uuid; v_code text; v_a jsonb; v_id uuid; v_mon uuid; i int := 0;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  insert into constellations(name) values (p_nom) returning id, invite_code into v_c, v_code;
  for v_a in select * from jsonb_array_elements(p_astres) loop
    insert into astres(display_name, birth_date)
      values (v_a->>'name', (v_a->>'birthDate')::date) returning id into v_id;
    insert into members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    if i = p_mon_index then v_mon := v_id; end if;
    i := i + 1;
  end loop;
  if v_mon is null then raise exception 'astre du fondateur introuvable'; end if;
  insert into device_links(user_id, astre_id, constellation_id) values (auth.uid(), v_mon, v_c)
    on conflict (user_id, constellation_id) do update set astre_id = excluded.astre_id;
  insert into device_current(user_id, constellation_id) values (auth.uid(), v_c)
    on conflict (user_id) do update set constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

create or replace function rejoindre(p_code text, p_astre uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_c uuid;
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  select id into v_c from constellations where invite_code = p_code;
  if v_c is null then raise exception 'clé inconnue'; end if;
  if not exists (select 1 from members where constellation_id = v_c and astre_id = p_astre) then
    raise exception 'cet astre n''appartient pas à cette galaxie';
  end if;
  insert into device_links(user_id, astre_id, constellation_id) values (auth.uid(), p_astre, v_c)
    on conflict (user_id, constellation_id) do update set astre_id = excluded.astre_id;
  insert into device_current(user_id, constellation_id) values (auth.uid(), v_c)
    on conflict (user_id) do update set constellation_id = excluded.constellation_id;
  return jsonb_build_object('ok', true);
end $$;

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
    insert into astres(display_name, avatar_url, birth_date)
      values (v_a->>'name', v_a->>'avatarUrl', (v_a->>'birthDate')::date) returning id into v_id;
    insert into members(constellation_id, astre_id, circle_level, role)
      values (v_c, v_id, (v_a->>'circle')::smallint, v_a->>'role');
    v_map := v_map || jsonb_build_object(v_a->>'id', v_id::text);
    if (v_a->>'id') = (p->>'meId') then v_mon := v_id; end if;
  end loop;
  if v_mon is null then raise exception 'astre du porteur introuvable'; end if;
  for v_t in select * from jsonb_array_elements(coalesce(p->'transmissions', '[]'::jsonb)) loop
    insert into transmissions(constellation_id, author_astre_id, about_astre_id, kind, body, created_at)
      values (
        v_c, (v_map->>(v_t->>'authorId'))::uuid, (v_map->>(v_t->>'aboutId'))::uuid,
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
    on conflict (user_id, constellation_id) do update set astre_id = excluded.astre_id;
  insert into device_current(user_id, constellation_id) values (auth.uid(), v_c)
    on conflict (user_id) do update set constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

-- 5. Les galaxies de cet appareil, et la bascule.
create or replace function mes_galaxies()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'constellationId', c.id,
    'name', c.name,
    'inviteCode', c.invite_code,
    'monNom', a.display_name,
    'monSurnom', a.nickname,
    'active', (dc.constellation_id = c.id)
  ) order by c.name), '[]'::jsonb)
  from device_links dl
  join constellations c on c.id = dl.constellation_id
  join astres a on a.id = dl.astre_id
  left join device_current dc on dc.user_id = dl.user_id
  where dl.user_id = auth.uid();
$$;

create or replace function activer_galaxie(p_constellation uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'session requise'; end if;
  if not exists (select 1 from device_links where user_id = auth.uid() and constellation_id = p_constellation) then
    raise exception 'galaxie non reliée à cet appareil';
  end if;
  insert into device_current(user_id, constellation_id) values (auth.uid(), p_constellation)
    on conflict (user_id) do update set constellation_id = excluded.constellation_id;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function mes_galaxies()            from public, anon;
grant  execute on function mes_galaxies()            to authenticated;
revoke execute on function activer_galaxie(uuid)     from public, anon;
grant  execute on function activer_galaxie(uuid)     to authenticated;
