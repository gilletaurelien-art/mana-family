import { useEffect, useRef, useState } from 'react'
import type { Astre, CalendarLayerId, Constellation, Role, Transmission, TransmissionKind } from './types'
import { CALENDAR_LAYERS, ROLES, nomIntime } from './types'
import { archiverHeritage, chargerHeritage } from './store'
import { demoCiel } from './demo'
import { connexionMotDePasse, envoyerLien, monEmail, seDeconnecter, sessionCertifiee, supabase } from './lib/supabase'
import {
  activerGalaxie, astresDe, charger, fonder, hisser, mesGalaxies, modifierCalendriers, modifierNomDoux, modifierProfil, poserNaissance, poserPortrait, rejoindre, transmettre,
  type Ciel as CielData, type Galaxie,
} from './remote'

/** Portrait : recadré carré, réduit à 128px — jamais l'original dans la mémoire. */
async function preparerPortrait(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const s = Math.min(img.width, img.height)
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', 0.82)
}

/** Pièce jointe : ratio préservé, réduite au plus grand côté (palier « compressé »
    ~1600px de la formule Famille), JPEG. On ne garde jamais l'original. */
async function preparerImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  const img = await createImageBitmap(file)
  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * ratio))
  const h = Math.max(1, Math.round(img.height * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Lit un fichier en data-URL — audio / vidéo / musique (aucune compression
    côté client) ; ces octets partent au bucket dès la prochaine marée. */
function lireFichierDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

interface AstreDraft { name: string; role: Role; circle: 1 | 2 | 3; birthDate: string | null }

/** Le visage — logo & future assistante. Uniquement aux seuils, jamais dans la vie de famille. */
/** Navigation constante — « ← Retour » collant en haut à gauche (au-dessus de tout) + un fixe en bas à gauche. */
function RetourNav({ onRetour }: { onRetour: () => void }) {
  return (
    <>
      <div className="retour-haut">
        <button className="retour-btn" onClick={onRetour}><span aria-hidden="true">←</span> retour</button>
      </div>
      <button className="retour-btn retour-bas" onClick={onRetour} aria-label="Retour"><span aria-hidden="true">←</span> retour</button>
    </>
  )
}

/** Les questions douces — pensées pour la grand-mère : chaque mot lui est naturel. */
const FAQ: { q: string; r: string }[] = [
  { q: 'Comment je partage un moment ?', r: 'Touchez « écrire », en bas au centre : écrivez quelques mots — ou offrez un petit geste. C’est tout.' },
  { q: 'Où je retrouve ce que la famille a partagé ?', r: 'À gauche, « lire » : c’est le carnet de famille. Tout y est rangé, du plus récent au plus ancien.' },
  { q: 'C’est quoi la petite lumière autour d’un visage ?', r: 'Quelqu’un a veillé sur ce moment — il l’a lu, il y a pensé. On voit qui a veillé, jamais qui ne l’a pas fait.' },
  { q: 'Est-ce que la famille voit si je n’ai pas lu ?', r: 'Non. Jamais. Votre silence vous appartient. Personne n’est jamais montré du doigt ici.' },
  { q: 'Dois-je écrire tous les jours ?', r: 'Non. Le silence est un état légitime. La maison vous attend sans rien réclamer — même après de longues saisons.' },
  { q: 'Comment j’ajoute quelqu’un à la famille ?', r: 'Ici même, dans « découvrir », touchez « inviter ». Vous confiez la clé de la maison à un proche ; il choisit alors qui il est parmi vous.' },
  { q: 'Comment je change mon nom, ma photo, ma date de naissance ?', r: 'Touchez votre visage, puis « modifier le profil ». Tout est facultatif : vous ne donnez que ce que vous voulez.' },
  { q: 'Puis-je appartenir à deux familles ?', r: 'Oui : c’est le jardin. Une même personne peut vivre dans plusieurs maisons — deux foyers, une famille de cœur, une lignée.' },
  { q: 'Est-ce que nos souvenirs peuvent disparaître ?', r: 'Non. Ce qui est transmis ne s’efface pas : c’est une ligne que nous ne franchirons jamais. La mémoire de la famille est gardée.' },
  { q: 'Qui peut voir nos moments ?', r: 'Seulement votre famille. Rien n’est public, rien n’est vendu, rien ne sert à autre chose qu’à vous relier.' },
]

/** Les portes de la maison Mana — chacune expliquée, pas seulement nommée. */
const PORTES: { nom: string; etat: string; mot: string; href?: string; ici?: boolean; bientot?: boolean }[] = [
  { nom: 'Mana Family', etat: 'vous y êtes', mot: 'La maison de votre famille : partager un moment, veiller sur les autres, garder la mémoire vivante.', ici: true },
  { nom: 'Mana Home', etat: 'le site', mot: 'La porte publique de la maison. Pour découvrir ce qu’est Mana Family et le faire connaître autour de vous.', href: 'https://manahome.org' },
  { nom: 'La Constitution numérique', etat: 'nos engagements', mot: 'Ce que nous refuserons toujours de faire : capter votre attention, vous culpabiliser, vendre vos données, effacer votre mémoire.', href: 'https://constitution.manahome.org' },
  { nom: 'Alliance Mana', etat: 'l’association', mot: 'L’association qui porte la maison Mana en France — qui nous sommes, ce que nous construisons.', href: 'https://www.manafrance.org' },
  { nom: 'Mana citoyen', etat: 'territoires', mot: 'Actions territoriales, entraides, bénévolat.', href: 'https://www.manafrance.org' },
  { nom: 'TempoSystem', etat: 'le moteur', mot: 'La comptabilité discrète du temps que les êtres humains se consacrent. Elle travaille en coulisse ; vous ne la voyez jamais.', href: 'https://temposystem.eu' },
]

/** L'univers Mana — pleine page : l'assistante, les questions douces, les portes de la maison. */
/** Nous écrire — formulaire de contact (Web3Forms → contact@manahome.org).
    Éléments natifs de l'app → thème jour/nuit automatique. */
function NousEcrire() {
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok?: boolean }>({ msg: '' })
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setSending(true)
    setStatus({ msg: 'Envoi…' })
    const data = Object.fromEntries(new FormData(form).entries())
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      })
      const r = await res.json()
      if (r.success) { setStatus({ msg: 'Merci ! Votre message est envoyé. 🌱', ok: true }); form.reset() }
      else setStatus({ msg: 'Oups — une erreur est survenue.' })
    } catch { setStatus({ msg: 'Erreur réseau, réessayez.' }) }
    finally { setSending(false) }
  }
  return (
    <section className="assistante-bloc">
      <h2>Nous écrire</h2>
      <p className="faq-r">Une question, une idée, un souci&nbsp;? Écrivez-nous — nous lisons tout.</p>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="access_key" value="6b87a2f3-2183-40e6-befe-23fd66944144" />
        <input type="hidden" name="subject" value="Message via Mana Family (l'app)" />
        <input type="checkbox" name="botcheck" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
        <input name="name" required placeholder="Votre nom" />
        <input name="email" type="email" required placeholder="Votre e-mail" style={{ marginTop: '0.8rem' }} />
        <textarea name="message" required placeholder="Votre message…" />
        <button type="submit" className="primary" disabled={sending} style={{ marginTop: '0.8rem', width: '100%' }}>
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
        {status.msg && (
          <p className="faq-r" style={{ marginTop: '0.6rem', color: status.ok ? 'var(--ensemble)' : 'var(--emotionnel)' }}>{status.msg}</p>
        )}
      </form>
    </section>
  )
}

