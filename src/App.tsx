import { useEffect, useRef, useState } from 'react'
import type { Astre, CalendarLayerId, Constellation, Role, TransmissionKind } from './types'
import { CALENDAR_LAYERS, ROLES, nomIntime } from './types'
import { archiverHeritage, chargerHeritage } from './store'
import { demoCiel } from './demo'
import DeesseChat from './DeesseChat'
import { connexionMotDePasse, envoyerLien, monEmail, seDeconnecter, sessionCertifiee, supabase } from './lib/supabase'
import {
  activerGalaxie, astresDe, charger, fonder, hisser, mesGalaxies, modifierCalendriers, modifierNomDoux, modifierProfil, poserNaissance, poserPortrait, rejoindre, transmettre, veiller,
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

interface AstreDraft { name: string; role: Role; circle: 1 | 2 | 3; birthDate: string | null }

/** Le visage — logo & future assistante. Uniquement aux seuils, jamais dans la vie de famille. */
function LogoSeuil() {
  return (
    <div className="logo-seuil-wrap">
      <img src="/logo-nuit.png" alt="" className="logo-seuil logo-nuit" />
      <img src="/logo-jour.png" alt="" className="logo-seuil logo-jour" />
    </div>
  )
}

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
  { nom: 'Mana France', etat: 'l’association', mot: 'L’association qui porte la maison Mana en France — qui nous sommes, ce que nous construisons.', href: 'https://www.manafrance.org' },
  { nom: 'Mana citoyen', etat: 'bientôt', mot: 'L’entraide entre voisins d’un même territoire — se rendre service, reconnaître le temps donné.', bientot: true },
  { nom: 'TempoSystem', etat: 'bientôt', mot: 'La comptabilité discrète du temps que les êtres humains se consacrent. Elle travaille en coulisse ; vous ne la voyez jamais.', bientot: true },
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

      <DeesseChat />

      <NousEcrire />

      <section className="assistante-bloc assistante-signature">
        <p>
          Bientôt, je pourrai vous montrer les gestes quand vous le voudrez —
          jamais sans que vous me le demandiez. Le logiciel disparaît ; la famille reste.
        </p>
      </section>
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

/** Le micro de la dictée — s'éveille quand il écoute. */
function MicGlyph({ actif }: { actif: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" fill={actif ? 'currentColor' : 'none'} />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </svg>
  )
}

/** L'entonnoir — replier/déplier les filtres du carnet. */
function FiltreGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5h18l-7 8v6l-4 2v-8Z" />
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
    } else if (!r.horsLigne) {
      setPhase((p) => (p.ecran === 'chargement' || p.ecran === 'compte' ? { ecran: 'porte' } : p))
    } else {
      setPhase((p) => (p.ecran === 'chargement' || p.ecran === 'compte' ? { ecran: 'porte' } : p))
    }
  }

  useEffect(() => {
    // Mode test (dev-only) : ?demo=1 ouvre l'intérieur avec une fausse famille,
    // sans auth ni base. Jamais actif en production (import.meta.env.DEV).
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
      setCiel(demoCiel())
      setPhase({ ecran: 'ciel' })
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
        onVeiller={(txId) => setCiel(veiller(ciel, txId))}
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
  { glyphe: '🌱', mot: 'Rien n’est vendu. Vos souvenirs ne servent à rien d’autre qu’à vous relier.' },
  { glyphe: '✦', mot: 'Rien ne s’efface. Ce qui est transmis reste, gardé pour ceux qui viennent.' },
]

/** Les deux piliers — la doctrine Présence / Mémoire, dite simplement,
    chacune portée par son illustration dorée. */
const PILIERS: { titre: string; mot: string; illus?: string }[] = [
  { titre: 'La Présence', illus: '/plume.jpg', mot: 'Partagez un moment en quelques mots. La famille veille sur vous — jamais de relance, jamais de reproche. Le silence aussi vous appartient.' },
  { titre: 'La Mémoire', illus: '/carnet.jpg', mot: 'Le carnet garde tout ce qui compte, du plus récent au plus ancien. Anniversaires, souvenirs, présences : la mémoire reste vivante.' },
]

function VitrineVue({ onSeConnecter }: { onSeConnecter: () => void }) {
  return (
    <div className="shell vitrine-shell seuil-nuit fond-maison">
      <header className="sky vitrine-hero">
        <p className="vitrine-eyebrow">Mana Family</p>
        <h1>Votre carnet de famille</h1>
        <p className="whisper">La Présence fait vivre. La Mémoire fait durer.</p>
        <p className="vitrine-phrase">
          Un cercle privé pour prendre soin, ensemble, de ceux qu’on aime :
          partager un moment, veiller sur les autres, garder la mémoire vivante.
        </p>
      </header>

      <section className="vitrine-piliers">
        {PILIERS.map((p) => (
          <div className="vitrine-pilier" key={p.titre}>
            {p.illus && <img className="vitrine-pilier-illus" src={p.illus} alt="" aria-hidden="true" />}
            <span className="vitrine-pilier-titre">{p.titre}</span>
            <p>{p.mot}</p>
          </div>
        ))}
      </section>

      <section className="vitrine-promesses">
        {PROMESSES.map((p) => (
          <p className="vitrine-promesse" key={p.mot}>
            <span className="vitrine-promesse-glyphe" aria-hidden="true">{p.glyphe}</span>
            <span>{p.mot}</span>
          </p>
        ))}
      </section>

      <section className="vitrine-livre">
        <div className="vitrine-tableau cadre-or">
          <img src="/livre-ouvert.jpg" alt="Le carnet de famille — vos souvenirs, gardés" />
        </div>
        <span className="vitrine-livre-etiquette">Le Livre blanc</span>
        <p className="vitrine-livre-mot">
          Toute la vision de Mana Family — les Cercles familiaux, la Présence et la Mémoire,
          et ce que nous refuserons toujours de faire. À lire le jour où vous voulez comprendre
          la maison en profondeur.
        </p>
        <a className="vitrine-livre-lien" href="/livre-blanc.html" target="_blank" rel="noopener">
          Lire le Livre blanc →
        </a>
      </section>

      <section className="vitrine-pied">
        <div className="vitrine-pied-clef cadre-or">
          <img src="/mana-key.jpg" alt="La clef de la maison Mana" />
        </div>
        <button className="primary" onClick={onSeConnecter}>Entrer dans la maison</button>
        <p className="whisper vitrine-pied-mot">
          Un proche vous a confié une clé&nbsp;? <button className="link" onClick={onSeConnecter}>Se connecter</button>, puis rejoignez la famille.
        </p>
      </section>
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

      <section className="card">
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
    <div className="shell">
      <header className="sky porte-sky">
        <div className="porte-deesse">
          <img src="/logo-nuit.png" alt="" className="logo-nuit" />
          <img src="/logo-jour.png" alt="" className="logo-jour" />
        </div>
        <h1>Mana Family</h1>
        <p className="whisper">La Présence fait vivre. La Mémoire fait durer.</p>
      </header>
      {avis && <section className="card"><p className="whisper" style={{ margin: 0 }}>{avis}</p></section>}
      <section className="card">
        {heritage && (
          <button className="primary" onClick={onHisser}>
            Ouvrir « {heritage.name} » dans la famille
          </button>
        )}
        <button className={heritage ? '' : 'primary'} style={{ width: '100%', marginTop: '0.8rem', padding: '0.85rem' }} onClick={onFonder}>
          Fonder une famille
        </button>
        <button style={{ width: '100%', marginTop: '0.8rem', padding: '0.85rem' }} onClick={onRejoindre}>
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
    if (!draft.trim()) return
    const meta = ROLES.find((r) => r.role === role)!
    setAstres([...astres, { name: draft.trim(), role, circle: meta.circle, birthDate: naissance || null }])
    setDraft('')
    setNaissance('')
  }

  return (
    <div className="shell">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <LogoSeuil />
        <h1>Mana Family</h1>
        <p className="whisper">La Présence fait vivre. La Mémoire fait durer.</p>
      </header>

      <section className="card">
        <h2>Fonder la famille</h2>
        <input placeholder="Nom de la famille (ex. Les Gillet)" value={name} onChange={(e) => setName(e.target.value)} />

        <h2>Les membres de la famille</h2>
        <div className="row">
          <input
            placeholder="Prénom"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r.role} value={r.role}>{r.label}</option>
            ))}
          </select>
          <button onClick={add} aria-label="Ajouter cet astre" className="ajout-astre">✦</button>
        </div>
        <div className="row naissance-row">
          <input type="date" value={naissance} onChange={(e) => setNaissance(e.target.value)} aria-label="Date de naissance" />
          <span className="whisper naissance-note">naissance — pour les anniversaires et l'arbre, facultatif</span>
        </div>

        <ul className="astre-list">
          {astres.map((a, i) => (
            <li key={i}>
              <span className="astre-dot" /> {a.name}{' '}
              <em>· {ROLES.find((r) => r.role === a.role)?.label}{a.birthDate ? ` · ${naissanceEnClair(a.birthDate)}` : ''}</em>
            </li>
          ))}
        </ul>

        <button className="primary" disabled={!name.trim() || astres.length < 2} onClick={() => onPrete(name.trim(), astres)}>
          Créer la famille
        </button>
      </section>
    </div>
  )
}

