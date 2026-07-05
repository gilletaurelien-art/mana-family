import { useEffect, useRef, useState } from 'react'
import type { Astre, Constellation, Role, TransmissionKind } from './types'
import { KINDS, ROLES } from './types'
import { archiverHeritage, chargerHeritage } from './store'
import {
  astresDe, charger, fonder, hisser, poserNaissance, poserPortrait, rejoindre, transmettre, veiller,
  type Ciel as CielData,
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

type Phase =
  | { ecran: 'chargement' }
  | { ecran: 'porte' }
  | { ecran: 'fondation' }
  | { ecran: 'choisir-moi'; nom: string; brouillon: AstreDraft[] }
  | { ecran: 'rejoindre' }
  | { ecran: 'hisser' }
  | { ecran: 'ciel' }
  | { ecran: 'galaxie' }
  | { ecran: 'inviter' }
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
          ? 'L’Univers partagé n’est pas encore ouvert : active « Anonymous sign-ins » dans le dashboard Supabase (Authentication → Sign In / Providers), puis réessaie.'
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
        onRetour={() => setPhase({ ecran: 'porte' })}
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

  return (
    <CielVue
      ciel={ciel}
      me={me}
      horsLigne={horsLigne}
      onOuvrirFrise={(aboutId) => setPhase({ ecran: 'frise', aboutId })}
      onTransmettre={() => setPhase({ ecran: 'composer' })}
      onInviter={() => setPhase({ ecran: 'inviter' })}
      onGalaxie={() => setPhase({ ecran: 'galaxie' })}
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
            Hisser « {heritage.name} » dans l'Univers partagé
          </button>
        )}
        <button className={heritage ? '' : 'primary'} style={{ width: '100%', marginTop: '0.8rem', padding: '0.85rem' }} onClick={onFonder}>
          Fonder une constellation
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
        <h2>Fonder la constellation</h2>
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
        <h2>La clé de la constellation</h2>
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

/* ---------- Hisser l'héritage local vers le ciel partagé ---------- */

function Hisser({ heritage, onHisse, onRetour }: { heritage: Constellation; onHisse: (meId: string) => void; onRetour: () => void }) {
  return (
    <div className="shell">
      <header className="sky">
        <h1>Famille {heritage.name}</h1>
        <p className="whisper">
          {heritage.transmissions.length} transmission{heritage.transmissions.length > 1 ? 's' : ''} rejoindr{heritage.transmissions.length > 1 ? 'ont' : 'a'} l'Univers partagé, dates et lueurs préservées.<br />
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
    return `C'est l'anniversaire de ${anniv.name} — ${age} an${age > 1 ? 's' : ''} aujourd'hui. ✦`
  }
  if (c.transmissions.length === 0) return 'L\'Univers attend sa première étoile.'
  const derniere = new Date(c.transmissions[0].createdAt).getTime()
  if (Date.now() - derniere > 72 * 3600 * 1000) return 'La famille se repose.'
  const veillee = c.transmissions.find((t) => Object.keys(t.veilles).length > 0 && t.aboutId)
  if (veillee) {
    const nom = c.astres.find((a) => a.id === veillee.aboutId)?.name
    if (nom) return `La famille veille sur ${nom}.`
  }
  if (c.transmissions[0].kind === 'souvenir') return 'Un souvenir a été déposé dans le cercle.'
  const h = new Date().getHours()
  if (h < 6) return 'La nuit veille avec vous.'
  if (h < 12) return 'Le jour se lève sur votre famille.'
  if (h < 18) return 'Le ciel est paisible.'
  return 'Douceur sur votre famille ce soir.'
}

function CielVue({ ciel, me, horsLigne, onOuvrirFrise, onTransmettre, onInviter, onGalaxie }: {
  ciel: CielData
  me: Astre
  horsLigne: boolean
  onOuvrirFrise: (aboutId: string | null) => void
  onTransmettre: () => void
  onInviter: () => void
  onGalaxie: () => void
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
          {me.name} · <button className="link" onClick={onGalaxie}>la galaxie</button> · <button className="link" onClick={onInviter}>inviter</button>
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
              <span className="prenom">{a.name}</span>
            </button>
          )
        })}
      </div>

      <button className="etat-ciel" onClick={() => onOuvrirFrise(null)}>{etatDuCiel(ciel)}</button>

      <button className="galet" onClick={onTransmettre} aria-label="Transmettre">
        <span className="galet-dot" />
        <span className="galet-mot">Transmettre</span>
      </button>
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

        <h2>Cet appareil est {me.name}</h2>
        <div className="chips" style={{ justifyContent: 'center' }}>
          {ciel.astres.map((a) => (
            <button key={a.id} className={`chip ${a.id === me.id ? 'on' : ''}`} onClick={() => a.id !== me.id && onChangerAstre(a.id)}>
              {a.name}
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
  onDone: (t: { kind: TransmissionKind; body: string; aboutId: string | null; recipientIds: string[] } | null) => void
}) {
  const others = ciel.astres.filter((a) => a.id !== me.id)
  const [kind, setKind] = useState<TransmissionKind | null>(null)
  const [recipients, setRecipients] = useState<string[]>(others.map((a) => a.id))
  const [aboutId, setAboutId] = useState<string | null>(null)
  const [body, setBody] = useState('')

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
              <span className="kind-emoji">{k.emoji}</span>
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
              {a.name}
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
              {a.name}
            </button>
          ))}
        </div>

        <textarea
          placeholder="Il a eu 39 de fièvre cette nuit — paracétamol à 6h, il dort bien là."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />

        <div className="row">
          <button onClick={() => onDone(null)}>Annuler</button>
          <button
            className="primary"
            disabled={!kind || !body.trim() || recipients.length === 0}
            onClick={() => onDone({ kind: kind!, body: body.trim(), aboutId, recipientIds: recipients })}
          >
            Transmettre
          </button>
        </div>
      </section>
    </div>
  )
}

/* ---------- Le fil de vie ---------- */

function FriseVue({ ciel, me, aboutId, onRetour, onVeiller, onPortrait, onNaissance }: {
  ciel: CielData
  me: Astre
  aboutId: string | null
  onRetour: () => void
  onVeiller: (txId: string) => void
  onPortrait: (astreId: string, dataUrl: string) => void
  onNaissance: (astreId: string, date: string) => void
}) {
  const sujet = aboutId ? ciel.astres.find((a) => a.id === aboutId) : null
  const nameOf = (id: string | null) => ciel.astres.find((a) => a.id === id)?.name ?? null
  const txs = ciel.transmissions.filter(
    (t) => aboutId === null || t.aboutId === aboutId || t.authorId === aboutId,
  )

  return (
    <div className="shell">
      <header className="sky">
        {sujet?.avatarUrl && <img src={sujet.avatarUrl} alt="" className="portrait-frise" />}
        <h1>{sujet ? sujet.name : 'Le fil de vie'}</h1>
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
            </>
          )}
        </p>
        {sujet && (
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
            const k = KINDS.find((x) => x.kind === t.kind)!
            const mine = t.authorId === me.id
            const forMe = t.recipientIds.includes(me.id)
            const iVeilled = Boolean(t.veilles[me.id])
            const lueurs = Object.keys(t.veilles).map((id) => nameOf(id)).filter(Boolean) as string[]

            return (
              <li key={t.id} className={`tx kind-${t.kind}`}>
                <div className="tx-head">
                  <span className="tx-kind">{k.emoji} {k.label}</span>
                  <span className="tx-when">
                    {new Date(t.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
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
