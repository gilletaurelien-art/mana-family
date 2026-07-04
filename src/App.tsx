import { useState } from 'react'
import type { Astre, Constellation, Role, TransmissionKind } from './types'
import { KINDS, ROLES } from './types'
import { found, load, setAvatar, transmit, veiller } from './store'

/** Portrait : recadré carré, réduit à 128px — jamais l'original dans la mémoire locale. */
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

type Vue = { ecran: 'ciel' } | { ecran: 'frise'; aboutId: string | null } | { ecran: 'composer' }

export default function App() {
  const [constellation, setConstellation] = useState<Constellation | null>(() => load())
  const [meId, setMeId] = useState<string | null>(null)
  const [vue, setVue] = useState<Vue>({ ecran: 'ciel' })

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

  if (vue.ecran === 'composer') {
    return (
      <Composer
        constellation={constellation}
        me={me}
        onDone={(next) => {
          if (next) setConstellation(next)
          setVue({ ecran: 'ciel' })
        }}
      />
    )
  }

  if (vue.ecran === 'frise') {
    return (
      <FriseVue
        constellation={constellation}
        me={me}
        aboutId={vue.aboutId}
        onRetour={() => setVue({ ecran: 'ciel' })}
        onVeiller={(txId) => setConstellation(veiller(constellation, txId, me.id))}
        onPortrait={(astreId, dataUrl) => setConstellation(setAvatar(constellation, astreId, dataUrl))}
      />
    )
  }

  return (
    <Ciel
      constellation={constellation}
      me={me}
      onChanger={() => setMeId(null)}
      onOuvrirFrise={(aboutId) => setVue({ ecran: 'frise', aboutId })}
      onTransmettre={() => setVue({ ecran: 'composer' })}
    />
  )
}

/* ---------- Le Ciel — la constellation respire, l'État du Ciel murmure ---------- */

function etatDuCiel(c: Constellation): string {
  if (c.transmissions.length === 0) return 'Le ciel attend sa première étoile.'
  const veillee = c.transmissions.find((t) => Object.keys(t.veilles).length > 0 && t.aboutId)
  if (veillee) {
    const nom = c.astres.find((a) => a.id === veillee.aboutId)?.name
    if (nom) return `La constellation veille sur ${nom}.`
  }
  if (c.transmissions[0].kind === 'souvenir') return 'Un souvenir a été déposé dans le cercle.'
  return 'Douceur sur votre constellation ce soir.'
}

function Ciel({
  constellation,
  me,
  onChanger,
  onOuvrirFrise,
  onTransmettre,
}: {
  constellation: Constellation
  me: Astre
  onChanger: () => void
  onOuvrirFrise: (aboutId: string | null) => void
  onTransmettre: () => void
}) {
  const n = constellation.astres.length
  // Un astre a sa lueur si une transmission à son sujet a été veillée.
  const halos = new Set(
    constellation.transmissions
      .filter((t) => t.aboutId && Object.keys(t.veilles).length > 0)
      .map((t) => t.aboutId as string),
  )

  return (
    <div className="shell">
      <header className="sky">
        <h1>{constellation.name}</h1>
        <p className="whisper">
          {me.name} · <button className="link" onClick={onChanger}>changer</button>
        </p>
      </header>

      <div className="ciel">
        {constellation.astres.map((a, i) => {
          // Ellipse brisée, jamais une grille : l'orbite s'élargit avec le Cercle,
          // et chaque astre porte un écart propre, semé par son nom — un ciel n'a pas d'angles droits.
          const graine = [...a.id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 9973, 7)
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2 + ((graine % 100) / 100 - 0.5) * 0.9
          const r = 24 + (a.circle - 1) * 10 + (graine % 7)
          const left = 50 + r * Math.cos(angle) + ((graine % 11) - 5) * 0.8
          const top = 48 + r * 0.8 * Math.sin(angle) + ((graine % 13) - 6) * 0.7
          return (
            <button
              key={a.id}
              className={`astre-ciel ${halos.has(a.id) ? 'halo' : ''}`}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                animationDuration: `${9 + (i % 5) * 1.7}s`,
                animationDelay: `${-(i * 2.3)}s`,
              }}
              onClick={() => onOuvrirFrise(a.id)}
            >
              <span className="astre-core">
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt="" className="astre-photo" />
                ) : (
                  <span className="astre-pure-light" />
                )}
              </span>
              <span className="prenom">{a.name}</span>
            </button>
          )
        })}
      </div>

      {/* L'État du Ciel — un bulletin météo affectif, jamais un journal de logs */}
      <button className="etat-ciel" onClick={() => onOuvrirFrise(null)}>
        {etatDuCiel(constellation)}
      </button>

      {/* Le galet — une invitation, pas un ordre. Pas de « + ». */}
      <button className="galet" onClick={onTransmettre} aria-label="Transmettre">
        <span className="galet-dot" />
        <span className="galet-mot">Transmettre</span>
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
          <button onClick={add} aria-label="Ajouter cet astre" className="ajout-astre">✦</button>
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

function FriseVue({
  constellation,
  me,
  aboutId,
  onRetour,
  onVeiller,
  onPortrait,
}: {
  constellation: Constellation
  me: Astre
  aboutId: string | null
  onRetour: () => void
  onVeiller: (txId: string) => void
  onPortrait: (astreId: string, dataUrl: string) => void
}) {
  const sujet = aboutId ? constellation.astres.find((a) => a.id === aboutId) : null
  const nameOf = (id: string | null) => constellation.astres.find((a) => a.id === id)?.name ?? null
  const txs = constellation.transmissions.filter(
    (t) => aboutId === null || t.aboutId === aboutId || t.authorId === aboutId,
  )

  return (
    <div className="shell">
      <header className="sky">
        {sujet?.avatarUrl && <img src={sujet.avatarUrl} alt="" className="portrait-frise" />}
        <h1>{sujet ? sujet.name : 'Le fil de vie'}</h1>
        <p className="whisper">
          <button className="link" onClick={onRetour}>← retour au ciel</button>
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
      )}
    </div>
  )
}
