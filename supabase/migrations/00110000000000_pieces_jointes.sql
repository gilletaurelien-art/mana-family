-- ============================================================
-- MANA FAMILY — LES PIÈCES JOINTES (une photo par transmission)
-- La photo est compressée côté client (~1600px, JPEG) puis déposée
-- dans un bucket PRIVÉ. La table ne garde que le chemin (image_url) —
-- jamais les octets : le carnet reste léger même après mille photos.
-- Lecture d'une pièce jointe = exactement le même droit que lire la
-- transmission qui la porte (auteur ou destinataire). Rien n'est public.
-- Cohérent avec la doctrine : rien n'expire, aucune suppression.
-- ============================================================

alter table transmissions add column if not exists image_url text;

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
    select 1 from transmissions t
    where t.id = split_part(name, '.', 1)::uuid
      and (
        t.author_astre_id = (select astre_id from mf_lien())
        or exists (
          select 1 from transmission_grants g
          where g.transmission_id = t.id
            and g.astre_id = (select astre_id from mf_lien())
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
  and (select astre_id from mf_lien()) is not null
);

-- ------------------------------------------------------------
-- 2. transmettre gagne la pièce jointe (facultative)
-- ------------------------------------------------------------
drop function if exists transmettre(uuid, text, text, uuid, uuid[], date);

create or replace function transmettre(
  p_id uuid, p_kind text, p_body text, p_about uuid, p_recipients uuid[],
  p_happens_on date, p_image text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  insert into transmissions(id, constellation_id, author_astre_id, about_astre_id, kind, body, happens_on, image_url)
    values (p_id, v.constellation_id, v.astre_id, p_about, p_kind, p_body, p_happens_on, p_image)
    on conflict (id) do nothing;
  insert into transmission_grants(transmission_id, astre_id)
    select p_id, m.astre_id from members m
    where m.constellation_id = v.constellation_id and m.astre_id = any(p_recipients)
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function transmettre(uuid, text, text, uuid, uuid[], date, text) from public, anon;
grant  execute on function transmettre(uuid, text, text, uuid, uuid[], date, text) to authenticated;

-- ------------------------------------------------------------
-- 3. ma_constellation projette imageUrl (le chemin ; le client signe)
-- ------------------------------------------------------------
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
          'kind', t.kind, 'body', t.body, 'imageUrl', t.image_url,
          'createdAt', t.created_at, 'happensOn', t.happens_on,
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
