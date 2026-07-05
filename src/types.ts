export type TransmissionKind = 'sante' | 'ecole' | 'emotionnel' | 'logistique' | 'souvenir'

export type Role = 'parent' | 'enfant' | 'grand_parent' | 'soutien' | 'famille'

export interface Astre {
  id: string
  name: string
  role: Role
  circle: 1 | 2 | 3
  /** Portrait argentique (dataURL 128px). Sans lui, l'astre est une lumière pure. */
  avatarUrl?: string
  /** Date de naissance (YYYY-MM-DD) — anniversaires et arbre des générations. Facultative, jamais exigée. */
  birthDate?: string | null
}

export interface Transmission {
  id: string
  authorId: string
  aboutId: string | null
  kind: TransmissionKind
  body: string
  recipientIds: string[]
  /** La lueur — astreId → date de veille. Asymétrique : on n'affiche jamais qui n'a PAS veillé. */
  veilles: Record<string, string>
  createdAt: string
}

export interface Constellation {
  name: string
  astres: Astre[]
  transmissions: Transmission[]
}

export const KINDS: { kind: TransmissionKind; label: string; emoji: string }[] = [
  { kind: 'sante', label: 'Santé', emoji: '🌡️' },
  { kind: 'ecole', label: 'École', emoji: '🎒' },
  { kind: 'emotionnel', label: 'Émotion', emoji: '💛' },
  { kind: 'logistique', label: 'Logistique', emoji: '🧭' },
  { kind: 'souvenir', label: 'Souvenir', emoji: '✨' },
]

export const ROLES: { role: Role; label: string; circle: 1 | 2 | 3 }[] = [
  { role: 'parent', label: 'Parent', circle: 1 },
  { role: 'enfant', label: 'Enfant', circle: 1 },
  { role: 'grand_parent', label: 'Grand-parent', circle: 2 },
  { role: 'soutien', label: 'Soutien proche', circle: 2 },
  { role: 'famille', label: 'Famille étendue', circle: 3 },
]
