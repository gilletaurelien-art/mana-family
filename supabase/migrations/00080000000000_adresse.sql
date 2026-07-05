-- ============================================================
-- MANA FAMILY — L'ADRESSE (pays + code postal)
-- Facultatif, jamais exigé. Prépare les futures branches (événements de
-- la commune, proximité, entraide de voisinage). Migration corrective :
-- on ne réédite jamais une migration jouée, on en écrit une nouvelle.
-- ============================================================

alter table astres add column if not exists country     text;
alter table astres add column if not exists postal_code text;

-- 1. modifier_profil gagne pays + code postal (garde surnom).
drop function if exists modifier_profil(uuid, text, text, date, text);

create or replace function modifier_profil(
  p_astre uuid, p_nom text, p_surnom text, p_date date, p_role text,
  p_pays text, p_code_postal text
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from members where constellation_id = v.constellation_id and astre_id = p_astre) then
    raise exception 'astre hors de la famille';
  end if;
  if p_nom is not null and length(trim(p_nom)) > 0 then
    update astres set display_name = trim(p_nom) where id = p_astre;
  end if;
  if p_surnom is not null then
    update astres set nickname = nullif(trim(p_surnom), '') where id = p_astre; -- '' efface le surnom
  end if;
  if p_date is not null then
    update astres set birth_date = p_date where id = p_astre;
  end if;
  if p_role is not null then
    update members set
      role = p_role,
      circle_level = case p_role when 'grand_parent' then 2 when 'soutien' then 2 when 'famille' then 3 else 1 end
    where constellation_id = v.constellation_id and astre_id = p_astre;
  end if;
  if p_pays is not null then
    update astres set country = nullif(trim(p_pays), '') where id = p_astre;
  end if;
  if p_code_postal is not null then
    update astres set postal_code = nullif(trim(p_code_postal), '') where id = p_astre;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function modifier_profil(uuid, text, text, date, text, text, text) from public, anon;
grant  execute on function modifier_profil(uuid, text, text, date, text, text, text) to authenticated;

-- 2. Les lectures projettent l'adresse (versions les plus récentes, étendues).
create or replace function astres_de(p_code text)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
    'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname,
    'country', a.country, 'postalCode', a.postal_code
  ) order by m.created_at), '[]'::jsonb)
  from constellations c
  join members m on m.constellation_id = c.id and m.ended_at is null
  join astres a on a.id = m.astre_id
  where c.invite_code = p_code;
$$;

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
          'kind', t.kind, 'body', t.body, 'createdAt', t.created_at,
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
