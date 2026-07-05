-- ============================================================
-- MANA FAMILY — LA CHRONOLOGIE (le « quand »)
-- Une transmission a désormais deux temps : celui où on l'écrit
-- (created_at, immuable) et celui qu'elle CONCERNE (happens_on,
-- facultatif). Le passé à gauche, le présent au centre, le futur à
-- droite. Fixé à l'écriture — cohérent avec l'immuabilité (une
-- transmission est un acte, on ne le corrige pas, on en écrit un autre).
-- Migration corrective.
-- ============================================================

alter table transmissions add column if not exists happens_on date;

-- transmettre gagne le « quand » (facultatif).
drop function if exists transmettre(uuid, text, text, uuid, uuid[]);

create or replace function transmettre(
  p_id uuid, p_kind text, p_body text, p_about uuid, p_recipients uuid[], p_happens_on date
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  insert into transmissions(id, constellation_id, author_astre_id, about_astre_id, kind, body, happens_on)
    values (p_id, v.constellation_id, v.astre_id, p_about, p_kind, p_body, p_happens_on)
    on conflict (id) do nothing;
  insert into transmission_grants(transmission_id, astre_id)
    select p_id, m.astre_id from members m
    where m.constellation_id = v.constellation_id and m.astre_id = any(p_recipients)
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function transmettre(uuid, text, text, uuid, uuid[], date) from public, anon;
grant  execute on function transmettre(uuid, text, text, uuid, uuid[], date) to authenticated;

-- ma_constellation projette happensOn (version la plus récente, étendue).
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
        'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname,
        'calendarIds', coalesce(a.calendar_preferences->'enabled', '[]'::jsonb),
        'country', a.country, 'postalCode', a.postal_code
      ) order by m.created_at), '[]'::jsonb)
      from members m join astres a on a.id = m.astre_id
      where m.constellation_id = c.id and m.ended_at is null
    ),
    'transmissions', (
      select coalesce(jsonb_agg(tx order by (tx->>'createdAt') desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', t.id, 'authorId', t.author_astre_id, 'aboutId', t.about_astre_id,
          'kind', t.kind, 'body', t.body, 'createdAt', t.created_at, 'happensOn', t.happens_on,
          'forMe', exists (select 1 from transmission_grants g where g.transmission_id = t.id and g.astre_id = v.astre_id),
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
