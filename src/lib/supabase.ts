import { createClient } from '@supabase/supabase-js'

// Family vit dans un schéma Postgres dédié `family`, à côté du civique
// (schéma public) dans la MÊME base MANA-app. Toutes les tables et RPC de
// la maison y sont isolées : `.from()` / `.rpc()` visent `family`, l'auth et
// le storage restent partagés (un seul compte MANA). Le schéma `family` doit
// être exposé dans l'API Supabase (Settings → API → Exposed schemas).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  { db: { schema: 'family' } },
)

/**
 * L'accès repose sur un compte e-mail certifié (code à 6 chiffres).
 * Un même e-mail = une même identité sur tous les appareils : le lien
 * à la famille devient durable (fini la Porte qui réapparaît).
 */
export async function assurerSession(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Aucune session ouverte.')
}

/** Un compte e-mail certifié est-il ouvert sur cet appareil ? (l'anonyme ne compte pas) */
export async function sessionCertifiee(): Promise<boolean> {
  const { data } = await supabase.auth.getUser()
  return Boolean(data.user && !data.user.is_anonymous && data.user.email)
}

export async function monEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? null
}

/**
 * Envoie le lien magique — inscription ou reconnexion, le même geste.
 * Le clic sur le lien certifie l'e-mail et ouvre la session durable ;
 * l'utilisateur revient ici, connecté (detectSessionInUrl de supabase-js).
 */
export async function envoyerLien(email: string): Promise<void> {
  // On repart propre : toute vieille session anonyme est refermée.
  const { data } = await supabase.auth.getUser()
  if (data.user?.is_anonymous) await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

/**
 * Connexion par mot de passe — pour qui en a défini un (option, jamais
 * imposée). Le lien magique reste le chemin par défaut.
 */
export async function connexionMotDePasse(email: string, motDePasse: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: motDePasse,
  })
  if (error) throw error
}

export async function seDeconnecter(): Promise<void> {
  await supabase.auth.signOut()
}

/** Suppression définitive du compte. Tente l'effacement côté serveur via la
    fonction `supprimer_compte` (SECURITY DEFINER, à créer côté base), puis
    déconnecte dans tous les cas. Tant que la fonction serveur n'existe pas,
    l'utilisateur est au moins déconnecté et ses appareils déliés. */
export async function supprimerCompte(): Promise<void> {
  try { await supabase.rpc('supprimer_compte') } catch { /* fonction serveur à venir */ }
  await supabase.auth.signOut()
}

/** Quitter la famille active : on garde son compte, on quitte cette maison.
    Tente `quitter_famille` côté serveur (à créer, pose `ended_at` sur le
    membre). L'app rafraîchit ensuite pour retrouver une autre famille ou
    l'écran d'accueil. */
export async function quitterFamille(): Promise<void> {
  try { await supabase.rpc('quitter_famille') } catch { /* fonction serveur à venir */ }
}
