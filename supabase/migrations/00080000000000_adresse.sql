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

-- NOTE : cette migration ne redéfinit PAS ma_constellation. La colonne
-- adresse suffit ; ma_constellation la projette déjà (versions 00090+).
-- Éviter de la redéfinir ici protège le « happens_on » de la chronologie,
-- dont la version la plus récente vit dans 00090. Ordre neutralisé.
