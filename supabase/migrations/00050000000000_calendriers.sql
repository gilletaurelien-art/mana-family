-- ============================================================
-- MANA FAMILY — CALENDRIERS PERSONNELS
-- Le temps est commun ; les calendriers sont des couches choisies.
-- Aucune tradition n'est activée par défaut, et le protocole reste neutre.
-- ============================================================

-- Prérequis auto-réparant : cette migration projette le surnom (colonne
-- nickname de 00040). Si 00040 n'a pas encore tourné, on la crée ici pour
-- que l'ordre ne piège plus. Idempotent.
alter table astres add column if not exists nickname text;

alter table astres
  add column if not exists calendar_preferences jsonb not null default '{"enabled":[]}'::jsonb;

alter table astres drop constraint if exists astres_calendar_preferences_object;
alter table astres
  add constraint astres_calendar_preferences_object
  check (jsonb_typeof(calendar_preferences) = 'object');

comment on column astres.calendar_preferences is
  'Préférences personnelles de lecture du temps. Structure extensible : {"enabled": [calendar_key...]}. Vide par défaut.';

create or replace function mf_calendar_keys(p_keys text[]) returns text[]
language sql immutable set search_path = public, pg_temp as $$
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

create or replace function modifier_calendriers(p_astre uuid, p_calendriers text[])
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links; v_keys text[];
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from members where constellation_id = v.constellation_id and astre_id = p_astre) then
    raise exception 'astre hors de la famille';
  end if;
  v_keys := mf_calendar_keys(p_calendriers);
  update astres
    set calendar_preferences = jsonb_build_object('enabled', to_jsonb(v_keys))
    where id = p_astre;
  return jsonb_build_object('ok', true);
end $$;

-- astres_de : expose les calendriers personnels pour le choix d'appareil.
create or replace function astres_de(p_code text)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.display_name, 'role', m.role, 'circle', m.circle_level,
    'avatarUrl', a.avatar_url, 'birthDate', a.birth_date, 'nickname', a.nickname,
    'calendarIds', coalesce(a.calendar_preferences->'enabled', '[]'::jsonb)
  ) order by m.created_at), '[]'::jsonb)
  from constellations c
  join members m on m.constellation_id = c.id and m.ended_at is null
  join astres a on a.id = m.astre_id
  where c.invite_code = p_code;
$$;

-- Projection de la famille : expose les calendriers personnels sans en faire une règle commune.
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
        'calendarIds', coalesce(a.calendar_preferences->'enabled', '[]'::jsonb)
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

revoke execute on function mf_calendar_keys(text[]) from public, anon, authenticated;
revoke execute on function modifier_calendriers(uuid, text[]) from public, anon;
grant execute on function modifier_calendriers(uuid, text[]) to authenticated;
