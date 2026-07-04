import type { Astre, Constellation, Transmission, TransmissionKind } from './types'

/**
 * Mémoire locale de la quille (incrément 1 : un appareil, un Cercle 1 réel).
 * L'incrément 2 remplacera ce module par l'adaptateur Supabase — même interface,
 * pour que le pont ne bouge pas quand la coque change.
 * Règle de la maison : on n'efface jamais une transmission. Pas de delete ici.
 */

const KEY = 'mana-family-quille'

export function load(): Constellation | null {
  const raw = localStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as Constellation) : null
}

function save(c: Constellation) {
  localStorage.setItem(KEY, JSON.stringify(c))
}

export function found(name: string, astres: Astre[]): Constellation {
  const c: Constellation = { name, astres, transmissions: [] }
  save(c)
  return c
}

export function transmit(
  c: Constellation,
  t: { authorId: string; aboutId: string | null; kind: TransmissionKind; body: string; recipientIds: string[] },
): Constellation {
  const tx: Transmission = {
    id: crypto.randomUUID(),
    ...t,
    veilles: {},
    createdAt: new Date().toISOString(),
  }
  const next = { ...c, transmissions: [tx, ...c.transmissions] }
  save(next)
  return next
}

/** Veiller : allume la lueur pour ce couple (transmission, astre). Jamais l'inverse. */
export function veiller(c: Constellation, transmissionId: string, astreId: string): Constellation {
  const next = {
    ...c,
    transmissions: c.transmissions.map((t) =>
      t.id === transmissionId && !t.veilles[astreId]
        ? { ...t, veilles: { ...t.veilles, [astreId]: new Date().toISOString() } }
        : t,
    ),
  }
  save(next)
  return next
}
