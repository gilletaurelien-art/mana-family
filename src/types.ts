export type TransmissionKind = 'sante' | 'emotionnel' | 'ensemble' | 'accompagner' | 'organiser' | 'souvenir'

export type Role = 'parent' | 'enfant' | 'grand_parent' | 'soutien' | 'famille'

export type CalendarLayerId =
  | 'civil'
  | 'country_holidays'
  | 'commune_events'
  | 'association_events'
  | 'personal_events'
  | 'moon_phases'
  | 'tides'
  | 'agricultural'
  | 'celtic'
  | 'christian'
  | 'muslim'
  | 'jewish'
  | 'buddhist'
  | 'hindu'

export interface Astre {
  id: string
  name: string
  role: Role
  circle: 1 | 2 | 3
  /** Portrait argentique (dataURL 128px). Sans lui, l'astre est une lumière pure. */
  avatarUrl?: string
  /** Date de naissance (YYYY-MM-DD) — anniversaires et arbre des générations. Facultative, jamais exigée. */
  birthDate?: string | null
  /** Le petit nom de la maison — très intime. La Présence le dit ; la Mémoire garde le prénom. */
  nickname?: string | null
  /** Le nom doux : comment MOI (le porteur) j'appelle ce proche (Papa, Mamie, Tonton Marc). Relationnel, propre à chacun. */
  nomDoux?: string | null
  /** Couches de temps choisies par cet astre. Vide par défaut : MANA n'impose aucune tradition. */
  calendarIds?: CalendarLayerId[]
  /** Pays et code postal — facultatifs, jamais exigés. Préparent la proximité et les événements de la commune. */
  country?: string | null
  postalCode?: string | null
}

/** La voix de l'attachement : le nom doux (comment je l'appelle), sinon le surnom, sinon le prénom. */
export function nomIntime(a: Astre): string {
  if (a.nomDoux && a.nomDoux.trim()) return a.nomDoux
  if (a.nickname && a.nickname.trim()) return a.nickname
  return a.name
}

export interface Transmission {
  id: string
  authorId: string
  aboutId: string | null
  kind: TransmissionKind
  body: string
  /** Le moment que la transmission CONCERNE (facultatif). Passé = souvenir, futur = organiser. */
  happensOn?: string | null
  /** Projection publique : ce que l'appareil doit savoir, pas toute l'audience. */
  forMe: boolean
  /** Héritage local uniquement, utilisé pendant le hissage de l'incrément 1. */
  recipientIds?: string[]
  /** La lueur — astreId → date de veille. Asymétrique : on n'affiche jamais qui n'a PAS veillé. */
  veilles: Record<string, string>
  createdAt: string
}

export interface Constellation {
  name: string
  astres: Astre[]
  transmissions: Transmission[]
}

// Ordre : du soin d'aujourd'hui vers la mémoire de demain. Register mixte assumé
// (domaines concrets pour la grand-mère + verbes-gestes qui réchauffent).
export const KINDS: { kind: TransmissionKind; label: string }[] = [
  { kind: 'sante', label: 'Santé' },
  { kind: 'emotionnel', label: 'Émotion' },
  { kind: 'ensemble', label: 'Ensemble' },
  { kind: 'accompagner', label: 'Accompagner' },
  { kind: 'organiser', label: 'Organiser' },
  { kind: 'souvenir', label: 'Souvenir' },
]

export const ROLES: { role: Role; label: string; circle: 1 | 2 | 3 }[] = [
  { role: 'parent', label: 'Parent', circle: 1 },
  { role: 'enfant', label: 'Enfant', circle: 1 },
  { role: 'grand_parent', label: 'Grand-parent', circle: 2 },
  { role: 'soutien', label: 'Soutien proche', circle: 2 },
  { role: 'famille', label: 'Famille étendue', circle: 3 },
]

export const CALENDAR_LAYERS: { id: CalendarLayerId; label: string }[] = [
  { id: 'civil', label: 'Calendrier civil' },
  { id: 'country_holidays', label: 'Jours fériés du pays' },
  { id: 'commune_events', label: 'Événements de ma commune' },
  { id: 'association_events', label: 'Événements de mes associations' },
  { id: 'personal_events', label: 'Mes événements personnels' },
  { id: 'moon_phases', label: 'Phases de la Lune' },
  { id: 'tides', label: 'Grandes marées' },
  { id: 'agricultural', label: 'Calendrier agricole' },
  { id: 'celtic', label: 'Calendrier celtique' },
  { id: 'christian', label: 'Calendrier chrétien' },
  { id: 'muslim', label: 'Calendrier musulman' },
  { id: 'jewish', label: 'Calendrier juif' },
  { id: 'buddhist', label: 'Calendrier bouddhiste' },
  { id: 'hindu', label: 'Calendrier hindou' },
]
