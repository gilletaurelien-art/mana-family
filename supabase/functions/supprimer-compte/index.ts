// ============================================================
// MANA FAMILY — Edge Function « supprimer-compte »
//
// Suppression définitive du compte, en deux temps :
//   1. nettoyage côté famille (anonymisation RGPD), exécuté AS l'utilisateur
//      via le RPC `family.supprimer_compte()` — la mémoire brute (les
//      transmissions) n'est jamais détruite (doctrine) ;
//   2. suppression du compte d'authentification via le service_role
//      (`auth.admin.deleteUser`) — ce qu'une fonction SQL ne peut pas
//      toujours faire (droits sur le schéma `auth`).
//
// Déploiement :
//   supabase functions deploy supprimer-compte
// Les variables SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// sont injectées automatiquement dans le runtime des Edge Functions.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'non authentifié' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Client « utilisateur » : porte le JWT, vise le schéma family.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: 'family' },
    })

    // 1. Identifier le compte à supprimer à partir de son propre jeton.
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'session invalide' }, 401)
    const userId = userData.user.id

    // 2. Nettoyage côté famille (anonymisation + purge des FK vers auth),
    //    exécuté AS l'utilisateur pour que auth.uid() soit renseigné.
    const { error: rpcErr } = await userClient.rpc('supprimer_compte')
    if (rpcErr) return json({ error: `nettoyage: ${rpcErr.message}` }, 400)

    // 3. Suppression du compte d'authentification via le service_role.
    const admin = createClient(url, serviceKey)
    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    if (delErr) return json({ error: `auth: ${delErr.message}` }, 400)

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
