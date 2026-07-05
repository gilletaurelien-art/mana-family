-- ============================================================
-- MANA FAMILY — LE NOM DOUX (relationnel)
-- « Ton père reste la même personne ; toi tu le vois Papa, ta mère
-- Chéri, ses petits-enfants Papi. » (Corvus)
-- Le nom doux n'est PAS sur la fiche du membre : il vit dans la RELATION
-- entre celui qui regarde et celui qu'il nomme. Le prénom reste l'identité ;
-- le nom doux est une préférence d'affichage propre à chacun.
-- ============================================================

create table if not exists noms_doux (
  viewer_astre_id uuid not null references astres(id),  -- qui regarde (moi)
  target_astre_id uuid not null references astres(id),  -- qui je nomme
  nom_doux        text not null,
  primary key (viewer_astre_id, target_astre_id)
);
alter table noms_doux enable row level security; -- accès via RPC uniquement

-- Nommer : poser, changer ou effacer (chaîne vide) mon nom doux pour un proche.
create or replace function nommer(p_target uuid, p_nom_doux text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  if not exists (select 1 from members where constellation_id = v.constellation_id and astre_id = p_target) then
    raise exception 'ce proche n''est pas dans la famille';
  end if;
  if p_nom_doux is null or length(trim(p_nom_doux)) = 0 then
    delete from noms_doux where viewer_astre_id = v.astre_id and target_astre_id = p_target;
  else
    insert into noms_doux(viewer_astre_id, target_astre_id, nom_doux)
      values (v.astre_id, p_target, trim(p_nom_doux))
      on conflict (viewer_astre_id, target_astre_id) do update set nom_doux = excluded.nom_doux;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function nommer(uuid, text) from public, anon;
grant  execute on function nommer(uuid, text) to authenticated;

-- ma_constellation : chaque proche reçoit le nom doux que MOI (le porteur)
-- lui ai donné. Copie exacte de la version 00090 + le seul ajout du nomDoux.
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
        'country', a.country, 'postalCode', a.postal_code,
        'nomDoux', (select nd.nom_doux from noms_doux nd
                    where nd.viewer_astre_id = v.astre_id and nd.target_astre_id = a.id)
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
