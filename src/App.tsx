import { useState } from 'react'
import type { Astre, Constellation, Role, TransmissionKind } from './types'
import { KINDS, ROLES } from './types'
import { found, load, transmit, veiller } from './store'

export default function App() {
  const [constellation, setConstellation] = useState<Constellation | null>(() => load())
  const [meId, setMeId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  if (!constellation) {
    return <Fondation onFound={(c) => setConstellation(c)} />
  }

  const me = constellation.astres.find((a) => a.id === meId) ?? null

  if (!me) {
    return (
      <div className="shell">
        <header className="sky">
          <h1>{constellation.name}</h1>
          <p className="whisper">Qui veille en ce moment ?</p>
        </header>
        <div className="astre-grid">
          {constellation.astres.map((a) => (
            <button key={a.id} className="astre-pick" onClick={() => setMeId(a.id)}>
              <span className="astre-dot" />
              {a.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (composing) {
    return (
      <Composer
        constellation={constellation}
        me={me}
        onDone={(next) => {
          if (next) setConstellation(next)
          setComposing(false)
        }}
      />
    )
  }

  return (
    <div className="shell">
      <header className="sky">
        <h1>{constellation.name}</h1>
        <p className="whisper">
          {me.name} · <button className="link" onClick={() => setMeId(null)}>changer</button>
        </p>
      </header>

      <Frise constellation={constellation} me={me} onVeiller={(txId) => setConstellation(veiller(constellation, txId, me.id))} />

      <button className="transmit-fab" onClick={() => setComposing(true)}>
        Transmettre
      </button>
    </div>
  )
}

/* ---------- Fondation du Cercle 1 ---------- */

function Fondation({ onFound }: { onFound: (c: Constellation) => void }) {
  const [name, setName] = useState('')
  const [astres, setAstres] = useState<Astre[]>([])
  const [draft, setDraft] = useState('')
  const [role, setRole] = useState<Role>('parent')

  const add = () => {
    if (!draft.trim()) return
    const meta = ROLES.find((r) => r.role === role)!
    setAstres([...astres, { id: crypto.randomUUID(), name: draft.trim(), role, circle: meta.circle }])
    setDraft('')
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
              <option key={r.role} value={r.role}>
                {r.label}
              </option>
            ))}
          </select>
          <button onClick={add}>+</button>
        </div>

        <ul className="astre-list">
          {astres.map((a) => (
            <li key={a.id}>
              <span className="astre-dot" /> {a.name} <em>· {ROLES.find((r) => r.role === a.role)?.label} · Cercle {a.circle}</em>
            </li>
          ))}
        </ul>

        <button
          className="primary"
          disabled={!name.trim() || astres.length < 2}
          onClick={() => onFound(found(name.trim(), astres))}
        >
          Allumer les astres
        </button>
      </section>
    </div>
  )
}

/* ---------- Composer une transmission : deux gestes, puis les mots ---------- */

function Composer({
  constellation,
  me,
  onDone,
}: {
  constellation: Constellation
  me: Astre
  onDone: (next: Constellation | null) => void
}) {
  const others = constellation.astres.filter((a) => a.id !== me.id)
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
            <button
              key={k.kind}
              className={`kind ${kind === k.kind ? 'on' : ''}`}
              onClick={() => setKind(k.kind)}
            >
              <span className="kind-emoji">{k.emoji}</span>
              {k.label}
            </button>
          ))}
        </div>

        <h2>Pour</h2>
        <div className="chips">
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
          {constellation.astres.map((a) => (
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
            onClick={() =>
              onDone(
                transmit(constellation, {
                  authorId: me.id,
                  aboutId,
                  kind: kind!,
                  body: body.trim(),
                  recipientIds: recipients,
                }),
              )
            }
          >
            Transmettre
          </button>
        </div>
      </section>
    </div>
  )
}

/* ---------- Le fil de vie — se contemple, ne se scrolle pas frénétiquement ---------- */

function Frise({
  constellation,
  me,
  onVeiller,
}: {
  constellation: Constellation
  me: Astre
  onVeiller: (txId: string) => void
}) {
  const nameOf = (id: string | null) => constellation.astres.find((a) => a.id === id)?.name ?? null

  if (constellation.transmissions.length === 0) {
    return <p className="empty">Le ciel est calme. La première transmission allumera la première étoile.</p>
  }

  return (
    <ul className="frise">
      {constellation.transmissions.map((t) => {
        const k = KINDS.find((x) => x.kind === t.kind)!
        const mine = t.authorId === me.id
        const forMe = t.recipientIds.includes(me.id)
        const iVeilled = Boolean(t.veilles[me.id])
        const lueurs = Object.keys(t.veilles).map((id) => nameOf(id)).filter(Boolean) as string[]

        return (
          <li key={t.id} className={`tx kind-${t.kind}`}>
            <div className="tx-head">
              <span className="tx-kind">
                {k.emoji} {k.label}
              </span>
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
  )
}
