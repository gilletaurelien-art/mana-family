import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
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

/** Envoie le code à 6 chiffres — inscription ou reconnexion, le même geste. */
export async function envoyerCode(email: string): Promise<void> {
  // On repart propre : toute vieille session anonyme est refermée.
  const { data } = await supabase.auth.getUser()
  if (data.user?.is_anonymous) await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  })
  if (error) throw error
}

/** Vérifie le code : certifie l'e-mail et ouvre la session durable. */
export async function verifierCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  })
  if (error) throw error
}

export async function seDeconnecter(): Promise<void> {
  await supabase.auth.signOut()
}