function AssistanteVue({ me, onJardin, onParametres, onInviter, onRetour }: {
  me: Astre
  onJardin: () => void
  onParametres: () => void
  onInviter: () => void
  onRetour: () => void
}) {
  return (
    <div className="shell assistante-shell papier">
      <RetourNav onRetour={onRetour} />
      <header className="sky carnet-hero-lire">
        <p className="whisper">
          <span className="mot-famille">{nomIntime(me)}</span> · <button className="link" onClick={onJardin}>le jardin</button> · <button className="link" onClick={onParametres}>paramètres</button> · <button className="link" onClick={onInviter}>inviter</button>
        </p>
      </header>

      <section className="assistante-bloc">
        <h2>Comment ça marche ?</h2>
        <div className="faq">
          {FAQ.map((f, i) => (
            <div className="faq-item" key={i}>
              <p className="faq-q">{f.q}</p>
              <p className="faq-r">{f.r}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="assistante-bloc">
        <h2>Les formules</h2>
        <p className="whisper formules-intro">La Famille est gratuite et sans limite de membres. Le Récit et La Lignée sont à venir.</p>

        <div className="formule-actuelle">
          <span className="formule-actuelle-label">Votre formule</span>
          <span className="formule-actuelle-nom">Famille<sup className="palier-marque">✦</sup></span>
          <span className="formule-actuelle-prix">gratuite · sans limite de membres</span>
        </div>

        <div className="formule-changer">
          <button className="formule-btn" disabled>Passer au Récit · 9 €/mois</button>
          <button className="formule-btn" disabled>Passer à La Lignée · 39 €/mois</button>
          <p className="whisper formule-bientot">Le changement de formule ouvrira au lancement des paiements.</p>
        </div>

        <div className="formules-table-wrap">
          <table className="formules-table">
            <thead>
              <tr><th></th><th>Famille<span>0 €</span></th><th>Le Récit<span>9 €</span></th><th>La Lignée<span>39 €</span></th></tr>
            </thead>
            <tbody>
              <tr><td>Membres</td><td>∞</td><td>∞</td><td>∞</td></tr>
              <tr><td>Photos</td><td>compressées</td><td>moyennes</td><td>originaux</td></tr>
              <tr><td>Vidéo</td><td>—</td><td>courtes</td><td>HD/4K</td></tr>
              <tr><td>Voix · export récit</td><td>—</td><td>✓</td><td>✓</td></tr>
              <tr><td>Arbre · artefacts</td><td>—</td><td>—</td><td>✓</td></tr>
              <tr><td>MANAkids</td><td>protection</td><td>+ suivi</td><td>+ coffret</td></tr>
              <tr><td>MANAcare</td><td>✓</td><td>✓</td><td>✓</td></tr>
            </tbody>
          </table>
        </div>
        <p className="whisper formules-nb">
          <strong>MANAkids</strong> — l’espace des plus jeunes&nbsp;: leurs souvenirs sont protégés et leur accès veillé, un garde-fou toujours actif et gratuit. Le premium ajoute le suivi et, à la majorité, un coffret de souvenirs.
        </p>
        <p className="whisper formules-nb">
          <strong>MANAcare</strong> — le pont du soin&nbsp;: un proche aidant ou un soignant peut déposer un mot dans le carnet sans jamais lire la mémoire de la famille. Gratuit pour tous.
        </p>
      </section>

      <section className="assistante-bloc">
        <h2>Les portes de la maison Mana</h2>
        <ul className="portes">
          {PORTES.map((p) => {
            const contenu = (
              <>
                <span className="porte-tete">
                  <span className="porte-nom">{p.nom}</span>
                  <span className="porte-mot">{p.etat}{p.href ? ' →' : ''}</span>
                </span>
                <span className="porte-desc">{p.mot}</span>
              </>
            )
            return (
              <li className={`porte ${p.ici ? 'ici' : ''} ${p.bientot ? 'bientot' : ''}`} key={p.nom}>
                {p.href
                  ? <a href={p.href} target="_blank" rel="noopener">{contenu}</a>
                  : contenu}
              </li>
            )
          })}
        </ul>
      </section>

      <NousEcrire />
    </div>
  )
}

/* ---------- Le temps des astres ---------- */

function ageDe(birthDate: string): number {
  const n = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - n.getFullYear()
  if (now.getMonth() < n.getMonth() || (now.getMonth() === n.getMonth() && now.getDate() < n.getDate())) age--
  return age
}

function estAnniversaire(birthDate: string): boolean {
  const n = new Date(birthDate)
  const now = new Date()
  return n.getDate() === now.getDate() && n.getMonth() === now.getMonth()
}

function naissanceEnClair(birthDate: string): string {
  return new Date(birthDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* ---------- Les glyphes gravés — line-art, monde céleste & nautique ---------- */

function KindGlyph({ kind }: { kind: TransmissionKind }) {
  const svg = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const dot = (cx: number, cy: number, r = 1.5) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
  switch (kind) {
    case 'sante': // le pouls
      return <svg {...svg}><path d="M2 12h4l2-6 3 12 2-6h9" /></svg>
    case 'emotionnel': // le cœur
      return <svg {...svg}><path d="M12 20C3 13 6 4 12 8.5 18 4 21 13 12 20Z" /></svg>
    case 'ensemble': // une petite constellation de trois astres
      return <svg {...svg}><path d="M7 8 17 6.5 12 16 7 8Z" />{dot(7, 8)}{dot(17, 6.5)}{dot(12, 16)}</svg>
    case 'accompagner': // le chemin, à deux
      return <svg {...svg}><path d="M4 18C9 18 9 9 14 9 18 9 18 6 20 6" />{dot(4, 18, 1.4)}{dot(20, 6, 1.4)}</svg>
    case 'organiser': // la boussole
      return <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7.5 14 12 12 16.5 10 12Z" />{dot(12, 12, 0.9)}</svg>
    case 'souvenir': // l'ancre — ce qui nous retient à ce qui compte
      return <svg {...svg}><circle cx="12" cy="5" r="2" /><path d="M12 7v12" /><path d="M8.5 10.5h7" /><path d="M5 14c0 4 3.5 5.5 7 5.5s7-1.5 7-5.5" /></svg>
    default:
      return <svg {...svg}>{dot(12, 12, 2)}</svg>
  }
}

/** Le sablier — les archives du carnet (réglages, tri, recherche). */
function SablierGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="3" x2="18" y2="3" />
      <line x1="6" y1="21" x2="18" y2="21" />
      <path d="M8 3v3l4 6 4-6V3" />
      <path d="M8 21v-3l4-6 4 6v3" />
    </svg>
  )
}

type Phase =
  | { ecran: 'chargement' }
  | { ecran: 'vitrine' }
  | { ecran: 'compte' }
  | { ecran: 'porte' }
  | { ecran: 'fondation' }
  | { ecran: 'choisir-moi'; nom: string; brouillon: AstreDraft[] }
  | { ecran: 'rejoindre'; retour?: 'jardin' }
  | { ecran: 'hisser' }
  | { ecran: 'ciel' }
  | { ecran: 'chronologie' }
  | { ecran: 'galaxie' }
  | { ecran: 'jardin' }
  | { ecran: 'inviter' }
  | { ecran: 'parametres' }
  | { ecran: 'assistante' }
  | { ecran: 'frise'; aboutId: string | null }
  | { ecran: 'composer'; aboutId?: string | null }

// Lien d'invitation par e-mail : ?clef=CODE amène directement à « Rejoindre ».
const clefUrl = new URLSearchParams(window.location.search).get('clef')

export default function App() {
  const [ciel, setCiel] = useState<CielData | null>(null)
  const [horsLigne, setHorsLigne] = useState(false)
  const [phase, setPhase] = useState<Phase>({ ecran: 'chargement' })
  const [avis, setAvis] = useState<string | null>(null)
  const heritage = useRef<Constellation | null>(chargerHeritage())

  // Un échec se dit avec des mots, jamais par un retour muet au port.
  const tenter = async (geste: () => Promise<void>) => {
    setAvis(null)
    setPhase({ ecran: 'chargement' })
    try {
      await geste()
      await rafraichir()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setAvis(`La manœuvre a échoué : ${msg}`)
      setPhase({ ecran: 'porte' })
    }
  }

  const rafraichir = async () => {
    if (!(await sessionCertifiee())) {
      setCiel(null)
      // Le premier seuil est la vitrine ; « se connecter » mène au compte.
      setPhase((p) => (p.ecran === 'compte' || p.ecran === 'vitrine' ? p : { ecran: 'vitrine' }))
      return
    }
    const r = await charger()
    setHorsLigne(r.horsLigne)
    if (r.ciel) {
      setCiel(r.ciel)
      setPhase((p) => (p.ecran === 'chargement' || p.ecran === 'porte' || p.ecran === 'compte' ? { ecran: 'ciel' } : p))
    } else {
      // Pas encore de famille : porte habituelle, sauf si on arrive par un
      // lien d'invitation (?clef=…) → droit vers « Rejoindre », la clé en main.
      const cible: Phase = clefUrl ? { ecran: 'rejoindre' } : { ecran: 'porte' }
      setPhase((p) => (p.ecran === 'chargement' || p.ecran === 'compte' ? cible : p))
    }
  }

  useEffect(() => {
    // Mode test (dev-only) : ?demo=1 ouvre l'intérieur avec une fausse famille,
    // sans auth ni base. Jamais actif en production (import.meta.env.DEV).
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
      const d = demoCiel()
      setCiel(d)
      // QA visuel dev-only : ?demo=1&ecran=porte|fondation|choisir-moi|rejoindre|hisser|…
      // saute directement sur un écran, avec des données de démo pour ceux
      // qui en réclament (parcours de fondation, hors UI en démo normale).
      const ecran = new URLSearchParams(window.location.search).get('ecran')
      if (ecran === 'choisir-moi') setPhase({ ecran, nom: d.name, brouillon: d.astres.map((a) => ({ name: a.name, role: a.role, circle: a.circle, birthDate: a.birthDate ?? null })) })
      else if (ecran) setPhase({ ecran } as Phase)
      else setPhase({ ecran: 'ciel' })
      return
    }
    rafraichir()
    const iv = setInterval(rafraichir, 30000) // marée calme : pas de temps réel frénétique
    const onVis = () => { if (document.visibilityState === 'visible') rafraichir() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', rafraichir)
    // Le retour du lien magique : dès que la session apparaît, on ouvre la maison.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') rafraichir()
    })
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', rafraichir)
      sub.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase.ecran === 'chargement') {
    return (
      <div className="shell seuil-nuit fond-maison chargement-ecran">
        <div className="chargement-cle"><img src="/mana-key.jpg" alt="Mana Family" /></div>
        <div className="chargement-spin" role="status" aria-label="Chargement…"></div>
      </div>
    )
  }

  if (phase.ecran === 'vitrine') {
    return <VitrineVue onSeConnecter={() => setPhase({ ecran: 'compte' })} />
  }

  if (phase.ecran === 'compte') {
    return <CompteVue onRetour={() => setPhase({ ecran: 'vitrine' })} />
  }

  if (phase.ecran === 'porte') {
    return (
      <Porte
        heritage={heritage.current}
        avis={avis}
        onFonder={() => setPhase({ ecran: 'fondation' })}
        onRejoindre={() => setPhase({ ecran: 'rejoindre' })}
        onHisser={() => setPhase({ ecran: 'hisser' })}
      />
    )
  }

  if (phase.ecran === 'fondation') {
    return (
      <Fondation
        onPrete={(nom, brouillon) => setPhase({ ecran: 'choisir-moi', nom, brouillon })}
        onRetour={() => setPhase({ ecran: 'porte' })}
      />
    )
  }

  if (phase.ecran === 'choisir-moi') {
    return (
      <ChoisirMoi
        nom={phase.nom}
        brouillon={phase.brouillon}
        onChoisi={(index) => tenter(() => fonder(phase.nom, phase.brouillon, index))}
        onRetour={() => setPhase({ ecran: 'fondation' })}
      />
    )
  }

  if (phase.ecran === 'rejoindre') {
    return (
      <Rejoindre
        codeInitial={clefUrl}
        onArrime={(code, astreId) => tenter(() => rejoindre(code, astreId))}
        onRetour={() => setPhase({ ecran: phase.retour === 'jardin' ? 'jardin' : 'porte' })}
      />
    )
  }

  if (phase.ecran === 'hisser' && heritage.current) {
    return (
      <Hisser
        heritage={heritage.current}
        onHisse={(meId) =>
          tenter(async () => {
            await hisser(heritage.current!, meId)
            archiverHeritage()
            heritage.current = null
          })
        }
        onRetour={() => setPhase({ ecran: 'porte' })}
      />
    )
  }

  if (!ciel) {
    return (
      <div className="shell">
        <header className="sky">
          <h1>Mana Family</h1>
          <p className="whisper">Pas de réseau, et aucune famille n'est en mémoire sur cet appareil.</p>
        </header>
      </div>
    )
  }

  const me = ciel.astres.find((a) => a.id === ciel.meId)!

  if (phase.ecran === 'composer') {
    return (
      <Composer
        ciel={ciel}
        me={me}
        aboutId={phase.aboutId ?? null}
        onDone={(t) => {
          if (t) setCiel(transmettre(ciel, t))
          setPhase({ ecran: 'ciel' })
        }}
      />
    )
  }

  if (phase.ecran === 'frise') {
    return (
      <FriseVue
        ciel={ciel}
        me={me}
        aboutId={phase.aboutId}
        onRetour={() => setPhase({ ecran: 'ciel' })}
        onEcrire={() => setPhase({ ecran: 'composer', aboutId: phase.aboutId })}
        onPortrait={(astreId, url) => setCiel(poserPortrait(ciel, astreId, url))}
        onNaissance={(astreId, date) => setCiel(poserNaissance(ciel, astreId, date))}
        onProfil={(astreId, nom, surnom, date, role, pays, codePostal) => setCiel(modifierProfil(ciel, astreId, nom, surnom, date, role, pays, codePostal))}
        onNommer={(astreId, nomDoux) => setCiel(modifierNomDoux(ciel, astreId, nomDoux))}
      />
    )
  }

  if (phase.ecran === 'galaxie') {
    return (
      <GalaxieVue
        ciel={ciel}
        onOuvrirFrise={(aboutId) => setPhase({ ecran: 'frise', aboutId })}
        onRetour={() => setPhase({ ecran: 'ciel' })}
      />
    )
  }

  if (phase.ecran === 'chronologie') {
    return (
      <ChronologieVue
        ciel={ciel}
        onOuvrirFrise={(aboutId) => setPhase({ ecran: 'frise', aboutId })}
        onRetour={() => setPhase({ ecran: 'ciel' })}
      />
    )
  }

  if (phase.ecran === 'jardin') {
    return (
      <JardinVue
        onActiver={(id) => tenter(() => activerGalaxie(id))}
        onRejoindreAutre={() => setPhase({ ecran: 'rejoindre', retour: 'jardin' })}
        onRetour={() => setPhase({ ecran: 'ciel' })}
      />
    )
  }

  if (phase.ecran === 'inviter') {
    return (
      <Inviter
        ciel={ciel}
        me={me}
        onChangerAstre={async (astreId) => {
          setPhase({ ecran: 'chargement' })
          await rejoindre(ciel.inviteCode, astreId)
          await rafraichir()
          setPhase({ ecran: 'ciel' })
        }}
        onRetour={() => setPhase({ ecran: 'ciel' })}
      />
    )
  }

  if (phase.ecran === 'parametres') {
    return (
      <ParametresVue
        me={me}
        onRetour={() => setPhase({ ecran: 'ciel' })}
        onCalendriers={(calendarIds) => setCiel(modifierCalendriers(ciel, me.id, calendarIds))}
        onDeconnexion={async () => { await seDeconnecter(); setCiel(null); setPhase({ ecran: 'vitrine' }) }}
      />
    )
  }

  if (phase.ecran === 'assistante') {
    return (
      <AssistanteVue
        me={me}
        onJardin={() => setPhase({ ecran: 'jardin' })}
        onParametres={() => setPhase({ ecran: 'parametres' })}
        onInviter={() => setPhase({ ecran: 'inviter' })}
        onRetour={() => setPhase({ ecran: 'ciel' })}
      />
    )
  }

  return (
    <CielVue
      ciel={ciel}
      horsLigne={horsLigne}
      onOuvrirFrise={(aboutId) => setPhase({ ecran: 'frise', aboutId })}
      onTransmettre={() => setPhase({ ecran: 'composer' })}
      onGalaxie={() => setPhase({ ecran: 'galaxie' })}
      onChronologie={() => setPhase({ ecran: 'chronologie' })}
      onAssistante={() => setPhase({ ecran: 'assistante' })}
    />
  )
}

/* ---------- La vitrine — le premier seuil, avant toute connexion ---------- */

/** Ce que la maison promet — trois lignes de confiance, pas des arguments de vente. */
const PROMESSES: { glyphe: string; mot: string }[] = [
  { glyphe: '🔒', mot: 'Rien n’est public. Seulement votre famille voit vos moments.' },
  { glyphe: '🔒', mot: 'Rien n’est vendu. Vos souvenirs ne servent à rien d’autre qu’à vous relier.' },
  { glyphe: '🔒', mot: 'Rien ne s’efface. Ce qui est transmis reste, gardé pour ceux qui viennent.' },
]

/** Les deux piliers — la doctrine Présence / Mémoire, dite simplement,
    chacune portée par son illustration dorée. */
const PILIERS: { titre: string; mot: string; illus?: string; lien?: string; lienHref?: string }[] = [
  {
    titre: 'La Présence fait vivre.\nLa Mémoire fait durer.',
    illus: '/plume.jpg',
    mot: 'Notre vision, en clair :\nce que nous protégeons,\net ce que nous vous offrons.',
    lien: 'Lire le Livre blanc →',
    lienHref: '/livre-blanc.html',
  },
  { titre: '', illus: '/carnet.jpg', mot: '' },
]

/** La clé-cadenas de « Entrer » — le verrou de la maison, où se glisse la clé. */
function LockKeyGlyph() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.4" />
      <path d="M8 10.5V7.4a4 4 0 0 1 8 0v3.1" />
      <circle cx="12" cy="14.7" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 16.2v2.1" />
    </svg>
  )
}

