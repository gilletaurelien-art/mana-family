import { assurerSession, supabase } from './lib/supabase'
import type { Astre, Constellation, Role, TransmissionKind } from './types'

/**
 * L'adaptateur du ciel partagé (incrément 2).
 * Serveur canonique + outbox locale idempotente (revue Codex) :
 * chaque geste porte un id client et peut être rejoué sans risque.
 * Le cache local permet d'ouvrir le ciel hors ligne — en lecture,
 * et les gestes faits hors ligne partent à la prochaine marée.
 */

export interface Ciel extends Constellation {
  inviteCode: string
  meId: string
}

const CACHE = 'mana-family-ciel-cache'
const OUTBOX = 'mana-family-outbox'

type Geste =
  | { geste: 'transmettre'; id: string; kind: TransmissionKind; body: string; aboutId: string | null; recipientIds: string[] }
  | { geste: 'veiller'; txId: string }
  | { geste: 'portrait'; astreId: string; url: string }

function lireOutbox(): Geste[] {
  try { return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]') } catch { return [] }
}
function ecrireOutbox(g: Geste[]) {
  localStorage.setItem(OUTBOX, JSON.stringify(g))
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

async function jouer(g: Geste): Promise<void> {
  if (g.geste === 'transmettre') {
    await rpc('transmettre', { p_id: g.id, p_kind: g.kind, p_body: g.body, p_about: g.aboutId, p_recipients: g.recipientIds })
  } else if (g.geste === 'veiller') {
    await rpc('veiller', { p_tx: g.txId })
  } else {
    await rpc('poser_portrait', { p_astre: g.astreId, p_url: g.url })
  }
}

/** Rejoue l'outbox dans l'ordre ; s'arrête au premier échec (la mer se calmera). */
export async function viderOutbox(): Promise<void> {
  let file = lireOutbox()
  while (file.length > 0) {
    await jouer(file[0])
    file = file.slice(1)
    ecrireOutbox(file)
  }
}

function enfiler(g: Geste) {
  ecrireOutbox([...lireOutbox(), g])
  viderOutbox().catch(() => {}) // hors ligne : le geste attend, sans paniquer
}

/* ---------- Lecture ---------- */

interface CielServeur {
  name: string
  inviteCode: string
  meId: string
  astres: Astre[]
  transmissions: {
    id: string; authorId: string; aboutId: string | null; kind: TransmissionKind
    body: string; createdAt: string; recipientIds: string[]; veilles: Record<string, string>
  }[]
}

function surcoucheOutbox(ciel: Ciel): Ciel {
  // Les gestes en attente restent visibles : l'interface ne « perd » jamais un geste.
  let next = ciel
  for (const g of lireOutbox()) {
    if (g.geste === 'transmettre' && !next.transmissions.some((t) => t.id === g.id)) {
      next = {
        ...next,
        transmissions: [
          { id: g.id, authorId: next.meId, aboutId: g.aboutId, kind: g.kind, body: g.body, recipientIds: g.recipientIds, veilles: {}, createdAt: new Date().toISOString() },
          ...next.transmissions,
        ],
      }
    } else if (g.geste === 'veiller') {
      next = {
        ...next,
        transmissions: next.transmissions.map((t) =>
          t.id === g.txId && !t.veilles[next.meId] ? { ...t, veilles: { ...t.veilles, [next.meId]: new Date().toISOString() } } : t,
        ),
      }
    } else if (g.geste === 'portrait') {
      next = { ...next, astres: next.astres.map((a) => (a.id === g.astreId ? { ...a, avatarUrl: g.url } : a)) }
    }
  }
  return next
}

export async function charger(): Promise<{ ciel: Ciel | null; horsLigne: boolean }> {
  try {
    await assurerSession()
    await viderOutbox().catch(() => {})
    const data = await rpc<CielServeur | null>('ma_constellation')
    if (!data) return { ciel: null, horsLigne: false }
    const ciel: Ciel = {
      name: data.name,
      inviteCode: data.inviteCode,
      meId: data.meId,
      astres: data.astres,
      transmissions: data.transmissions,
    }
    localStorage.setItem(CACHE, JSON.stringify(ciel))
    return { ciel: surcoucheOutbox(ciel), horsLigne: false }
  } catch {
    const raw = localStorage.getItem(CACHE)
    if (!raw) return { ciel: null, horsLigne: true }
    return { ciel: surcoucheOutbox(JSON.parse(raw) as Ciel), horsLigne: true }
  }
}

/* ---------- Gestes (optimistes + outbox) ---------- */

export function transmettre(
  ciel: Ciel,
  t: { kind: TransmissionKind; body: string; aboutId: string | null; recipientIds: string[] },
): Ciel {
  const id = crypto.randomUUID()
  enfiler({ geste: 'transmettre', id, ...t })
  return {
    ...ciel,
    transmissions: [
      { id, authorId: ciel.meId, aboutId: t.aboutId, kind: t.kind, body: t.body, recipientIds: t.recipientIds, veilles: {}, createdAt: new Date().toISOString() },
      ...ciel.transmissions,
    ],
  }
}

export function veiller(ciel: Ciel, txId: string): Ciel {
  enfiler({ geste: 'veiller', txId })
  return {
    ...ciel,
    transmissions: ciel.transmissions.map((t) =>
      t.id === txId && !t.veilles[ciel.meId] ? { ...t, veilles: { ...t.veilles, [ciel.meId]: new Date().toISOString() } } : t,
    ),
  }
}

export function poserPortrait(ciel: Ciel, astreId: string, url: string): Ciel {
  enfiler({ geste: 'portrait', astreId, url })
  return { ...ciel, astres: ciel.astres.map((a) => (a.id === astreId ? { ...a, avatarUrl: url } : a)) }
}

/* ---------- Fondation, arrimage, hissage ---------- */

export async function fonder(nom: string, astres: { name: string; role: Role; circle: 1 | 2 | 3 }[], monIndex: number): Promise<void> {
  await assurerSession()
  await rpc('fonder', { p_nom: nom, p_astres: astres, p_mon_index: monIndex })
}

export async function astresDe(code: string): Promise<Astre[]> {
  await assurerSession()
  return await rpc<Astre[]>('astres_de', { p_code: code })
}

export async function rejoindre(code: string, astreId: string): Promise<void> {
  await assurerSession()
  await rpc('rejoindre', { p_code: code, p_astre: astreId })
}

/** Hisser une constellation locale (héritage de l'incrément 1) vers le ciel partagé. */
export async function hisser(heritage: Constellation, meId: string): Promise<void> {
  await assurerSession()
  await rpc('importer', {
    p: {
      name: heritage.name,
      meId,
      astres: heritage.astres,
      transmissions: heritage.transmissions,
    },
  })
}
