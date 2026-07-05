import type { Constellation } from './types'

/**
 * Héritage de l'incrément 1 : la constellation locale d'un seul navigateur.
 * Ce module ne sert plus qu'à la retrouver pour la hisser vers le ciel
 * partagé — puis à l'archiver (on n'efface jamais, on archive).
 */

const KEY = 'mana-family-quille'

export function chargerHeritage(): Constellation | null {
  const raw = localStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as Constellation) : null
}

export function archiverHeritage(): void {
  const raw = localStorage.getItem(KEY)
  if (raw) {
    localStorage.setItem(`${KEY}-hissee`, raw)
    localStorage.removeItem(KEY)
  }
}
