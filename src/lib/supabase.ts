import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
)

/**
 * Chaque appareil porte une session anonyme invisible — personne dans la
 * famille ne crée jamais de compte. La session est reliée à un astre par
 * la clé de famille (RPC rejoindre / fonder / importer).
 */
export async function assurerSession(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
  }
}
