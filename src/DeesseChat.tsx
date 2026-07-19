import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

/* ------------------------------------------------------------------
   La Déesse — le visage de l'assistance Mana pour la famille.
   Un moteur unique (edge function `ask-mana`, Claude Haiku), trois
   incarnations : Marianne (civique), la Fée (folklorique), la Déesse
   (family). Ici elle parle doucement, au tutoiement, et guide sans
   jamais presser. Si le moteur dort, elle le dit avec grâce.
   ------------------------------------------------------------------ */

type Ligne = { qui: 'deesse' | 'moi'; mot: string }

const ACCUEIL: Ligne = {
  qui: 'deesse',
  mot: "Bonjour, je suis l'assistance de MANAfamily — la confidente de ta maison. Demande-moi ce que tu veux comprendre : comment partager un moment, veiller sur un proche, ou garder un souvenir vivant.",
}

const CONTEXTE = [
  "Tu es la Déesse de Mana Family : la confidente bienveillante d'une famille.",
  "Tu parles au tutoiement, avec douceur et sobriété, sans jargon.",
  "Mana Family est un cercle privé et intime : partager un moment (la Présence),",
  "veiller les uns sur les autres, et garder la mémoire vivante (le carnet de famille).",
  "Rien n'y est public, rien n'est vendu, rien ne s'efface. Jamais de relance ni de reproche.",
  "Réponds court, chaleureux, et rassure la personne la moins à l'aise avec les écrans.",
].join(' ')

export default function DeesseChat() {
  const [fil, setFil] = useState<Ligne[]>([ACCUEIL])
  const [saisie, setSaisie] = useState('')
  const [occupe, setOccupe] = useState(false)
  const filRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    filRef.current?.scrollTo({ top: filRef.current.scrollHeight, behavior: 'smooth' })
  }, [fil, occupe])

  const demander = async () => {
    const question = saisie.trim()
    if (!question || occupe) return
    setFil((f) => [...f, { qui: 'moi', mot: question }])
    setSaisie('')
    setOccupe(true)
    try {
      const { data, error } = await supabase.functions.invoke('ask-mana', {
        body: { question, context: CONTEXTE },
      })
      if (error) throw error
      const reponse = (data as { answer?: string })?.answer?.trim()
      setFil((f) => [
        ...f,
        { qui: 'deesse', mot: reponse || "Je n'ai pas su répondre à cela — reformule-moi ta question ?" },
      ])
    } catch {
      setFil((f) => [
        ...f,
        {
          qui: 'deesse',
          mot: "Je m'éveille encore et ma voix vacille. Reviens un peu plus tard — la maison, elle, reste ouverte. 🌙",
        },
      ])
    } finally {
      setOccupe(false)
    }
  }

  return (
    <section className="assistante-bloc deesse-chat">
      <div className="deesse-tete">
        <img className="deesse-orbe" src="/plume.jpg" alt="" />
        <div>
          <h2>Assistance MANAfamily</h2>
          <p className="deesse-sous">la confidente de ta maison</p>
        </div>
      </div>

      <div className="deesse-fil" ref={filRef}>
        {fil.map((l, i) => (
          <div className={`deesse-ligne ${l.qui === 'moi' ? 'moi' : ''}`} key={i}>
            {l.qui === 'deesse' && <img className="deesse-mini" src="/plume.jpg" alt="" />}
            <p className={`deesse-bulle ${l.qui === 'moi' ? 'moi' : ''}`}>{l.mot}</p>
          </div>
        ))}
        {occupe && (
          <div className="deesse-ligne">
            <img className="deesse-mini" src="/plume.jpg" alt="" />
            <p className="deesse-bulle">
              <span className="deesse-points" aria-label="la Déesse réfléchit"><span></span><span></span><span></span></span>
            </p>
          </div>
        )}
      </div>

      <div className="deesse-saisie">
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') demander() }}
          placeholder="Pose ta question…"
          aria-label="Ta question à la Déesse"
          disabled={occupe}
        />
        <button onClick={demander} disabled={!saisie.trim() || occupe} aria-label="Envoyer">↑</button>
      </div>
    </section>
  )
}
