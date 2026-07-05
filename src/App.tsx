import { useEffect, useRef, useState } from 'react'
import type { Astre, CalendarLayerId, Constellation, Role, TransmissionKind } from './types'
import { CALENDAR_LAYERS, KINDS, ROLES, nomIntime } from './types'
import { archiverHeritage, chargerHeritage } from './store'
import {
  activerGalaxie, astresDe, charger, fonder, hisser, mesGalaxies, modifierCalendriers, modifierProfil, poserNaissance, poserPortrait, rejoindre, transmettre, veiller,
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

type Phase =
  | { ecran: 'chargement' }
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
  | { ecran: 'frise'; aboutId: string | null }
  | { ecran: 'composer' }

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
      setAvis(
        msg.includes('anonymous') || msg.includes('Anonymous')
          ? 'La galaxie familiale n’est pas encore ouverte : active « Anonymous sign-ins » dans le dashboard Supabase (Authentication → Sign In / Providers), puis réessaie.'
          : `La manœuvre a échoué : ${msg}`,
      )
      setPhase({ ecran: 'porte' })
    }
  }

  const rafraichir = async () => {
    const r = await charger()
    setHorsLigne(r.horsLigne)
    if (r.ciel) {
      setCiel(r.ciel)
      setPhase((p) => (p.ecran === 'chargement' || p.ecran === 'porte' ? { ecran: 'ciel' } : p))
    } else if (!r.horsLigne) {
      setPhase((p) => (p.ecran === 'chargement' ? { ecran: 'porte' } : p))
    } else {
      setPhase((p) => (p.ecran === 'chargement' ? { ecran: 'porte' } : p))
    }
  }

  useEffect(() => {
    rafraichir()
    const iv = setInterval(rafraichir, 30000) // marée calme : pas de temps réel frénétique
    const onVis = () => { if (document.visibilityState === 'visible') rafraichir() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', rafraichir)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', rafraichir)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase.ecran === 'chargement') {
    return (
      <div className="shell">
        <header className="sky"><h1>Mana Family</h1><p className="whisper">L'Univers s'ouvre…</p></header>
      </div>
    )
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
    return <Fondation onPrete={(nom, brouillon) => setPhase({ ecran: 'choisir-moi', nom, brouillon })} />
  }

  if (phase.ecran === 'choisir-moi') {
    return (
      <ChoisirMoi
        nom={phase.nom}
        brouillon={phase.brouillon}
        onChoisi={(index) => tenter(() => fonder(phase.nom, phase.brouillon, index))}
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
          <p className="whisper">La mer est coupée et aucun Univers n'est en mémoire sur cet appareil.</p>
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
        onVeiller={(txId) => setCiel(veiller(ciel, txId))}
        onPortrait={(astreId, url) => setCiel(poserPortrait(ciel, astreId, url))}
        onNaissance={(astreId, date) => setCiel(poserNaissance(ciel, astreId, date))}
        onProfil={(astreId, nom, surnom, date, role, pays, codePostal) => setCiel(modifierProfil(ciel, astreId, nom, surnom, date, role, pays, codePostal))}
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
      />
    )
  }

  return (
    <CielVue
      ciel={ciel}
      me={me}
      horsLigne={horsLigne}
      onOuvrirFrise={(aboutId) => setPhase({ ecran: 'frise', aboutId })}
      onTransmettre={() => setPhase({ ecran: 'composer' })}
      onInviter={() => setPhase({ ecran: 'inviter' })}
      onGalaxie={() => setPhase({ ecran: 'galaxie' })}
      onChronologie={() => setPhase({ ecran: 'chronologie' })}
      onJardin={() => setPhase({ ecran: 'jardin' })}
      onParametres={() => setPhase({ ecran: 'parametres' })}
    />
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
      <header className="sky">
        <h1>Mana Family</h1>
        <p className="whisper">La Présence fait vivre. La Mémoire fait durer.</p>
      </header>
      {avis && <section className="card"><p className="whisper" style={{ margin: 0 }}>{avis}</p></section>}
      <section className="card">
        {heritage && (
          <button className="primary" onClick={onHisser}>
            Ouvrir « {heritage.name} » dans la galaxie familiale
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

function Fondation({ onPrete }: { onPrete: (nom: string, brouillon: AstreDraft[]) => void }) {
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
      <header className="sky">
        <h1>Mana Family</h1>
        <p className="whisper">La Présence fait vivre. La Mémoire fait durer.</p>
      </header>

      <section className="card">
        <h2>Fonder la famille</h2>
        <input placeholder="Nom de la famille (ex. Les Gillet)" value={name} onChange={(e) => setName(e.target.value)} />

        <h2>Les astres du Cercle</h2>
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
              <em>· {ROLES.find((r) => r.role === a.role)?.label} · Cercle {a.circle}{a.birthDate ? ` · ${naissanceEnClair(a.birthDate)}` : ''}</em>
            </li>
          ))}
        </ul>

        <button className="primary" disabled={!name.trim() || astres.length < 2} onClick={() => onPrete(name.trim(), astres)}>
          Allumer les astres
        </button>
      </section>
    </div>
  )
}

