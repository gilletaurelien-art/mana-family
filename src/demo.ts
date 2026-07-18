import type { Ciel } from './remote'

/* ------------------------------------------------------------------
   Mode test (dev-only) — une fausse famille pour visiter l'intérieur
   sans compte ni base. Activé par `?demo=1` UNIQUEMENT en dev
   (import.meta.env.DEV) : jamais présent dans le build de production.
   ------------------------------------------------------------------ */

const jours = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const dans = (n: number) => new Date(Date.now() + n * 86400000).toISOString()

export function demoCiel(): Ciel {
  return {
    name: 'Gillet',
    inviteCode: 'DEMO-MANA',
    meId: 'a-moi',
    astres: [
      { id: 'a-moi', name: 'Aurélien', role: 'parent', circle: 1, birthDate: '1985-04-12' },
      { id: 'a-jeanne', name: 'Jeanne', role: 'grand_parent', circle: 2, birthDate: '1948-09-03', nomDoux: 'Mamie' },
      { id: 'a-jules', name: 'Jules', role: 'enfant', circle: 1, birthDate: '2015-06-21' },
      { id: 'a-lea', name: 'Léa', role: 'enfant', circle: 1, birthDate: '2018-02-10' },
      { id: 'a-marc', name: 'Marc', role: 'soutien', circle: 2, birthDate: '1979-11-30', nomDoux: 'Tonton Marc' },
      { id: 'a-rose', name: 'Rose', role: 'famille', circle: 3, birthDate: '1952-07-19', nomDoux: 'Tante Rose' },
    ],
    transmissions: [
      {
        id: 't1', authorId: 'a-moi', aboutId: 'a-jules', kind: 'souvenir',
        body: 'Jules a fait ses premiers tours de vélo sans les roulettes ce matin — immense fierté.',
        forMe: false, veilles: { 'a-jeanne': jours(0), 'a-rose': jours(1) }, createdAt: jours(1),
      },
      {
        id: 't2', authorId: 'a-jeanne', aboutId: 'a-moi', kind: 'emotionnel',
        body: 'Je pense fort à toi aujourd’hui. La maison est calme, le jardin fleurit.',
        forMe: true, veilles: {}, createdAt: jours(2),
      },
      {
        id: 't3', authorId: 'a-moi', aboutId: null, kind: 'ensemble',
        body: 'Repas de famille dimanche midi chez Mamie — chacun apporte un plat.',
        happensOn: dans(4), forMe: false, veilles: { 'a-marc': jours(0) }, createdAt: jours(3),
      },
      {
        id: 't4', authorId: 'a-marc', aboutId: 'a-lea', kind: 'sante',
        body: 'Léa a un petit rhume, rien de grave — au chaud ce week-end.',
        forMe: false, veilles: { 'a-moi': jours(0) }, createdAt: jours(4),
      },
      {
        id: 't5', authorId: 'a-rose', aboutId: null, kind: 'souvenir',
        body: 'Retrouvé une photo de l’été 1974 à Crozon — je la déposerai bientôt.',
        forMe: false, veilles: {}, createdAt: jours(6),
      },
    ],
  }
}
