// Tela Reflect — card de pergunta da Violet com ciclo de 4 prompts e seção "Releia-se".

import { useEffect, useState } from 'react'
import { violetApi } from '../../../lib/api'
import type { CollectionItem, DreamItem } from '../types'

interface ReflectProps {
  navigate: (view: string, param?: string | null) => void
}

// As 4 perguntas de reflexão assinadas pela Violet, em estilo Newsreader itálico
const PROMPTS: Array<{ q: string; by: string }> = [
  { q: 'O que ficou de mais valioso no seu dia de hoje?',          by: 'Violet' },
  { q: 'Qual foi o momento em que você se sentiu mais vivo?',      by: 'Violet' },
  { q: 'O que você deixou para amanhã que poderia ter feito hoje?', by: 'Violet' },
  { q: 'Existe algo que você notou hoje mas não registrou ainda?',  by: 'Violet' },
]

// Seleciona deterministicamente 1 item de um array pelo dia do ano:
// evita que a seleção mude ao recarregar a página no mesmo dia.
function pickByDayOfYear<T>(arr: T[]): T | null {
  if (!arr.length) return null
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000)
  return arr[dayOfYear % arr.length]
}

export function Reflect({ navigate }: ReflectProps) {
  // Índice do prompt ativo (0–3), permite ciclar com "Outra pergunta"
  const [promptIdx, setPromptIdx] = useState(0)
  // Itens para a seção "Releia-se" (um por tipo: wisdom, highlight, dream, idea)
  const [wisdom, setWisdom]       = useState<CollectionItem | null>(null)
  const [highlight, setHighlight] = useState<CollectionItem | null>(null)
  const [dream, setDream]         = useState<DreamItem | null>(null)
  const [idea, setIdea]           = useState<CollectionItem | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    // Carrega todos os tipos de coleção em paralelo para o "Releia-se"
    Promise.allSettled([
      violetApi.collection('wisdom'),
      violetApi.collection('highlight'),
      violetApi.dreams(),
      violetApi.collection('idea'),
    ]).then(([wi, hi, dr, id]) => {
      if (wi.status === 'fulfilled') setWisdom(pickByDayOfYear(wi.value as CollectionItem[]))
      if (hi.status === 'fulfilled') setHighlight(pickByDayOfYear(hi.value as CollectionItem[]))
      if (dr.status === 'fulfilled') setDream(pickByDayOfYear(dr.value as DreamItem[]))
      if (id.status === 'fulfilled') setIdea(pickByDayOfYear(id.value as CollectionItem[]))
    }).finally(() => setLoading(false))
  }, [])

  const prompt = PROMPTS[promptIdx]

  function nextPrompt() {
    setPromptIdx(i => (i + 1) % PROMPTS.length)
  }

  const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  function fmtDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00')
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
  }

  // Reúne os itens do "Releia-se" que existem (pula tipo vazio)
  const rereads: Array<{ label: string; text: string; date: string; entry: number }> = []
  if (wisdom)    rereads.push({ label: 'Sabedoria', text: wisdom.content,    date: wisdom.date,    entry: wisdom.entry_num })
  if (highlight) rereads.push({ label: 'Destaque',  text: highlight.content, date: highlight.date, entry: highlight.entry_num })
  if (dream)     rereads.push({ label: 'Sonho',     text: dream.dream,       date: dream.date,     entry: dream.entry_num })
  if (idea)      rereads.push({ label: 'Ideia',     text: idea.content,      date: idea.date,      entry: idea.entry_num })

  return (
    <div className="page" style={{ paddingTop: 32 }}>
      {/* ── Card de pergunta ── */}
      <div className="rf-card">
        {/* Eyebrow Mono uppercase */}
        <div className="rf-eyebrow">Reflexão do dia</div>

        {/* Pergunta em Newsreader 30px */}
        <p className="rf-question">"{prompt.q}"</p>

        {/* Assinatura */}
        <div className="rf-signature">— {prompt.by}</div>

        {/* Ações */}
        <div className="rf-actions">
          <button
            className="rf-btn-primary"
            onClick={() => navigate('write')}
          >
            Responder hoje
          </button>
          <button
            className="rf-btn-secondary"
            onClick={nextPrompt}
          >
            Outra pergunta
          </button>
        </div>
      </div>

      {/* ── Releia-se ── */}
      {!loading && rereads.length > 0 && (
        <div className="rf-reread">
          <div className="rf-reread-title">Releia-se</div>
          <div className="rf-reread-list">
            {rereads.map((item, i) => (
              <div key={i} className="rf-reread-card">
                <div className="rf-reread-label">{item.label}</div>
                <p className="rf-reread-text">"{item.text}"</p>
                <button
                  className="col-origin"
                  onClick={() => navigate('write', item.date)}
                >
                  #{item.entry} · {fmtDate(item.date)}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && rereads.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--ink-3)', fontSize: 13 }}>
          Escreva alguns bullets de sabedoria, destaques e ideias para ativar o "Releia-se".
        </div>
      )}
    </div>
  )
}
