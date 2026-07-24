-- ============================================================
-- MANA FAMILY — QUITTER & SUPPRIMER
-- Deux gestes souverains, exposés comme les autres via des RPC
-- security definer (le contrat public reste les fonctions, jamais les
-- tables brutes) ; RLS déni-par-défaut inchangé.
--
-- ⚠️ SCHÉMA : dans la base MANA fusionnée, toute la maison Family vit
-- dans le schéma `family` (le client cible db.schema = 'family', voir
-- src/lib/supabase.ts). Ces fonctions y sont donc créées et cherchent
-- leurs tables via search_path = family. À exécuter dans le SQL Editor.
--
-- SUPPRESSION DU COMPTE AUTH : ces fonctions ne touchent PAS au schéma
-- `auth`. La suppression de `auth.users` est faite par l'Edge Function
-- `supprimer-compte` (service_role) — voir supabase/functions/. Le RPC
-- prépare tout côté famille (anonymisation + purge des FK vers auth).
--
-- Modèle multi-familles (migration « jardin ») :
--   * device_links(user_id, constellation_id) → astre_id : une ligne par
--     famille reliée à l'appareil ;
--   * device_current(user_id) → constellation_id : la famille active ;
--   * mf_lien() = la ligne device_links de la famille active.
--   Un même compte peut donc porter PLUSIEURS astres (un par famille).
--
-- Doctrine embarquée (livre blanc / quille) :
--   * « la mémoire brute n'est JAMAIS effacée par Mana » → on ne détruit
--     pas les transmissions. Supprimer son compte ANONYMISE l'astre
--     (RGPD sur SES données) et coupe l'authentification ; la mémoire
--     partagée avec la famille demeure, signée d'un astre anonyme.
--   * quitter une famille = poser `ended_at` sur l'appartenance : l'astre
--     disparaît des listes vivantes sans rien détruire.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUITTER LA FAMILLE ACTIVE
--    On garde son compte ; on met fin à l'appartenance à la famille
--    active et on délie cet appareil de cette galaxie, puis on active
--    une autre galaxie s'il en reste — sinon retour à l'accueil.
-- ------------------------------------------------------------
create or replace function family.quitter_famille()
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v device_links; v_next uuid;
begin
  v := mf_lien();
  if v is null then raise exception 'appareil non relié'; end if;

  -- Fin de l'appartenance à la famille active (aucune donnée détruite).
  update members
    set ended_at = now()
    where constellation_id = v.constellation_id
      and astre_id = v.astre_id
      and ended_at is null;

  -- L'appareil se délie de cette galaxie.
  delete from device_links
    where user_id = v.user_id and constellation_id = v.constellation_id;

  -- Reste-t-il une autre galaxie sur cet appareil ? On l'active, sinon on éteint.
  select constellation_id into v_next
    from device_links
    where user_id = v.user_id
    order by created_at
    limit 1;

  if v_next is null then
    delete from device_current where user_id = v.user_id;   -- plus de famille active
  else
    insert into device_current(user_id, constellation_id) values (v.user_id, v_next)
      on conflict (user_id) do update set constellation_id = excluded.constellation_id;
  end if;

  return jsonb_build_object('ok', true, 'nextConstellation', v_next);
end $$;

-- ------------------------------------------------------------
-- 2. SUPPRIMER SON COMPTE (définitif)
--    RGPD : on efface les données personnelles des astres de ce compte
--    et on coupe l'authentification. On NE détruit PAS les transmissions
--    (mémoire de la famille) — chaque astre reste, anonymisé, en signature.
--    Un astre encore relié à un AUTRE compte (appareil partagé) est
--    préservé : on ne délie que le compte courant.
-- ------------------------------------------------------------
create or replace function family.supprimer_compte()
returns jsonb
language plpgsql security definer set search_path = family, public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_astre uuid;
begin
  if v_uid is null then raise exception 'session requise'; end if;

  -- Chaque astre porté par ce compte (un par famille reliée).
  for v_astre in select distinct astre_id from device_links where user_id = v_uid loop
    -- Seulement s'il n'est plus relié à aucun autre compte (appareil partagé).
    if not exists (
      select 1 from device_links where astre_id = v_astre and user_id <> v_uid
    ) then
      -- a) L'astre quitte toutes ses familles (disparaît des listes vivantes).
      update members set ended_at = now()
        where astre_id = v_astre and ended_at is null;

      -- b) Anonymisation RGPD de l'astre. Les transmissions demeurent,
      --    désormais signées d'un astre sans identité.
      update astres set
        display_name = 'Compte supprimé',
        avatar_url = null,
        birth_date = null,
        nickname = null,
        country = null,
        postal_code = null,
        calendar_preferences = '{"enabled":[]}'::jsonb,  -- NOT NULL + check objet : on remet le défaut
        user_id = null
      where id = v_astre;
    end if;
  end loop;

  -- c) Déliaison de tous les appareils/galaxies de ce compte + coupure des
  --    liens résiduels vers l'auth (les FK vers auth.users sont ainsi purgées,
  --    ce qui permet à l'Edge Function de supprimer ensuite le compte auth).
  delete from device_current where user_id = v_uid;
  delete from device_links   where user_id = v_uid;
  update astres set user_id = null where user_id = v_uid;

  -- La suppression de auth.users elle-même est faite par l'Edge Function
  -- `supprimer-compte` (service_role) : une fonction SQL n'a pas toujours le
  -- droit d'écrire dans le schéma `auth`. Ici, on a tout préparé côté famille.
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- 3. Permissions — le contrat public, et rien d'autre.
-- ------------------------------------------------------------
revoke execute on function family.quitter_famille()  from public, anon;
revoke execute on function family.supprimer_compte() from public, anon;
grant  execute on function family.quitter_famille()  to authenticated;
grant  execute on function family.supprimer_compte() to authenticated;