/** Le header fixe de l'univers — MANAfamily centré, sur le ciel étoilé. */
function ManaHeader() {
  return (
    <header className="vitrine-topbar">
      <span className="vitrine-eyebrow vitrine-marque">MANAfamily</span>
    </header>
  )
}

function VitrineVue({ onSeConnecter }: { onSeConnecter: () => void }) {
  return (
    <div className="shell vitrine-shell seuil-nuit fond-maison">
      <ManaHeader />
      <div className="vitrine-bottombar">
        <button className="vitrine-entrer-bas" onClick={onSeConnecter} aria-label="Se connecter avec votre clé">
          <span className="vitrine-entrer-mot">Entrer</span>
          <LockKeyGlyph />
        </button>
      </div>
      <div className="ciel-anime" aria-hidden="true">
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className="etoile-s"
            style={{
              left: `${((i * 61) % 96) + 2}%`,
              top: `${((i * 37) % 44) + 3}%`,
              animationDelay: `${(i % 5) * 0.7}s`,
              animationDuration: `${2.6 + (i % 4) * 0.6}s`,
            }}
          />
        ))}
      </div>
      <header className="sky vitrine-hero">
        <img className="vitrine-hero-cle" src="/mana-key.jpg" alt="La clef de la maison Mana" />
      </header>

      <section className="vitrine-piliers">
        {PILIERS.map((p) => (
          <div className="vitrine-pilier" key={p.illus}>
            {p.illus && <img className="vitrine-pilier-illus" src={p.illus} alt="" aria-hidden="true" />}
            {p.titre && <span className="vitrine-pilier-titre">{p.titre}</span>}
            {p.mot && <p>{p.mot}</p>}
            {p.lien && (
              <a className="vitrine-livre-lien vitrine-pilier-lien" href={p.lienHref} target="_blank" rel="noopener">
                {p.lien}
              </a>
            )}
          </div>
        ))}
      </section>

      <section className="vitrine-pied">
        <div className="vitrine-serment">
          <h2 className="vitrine-serment-titre">Votre Carnet de Famille</h2>
          <div className="vitrine-promesses">
            {PROMESSES.map((p) => (
              <p className="vitrine-promesse" key={p.mot}>
                <span className="vitrine-promesse-glyphe" aria-hidden="true">{p.glyphe}</span>
                <span>{p.mot}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      <footer className="vitrine-footer">
        <div className="vitrine-securite" aria-label="Nos garanties">
          <span className="vitrine-securite-item"><span className="vitrine-securite-glyphe" aria-hidden="true">🔒</span> Privé</span>
          <span className="vitrine-securite-item"><span className="vitrine-securite-glyphe" aria-hidden="true">🛡️</span> Protégé</span>
          <span className="vitrine-securite-item"><span className="vitrine-securite-glyphe" aria-hidden="true">🔐</span> Chiffré</span>
          <span className="vitrine-securite-item"><span className="vitrine-securite-glyphe" aria-hidden="true">🚫</span> Sans publicité</span>
        </div>
        <span>propulsé par <b>TEMPOsystem</b></span>
        <span className="vitrine-footer-legal">© 2026 · Tous droits réservés</span>
      </footer>
    </div>
  )
}

/* ---------- Le compte — e-mail certifié par code, identité durable ---------- */

function CompteVue({ onRetour }: { onRetour: () => void }) {
  const [etape, setEtape] = useState<'email' | 'envoye'>('email')
  const [mode, setMode] = useState<'lien' | 'motdepasse'>('lien')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const emailValide = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())

  const demander = async () => {
    setErreur(null); setOccupe(true)
    try {
      await envoyerLien(email)
      setEtape('envoye')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally { setOccupe(false) }
  }

  const entrerAvecMotDePasse = async () => {
    setErreur(null); setOccupe(true)
    try {
      await connexionMotDePasse(email, motDePasse)
      // La session s'ouvre : onAuthStateChange rafraîchit et ouvre la maison.
    } catch {
      setErreur("E-mail ou mot de passe incorrect — ou aucun mot de passe défini. Vous pouvez recevoir un lien à la place.")
    } finally { setOccupe(false) }
  }

  return (
    <div className="shell seuil-nuit fond-maison">
      <RetourNav onRetour={onRetour} />
      <header className="sky porte-sky">
        <div className="clef-embleme cadre-or">
          <img src="/mana-key.jpg" alt="La clef de la maison Mana" />
        </div>
        <h1>Mana Family</h1>
        <p className="whisper">La Présence fait vivre. La Mémoire fait durer.</p>
      </header>

      <section className="card compte-card">
        {etape === 'email' ? (
          <>
            <h2>Entrer dans la maison</h2>
            <p className="whisper compte-mot">Votre e-mail — pour créer votre accès, ou vous reconnecter. Nous vous envoyons un lien : un clic, et vous êtes chez vous.</p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="votre@email.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'lien' && emailValide && !occupe) demander() }}
              aria-label="Votre e-mail"
            />
            {mode === 'motdepasse' && (
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Votre mot de passe"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && emailValide && motDePasse && !occupe) entrerAvecMotDePasse() }}
                aria-label="Votre mot de passe"
              />
            )}
            {mode === 'lien' ? (
              <button className="primary" disabled={!emailValide || occupe} onClick={demander}>
                {occupe ? 'Envoi…' : 'Recevoir mon lien'}
              </button>
            ) : (
              <button className="primary" disabled={!emailValide || !motDePasse || occupe} onClick={entrerAvecMotDePasse}>
                {occupe ? 'Connexion…' : 'Se connecter'}
              </button>
            )}

            <div className="compte-options">
              <button className="link" onClick={() => { setErreur(null); setNote(null); setMode(mode === 'lien' ? 'motdepasse' : 'lien') }}>
                {mode === 'lien' ? 'Se connecter avec un mot de passe' : 'Recevoir plutôt un lien magique'}
              </button>
              <button className="link compte-manaid" onClick={() => { setErreur(null); setNote('MANA ID arrive bientôt — un seul compte pour tout l’univers Mana.') }}>
                Se connecter avec MANA ID <span className="compte-bientot">bientôt</span>
              </button>
            </div>
            {note && <p className="whisper compte-note">{note}</p>}
          </>
        ) : (
          <>
            <h2>Regardez vos e-mails</h2>
            <p className="whisper compte-mot">Un lien est parti vers <b>{email}</b>. Ouvrez votre boîte, cliquez le lien — vous reviendrez ici, connecté. (Pensez aux indésirables.)</p>
            <p className="whisper" style={{ textAlign: 'center', marginTop: '0.4rem' }}>
              <button className="link" onClick={() => { setEtape('email'); setErreur(null) }}>changer d'e-mail</button>
              {' · '}
              <button className="link" onClick={demander} disabled={occupe}>{occupe ? 'envoi…' : 'renvoyer le lien'}</button>
            </p>
          </>
        )}
        {erreur && <p className="whisper compte-erreur">{erreur}</p>}
      </section>
    </div>
  )
}

/* ---------- La porte — fonder, rejoindre, ou hisser l'héritage ---------- */

function Porte({ heritage, avis, onFonder, onRejoindre, onHisser }: {
  heritage: Constellation | null
  avis: string | null
  onFonder: () => void
  onRejoindre: () => void
  onHisser: () => void
}) {
  return (
    <div className="shell seuil-nuit fond-maison">
      <header className="sky porte-sky">
        <h1>MANAfamily</h1>
        <p className="whisper slogan-marelle">La Présence fait vivre. La Mémoire fait durer.</p>
      </header>
      {avis && <section className="card"><p className="whisper" style={{ margin: 0 }}>{avis}</p></section>}
      <section className="card">
        {heritage && (
          <button className="primary btn-marelle" onClick={onHisser}>
            Ouvrir « {heritage.name} » dans la famille
          </button>
        )}
        <button className={`btn-marelle ${heritage ? '' : 'primary'}`} style={{ width: '100%', marginTop: '0.8rem', padding: '0.85rem' }} onClick={onFonder}>
          Fonder une famille
        </button>
        <button className="btn-marelle" style={{ width: '100%', marginTop: '0.8rem', padding: '0.85rem' }} onClick={onRejoindre}>
          Rejoindre avec une clé
        </button>
      </section>
    </div>
  )
}

/* ---------- Fondation du Cercle ---------- */

function Fondation({ onPrete, onRetour }: { onPrete: (nom: string, brouillon: AstreDraft[]) => void; onRetour: () => void }) {
  const [name, setName] = useState('')
  const [astres, setAstres] = useState<AstreDraft[]>([])
  const [draft, setDraft] = useState('')
  const [role, setRole] = useState<Role>('parent')
  const [naissance, setNaissance] = useState('')

  const add = () => {
    if (!draft.trim() || !naissance) return
    const meta = ROLES.find((r) => r.role === role)!
    setAstres([...astres, { name: draft.trim(), role, circle: meta.circle, birthDate: naissance }])
    setDraft('')
    setNaissance('')
    setRole('parent')
  }

  return (
    <div className="shell seuil-nuit fond-maison fondation-shell">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>MANAfamily</h1>
        <p className="whisper slogan-marelle">La Présence fait vivre. La Mémoire fait durer.</p>
      </header>

      <section className="card">
        <h2>Fonder la famille</h2>
        <input placeholder="Nom de Famille (Ex. Dubois)" value={name} onChange={(e) => setName(e.target.value)} />

        <h2>Les membres de la famille</h2>
        <input
          className="fondation-champ"
          placeholder="Prénom"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <select className="fondation-champ" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r.role} value={r.role}>{r.label}</option>
          ))}
        </select>
        <input type="date" className="fondation-champ" value={naissance} onChange={(e) => setNaissance(e.target.value)} aria-label="Date de naissance" required />
        <p className="whisper naissance-note">pour les anniversaires et l'arbre — obligatoire</p>
        <button onClick={add} disabled={!draft.trim() || !naissance} className="fondation-ajout">Ajouter ce membre ✦</button>

        <ul className="astre-list">
          {astres.map((a, i) => (
            <li key={i}>
              <span className="astre-dot" /> {a.name}{' '}
              <em>· {ROLES.find((r) => r.role === a.role)?.label}{a.birthDate ? ` · ${naissanceEnClair(a.birthDate)}` : ''}</em>
            </li>
          ))}
        </ul>

        <button className="primary btn-marelle" disabled={!name.trim() || astres.length < 2} onClick={() => onPrete(name.trim(), astres)}>
          Créer la famille
        </button>
      </section>
    </div>
  )
}

