import type { Ciel } from './remote'

/* ------------------------------------------------------------------
   Mode test (dev-only) — une fausse famille pour visiter l'intérieur
   sans compte ni base. Activé par `?demo=1` UNIQUEMENT en dev
   (import.meta.env.DEV) : jamais présent dans le build de production.
   ------------------------------------------------------------------ */

const jours = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const dans = (n: number) => new Date(Date.now() + n * 86400000).toISOString()

// Membres supplémentaires pour tester une grande famille (?demo=20).
const NOMS_EXTRA: { nom: string; nomDoux?: string; role: import('./types').Role; circle: 1 | 2 | 3 }[] = [
  { nom: 'Camille', role: 'enfant', circle: 1 },
  { nom: 'Louis', role: 'parent', circle: 1 },
  { nom: 'Emma', role: 'enfant', circle: 1 },
  { nom: 'Hugo', nomDoux: 'Papi Hugo', role: 'grand_parent', circle: 2 },
  { nom: 'Chloé', role: 'soutien', circle: 2 },
  { nom: 'Nathan', nomDoux: 'Cousin Nathan', role: 'famille', circle: 3 },
  { nom: 'Manon', role: 'famille', circle: 3 },
  { nom: 'Lucas', role: 'enfant', circle: 1 },
  { nom: 'Sarah', nomDoux: 'Tata Sarah', role: 'soutien', circle: 2 },
  { nom: 'Théo', role: 'famille', circle: 3 },
  { nom: 'Inès', role: 'enfant', circle: 1 },
  { nom: 'Paul', nomDoux: 'Tonton Paul', role: 'soutien', circle: 2 },
  { nom: 'Zoé', role: 'famille', circle: 3 },
  { nom: 'Adam', role: 'famille', circle: 3 },
]

export function demoCiel(nMembres = 6): Ciel {
  const base: Ciel['astres'] = [
    { id: 'a-moi', name: 'Aurélien', role: 'parent', circle: 1, birthDate: '1985-04-12' },
    { id: 'a-jeanne', name: 'Jeanne', role: 'grand_parent', circle: 2, birthDate: '1948-09-03', nomDoux: 'Mamie' },
    { id: 'a-jules', name: 'Jules', role: 'enfant', circle: 1, birthDate: '2015-06-21' },
    { id: 'a-lea', name: 'Léa', role: 'enfant', circle: 1, birthDate: '2018-02-10' },
    { id: 'a-marc', name: 'Marc', role: 'soutien', circle: 2, birthDate: '1979-11-30', nomDoux: 'Tonton Marc' },
    { id: 'a-rose', name: 'Rose', role: 'famille', circle: 3, birthDate: '1952-07-19', nomDoux: 'Tante Rose' },
  ]
  const extras: Ciel['astres'] = NOMS_EXTRA.slice(0, Math.max(0, nMembres - base.length)).map((m, i) => ({
    id: `x-${i}`, name: m.nom, role: m.role, circle: m.circle,
    birthDate: `19${60 + (i % 40)}-0${1 + (i % 9)}-1${i % 9}`,
    ...(m.nomDoux ? { nomDoux: m.nomDoux } : {}),
  }))
  return {
    name: 'Gillet',
    inviteCode: 'DEMO-MANA',
    meId: 'a-moi',
    astres: [...base, ...extras],
    transmissions: [
      {
        id: 't1', authorId: 'a-moi', aboutId: 'a-jules', kind: 'souvenir',
        body: 'Jules a fait ses premiers tours de vélo sans les roulettes ce matin — immense fierté.',
        // démo : marque « vidéo » pour illustrer le filtre médium (aucun lecteur encore).
        videoUrl: '#demo-video',
        forMe: false, veilles: { 'a-jeanne': jours(0), 'a-rose': jours(1) }, createdAt: jours(1),
      },
      {
        id: 't2', authorId: 'a-jeanne', aboutId: 'a-moi', kind: 'emotionnel',
        body: 'Je pense fort à toi aujourd’hui. La maison est calme, le jardin fleurit.',
        // démo : marque « audio » (message vocal).
        audioUrl: '#demo-audio',
        forMe: true, veilles: {}, createdAt: jours(2),
      },
      {
        id: 't3', authorId: 'a-moi', aboutId: null, kind: 'ensemble',
        body: 'Repas de famille dimanche midi chez Mamie — chacun apporte un plat.',
        // démo : marque « musique » (la chanson du repas).
        musicUrl: '#demo-musique',
        happensOn: dans(4), forMe: false, veilles: { 'a-marc': jours(0) }, createdAt: jours(3),
      },
      {
        id: 't4', authorId: 'a-marc', aboutId: 'a-lea', kind: 'sante',
        body: 'Léa a un petit rhume, rien de grave — au chaud ce week-end.',
        forMe: false, veilles: { 'a-moi': jours(0) }, createdAt: jours(4),
      },
      {
        id: 't5', authorId: 'a-rose', aboutId: null, kind: 'souvenir',
        body: 'Retrouvé une photo de l’été 1974 à Crozon.',
        // démo : image data: (rendue directement par TxImage) pour illustrer « photo ».
        imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='420' height='260'%3E%3Crect width='420' height='260' fill='%23c9b78f'/%3E%3Ctext x='50%25' y='52%25' font-family='monospace' font-size='19' fill='%23514019' text-anchor='middle'%3E%C3%89t%C3%A9 1974 %C2%B7 Crozon%3C/text%3E%3C/svg%3E",
        forMe: false, veilles: {}, createdAt: jours(6),
      },
    ],
  }
}