function ChoisirMoi({ nom, brouillon, onChoisi }: { nom: string; brouillon: AstreDraft[]; onChoisi: (index: number) => void }) {
  return (
    <div className="shell">
      <header className="sky">
        <h1>Famille {nom}</h1>
        <p className="whisper">Et toi, quel astre es-tu ?</p>
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
      <header className="sky">
        <h1>Rejoindre</h1>
        <p className="whisper"><button className="link" onClick={onRetour}>← retour</button></p>
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
                setErreur('La mer est agitée — réessaie dans un instant.')
              }
            }}
          >Ouvrir</button>
        </div>
        {erreur && <p className="whisper">{erreur}</p>}
        {astres && (
          <>
            <h2>Quel astre es-tu ?</h2>
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

/* ---------- Ouvrir l'héritage local dans la galaxie familiale ---------- */

function Hisser({ heritage, onHisse, onRetour }: { heritage: Constellation; onHisse: (meId: string) => void; onRetour: () => void }) {
  return (
    <div className="shell">
      <header className="sky">
        <h1>Famille {heritage.name}</h1>
        <p className="whisper">
          {heritage.transmissions.length} transmission{heritage.transmissions.length > 1 ? 's' : ''} rejoindr{heritage.transmissions.length > 1 ? 'ont' : 'a'} la galaxie familiale, dates et lueurs préservées.<br />
          <button className="link" onClick={onRetour}>← retour</button>
        </p>
      </header>
      <section className="card">
        <h2>Et toi, quel astre es-tu ?</h2>
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
  if (c.transmissions.length === 0) return 'L\'Univers attend sa première étoile.'
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
  if (h < 18) return 'Le ciel est paisible.'
  return 'Douceur sur votre famille ce soir.'
}

function CielVue({ ciel, me, horsLigne, onOuvrirFrise, onTransmettre, onInviter, onGalaxie, onChronologie, onJardin, onParametres }: {
  ciel: CielData
  me: Astre
  horsLigne: boolean
  onOuvrirFrise: (aboutId: string | null) => void
  onTransmettre: () => void
  onInviter: () => void
  onGalaxie: () => void
  onChronologie: () => void
  onJardin: () => void
  onParametres: () => void
}) {
  const n = ciel.astres.length
  const halos = new Set(
    ciel.transmissions.filter((t) => t.aboutId && Object.keys(t.veilles).length > 0).map((t) => t.aboutId as string),
  )

  return (
    <div className="shell">
      <header className="sky">
        <h1><button className="titre-lien" onClick={onGalaxie}>Famille {ciel.name}</button></h1>
        <p className="whisper">
          {nomIntime(me)} · <button className="link" onClick={onJardin}>le jardin</button> · <button className="link" onClick={onParametres}>paramètres</button> · <button className="link" onClick={onInviter}>inviter</button>
          {horsLigne && <> · en mer, hors réseau — les gestes attendent</>}
        </p>
      </header>

      <div className="ciel">
        {ciel.astres.map((a, i) => {
          const graine = [...a.id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 9973, 7)
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2 + ((graine % 100) / 100 - 0.5) * 0.9
          const r = 24 + (a.circle - 1) * 10 + (graine % 7)
          const left = 50 + r * Math.cos(angle) + ((graine % 11) - 5) * 0.8
          const top = 48 + r * 0.8 * Math.sin(angle) + ((graine % 13) - 6) * 0.7
          return (
            <button
              key={a.id}
              className={`astre-ciel ${halos.has(a.id) ? 'halo' : ''}`}
              style={{ left: `${left}%`, top: `${top}%`, animationDuration: `${9 + (i % 5) * 1.7}s`, animationDelay: `${-(i * 2.3)}s` }}
              onClick={() => onOuvrirFrise(a.id)}
            >
              <span className="astre-core">
                {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="astre-photo" /> : <span className="astre-pure-light" />}
              </span>
              <span className="prenom">{nomIntime(a)}</span>
            </button>
          )
        })}
      </div>

      <button className="etat-ciel" onClick={onChronologie}>{etatDuCiel(ciel)}</button>

      <button className="galet" onClick={onTransmettre} aria-label="Transmettre">
        <span className="galet-dot" />
        <span className="galet-mot">Transmettre</span>
      </button>
    </div>
  )
}

/* ---------- Paramètres personnels ---------- */

function ParametresVue({ me, onRetour, onCalendriers }: {
  me: Astre
  onRetour: () => void
  onCalendriers: (calendarIds: CalendarLayerId[]) => void
}) {
  const actifs = new Set(me.calendarIds ?? [])
  const toggle = (id: CalendarLayerId) => {
    const next = new Set(actifs)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onCalendriers(CALENDAR_LAYERS.filter((c) => next.has(c.id)).map((c) => c.id))
  }

  return (
    <div className="shell">
      <header className="sky">
        <h1>Paramètres</h1>
        <p className="whisper"><button className="link" onClick={onRetour}>← retour aux astres</button></p>
      </header>

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
    <div className="shell">
      <header className="sky">
        <h1>La galaxie {ciel.name}</h1>
        <p className="whisper">
          les générations, des aînés aux enfants · <button className="link" onClick={onRetour}>← retour aux astres</button>
        </p>
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
                  <span className="prenom">{a.name}</span>
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
      <header className="sky">
        <h1>Le fil du temps</h1>
        <p className="whisper">
          souvenirs ← · aujourd'hui · → ce qui vient &nbsp;·&nbsp; <button className="link" onClick={onRetour}>← retour aux astres</button>
        </p>
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
      <header className="sky">
        <h1>Le jardin</h1>
        <p className="whisper">
          Les galaxies où vous veillez · <button className="link" onClick={onRetour}>← retour aux astres</button>
        </p>
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
          <button className="primary" onClick={onRejoindreAutre}>Rejoindre une autre galaxie</button>
          <p className="whisper naissance-note">
            Une même personne peut appartenir à plusieurs galaxies — deux maisons, la famille de cœur, la lignée.
            Chacune garde sa propre lumière.
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
      <header className="sky">
        <h1>La clé de la maison</h1>
        <p className="whisper"><button className="link" onClick={onRetour}>← retour aux astres</button></p>
      </header>
      <section className="card" style={{ textAlign: 'center' }}>
        <p>Chaque proche ouvre l'application sur son appareil, choisit « Rejoindre avec une clé », et entre :</p>
        <p style={{ fontFamily: 'var(--serif)', fontSize: '2rem', letterSpacing: '0.2em', color: 'var(--or-mana)' }}>
          {ciel.inviteCode}
        </p>
        <p className="whisper">La clé ne se partage qu'en famille — c'est la porte de votre Univers.</p>

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

function Composer({ ciel, me, onDone }: {
  ciel: CielData
  me: Astre
  onDone: (t: { kind: TransmissionKind; body: string; aboutId: string | null; recipientIds: string[]; happensOn: string | null } | null) => void
}) {
  const others = ciel.astres.filter((a) => a.id !== me.id)
  const [kind, setKind] = useState<TransmissionKind | null>(null)
  const [recipients, setRecipients] = useState<string[]>(others.map((a) => a.id))
  const [aboutId, setAboutId] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [quand, setQuand] = useState('')

  const toggle = (id: string) =>
    setRecipients((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))

  return (
    <div className="shell">
      <header className="sky">
        <h1>Transmettre</h1>
        <p className="whisper">Un acte de soin aujourd'hui, un acte de mémoire demain.</p>
      </header>

      <section className="card">
        <div className="kind-grid">
          {KINDS.map((k) => (
            <button key={k.kind} className={`kind ${kind === k.kind ? 'on' : ''}`} onClick={() => setKind(k.kind)}>
              <span className="kind-glyph"><KindGlyph kind={k.kind} /></span>
              {k.label}
            </button>
          ))}
        </div>

        <h2>Pour</h2>
        <div className="chips">
          <button
            className={`chip ${recipients.length === others.length ? 'on' : ''}`}
            onClick={() => setRecipients(others.map((a) => a.id))}
          >
            Toute la famille
          </button>
          {others.map((a) => (
            <button key={a.id} className={`chip ${recipients.includes(a.id) ? 'on' : ''}`} onClick={() => toggle(a.id)}>
              {nomIntime(a)}
            </button>
          ))}
        </div>

        <h2>Au sujet de</h2>
        <div className="chips">
          <button className={`chip ${aboutId === null ? 'on' : ''}`} onClick={() => setAboutId(null)}>
            Toute la famille
          </button>
          {ciel.astres.map((a) => (
            <button key={a.id} className={`chip ${aboutId === a.id ? 'on' : ''}`} onClick={() => setAboutId(a.id)}>
              {nomIntime(a)}
            </button>
          ))}
        </div>

        <textarea
          placeholder="Il a eu 39 de fièvre cette nuit — paracétamol à 6h, il dort bien là."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />

        <h2>Quand ?</h2>
        <div className="row naissance-row">
          <input type="date" value={quand} onChange={(e) => setQuand(e.target.value)} aria-label="Quand" />
          <span className="whisper naissance-note">
            {kind === 'organiser' ? 'ce qui vient — la date du rendez-vous' : kind === 'souvenir' ? 'le jour du souvenir, s’il a une date' : 'facultatif — pour la place sur le fil du temps'}
          </span>
        </div>

        <div className="row">
          <button onClick={() => onDone(null)}>Annuler</button>
          <button
            className="primary"
            disabled={!kind || !body.trim() || recipients.length === 0}
            onClick={() => onDone({ kind: kind!, body: body.trim(), aboutId, recipientIds: recipients, happensOn: quand || null })}
          >
            Transmettre
          </button>
        </div>
      </section>
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
      <p className="whisper naissance-note">le petit nom de la maison — très intime, visible seulement de la famille ; le prénom reste dans la galaxie</p>
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

function FriseVue({ ciel, me, aboutId, onRetour, onVeiller, onPortrait, onNaissance, onProfil }: {
  ciel: CielData
  me: Astre
  aboutId: string | null
  onRetour: () => void
  onVeiller: (txId: string) => void
  onPortrait: (astreId: string, dataUrl: string) => void
  onNaissance: (astreId: string, date: string) => void
  onProfil: (astreId: string, nom: string, surnom: string, date: string | null, role: Role, pays: string, codePostal: string) => void
}) {
  const sujet = aboutId ? ciel.astres.find((a) => a.id === aboutId) : null
  const [enEdition, setEnEdition] = useState(false)
  const nameOf = (id: string | null) => {
    const a = ciel.astres.find((x) => x.id === id)
    return a ? nomIntime(a) : null
  }
  const txs = ciel.transmissions.filter(
    (t) => aboutId === null || t.aboutId === aboutId || t.authorId === aboutId,
  )

  return (
    <div className="shell">
      <header className="sky">
        {sujet?.avatarUrl && <img src={sujet.avatarUrl} alt="" className="portrait-frise" />}
        <h1>{sujet ? nomIntime(sujet) : 'Le fil de vie'}</h1>
        <p className="whisper">
          <button className="link" onClick={onRetour}>← retour aux astres</button>
          {sujet && (
            <>
              {' · '}
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

      {txs.length === 0 ? (
        <p className="empty">Le ciel est calme. La première transmission allumera la première étoile.</p>
      ) : (
        <ul className="frise">
          {txs.map((t) => {
            const k = KINDS.find((x) => x.kind === t.kind) ?? KINDS[KINDS.length - 1]
            const mine = t.authorId === me.id
            const forMe = t.forMe
            const iVeilled = Boolean(t.veilles[me.id])
            const lueurs = Object.keys(t.veilles).map((id) => nameOf(id)).filter(Boolean) as string[]

            return (
              <li key={t.id} className={`tx kind-${t.kind}`}>
                <div className="tx-head">
                  <span className="tx-kind"><span className="kind-glyph tx-glyph"><KindGlyph kind={k.kind} /></span> {k.label}</span>
                  <span className="tx-when">
                    {t.happensOn
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
    </div>
  )
}
