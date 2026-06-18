// Tela Journal — arquivo de entries agrupadas por mês, com busca e clique para abrir Write.

import { useEffect, useState } from 'react'
import { violetApi } from '../../../lib/api'
// Helper de data local: evita o bug de UTC onde "hoje" muda às 21h no UTC-3
import { todayLocalISO } from '../dateUtils'
import type { EntryListItem } from '../types'
import { RichText } from '../ui/RichText'

interface JournalScreenProps {
  query: string
  navigate: (view: string, param?: string | null) => void
}

// Nomes dos meses em português para o cabeçalho de agrupamento
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

// Converte uma data YYYY-MM-DD em uma descrição relativa: "Hoje", "Ontem", "N dias atrás"
function relativeDate(dateStr: string): string {
  // todayLocalISO() usa o fuso do navegador — sem isso, "Hoje" viraria "Ontem" após as 21h
  const today = todayLocalISO()
  const diff = Math.round((new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return `${diff} dias atrás`
}

export function JournalScreen({ query, navigate }: JournalScreenProps) {
  const [entries, setEntries] = useState<EntryListItem[]>([])
  const [loading, setLoading] = useState(true)

  // Carrega entries do backend sempre que a query muda
  useEffect(() => {
    setLoading(true)
    violetApi.entries(query).then((list: unknown) => {
      setEntries(list as EntryListItem[])
    }).catch(() => {
      setEntries([])
    }).finally(() => setLoading(false))
  }, [query])

  if (loading) {
    return (
      <div className="page" style={{ paddingTop: 40 }}>
        <div style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>
          carregando...
        </div>
      </div>
    )
  }

  if (!entries.length) {
    return (
      <div className="page" style={{ paddingTop: 40, textAlign: 'center' }}>
        <div style={{ marginTop: 60 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink-2)', marginBottom: 10 }}>
            {query ? 'Nenhuma entrada encontrada' : 'Nenhuma entrada ainda'}
          </div>
          <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>
            {query ? `Sem resultados para "${query}"` : 'Escreva sua primeira entrada no diário.'}
          </div>
        </div>
      </div>
    )
  }

  // Agrupa entries por "Mês Ano" em ordem descendente
  const groups: Map<string, EntryListItem[]> = new Map()
  for (const entry of entries) {
    const d = new Date(entry.date + 'T12:00:00')
    const key = `${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(entry)
  }

  return (
    <div className="page" style={{ paddingTop: 32 }}>
      {Array.from(groups.entries()).map(([monthLabel, monthEntries]) => (
        <div key={monthLabel} className="jn-month-group">
          {/* Cabeçalho do mês em DM Mono uppercase */}
          <div className="jn-month-head">{monthLabel}</div>

          <div className="jn-cards">
            {monthEntries.map(entry => {
              const d = new Date(entry.date + 'T12:00:00')
              return (
                <div
                  key={entry.date}
                  className="jn-card"
                  onClick={() => navigate('write', entry.date)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && navigate('write', entry.date)}
                >
                  {/* Data: dia grande (Newsreader) + dia-da-semana mono */}
                  <div className="jn-date-col">
                    <div className="jn-day-num">{d.getDate()}</div>
                    <div className="jn-day-week">{DAYS_SHORT[d.getDay()]}</div>
                  </div>

                  {/* Conteúdo do card */}
                  <div className="jn-body">
                    <div className="jn-meta">
                      <span className="jn-num">#{entry.num}</span>
                      <span className="jn-sep">·</span>
                      <span className="jn-when">{relativeDate(entry.date)}</span>
                      <span className="jn-sep">·</span>
                      <span className="jn-count">{entry.bullet_count} {entry.bullet_count === 1 ? 'nota' : 'notas'}</span>
                    </div>

                    {/* Excerpt com clamp de 2 linhas */}
                    {entry.excerpt && (
                      <div className="jn-excerpt">
                        <RichText content={entry.excerpt} />
                      </div>
                    )}

                    {/* Pills de destaque e sonho */}
                    <div className="jn-pills">
                      {entry.has_highlight && <span className="jn-pill pill-garnet">✦ destaque</span>}
                      {entry.has_dream && <span className="jn-pill pill-gold">◎ sonho</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
