-- ============================================================
-- MANA FAMILY — LES RACINES (dates de naissance, anniversaires, arbre)
-- La colonne astres.birth_date existe depuis la quille ; on l'ouvre
-- au contrat public : fondation, import, lecture, et pose après coup.
-- ============================================================

-- Poser (ou corriger) une date de naissance — même cercle de confiance que le portrait.
create or replace function poser_naissance(p_astre uuid, p_date date)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from members where constellation_id = v.constellation_id and astre_id = p_astre) then
    raise exception 'astre hors de la constellation';
  end if;
  update astres set birth_date = p_date where id = p_astre;
  return jsonb_build_object('ok', true);
end $$;

-- Fonder : accepte birthDate (facultatif) pour chaque astre.
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
    on conflict (user_id) do update set astre_id = excluded.astre_id, constellation_id = excluded.constellation_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

-- Importer : idem.
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

-- astres_de : expose birthDate.
create or replace function astres_de(p_code text)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
    'avatarUrl', a.avatar_url, 'birthDate', a.birth_date
  ) order by m.created_at), '[]'::jsonb)
  from constellations c
  join members m on m.constellation_id = c.id and m.ended_at is null
  join astres a on a.id = m.astre_id
  where c.invite_code = p_code;
$$;

-- ma_constellation : expose birthDate.
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
        'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
        'avatarUrl', a.avatar_url, 'birthDate', a.birth_date
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

revoke execute on function poser_naissance(uuid, date) from public, anon;
grant execute on function poser_naissance(uuid, date) to authenticated;
