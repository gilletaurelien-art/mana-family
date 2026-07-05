import { assurerSession, supabase } from './lib/supabase'
import { CALENDAR_LAYERS } from './types'
import type { Astre, CalendarLayerId, Constellation, Role, TransmissionKind } from './types'

/**
 * L'adaptateur de la galaxie familiale (incrément 2).
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
  | { geste: 'naissance'; astreId: string; date: string }
  | { geste: 'profil'; astreId: string; nom: string; surnom: string; date: string | null; role: Role }
  | { geste: 'calendriers'; astreId: string; calendarIds: CalendarLayerId[] }

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
  } else if (g.geste === 'naissance') {
    await rpc('poser_naissance', { p_astre: g.astreId, p_date: g.date })
  } else if (g.geste === 'profil') {
    await rpc('modifier_profil', { p_astre: g.astreId, p_nom: g.nom, p_surnom: g.surnom, p_date: g.date, p_role: g.role })
  } else if (g.geste === 'calendriers') {
    await rpc('modifier_calendriers', { p_astre: g.astreId, p_calendriers: g.calendarIds })
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
    body: string; createdAt: string; forMe: boolean; veilles: Record<string, string>
  }[]
}

function normaliserCiel(ciel: Ciel): Ciel {
  return {
    ...ciel,
    astres: ciel.astres.map(normaliserAstre),
    transmissions: ciel.transmissions.map((t) => ({
      ...t,
      forMe: t.forMe ?? Boolean(t.recipientIds?.includes(ciel.meId)),
    })),
  }
}

function normaliserAstre(a: Astre): Astre {
  const connus = new Set(CALENDAR_LAYERS.map((c) => c.id))
  return { ...a, calendarIds: (a.calendarIds ?? []).filter((id): id is CalendarLayerId => connus.has(id as CalendarLayerId)) }
}

function surcoucheOutbox(ciel: Ciel): Ciel {
  // Les gestes en attente restent visibles : l'interface ne « perd » jamais un geste.
  let next = normaliserCiel(ciel)
  for (const g of lireOutbox()) {
    if (g.geste === 'transmettre' && !next.transmissions.some((t) => t.id === g.id)) {
      next = {
        ...next,
        transmissions: [
          { id: g.id, authorId: next.meId, aboutId: g.aboutId, kind: g.kind, body: g.body, forMe: g.recipientIds.includes(next.meId), veilles: {}, createdAt: new Date().toISOString() },
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
    } else if (g.geste === 'naissance') {
      next = { ...next, astres: next.astres.map((a) => (a.id === g.astreId ? { ...a, birthDate: g.date } : a)) }
    } else if (g.geste === 'profil') {
      next = appliquerProfil(next, g.astreId, g.nom, g.surnom, g.date, g.role)
    } else if (g.geste === 'calendriers') {
      next = appliquerCalendriers(next, g.astreId, g.calendarIds)
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
      { id, authorId: ciel.meId, aboutId: t.aboutId, kind: t.kind, body: t.body, forMe: t.recipientIds.includes(ciel.meId), veilles: {}, createdAt: new Date().toISOString() },
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

export function poserNaissance(ciel: Ciel, astreId: string, date: string): Ciel {
  enfiler({ geste: 'naissance', astreId, date })
  return { ...ciel, astres: ciel.astres.map((a) => (a.id === astreId ? { ...a, birthDate: date } : a)) }
}

function appliquerProfil(ciel: Ciel, astreId: string, nom: string, surnom: string, date: string | null, role: Role): Ciel {
  const circle: 1 | 2 | 3 = role === 'grand_parent' || role === 'soutien' ? 2 : role === 'famille' ? 3 : 1
  return {
    ...ciel,
    astres: ciel.astres.map((a) =>
      a.id === astreId
        ? { ...a, name: nom, nickname: surnom.trim() || null, birthDate: date ?? a.birthDate, role, circle }
        : a,
    ),
  }
}

export function modifierProfil(ciel: Ciel, astreId: string, nom: string, surnom: string, date: string | null, role: Role): Ciel {
  enfiler({ geste: 'profil', astreId, nom, surnom, date, role })
  return appliquerProfil(ciel, astreId, nom, surnom, date, role)
}

function appliquerCalendriers(ciel: Ciel, astreId: string, calendarIds: CalendarLayerId[]): Ciel {
  return {
    ...ciel,
    astres: ciel.astres.map((a) => (a.id === astreId ? { ...a, calendarIds } : a)),
  }
}

export function modifierCalendriers(ciel: Ciel, astreId: string, calendarIds: CalendarLayerId[]): Ciel {
  enfiler({ geste: 'calendriers', astreId, calendarIds })
  return appliquerCalendriers(ciel, astreId, calendarIds)
}

/* ---------- Fondation, arrimage, hissage ---------- */

export async function fonder(nom: string, astres: { name: string; role: Role; circle: 1 | 2 | 3; birthDate?: string | null }[], monIndex: number): Promise<void> {
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

/** Ouvrir une famille locale (héritage de l'incrément 1) dans la galaxie familiale. */
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