function ChoisirMoi({ nom, brouillon, onChoisi, onRetour }: { nom: string; brouillon: AstreDraft[]; onChoisi: (index: number) => void; onRetour: () => void }) {
  return (
    <div className="shell seuil-nuit fond-maison">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>Famille {nom}</h1>
        <p className="whisper">Et toi, qui es-tu dans la famille ?</p>
      </header>
      <div className="astre-grid">
        {brouillon.map((a, i) => (
          <button key={i} className="astre-pick" onClick={() => onChoisi(i)}>
            <span className="astre-dot" />
            {a.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- Rejoindre avec la clé de la maison ---------- */

function Rejoindre({ codeInitial, onArrime, onRetour }: { codeInitial?: string | null; onArrime: (code: string, astreId: string) => void; onRetour: () => void }) {
  const [code, setCode] = useState(codeInitial ?? '')
  const [astres, setAstres] = useState<Astre[] | null>(null)
  const [erreur, setErreur] = useState('')

  const chercher = async (c: string) => {
    if (!c) return
    setErreur('')
    try {
      const a = await astresDe(c)
      if (a.length === 0) setErreur('Clé inconnue — vérifie auprès de la famille.')
      else setAstres(a)
    } catch {
      setErreur('Le réseau est agité — réessaie dans un instant.')
    }
  }

  // Lien d'invitation (?clef=…) : la clé est déjà là, on charge la famille.
  useEffect(() => { if (codeInitial) chercher(codeInitial) }, [])

  return (
    <div className="shell seuil-nuit fond-maison">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>Rejoindre</h1>
      </header>
      <section className="card">
        <h2>La clé de la famille</h2>
        <div className="row">
          <input placeholder="ex. 3f9a1c2e" value={code} onChange={(e) => setCode(e.target.value.trim().toLowerCase())} />
          <button onClick={() => chercher(code)}>Ouvrir</button>
        </div>
        {erreur && <p className="whisper">{erreur}</p>}
        {astres && (
          <>
            <h2>Qui es-tu dans la famille ?</h2>
            <div className="astre-grid">
              {astres.map((a) => (
                <button key={a.id} className="astre-pick" onClick={() => onArrime(code, a.id)}>
                  <span className="astre-dot" />
                  {a.name}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/* ---------- Ouvrir l'héritage local dans la famille ---------- */

function Hisser({ heritage, onHisse, onRetour }: { heritage: Constellation; onHisse: (meId: string) => void; onRetour: () => void }) {
  return (
    <div className="shell seuil-nuit fond-maison">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>Famille {heritage.name}</h1>
        <p className="whisper">
          {heritage.transmissions.length} transmission{heritage.transmissions.length > 1 ? 's' : ''} rejoindr{heritage.transmissions.length > 1 ? 'ont' : 'a'} la famille, dates et lueurs préservées.
        </p>
      </header>
      <section className="card">
        <h2>Et toi, qui es-tu dans la famille ?</h2>
        <div className="astre-grid">
          {heritage.astres.map((a) => (
            <button key={a.id} className="astre-pick" onClick={() => onHisse(a.id)}>
              <span className="astre-dot" />
              {a.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ---------- Le Ciel ---------- */

/** L'État du Ciel — plusieurs états peuvent coexister et s'empiler (max 3),
    du plus factuel (anniversaire) au plus doux (l'heure). */
function etatsDuCiel(c: CielData): string[] {
  const out: string[] = []
  // Les anniversaires passent avant tout — un fait du calendrier, jamais une relance.
  for (const a of c.astres) {
    if (a.birthDate && estAnniversaire(a.birthDate)) {
      const age = ageDe(a.birthDate)
      out.push(`C'est l'anniversaire de ${nomIntime(a)} — ${age} an${age > 1 ? 's' : ''} aujourd'hui. ✦`)
    }
  }
  if (c.transmissions.length === 0) {
    if (out.length === 0) out.push('Votre famille attend sa première page.')
    return out.slice(0, 3)
  }
  const derniere = new Date(c.transmissions[0].createdAt).getTime()
  const repos = Date.now() - derniere > 72 * 3600 * 1000
  // Quelqu'un est veillé
  const veillee = c.transmissions.find((t) => Object.keys(t.veilles).length > 0 && t.aboutId)
  if (veillee) {
    const astre = c.astres.find((a) => a.id === veillee.aboutId)
    if (astre) out.push(`La famille veille sur ${nomIntime(astre)}.`)
  }
  // Le dernier geste est un souvenir
  if (c.transmissions[0].kind === 'souvenir') out.push('Un souvenir a été déposé dans le cercle.')
  // À défaut d'événement, une phrase de fond (repos, puis l'heure).
  if (out.length === 0) {
    if (repos) out.push('La famille se repose.')
    else {
      const h = new Date().getHours()
      if (h < 6) out.push('La nuit veille avec vous.')
      else if (h < 12) out.push('Le jour se lève sur votre famille.')
      else if (h < 18) out.push('Tout est paisible à la maison.')
      else out.push('Douceur sur votre famille ce soir.')
    }
  }
  return out.slice(0, 3)
}

// Le livre ne s'ouvre qu'une fois par session — quand on entre dans la maison,
// pas à chaque retour à l'accueil.
let livreDejaOuvert = false

/* Le médium d'une transmission — pour le filtre du carnet. Aujourd'hui seule
   la photo existe dans les données ; audio/vidéo/musique sont prêts à filtrer
   dès que ces pièces jointes arriveront. */
type Medium = 'photo' | 'audio' | 'video' | 'musique' | 'lien'
const MEDIUMS: { id: Medium; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Vidéo' },
  { id: 'musique', label: 'Musique' },
  { id: 'lien', label: 'Lien' },
]
function mediumDe(t: Transmission): Medium | null {
  if (t.imageUrl) return 'photo'
  if (t.audioUrl) return 'audio'
  if (t.videoUrl) return 'video'
  if (t.musicUrl) return 'musique'
  if (t.linkUrl) return 'lien'
  return null
}

// Les périodes pour trier/filtrer le carnet (jours = null → tout).
type Periode = 'tout' | 'semaine' | 'mois' | 'annee'
const PERIODES: { id: Periode; label: string; jours: number | null }[] = [
  { id: 'tout', label: 'Tout', jours: null },
  { id: 'semaine', label: 'Cette semaine', jours: 7 },
  { id: 'mois', label: 'Ce mois', jours: 31 },
  { id: 'annee', label: 'Cette année', jours: 365 },
]

// Recherche précise d'un moment : un jour, un mois ou une année donnés.
type RechMode = 'aucune' | 'jour' | 'mois' | 'annee'
const RECH_MODES: { m: RechMode; label: string }[] = [
  { m: 'aucune', label: 'Aucune' },
  { m: 'jour', label: 'Un jour' },
  { m: 'mois', label: 'Un mois' },
  { m: 'annee', label: 'Une année' },
]

/** L'État du Ciel — une à trois phrases empilées, composées à la machine
    à écrire (SF Mono), l'une après l'autre. Le curseur suit la frappe puis
    reste, calme, à la fin. `rejouer` (incrémenté au clic sur « Famille »)
    relance la composition depuis le début. */
function EtatCiel({ textes, onClick, rejouer }: { textes: string[]; onClick: () => void; rejouer: number }) {
  const plein = textes.join('\n')
  const reduit = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [n, setN] = useState(reduit ? plein.length : 0)
  useEffect(() => {
    if (reduit) { setN(plein.length); return }
    setN(0)
    const id = window.setInterval(() => {
      setN((k) => {
        if (k >= plein.length) { window.clearInterval(id); return k }
        return k + 1
      })
    }, 45)
    return () => window.clearInterval(id)
  }, [plein, reduit, rejouer])
  // On répartit les caractères déjà tapés ligne par ligne, pour l'empilement.
  const vues: string[] = []
  let reste = n
  for (const t of textes) {
    const pris = Math.max(0, Math.min(t.length, reste))
    vues.push(t.slice(0, pris))
    reste -= t.length + 1 // +1 pour le saut de ligne consommé
  }
  const derniereVisible = vues.reduce((acc, v, i) => (v.length > 0 ? i : acc), 0)
  return (
    <button className="etat-ciel" onClick={onClick} aria-label={textes.join(' · ')}>
      {vues.map((v, i) => (
        <span className="etat-ligne" key={i}>
          {v}
          {i === derniereVisible && <span className="etat-curseur" aria-hidden="true">▋</span>}
        </span>
      ))}
    </button>
  )
}

function CielVue({ ciel, horsLigne, onOuvrirFrise, onTransmettre, onGalaxie, onChronologie, onAssistante }: {
  ciel: CielData
  horsLigne: boolean
  onOuvrirFrise: (aboutId: string | null) => void
  onTransmettre: () => void
  onGalaxie: () => void
  onChronologie: () => void
  onAssistante: () => void
}) {
  const n = ciel.astres.length
  // Familles nombreuses : au-delà de 12 astres, on n'affiche que l'initiale
  // sous chaque étoile pour garder un ciel lisible (nom complet au toucher / aria).
  const initialesSeules = n > 12
  const halos = new Set(
    ciel.transmissions.filter((t) => t.aboutId && Object.keys(t.veilles).length > 0).map((t) => t.aboutId as string),
  )
  // Géographie FIXE de la constellation : MOI au centre, puis deux anneaux —
  // la famille proche (cercles 1-2) sur l'anneau interne, la famille étendue
  // (cercle 3) sur l'anneau externe (2× le diamètre).
  const CENTRE_X = 50, CENTRE_Y = 47
  const R_PROCHE = 19
  const posDe = new Map<string, { left: number; top: number }>()
  posDe.set(ciel.meId, { left: CENTRE_X, top: CENTRE_Y })
  const placerAnneau = (liste: Astre[], rayon: number) => {
    liste.forEach((a, k) => {
      const g = [...a.id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 9973, 7)
      const angle = (k / Math.max(1, liste.length)) * 2 * Math.PI - Math.PI / 2 + ((g % 100) / 100 - 0.5) * 0.35
      posDe.set(a.id, {
        left: CENTRE_X + rayon * Math.cos(angle) + ((g % 9) - 4) * 0.5,
        top: CENTRE_Y + rayon * 0.82 * Math.sin(angle) + ((g % 11) - 5) * 0.5,
      })
    })
  }
  const autres = ciel.astres.filter((a) => a.id !== ciel.meId)
  placerAnneau(autres.filter((a) => a.circle <= 2), R_PROCHE)        // famille proche (diamètre 1)
  placerAnneau(autres.filter((a) => a.circle >= 3), R_PROCHE * 2)    // famille étendue (diamètre 2)

  // Vrai au tout premier affichage de l'accueil : le livre s'ouvre en fondu.
  const [ouverture] = useState(() => { const premier = !livreDejaOuvert; livreDejaOuvert = true; return premier })

  // Cliquer « Famille » relance la composition de l'État du Ciel.
  const [rejouer, setRejouer] = useState(0)

  return (
    <div className="shell foyer">
      <div className="foyer-fond" aria-hidden="true" />
      {ouverture && <div className="foyer-fond-ferme" aria-hidden="true" />}
      <ManaHeader />
      <header className="sky sky-sous-header">
        <h1 className="titre-foyer">
          <button className="titre-lien" onClick={() => setRejouer((x) => x + 1)} aria-label="Relire l'état du ciel">
            <span className="mot-famille">Famille<sup className="palier-marque" title="Formule Famille — gratuite">✦</sup></span>
          </button>
          {' '}
          <button className="titre-lien" onClick={onGalaxie} aria-label="Les générations">
            <span className="nom-famille">{ciel.name}</span>
          </button>
        </h1>
        {horsLigne && <p className="whisper">hors réseau — les gestes attendent</p>}
      </header>

      <div className="ciel">
        {ciel.astres.map((a, i) => {
          const { left, top } = posDe.get(a.id) ?? { left: CENTRE_X, top: CENTRE_Y }
          return (
            <button
              key={a.id}
              className={`astre-ciel ${halos.has(a.id) ? 'halo' : ''} ${a.avatarUrl ? 'astre-avec-photo' : ''}`}
              style={{ left: `${left}%`, top: `${top}%`, animationDuration: `${9 + (i % 5) * 1.7}s`, animationDelay: `${-(i * 2.3)}s` }}
              aria-label={nomIntime(a)}
              onClick={() => onOuvrirFrise(a.id)}
            >
              <span className="astre-core">
                {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="astre-photo" /> : <span className="astre-pure-light" />}
              </span>
              <span className={`prenom ${initialesSeules ? 'prenom-initiale' : ''}`}>{initialesSeules ? nomIntime(a).charAt(0).toUpperCase() : nomIntime(a)}</span>
            </button>
          )
        })}
      </div>

      <div className="bas-fixe">
        <EtatCiel textes={etatsDuCiel(ciel)} onClick={onChronologie} rejouer={rejouer} />

        <div className="barre-bas">
          <button className="geste" onClick={() => onOuvrirFrise(null)} aria-label="Le carnet de famille — lire">
            <span className="geste-rond geste-visage"><img src="/carnet.jpg" alt="" /><span className="geste-mot"><span className="geste-mot-txt">lire</span></span></span>
          </button>

          <button className="geste geste-ecrire" onClick={onTransmettre} aria-label="Transmettre — écrire">
            <span className="geste-rond geste-mandala"><img src="/plume.jpg" alt="" /><span className="geste-mot"><span className="geste-mot-txt">écrire</span></span></span>
          </button>

          <button className="geste" onClick={onAssistante} aria-label="L'univers Mana — découvrir">
            <span className="geste-rond geste-visage"><img src="/mana-key.jpg" alt="" /><span className="geste-mot"><span className="geste-mot-txt">découvrir</span></span></span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Paramètres personnels ---------- */

function ParametresVue({ me, onRetour, onCalendriers, onDeconnexion }: {
  me: Astre
  onRetour: () => void
  onCalendriers: (calendarIds: CalendarLayerId[]) => void
  onDeconnexion: () => void
}) {
  const actifs = new Set(me.calendarIds ?? [])
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => { monEmail().then(setEmail) }, [])
  const toggle = (id: CalendarLayerId) => {
    const next = new Set(actifs)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onCalendriers(CALENDAR_LAYERS.filter((c) => next.has(c.id)).map((c) => c.id))
  }

  return (
    <div className="shell papier">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>Paramètres</h1>
      </header>

      <section className="card">
        <h2>Mon compte</h2>
        <p className="whisper">Connecté{email ? <> en tant que <b>{email}</b></> : ''} — votre accès à la famille vous suit d'un appareil à l'autre.</p>
        <button onClick={onDeconnexion} style={{ marginTop: '0.6rem' }}>Se déconnecter</button>
      </section>

      <section className="card">
        <h2>Mes calendriers</h2>
        <p className="calendar-principle">Le temps est commun. Les calendriers sont personnels. MANA n’impose aucune tradition.</p>
        <p className="whisper">Ces calendriers sont des couches personnelles : ils n'activent rien pour la famille et ne changent pas le protocole MANA.</p>

        <div className="calendar-list">
          {CALENDAR_LAYERS.map((layer) => (
            <label key={layer.id} className="calendar-option">
              <input
                type="checkbox"
                checked={actifs.has(layer.id)}
                onChange={() => toggle(layer.id)}
              />
              <span>{layer.label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ---------- La galaxie — les générations de la famille ---------- */

const GENERATIONS: { nom: string; roles: Role[] }[] = [
  { nom: 'Les aînés', roles: ['grand_parent'] },
  { nom: 'Les parents', roles: ['parent', 'soutien'] },
  { nom: 'Les enfants', roles: ['enfant'] },
  { nom: 'La famille étendue', roles: ['famille'] },
]

function GalaxieVue({ ciel, onOuvrirFrise, onRetour }: {
  ciel: CielData
  onOuvrirFrise: (aboutId: string) => void
  onRetour: () => void
}) {
  const parDate = (a: Astre, b: Astre) => {
    if (a.birthDate && b.birthDate) return a.birthDate.localeCompare(b.birthDate)
    if (a.birthDate) return -1
    if (b.birthDate) return 1
    return a.name.localeCompare(b.name)
  }

  return (
    <div className="shell papier">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1 className="galaxie-titre">Les générations</h1>
        <p className="whisper">les générations, des aînés aux enfants</p>
      </header>

      {GENERATIONS.map((g) => {
        const rang = ciel.astres.filter((a) => g.roles.includes(a.role)).sort(parDate)
        if (rang.length === 0) return null
        return (
          <section className="galaxie-etage" key={g.nom}>
            <span className="etage-nom">{g.nom}</span>
            <div className="galaxie-rang">
              {rang.map((a) => (
                <button key={a.id} className="astre-fixe" onClick={() => onOuvrirFrise(a.id)}>
                  <span className="astre-core">
                    {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="astre-photo" /> : <span className="astre-pure-light" />}
                  </span>
                  <span className="prenom">{nomIntime(a)}</span>
                  <span className="naissance">
                    {a.birthDate
                      ? `${naissanceEnClair(a.birthDate)} · ${ageDe(a.birthDate)} an${ageDe(a.birthDate) > 1 ? 's' : ''}${estAnniversaire(a.birthDate) ? ' ✦' : ''}`
                      : '—'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* ---------- La chronologie — le fil du temps de la famille ---------- */

const UN_JOUR = 86400000

function ChronologieVue({ ciel, onOuvrirFrise, onRetour }: {
  ciel: CielData
  onOuvrirFrise: (aboutId: string | null) => void
  onRetour: () => void
}) {
  const scroll = useRef<HTMLDivElement>(null)
  const now = Date.now()

  const items = ciel.transmissions
    .map((t) => ({ t, ms: new Date(t.happensOn ?? t.createdAt).getTime(), date: t.happensOn ?? t.createdAt }))
    .sort((a, b) => a.ms - b.ms)

  const tous = [now, ...items.map((i) => i.ms)]
  const min = Math.min(...tous) - 10 * UN_JOUR
  const max = Math.max(...tous) + 10 * UN_JOUR
  const jours = Math.max(1, (max - min) / UN_JOUR)
  const largeur = Math.min(5200, Math.max(660, jours * 18))
  const posX = (ms: number) => ((ms - min) / (max - min)) * largeur

  useEffect(() => {
    const el = scroll.current
    if (el) el.scrollLeft = posX(now) - el.clientWidth / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const court = (s: string) => (s.length > 24 ? s.slice(0, 23) + '…' : s)
  const jourCourt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

  // Anti-collision : ce qui partage (à peu près) une date s'empile de part et
  // d'autre de l'horizon, au lieu de se chevaucher.
  const SEUIL = 100, RANGEE = 64, ECART = 16
  let clusterX = -Infinity, rang = 0
  const places = items.map((it) => {
    const x = posX(it.ms)
    if (x - clusterX >= SEUIL) { clusterX = x; rang = 0 } else { rang += 1 }
    const haut = rang % 2 === 0
    const offset = ECART + Math.floor(rang / 2) * RANGEE
    return { it, x, haut, offset, futur: it.ms > now }
  })

  return (
    <div className="shell chrono-shell papier">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>Le fil du temps</h1>
        <p className="whisper">souvenirs ← · aujourd'hui · → ce qui vient</p>
      </header>

      {items.length === 0 ? (
        <p className="empty">Le temps de la famille est encore vierge. La première transmission y déposera une étoile.</p>
      ) : (
        <div className="chrono-scroll" ref={scroll}>
          <div className="chrono-inner" style={{ width: `${largeur}px` }}>
            <div className="chrono-horizon" />
            <div className="chrono-maintenant" style={{ left: `${posX(now)}px` }}>
              <span className="chrono-maintenant-mot">aujourd'hui</span>
            </div>
            {places.map(({ it, x, haut, offset, futur }) => (
              <button
                key={it.t.id}
                className={`chrono-node ${futur ? 'futur' : ''}`}
                style={{
                  left: `${x}px`,
                  color: `var(--${it.t.kind})`,
                  ...(haut ? { bottom: `calc(50% + ${offset}px)` } : { top: `calc(50% + ${offset}px)` }),
                }}
                onClick={() => onOuvrirFrise(it.t.aboutId)}
              >
                <span className="chrono-glyph"><KindGlyph kind={it.t.kind} /></span>
                <span className="chrono-corps">{court(it.t.body)}</span>
                <span className="chrono-date">{jourCourt(it.date)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="whisper naissance-note chrono-legende">
        Chaque transmission trouve sa place dans le temps : les souvenirs derrière, ce qu'on organise devant.
        Rien ne « passe en retard » — ce qui vient rejoint doucement la mémoire.
      </p>
    </div>
  )
}

/* ---------- Le jardin — les galaxies où l'on appartient ---------- */

function JardinVue({ onActiver, onRejoindreAutre, onRetour }: {
  onActiver: (constellationId: string) => void
  onRejoindreAutre: () => void
  onRetour: () => void
}) {
  const [galaxies, setGalaxies] = useState<Galaxie[] | null>(null)
  useEffect(() => {
    mesGalaxies().then(setGalaxies).catch(() => setGalaxies([]))
  }, [])

  return (
    <div className="shell papier">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>Le jardin</h1>
        <p className="whisper">Les familles où vous comptez</p>
      </header>

      {galaxies === null ? (
        <p className="empty">Le jardin s'éveille…</p>
      ) : (
        <section className="card">
          <ul className="jardin-list">
            {galaxies.map((g) => (
              <li key={g.constellationId}>
                <button
                  className={`jardin-galaxie ${g.active ? 'active' : ''}`}
                  disabled={g.active}
                  onClick={() => onActiver(g.constellationId)}
                >
                  <span className="astre-dot" />
                  <span className="jardin-nom">Famille {g.name}</span>
                  <span className="jardin-moi">{g.active ? 'vous y êtes' : 'passer ici'} · {g.monSurnom || g.monNom}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="primary" onClick={onRejoindreAutre}>Rejoindre une autre famille</button>
          <p className="whisper naissance-note">
            Une même personne peut appartenir à plusieurs familles — deux maisons, la famille de cœur, la lignée.
            Chacune reste elle-même.
          </p>
        </section>
      )}
    </div>
  )
}

/* ---------- Inviter — la clé de la maison ---------- */

function Inviter({ ciel, me, onChangerAstre, onRetour }: {
  ciel: CielData
  me: Astre
  onChangerAstre: (astreId: string) => void
  onRetour: () => void
}) {
  const [email, setEmail] = useState('')
  const emailValide = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const lien = `${window.location.origin}/?clef=${ciel.inviteCode}`
  const envoyerParEmail = () => {
    const sujet = encodeURIComponent('Rejoignez notre famille sur MANAfamily')
    const corps = encodeURIComponent(
      `Bonjour,\n\nJe vous ouvre la porte de notre famille sur MANAfamily. Il suffit de cliquer :\n${lien}\n\n(ou d'entrer la clé « ${ciel.inviteCode} » dans l'application.)\n\nÀ bientôt à la maison.`,
    )
    window.location.href = `mailto:${email.trim()}?subject=${sujet}&body=${corps}`
  }

  return (
    <div className="shell papier inviter-shell">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>La clé de la maison</h1>
      </header>
      <section className="card" style={{ textAlign: 'center' }}>
        <div className="clef-embleme cadre-or"><img src="/mana-key.jpg" alt="La clef de la maison Mana" /></div>
        <p>Chaque proche ouvre l'application, choisit « Rejoindre avec une clé », et entre :</p>
        <p className="inviter-code">{ciel.inviteCode}</p>
        <p className="whisper slogan-marelle">La clé ne se partage qu'en famille — c'est la porte de votre maison.</p>

        <h2>Ou envoyer un lien</h2>
        <p className="whisper">Un e-mail avec le lien — le proche rejoint la maison sans saisir la clé.</p>
        <div className="row">
          <input type="email" inputMode="email" placeholder="e-mail du proche" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail du proche" />
          <button className="primary" style={{ width: 'auto', marginTop: 0 }} disabled={!emailValide} onClick={envoyerParEmail}>Envoyer</button>
        </div>

        <h2>Cet appareil est {nomIntime(me)}</h2>
        <div className="chips" style={{ justifyContent: 'center' }}>
          {ciel.astres.map((a) => (
            <button key={a.id} className={`chip ${a.id === me.id ? 'on' : ''}`} onClick={() => a.id !== me.id && onChangerAstre(a.id)}>
              {nomIntime(a)}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ---------- Composer ---------- */

// Au-delà, on refuse doucement (l'octet transite par le stockage local hors ligne).
const MEDIA_MAX_MO = 8

/** Aperçu d'un médium dans le Composer, selon son type. */
function MediaApercu({ url, medium }: { url: string; medium: Medium }) {
  if (medium === 'photo') return <img src={url} alt="Aperçu de la pièce jointe" />
  if (medium === 'video') return <video className="composer-media-video" src={url} controls preload="metadata" />
  return (
    <div className="composer-media-son">
      <span className="composer-media-son-icone" aria-hidden="true">{medium === 'musique' ? '🎵' : '🎙️'}</span>
      <audio src={url} controls preload="metadata" />
    </div>
  )
}

// Offrir un geste : des attentions légères, silencieuses, à toucher.
const GESTES: [string, string][] = [
  ['🤍', 'Pensée'], ['🤗', 'Câlin'], ['😘', 'Bisou'],
  ['🌸', 'Fleur'], ['🌼', 'Bouquet'], ['🍀', 'Trèfle'],
  ['🌞', 'Rayon de soleil'], ['🌙', 'Douce nuit'], ['⭐', 'Étoile'],
  ['🦋', 'Papillon'], ['🕊️', 'Colombe'],
  ['☕', 'Café'], ['🍵', 'Thé'], ['🍫', 'Chocolat chaud'],
  ['🍰', 'Gâteau'], ['🍎', 'Pomme'], ['🍯', 'Douceur'],
  ['🌳', 'Arbre'], ['🌱', 'Jeune pousse'], ['🌾', 'Graine'],
  ['🔥', 'Feu de cheminée'],
  ['😊', 'Sourire'], ['❤️', 'Merci'], ['🫶', 'Amour'],
  ['🙏', 'Gratitude'], ['💪', 'Courage'], ['✨', 'Espoir'],
  ['🎉', 'Félicitations'],
]

/* ---------- Les 6 symboles de pièce jointe ---------- */
const ISVG = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
function IconPhoto() { return <svg {...ISVG}><path d="M3 8h3l1.6-2h8.8L18 8h3v11H3z" /><circle cx="12" cy="13" r="3.3" /></svg> }
function IconVideo() { return <svg {...ISVG}><rect x="3" y="5" width="18" height="14" rx="2.4" /><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" /></svg> }
function IconAudio() { return <svg {...ISVG}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4" /><path d="M9 21h6" /></svg> }
function IconMusique() { return <svg {...ISVG}><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg> }
function IconLien() { return <svg {...ISVG}><path d="M9.5 14.5l5-5" /><path d="M10.8 6.6l1.6-1.6a4 4 0 0 1 5.7 5.7l-2.3 2.3" /><path d="M13.2 17.4l-1.6 1.6a4 4 0 0 1-5.7-5.7l2.3-2.3" /></svg> }
function IconGeste() { return <svg {...ISVG}><rect x="4" y="9" width="16" height="11" rx="1.6" /><path d="M2.5 9h19M12 9v11" /><path d="M12 9C10 9 7.5 8.2 7.5 6.3A2 2 0 0 1 11.5 6M12 9c2 0 4.5-.8 4.5-2.7A2 2 0 0 0 12.5 6" /></svg> }
function IconGalerie() { return <svg {...ISVG}><rect x="3" y="3" width="18" height="18" rx="2.4" /><circle cx="8.5" cy="9" r="1.6" /><path d="M21 16l-5-5-9 9" /></svg> }

/** Nettoie le HTML du message : on ne garde que la mise en forme (gras,
    italique, souligné, listes, taille), jamais de script, d'attribut actif,
    ni de lien/image dans le corps (les liens sont des pièces jointes). */
function assainirHtml(html: string): string {
  if (typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,img,a').forEach((e) => e.replaceWith(...Array.from(e.childNodes)))
  doc.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((a) => {
      const n = a.name.toLowerCase()
      const keepStyle = n === 'style' && /^font-size:\s*[\d.]+em;?$/i.test(a.value.trim())
      if (n.startsWith('on') || n === 'src' || n === 'href' || n === 'srcdoc' || (n === 'style' && !keepStyle)) el.removeAttribute(a.name)
    })
  })
  return doc.body.innerHTML
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(blob) })
}

/** L'enregistreur de voix — la pièce jointe « audio », enregistrée directement. */
function EnregistreurAudio({ onFini, onErreur, onFermer }: { onFini: (url: string) => void; onErreur: (m: string) => void; onFermer: () => void }) {
  const [etat, setEtat] = useState<'idle' | 'enreg' | 'apercu'>('idle')
  const [secondes, setSecondes] = useState(0)
  const [apercu, setApercu] = useState<string | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const stopTimer = () => { if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null } }
  useEffect(() => () => { stopTimer(); recRef.current?.stream?.getTracks?.().forEach((t) => t.stop()) }, [])

  async function demarrer() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        if (blob.size > MEDIA_MAX_MO * 1024 * 1024) { onErreur(`L'enregistrement dépasse ${MEDIA_MAX_MO} Mo — plus court la prochaine fois.`); return }
        setApercu(await blobDataUrl(blob)); setEtat('apercu')
      }
      rec.start(); recRef.current = rec; setEtat('enreg'); setSecondes(0)
      timerRef.current = window.setInterval(() => setSecondes((s) => {
        if (s + 1 >= 180) { rec.stop(); stopTimer() } // plafond 3 min
        return s + 1
      }), 1000)
    } catch { onErreur("Micro indisponible — autorisez l'accès, ou joignez un fichier audio.") }
  }
  function arreter() { stopTimer(); recRef.current?.stop() }
  const mmss = `${String(Math.floor(secondes / 60)).padStart(2, '0')}:${String(secondes % 60).padStart(2, '0')}`

  return (
    <div className="offrir-veil" onClick={onFermer}>
      <div className="offrir-sheet enreg-sheet" role="dialog" aria-label="Enregistrer un audio" onClick={(e) => e.stopPropagation()}>
        <button className="offrir-fermer" onClick={onFermer} aria-label="Fermer">✕</button>
        <h2 className="offrir-titre">Enregistrer</h2>
        {etat !== 'apercu' ? (
          <>
            <div className={`enreg-pastille ${etat === 'enreg' ? 'on' : ''}`} aria-hidden="true"><IconAudio /></div>
            <p className="enreg-minuteur">{mmss}</p>
            {etat === 'idle'
              ? <button className="primary" style={{ width: '100%' }} onClick={demarrer}>Commencer</button>
              : <button className="primary enreg-stop" style={{ width: '100%' }} onClick={arreter}>Arrêter</button>}
          </>
        ) : (
          <>
            {apercu && <audio src={apercu} controls style={{ width: '100%' }} />}
            <div className="row" style={{ marginTop: '0.8rem' }}>
              <button onClick={() => { setApercu(null); setEtat('idle'); setSecondes(0) }}>Recommencer</button>
              <button className="primary" onClick={() => apercu && onFini(apercu)}>Joindre</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Composer({ ciel, me, aboutId = null, onDone }: {
  ciel: CielData
  me: Astre
  aboutId?: string | null
  onDone: (t: { kind: TransmissionKind; body: string; aboutId: string | null; recipientIds: string[]; happensOn: string | null; imageUrl?: string | null; audioUrl?: string | null; videoUrl?: string | null; musicUrl?: string | null; linkUrl?: string | null } | null) => void
}) {
  const others = ciel.astres.filter((a) => a.id !== me.id)
  const sujet = aboutId ? ciel.astres.find((a) => a.id === aboutId) : null

  // Le message — éditeur riche (contenteditable, mise en forme + retours à la ligne).
  const editorRef = useRef<HTMLDivElement>(null)
  const [vide, setVide] = useState(true)
  const majVide = () => setVide(!editorRef.current?.textContent?.trim())
  const format = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); editorRef.current?.focus(); majVide() }
  const titre = () => format('formatBlock', 'H3')

  // Pièces jointes : un médium OU un lien à la fois.
  const [media, setMedia] = useState<{ url: string; medium: Medium } | null>(null)
  const [lien, setLien] = useState<string | null>(null)
  const [prepMedia, setPrepMedia] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [offrirOuvert, setOffrirOuvert] = useState(false)
  const [lienOuvert, setLienOuvert] = useState(false)
  const [lienSaisie, setLienSaisie] = useState('')
  const [enregOuvert, setEnregOuvert] = useState(false)
  const [pjChoix, setPjChoix] = useState<'photo' | 'video' | null>(null)
  const [geste, setGeste] = useState<[string, string] | null>(null)

  const poserMedia = (url: string, medium: Medium) => { setLien(null); setMedia({ url, medium }); setErreur(null) }
  const retirerPj = () => { setMedia(null); setLien(null) }

  async function choisirFichier(medium: Medium, file: File | undefined) {
    setErreur(null)
    setPjChoix(null)
    if (!file) return
    if (medium !== 'photo' && file.size > MEDIA_MAX_MO * 1024 * 1024) {
      setErreur(`Ce fichier dépasse ${MEDIA_MAX_MO} Mo — choisissez un extrait plus court pour l'instant.`)
      return
    }
    setPrepMedia(true)
    try {
      const url = medium === 'photo' ? await preparerImage(file) : await lireFichierDataUrl(file)
      poserMedia(url, medium)
    } catch {
      setErreur("Ce fichier n'a pas pu être préparé — réessayez avec un autre.")
    } finally { setPrepMedia(false) }
  }

  function validerLien() {
    let u = lienSaisie.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    setMedia(null); setLien(u); setLienSaisie(''); setLienOuvert(false); setErreur(null)
  }

  const champPj = () => {
    const c: Record<string, string | null> = {}
    if (media) {
      c.imageUrl = media.medium === 'photo' ? media.url : null
      c.audioUrl = media.medium === 'audio' ? media.url : null
      c.videoUrl = media.medium === 'video' ? media.url : null
      c.musicUrl = media.medium === 'musique' ? media.url : null
    }
    if (lien) c.linkUrl = lien
    return c
  }

  function transmettre() {
    const brut = editorRef.current?.innerHTML ?? ''
    let corps = assainirHtml(brut).trim()
    if (geste) corps += `<div class="tx-geste">${geste[0]} ${geste[1]}</div>`
    onDone({ kind: 'souvenir', body: corps, aboutId, recipientIds: others.map((a) => a.id), happensOn: null, ...champPj() })
  }

  const pret = !vide || !!media || !!lien || !!geste

  return (
    <div className="shell papier">
      <RetourNav onRetour={() => onDone(null)} />
      <header className="sky carnet-hero-lire">
        {sujet && <p className="whisper">au sujet de <b>{nomIntime(sujet)}</b></p>}
      </header>

      <section className="card composer-card">
        {/* 1. Le message — éditeur riche */}
        <div className="rt-barre">
          <button type="button" className="rt-btn rt-titre" onMouseDown={(e) => e.preventDefault()} onClick={titre} aria-label="Titre">Titre</button>
          <span className="rt-flex" aria-hidden="true" />
          <button type="button" className="rt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => format('bold')} aria-label="Gras"><b>G</b></button>
          <button type="button" className="rt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => format('italic')} aria-label="Italique"><i>I</i></button>
          <button type="button" className="rt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => format('underline')} aria-label="Souligner"><u>S</u></button>
          <button type="button" className="rt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => format('insertUnorderedList')} aria-label="Puce">•</button>
        </div>
        <div
          ref={editorRef}
          className={`rt-editeur ${vide ? 'rt-vide' : ''}`}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Votre message"
          data-placeholder="On a ri tous ensemble après le dîner — un petit bonheur simple qui a rempli la maison."
          onInput={majVide}
        />

        {/* 2. Aperçu de la pièce jointe (médium ou lien) */}
        {media && (
          <div className="composer-pj-apercu">
            <MediaApercu url={media.url} medium={media.medium} />
            <button type="button" className="composer-pj-retirer" onClick={retirerPj} aria-label="Retirer la pièce jointe">✕</button>
          </div>
        )}
        {lien && (
          <div className="composer-lien-apercu">
            <span className="composer-lien-ico" aria-hidden="true"><IconLien /></span>
            <a href={lien} target="_blank" rel="noopener">{lien}</a>
            <button type="button" className="composer-lien-retirer" onClick={retirerPj} aria-label="Retirer le lien">✕</button>
          </div>
        )}
        {geste && (
          <div className="composer-lien-apercu composer-geste-apercu">
            <span className="composer-geste-emoji" aria-hidden="true">{geste[0]}</span>
            <span className="composer-geste-mot">{geste[1]}</span>
            <button type="button" className="composer-lien-retirer" onClick={() => setGeste(null)} aria-label="Retirer le geste">✕</button>
          </div>
        )}
        {prepMedia && <p className="whisper naissance-note">Préparation…</p>}
        {erreur && <p className="whisper naissance-note composer-media-erreur">{erreur}</p>}

        {/* 3. Les 6 symboles de pièce jointe */}
        <div className="composer-attach">
          <button type="button" className="attach-btn" onClick={() => { setErreur(null); setPjChoix('photo') }} aria-label="Joindre une photo">
            <IconPhoto /><span>Photo</span>
          </button>
          <button type="button" className="attach-btn" onClick={() => { setErreur(null); setPjChoix('video') }} aria-label="Joindre une vidéo">
            <IconVideo /><span>Vidéo</span>
          </button>
          <button type="button" className="attach-btn" onClick={() => { setErreur(null); setEnregOuvert(true) }} aria-label="Enregistrer un audio">
            <IconAudio /><span>Audio</span>
          </button>
          <label className="attach-btn" aria-label="Joindre une musique">
            <IconMusique /><span>Musique</span>
            <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; choisirFichier('musique', f) }} />
          </label>
          <button type="button" className="attach-btn" onClick={() => { setLienSaisie(lien ?? ''); setLienOuvert(true) }} aria-label="Joindre un lien">
            <IconLien /><span>Lien</span>
          </button>
          <button type="button" className="attach-btn" onClick={() => setOffrirOuvert(true)} aria-label="Offrir un geste">
            <IconGeste /><span>Un geste</span>
          </button>
        </div>

        <div className="row">
          <button onClick={() => onDone(null)}>Annuler</button>
          <button className="primary" disabled={!pret || prepMedia} onClick={transmettre}>Transmettre</button>
        </div>
      </section>

      {enregOuvert && (
        <EnregistreurAudio
          onFini={(url) => { poserMedia(url, 'audio'); setEnregOuvert(false) }}
          onErreur={(m) => { setErreur(m); setEnregOuvert(false) }}
          onFermer={() => setEnregOuvert(false)}
        />
      )}

      {lienOuvert && (
        <div className="offrir-veil" onClick={() => setLienOuvert(false)}>
          <div className="offrir-sheet" role="dialog" aria-label="Joindre un lien" onClick={(e) => e.stopPropagation()}>
            <button className="offrir-fermer" onClick={() => setLienOuvert(false)} aria-label="Fermer">✕</button>
            <h2 className="offrir-titre">Un lien</h2>
            <p className="whisper offrir-mot">Collez l'adresse — elle est jointe au message, jamais dans le texte.</p>
            <input className="composer-lien-input" type="url" inputMode="url" placeholder="https://…" value={lienSaisie} autoFocus onChange={(e) => setLienSaisie(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') validerLien() }} aria-label="Adresse du lien" />
            <button className="primary" style={{ width: '100%', marginTop: '0.8rem' }} disabled={!lienSaisie.trim()} onClick={validerLien}>Joindre le lien</button>
          </div>
        </div>
      )}

      {pjChoix && (
        <div className="offrir-veil" onClick={() => setPjChoix(null)}>
          <div className="offrir-sheet" role="dialog" aria-label={pjChoix === 'photo' ? 'Ajouter une photo' : 'Ajouter une vidéo'} onClick={(e) => e.stopPropagation()}>
            <button className="offrir-fermer" onClick={() => setPjChoix(null)} aria-label="Fermer">✕</button>
            <h2 className="offrir-titre">{pjChoix === 'photo' ? 'Une photo' : 'Une vidéo'}</h2>
            <div className="pj-choix">
              <label className="pj-choix-btn">
                <span className="pj-choix-ico" aria-hidden="true">{pjChoix === 'photo' ? <IconPhoto /> : <IconVideo />}</span>
                <span>{pjChoix === 'photo' ? 'Prendre une photo' : 'Filmer une vidéo'}</span>
                <input type="file" accept={pjChoix === 'photo' ? 'image/*' : 'video/*'} capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; choisirFichier(pjChoix, f) }} />
              </label>
              <label className="pj-choix-btn">
                <span className="pj-choix-ico" aria-hidden="true"><IconGalerie /></span>
                <span>Depuis la galerie</span>
                <input type="file" accept={pjChoix === 'photo' ? 'image/*' : 'video/*'} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; choisirFichier(pjChoix, f) }} />
              </label>
            </div>
          </div>
        </div>
      )}

      {offrirOuvert && (
        <div className="offrir-veil" onClick={() => setOffrirOuvert(false)}>
          <div className="offrir-sheet" role="dialog" aria-label="Offrir un geste" onClick={(e) => e.stopPropagation()}>
            <button className="offrir-fermer" onClick={() => setOffrirOuvert(false)} aria-label="Fermer">✕</button>
            <h2 className="offrir-titre">Un geste</h2>
            <p className="whisper offrir-mot">
              Une attention {sujet ? <>pour <b>{nomIntime(sujet)}</b></> : <>pour toute la famille</>} — touchez pour la joindre au message.
            </p>
            <div className="offrir-capsules">
              {GESTES.map(([emoji, libelle]) => (
                <button
                  key={libelle}
                  type="button"
                  className="offrir-capsule"
                  onClick={() => { setGeste([emoji, libelle]); setOffrirOuvert(false) }}
                >
                  <span className="offrir-emoji" aria-hidden="true">{emoji}</span>
                  <span>{libelle}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Modifier le profil d'un astre ---------- */

function ProfilForm({ sujet, onEnregistrer }: {
  sujet: Astre
  onEnregistrer: (nom: string, surnom: string, date: string | null, role: Role, pays: string, codePostal: string) => void
}) {
  const [nom, setNom] = useState(sujet.name)
  const [surnom, setSurnom] = useState(sujet.nickname ?? '')
  const [date, setDate] = useState(sujet.birthDate ?? '')
  const [role, setRole] = useState<Role>(sujet.role)
  const [codePostal, setCodePostal] = useState(sujet.postalCode ?? '')
  const [pays, setPays] = useState(sujet.country ?? '')

  return (
    <section className="card profil-form">
      <h2>Le profil de {sujet.name}</h2>
      <div className="row">
        <input value={nom} onChange={(e) => setNom(e.target.value)} aria-label="Prénom" placeholder="Prénom" />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r.role} value={r.role}>{r.label}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <input value={surnom} onChange={(e) => setSurnom(e.target.value)} aria-label="Surnom" placeholder="Surnom (ex. Loulou, Mamou…)" />
      </div>
      <p className="whisper naissance-note">le petit nom tendre — très intime, visible seulement de la famille ; le prénom reste l'identité</p>
      <div className="row naissance-row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date de naissance" />
        <span className="whisper naissance-note">naissance — facultatif</span>
      </div>
      <div className="row">
        <input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} aria-label="Code postal" placeholder="Code postal" style={{ flex: '0 0 8rem' }} />
        <input value={pays} onChange={(e) => setPays(e.target.value)} aria-label="Pays" placeholder="Pays" />
      </div>
      <p className="whisper naissance-note">où l'on vit — facultatif, pour la proximité et les événements du coin</p>
      <button className="primary" disabled={!nom.trim()} onClick={() => onEnregistrer(nom.trim(), surnom, date || null, role, pays, codePostal)}>
        Enregistrer
      </button>
    </section>
  )
}

/* ---------- Le fil de vie ---------- */

/** L'image d'une transmission : une data-URL (geste optimiste, hors ligne)
    s'affiche telle quelle ; un chemin du bucket privé est signé à la volée. */
function TxImage({ src }: { src: string }) {
  const [url, setUrl] = useState<string | null>(src.startsWith('data:') ? src : null)
  useEffect(() => {
    if (src.startsWith('data:')) { setUrl(src); return }
    let vivant = true
    supabase.storage.from('pieces-jointes').createSignedUrl(src, 3600)
      .then(({ data }) => { if (vivant) setUrl(data?.signedUrl ?? null) })
      .catch(() => { if (vivant) setUrl(null) })
    return () => { vivant = false }
  }, [src])
  if (!url) return null
  return <img className="tx-image" src={url} alt="" loading="lazy" />
}

/** Le son ou la vidéo d'une transmission — même signature que l'image :
    data-URL affichée telle quelle, chemin du bucket privé signé à la volée. */
function TxMedia({ src, kind }: { src: string; kind: 'audio' | 'video' }) {
  const [url, setUrl] = useState<string | null>(src.startsWith('data:') ? src : null)
  useEffect(() => {
    if (src.startsWith('data:')) { setUrl(src); return }
    if (!src || src.startsWith('#')) { setUrl(null); return } // marqueurs de démo
    let vivant = true
    supabase.storage.from('pieces-jointes').createSignedUrl(src, 3600)
      .then(({ data }) => { if (vivant) setUrl(data?.signedUrl ?? null) })
      .catch(() => { if (vivant) setUrl(null) })
    return () => { vivant = false }
  }, [src])
  if (!url) return null
  return kind === 'video'
    ? <video className="tx-video" src={url} controls preload="metadata" />
    : <audio className="tx-audio" src={url} controls preload="metadata" />
}

/** Un lien joint — une pastille cliquable (jamais dans le corps du texte). */
function TxLien({ url }: { url: string }) {
  let hote = url
  try { hote = new URL(url).hostname.replace(/^www\./, '') } catch { /* garde l'url brute */ }
  return (
    <a className="tx-lien" href={url} target="_blank" rel="noopener">
      <span className="tx-lien-ico" aria-hidden="true"><IconLien /></span>
      <span className="tx-lien-txt">{hote}</span>
    </a>
  )
}

function FriseVue({ ciel, me, aboutId, onRetour, onEcrire, onPortrait, onNaissance, onProfil, onNommer }: {
  ciel: CielData
  me: Astre
  aboutId: string | null
  onRetour: () => void
  onEcrire: () => void
  onPortrait: (astreId: string, dataUrl: string) => void
  onNaissance: (astreId: string, date: string) => void
  onProfil: (astreId: string, nom: string, surnom: string, date: string | null, role: Role, pays: string, codePostal: string) => void
  onNommer: (astreId: string, nomDoux: string) => void
}) {
  const sujet = aboutId ? ciel.astres.find((a) => a.id === aboutId) : null
  const [enEdition, setEnEdition] = useState(false)
  const [nomDouxEdit, setNomDouxEdit] = useState(false)
  const [nomDouxVal, setNomDouxVal] = useState('')
  const [ordre, setOrdre] = useState<'recent' | 'ancien'>('recent')
  const [auteurFiltre, setAuteurFiltre] = useState('')
  const [sujetFiltre, setSujetFiltre] = useState('')
  const [mediumFiltre, setMediumFiltre] = useState<'' | Medium>('')
  const [periode, setPeriode] = useState<Periode>('tout')
  const [rechMode, setRechMode] = useState<RechMode>('aucune')
  const [rechVal, setRechVal] = useState('')
  const [reglagesOuvert, setReglagesOuvert] = useState(false)
  const nameOf = (id: string | null) => {
    const a = ciel.astres.find((x) => x.id === id)
    return a ? nomIntime(a) : null
  }
  const bornePeriode = PERIODES.find((p) => p.id === periode)?.jours ?? null
  const rechActive = rechMode !== 'aucune' && Boolean(rechVal)
  const filtresActifs = [auteurFiltre, sujetFiltre, mediumFiltre].filter(Boolean).length + (periode !== 'tout' ? 1 : 0) + (rechActive ? 1 : 0)
  const dansRecherche = (t: Transmission) => {
    if (!rechActive) return true
    const iso = new Date(t.createdAt).toISOString().slice(0, 10)
    if (rechMode === 'jour') return iso === rechVal
    if (rechMode === 'mois') return iso.slice(0, 7) === rechVal
    return iso.slice(0, 4) === rechVal
  }
  const txs = ciel.transmissions
    .filter((t) => aboutId === null || t.aboutId === aboutId || t.authorId === aboutId)
    .filter((t) => !auteurFiltre || t.authorId === auteurFiltre)
    .filter((t) => !sujetFiltre || t.aboutId === sujetFiltre)
    .filter((t) => !mediumFiltre || mediumDe(t) === mediumFiltre)
    .filter((t) => !bornePeriode || (Date.now() - new Date(t.createdAt).getTime()) <= bornePeriode * 864e5)
    .filter(dansRecherche)
    .slice()
    .sort((a, b) => (ordre === 'recent' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)))

  return (
    <div className="shell carnet-papier">
      <RetourNav onRetour={onRetour} />
      {!sujet ? (
        <header className="sky carnet-hero-lire">
          <div className="carnet-filtre-barre">
            <button className="carnet-reglages-btn" onClick={() => setReglagesOuvert(true)} aria-label="Archives du carnet">
              <span className="filtre-glyph"><SablierGlyph /></span>
              <span>Archives</span>
              {filtresActifs > 0 && <span className="carnet-reglages-badge">{filtresActifs}</span>}
            </button>
          </div>
        </header>
      ) : (
      <header className="sky">
        {sujet?.avatarUrl && <img src={sujet.avatarUrl} alt="" className="portrait-frise" />}
        <h1>{sujet ? nomIntime(sujet) : 'Le carnet de famille'}</h1>
        <p className="whisper">
          {sujet && (
            <>
              <label className="link portrait-label">
                {sujet.avatarUrl ? 'changer le portrait' : 'poser un portrait'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (f) onPortrait(sujet.id, await preparerPortrait(f))
                  }}
                />
              </label>
              {' · '}
              <button className="link" onClick={() => setEnEdition(!enEdition)}>
                {enEdition ? 'fermer' : 'modifier le profil'}
              </button>
            </>
          )}
        </p>
        {sujet && enEdition && (
          <ProfilForm
            sujet={sujet}
            onEnregistrer={(nom, surnom, date, role, pays, codePostal) => {
              onProfil(sujet.id, nom, surnom, date, role, pays, codePostal)
              setEnEdition(false)
            }}
          />
        )}
        {sujet && !enEdition && sujet.id !== me.id && (
          nomDouxEdit ? (
            <div className="row nom-doux-row">
              <input
                autoFocus
                value={nomDouxVal}
                onChange={(e) => setNomDouxVal(e.target.value)}
                placeholder="Papa, Mamie, Tonton Marc…"
                aria-label="Nom doux"
                onKeyDown={(e) => { if (e.key === 'Enter') { onNommer(sujet.id, nomDouxVal); setNomDouxEdit(false) } }}
              />
              <button className="primary" style={{ width: 'auto', marginTop: 0 }} onClick={() => { onNommer(sujet.id, nomDouxVal); setNomDouxEdit(false) }}>ok</button>
            </div>
          ) : (
            <p className="naissance nom-doux-ligne">
              {sujet.nomDoux ? <>je l'appelle <b>{sujet.nomDoux}</b></> : 'lui donner un petit nom'}{' '}
              <button className="link" onClick={() => { setNomDouxVal(sujet.nomDoux ?? ''); setNomDouxEdit(true) }}>
                {sujet.nomDoux ? 'changer' : '＋'}
              </button>
            </p>
          )
        )}
        {sujet && !enEdition && (sujet.postalCode || sujet.country) && (
          <p className="naissance">{[sujet.postalCode, sujet.country].filter(Boolean).join(' · ')}</p>
        )}
        {sujet && !enEdition && (
          sujet.birthDate ? (
            <p className="naissance">
              {naissanceEnClair(sujet.birthDate)} · {ageDe(sujet.birthDate)} an{ageDe(sujet.birthDate) > 1 ? 's' : ''}
              {estAnniversaire(sujet.birthDate) ? ' — bon anniversaire ✦' : ''}
            </p>
          ) : (
            <p className="naissance">
              <input
                type="date"
                aria-label={`Date de naissance de ${sujet.name}`}
                className="naissance-input"
                onChange={(e) => { if (e.target.value) onNaissance(sujet.id, e.target.value) }}
              />
              <span className="whisper naissance-note"> poser la date de naissance</span>
            </p>
          )
        )}
      </header>
      )}

      {txs.length === 0 ? (
        <div className="carnet-vierge">
          <img src="/livre-page-1.jpg" alt="" className="carnet-vierge-page" />
          <p className="carnet-vierge-mot">Le carnet est encore vierge.<br />La première transmission y écrira sa première page.</p>
        </div>
      ) : (
        <ul className="frise">
          {txs.map((t) => {
            const lueurs = Object.keys(t.veilles).map((id) => nameOf(id)).filter(Boolean) as string[]

            return (
              <li key={t.id} className="tx">
                <div className="tx-head">
                  <span className="tx-when">
                    {t.happensOn && new Date(t.happensOn).toDateString() !== new Date(t.createdAt).toDateString()
                      ? `pour le ${new Date(t.happensOn).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                      : new Date(t.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {t.body && <div className="tx-body" dangerouslySetInnerHTML={{ __html: assainirHtml(t.body) }} />}
                {t.imageUrl && <TxImage src={t.imageUrl} />}
                {t.videoUrl && <TxMedia src={t.videoUrl} kind="video" />}
                {t.audioUrl && <TxMedia src={t.audioUrl} kind="audio" />}
                {t.musicUrl && <TxMedia src={t.musicUrl} kind="audio" />}
                {t.linkUrl && <TxLien url={t.linkUrl} />}
                <div className="tx-foot">
                  <span className="tx-meta">
                    {nameOf(t.authorId)}
                    {t.aboutId && <><span className="tx-meta-apropos"> · au sujet de </span>{nameOf(t.aboutId)}</>}
                  </span>
                  {/* La lueur, asymétrique : on montre qui a veillé, jamais qui manque. */}
                  {lueurs.length > 0 && <span className="lueur">✦ {lueurs.join(', ')}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {sujet && (
        <button className="fiche-ecrire" onClick={onEcrire} aria-label={`Écrire au sujet de ${nomIntime(sujet)}`}>
          <span className="fiche-ecrire-plume"><img src="/plume.jpg" alt="" /></span>
          <span>écrire</span>
        </button>
      )}

      {reglagesOuvert && (
        <div className="offrir-veil" onClick={() => setReglagesOuvert(false)}>
          <div className="offrir-sheet reglages-sheet" role="dialog" aria-label="Réglages du carnet" onClick={(e) => e.stopPropagation()}>
            <button className="offrir-fermer" onClick={() => setReglagesOuvert(false)} aria-label="Fermer">✕</button>
            <h2 className="offrir-titre">Archives</h2>

            <div className="reglages-groupe">
              <span className="reglages-label">Ordre</span>
              <div className="reglages-segment">
                <button className={ordre === 'recent' ? 'on' : ''} onClick={() => setOrdre('recent')}>Du plus récent</button>
                <button className={ordre === 'ancien' ? 'on' : ''} onClick={() => setOrdre('ancien')}>Du plus ancien</button>
              </div>
            </div>

            <div className="reglages-groupe">
              <span className="reglages-label">Période</span>
              <div className="reglages-chips">
                {PERIODES.map((p) => (
                  <button key={p.id} className={`reglages-chip ${periode === p.id ? 'on' : ''}`} onClick={() => setPeriode(p.id)}>{p.label}</button>
                ))}
              </div>
            </div>

            <div className="reglages-groupe">
              <span className="reglages-label">Recherche précise</span>
              <div className="reglages-chips">
                {RECH_MODES.map((r) => (
                  <button key={r.m} className={`reglages-chip ${rechMode === r.m ? 'on' : ''}`} onClick={() => { setRechMode(r.m); setRechVal('') }}>{r.label}</button>
                ))}
              </div>
              {rechMode === 'jour' && (
                <input className="carnet-filtre-select reglages-date" type="date" value={rechVal} onChange={(e) => setRechVal(e.target.value)} aria-label="Choisir un jour" />
              )}
              {rechMode === 'mois' && (
                <input className="carnet-filtre-select reglages-date" type="month" value={rechVal} onChange={(e) => setRechVal(e.target.value)} aria-label="Choisir un mois" />
              )}
              {rechMode === 'annee' && (
                <input className="carnet-filtre-select reglages-date" type="number" min="1990" max="2100" placeholder="Ex. 2026" value={rechVal} onChange={(e) => setRechVal(e.target.value)} aria-label="Choisir une année" />
              )}
            </div>

            <div className="reglages-groupe">
              <span className="reglages-label">Auteur</span>
              <select className="carnet-filtre-select" value={auteurFiltre} onChange={(e) => setAuteurFiltre(e.target.value)} aria-label="Filtrer par auteur">
                <option value="">Tous</option>
                {ciel.astres.map((a) => (<option key={a.id} value={a.id}>{nomIntime(a)}</option>))}
              </select>
            </div>

            <div className="reglages-groupe">
              <span className="reglages-label">Sujet</span>
              <select className="carnet-filtre-select" value={sujetFiltre} onChange={(e) => setSujetFiltre(e.target.value)} aria-label="Filtrer par sujet">
                <option value="">Tous</option>
                {ciel.astres.map((a) => (<option key={a.id} value={a.id}>{nomIntime(a)}</option>))}
              </select>
            </div>

            <div className="reglages-groupe">
              <span className="reglages-label">Médium</span>
              <select className="carnet-filtre-select" value={mediumFiltre} onChange={(e) => setMediumFiltre(e.target.value as '' | Medium)} aria-label="Filtrer par médium">
                <option value="">Tous</option>
                {MEDIUMS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
              </select>
            </div>

            <div className="reglages-actions">
              {filtresActifs > 0 && (
                <button className="reglages-reset" onClick={() => { setAuteurFiltre(''); setSujetFiltre(''); setMediumFiltre(''); setPeriode('tout'); setRechMode('aucune'); setRechVal('') }}>Réinitialiser</button>
              )}
              <button className="primary reglages-appliquer" onClick={() => setReglagesOuvert(false)}>
                Voir {txs.length} message{txs.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
