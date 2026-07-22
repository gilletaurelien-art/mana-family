-- ============================================================
-- MANA FAMILY — LES MÉDIUMS (audio · vidéo · musique)
-- Prolonge les pièces jointes (00110000000000_pieces_jointes.sql) :
-- une transmission peut porter, en plus de la photo, un son, une vidéo
-- ou un morceau de musique. Comme la photo, l'octet vit dans le bucket
-- PRIVÉ « pieces-jointes » (nommé « <transmission_id>.<ext> ») ; la table
-- ne garde que le chemin. Le droit de LIRE l'octet reste indexé sur le
-- droit de lire la transmission (politique RLS déjà posée : elle découpe
-- l'uuid par split_part(name,'.',1), donc toute extension convient).
--
-- Ces colonnes alimentent le filtre « médium » du carnet. Une transmission
-- ne porte qu'UN médium à la fois — la contrainte le garantit.
-- Cohérent avec la doctrine : rien n'expire, aucune suppression.
-- ============================================================

alter table transmissions add column if not exists audio_url text;
alter table transmissions add column if not exists video_url text;
alter table transmissions add column if not exists music_url text;

-- Un seul médium par transmission (photo, audio, vidéo OU musique).
alter table transmissions drop constraint if exists transmissions_un_seul_medium;
alter table transmissions add constraint transmissions_un_seul_medium check (
  (case when image_url is not null then 1 else 0 end)
  + (case when audio_url is not null then 1 else 0 end)
  + (case when video_url is not null then 1 else 0 end)
  + (case when music_url is not null then 1 else 0 end)
  <= 1
);

-- ------------------------------------------------------------
-- 1. Le bucket privé accepte désormais audio & vidéo (en plus des images).
--    La politique de lecture/écriture reste celle des pièces jointes.
-- ------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp',
      'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm',
      'video/mp4', 'video/webm', 'video/quicktime'
    ],
    file_size_limit = 52428800   -- 50 Mo : marge pour une courte vidéo compressée
where id = 'pieces-jointes';

-- ------------------------------------------------------------
-- 2. transmettre gagne les trois médiums (facultatifs, défaut null).
--    Les défauts préservent l'appel actuel du client (7 arguments) :
--    on remplace la version à 7 args par une version à 10 args.
-- ------------------------------------------------------------
drop function if exists transmettre(uuid, text, text, uuid, uuid[], date, text);

create or replace function transmettre(
  p_id uuid, p_kind text, p_body text, p_about uuid, p_recipients uuid[],
  p_happens_on date, p_image text default null,
  p_audio text default null, p_video text default null, p_music text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v device_links;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;
  insert into transmissions(id, constellation_id, author_astre_id, about_astre_id, kind, body, happens_on,
                            image_url, audio_url, video_url, music_url)
    values (p_id, v.constellation_id, v.astre_id, p_about, p_kind, p_body, p_happens_on,
            p_image, p_audio, p_video, p_music)
    on conflict (id) do nothing;
  insert into transmission_grants(transmission_id, astre_id)
    select p_id, m.astre_id from members m
    where m.constellation_id = v.constellation_id and m.astre_id = any(p_recipients)
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function transmettre(uuid, text, text, uuid, uuid[], date, text, text, text, text) from public, anon;
grant  execute on function transmettre(uuid, text, text, uuid, uuid[], date, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3. ma_constellation projette aussi audioUrl / videoUrl / musicUrl.
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
          'kind', t.kind, 'body', t.body,
          'imageUrl', t.image_url, 'audioUrl', t.audio_url, 'videoUrl', t.video_url, 'musicUrl', t.music_url,
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