function ChoisirMoi({ nom, brouillon, onChoisi, onRetour }: { nom: string; brouillon: AstreDraft[]; onChoisi: (index: number) => void; onRetour: () => void }) {
  return (
    <div className="shell">
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

function Rejoindre({ onArrime, onRetour }: { onArrime: (code: string, astreId: string) => void; onRetour: () => void }) {
  const [code, setCode] = useState('')
  const [astres, setAstres] = useState<Astre[] | null>(null)
  const [erreur, setErreur] = useState('')

  return (
    <div className="shell">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>Rejoindre</h1>
      </header>
      <section className="card">
        <h2>La clé de la famille</h2>
        <div className="row">
          <input placeholder="ex. 3f9a1c2e" value={code} onChange={(e) => setCode(e.target.value.trim().toLowerCase())} />
          <button
            onClick={async () => {
              setErreur('')
              try {
                const a = await astresDe(code)
                if (a.length === 0) setErreur('Clé inconnue — vérifie auprès de la famille.')
                else setAstres(a)
              } catch {
                setErreur('Le réseau est agité — réessaie dans un instant.')
              }
            }}
          >Ouvrir</button>
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
    <div className="shell">
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

function etatDuCiel(c: CielData): string {
  // L'anniversaire passe avant tout — c'est un fait du calendrier, jamais une relance.
  const anniv = c.astres.find((a) => a.birthDate && estAnniversaire(a.birthDate))
  if (anniv) {
    const age = ageDe(anniv.birthDate!)
    return `C'est l'anniversaire de ${nomIntime(anniv)} — ${age} an${age > 1 ? 's' : ''} aujourd'hui. ✦`
  }
  if (c.transmissions.length === 0) return 'Votre famille attend sa première page.'
  const derniere = new Date(c.transmissions[0].createdAt).getTime()
  if (Date.now() - derniere > 72 * 3600 * 1000) return 'La famille se repose.'
  const veillee = c.transmissions.find((t) => Object.keys(t.veilles).length > 0 && t.aboutId)
  if (veillee) {
    const astre = c.astres.find((a) => a.id === veillee.aboutId)
    if (astre) return `La famille veille sur ${nomIntime(astre)}.`
  }
  if (c.transmissions[0].kind === 'souvenir') return 'Un souvenir a été déposé dans le cercle.'
  const h = new Date().getHours()
  if (h < 6) return 'La nuit veille avec vous.'
  if (h < 12) return 'Le jour se lève sur votre famille.'
  if (h < 18) return 'Tout est paisible à la maison.'
  return 'Douceur sur votre famille ce soir.'
}

// Le livre ne s'ouvre qu'une fois par session — quand on entre dans la maison,
// pas à chaque retour à l'accueil.
let livreDejaOuvert = false

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

  // Vrai au tout premier affichage de l'accueil : le livre s'ouvre en fondu.
  const [ouverture] = useState(() => { const premier = !livreDejaOuvert; livreDejaOuvert = true; return premier })

  return (
    <div className="shell foyer">
      <div className="foyer-fond" aria-hidden="true" />
      {ouverture && <div className="foyer-fond-ferme" aria-hidden="true" />}
      <header className="sky">
        <h1><button className="titre-lien" onClick={onGalaxie}><span className="mot-famille">Famille<sup className="palier-marque" title="Formule Famille — gratuite">✦</sup></span> {ciel.name}</button></h1>
        {horsLigne && <p className="whisper">hors réseau — les gestes attendent</p>}
      </header>

      <div className="ciel">
        {ciel.astres.map((a, i) => {
          const graine = [...a.id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 9973, 7)
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2 + ((graine % 100) / 100 - 0.5) * 0.9
          // Un seul cercle familial : le rayon ne dépend plus du « circle »,
          // juste d'une dérive organique — une constellation, pas trois anneaux.
          const r = 24 + (graine % 16)
          const left = 50 + r * Math.cos(angle) + ((graine % 11) - 5) * 0.8
          const top = 48 + r * 0.8 * Math.sin(angle) + ((graine % 13) - 6) * 0.7
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

      <button className="etat-ciel" onClick={onChronologie}>{etatDuCiel(ciel)}</button>

      <div className="barre-bas">
        <button className="geste" onClick={() => onOuvrirFrise(null)} aria-label="Le carnet de famille — lire">
          <span className="geste-rond geste-visage"><img src="/carnet.jpg" alt="" /><span className="geste-mot">lire</span></span>
        </button>

        <button className="geste geste-ecrire" onClick={onTransmettre} aria-label="Transmettre — écrire">
          <span className="geste-rond geste-mandala"><img src="/plume.jpg" alt="" /><span className="geste-mot">écrire</span></span>
        </button>

        <button className="geste" onClick={onAssistante} aria-label="L'univers Mana — découvrir">
          <span className="geste-rond geste-visage"><img src="/mana-key.jpg" alt="" /><span className="geste-mot">découvrir</span></span>
        </button>
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
    <div className="shell">
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
        <h1>Les générations</h1>
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
    <div className="shell chrono-shell">
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
    <div className="shell">
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
  return (
    <div className="shell">
      <RetourNav onRetour={onRetour} />
      <header className="sky">
        <h1>La clé de la maison</h1>
      </header>
      <section className="card" style={{ textAlign: 'center' }}>
        <p>Chaque proche ouvre l'application sur son appareil, choisit « Rejoindre avec une clé », et entre :</p>
        <p style={{ fontFamily: 'var(--serif)', fontSize: '2rem', letterSpacing: '0.2em', color: 'var(--or-mana)' }}>
          {ciel.inviteCode}
        </p>
        <p className="whisper">La clé ne se partage qu'en famille — c'est la porte de votre maison.</p>

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

function Composer({ ciel, me, aboutId = null, onDone }: {
  ciel: CielData
  me: Astre
  aboutId?: string | null
  onDone: (t: { kind: TransmissionKind; body: string; aboutId: string | null; recipientIds: string[]; happensOn: string | null } | null) => void
}) {
  const others = ciel.astres.filter((a) => a.id !== me.id)
  const sujet = aboutId ? ciel.astres.find((a) => a.id === aboutId) : null
  const [body, setBody] = useState('')
  const [offrirOuvert, setOffrirOuvert] = useState(false)

  const [ecoute, setEcoute] = useState(false)
  const recognitionRef = useRef<any>(null)

  // La dictée — la voix devient mémoire (reconnaissance du navigateur, hors ligne quand dispo)
  const dicter = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    if (ecoute) { recognitionRef.current?.stop(); return }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.interimResults = true
    rec.continuous = true
    const base = body ? body.trimEnd() + ' ' : ''
    rec.onresult = (e: any) => {
      let txt = ''
      for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript
      setBody(base + txt)
    }
    rec.onend = () => setEcoute(false)
    rec.onerror = () => setEcoute(false)
    recognitionRef.current = rec
    rec.start()
    setEcoute(true)
  }
  const dicteeDispo = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  return (
    <div className="shell papier">
      <RetourNav onRetour={() => onDone(null)} />
      <header className="sky carnet-hero-lire">
        {sujet && <p className="whisper">au sujet de <b>{nomIntime(sujet)}</b></p>}
      </header>

      <section className="card composer-card">
        {/* 1. Le message */}
        <div className="message-zone">
          <textarea
            placeholder="On a ri tous ensemble après le dîner — un petit bonheur simple qui a rempli la maison."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
          />
          {dicteeDispo && (
            <button
              type="button"
              className={`dictee ${ecoute ? 'on' : ''}`}
              onClick={dicter}
              aria-label={ecoute ? 'Arrêter la dictée' : 'Dicter le message'}
              title={ecoute ? 'Arrêter la dictée' : 'Dicter — la voix devient mémoire'}
            >
              <MicGlyph actif={ecoute} />
            </button>
          )}
        </div>
        <p className="whisper naissance-note message-aide">
          {ecoute ? 'Je vous écoute…' : 'Écrivez, ou touchez le micro pour dicter.'}
        </p>

        {/* 2. Deux options illustrées, côte à côte : pièce jointe (bientôt) & offrir un geste */}
        <div className="composer-tuiles">
          <button type="button" className="composer-tuile bientot" disabled aria-label="Pièce jointe — bientôt">
            <span className="composer-tuile-img"><img src="/pj.jpg" alt="" /></span>
            <span className="composer-tuile-mot">Pièce jointe</span>
            <span className="composer-tuile-note">bientôt</span>
          </button>
          <button type="button" className="composer-tuile" onClick={() => setOffrirOuvert(true)} aria-label="Offrir un geste">
            <span className="composer-tuile-img"><img src="/cadeau.jpg" alt="" /></span>
            <span className="composer-tuile-mot">Offrir un geste</span>
          </button>
        </div>

        <div className="row">
          <button onClick={() => onDone(null)}>Annuler</button>
          <button
            className="primary"
            disabled={!body.trim()}
            onClick={() => onDone({ kind: 'souvenir', body: body.trim(), aboutId, recipientIds: others.map((a) => a.id), happensOn: null })}
          >
            Transmettre
          </button>
        </div>
      </section>

      {offrirOuvert && (
        <div className="offrir-veil" onClick={() => setOffrirOuvert(false)}>
          <div className="offrir-sheet" role="dialog" aria-label="Offrir un geste" onClick={(e) => e.stopPropagation()}>
            <button className="offrir-fermer" onClick={() => setOffrirOuvert(false)} aria-label="Fermer">✕</button>
            <div className="offrir-cadeau" aria-hidden="true"><img src="/cadeau.jpg" alt="" /></div>
            <h2 className="offrir-titre">Offrir un geste</h2>
            <p className="whisper offrir-mot">
              Une attention {sujet ? <>pour <b>{nomIntime(sujet)}</b></> : <>pour toute la famille</>} — touchez pour l'offrir.
            </p>
            <div className="offrir-capsules">
              {GESTES.map(([emoji, libelle]) => (
                <button
                  key={libelle}
                  type="button"
                  className="offrir-capsule"
                  onClick={() => onDone({ kind: 'souvenir', body: `${emoji} ${libelle}`, aboutId, recipientIds: others.map((a) => a.id), happensOn: null })}
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

function FriseVue({ ciel, me, aboutId, onRetour, onEcrire, onVeiller, onPortrait, onNaissance, onProfil, onNommer }: {
  ciel: CielData
  me: Astre
  aboutId: string | null
  onRetour: () => void
  onEcrire: () => void
  onVeiller: (txId: string) => void
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
  const nameOf = (id: string | null) => {
    const a = ciel.astres.find((x) => x.id === id)
    return a ? nomIntime(a) : null
  }
  const txs = ciel.transmissions
    .filter((t) => aboutId === null || t.aboutId === aboutId || t.authorId === aboutId)
    .slice()
    .sort((a, b) => (ordre === 'recent' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)))

  return (
    <div className="shell carnet-papier">
      <RetourNav onRetour={onRetour} />
      {!sujet ? (
        <header className="sky carnet-hero-lire">
          <div className="carnet-filtre-barre">
            <button
              className="carnet-filtre-btn"
              onClick={() => setOrdre((o) => (o === 'recent' ? 'ancien' : 'recent'))}
              aria-label="Changer l'ordre par date"
            >
              <span className="filtre-glyph"><FiltreGlyph /></span>
              {ordre === 'recent' ? 'Du plus récent' : 'Du plus ancien'}
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
            const mine = t.authorId === me.id
            const forMe = t.forMe
            const iVeilled = Boolean(t.veilles[me.id])
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
                <p className="tx-body">{t.body}</p>
                <div className="tx-foot">
                  <span className="tx-meta">
                    {nameOf(t.authorId)}
                    {t.aboutId ? ` · au sujet de ${nameOf(t.aboutId)}` : ''}
                  </span>
                  {/* La lueur, asymétrique : on montre qui a veillé, jamais qui manque. */}
                  {lueurs.length > 0 && <span className="lueur">✦ {lueurs.join(', ')}</span>}
                </div>
                {forMe && !mine && !iVeilled && (
                  <button className="veiller" onClick={() => onVeiller(t.id)}>
                    J'ai veillé
                  </button>
                )}
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
    </div>
  )
}
