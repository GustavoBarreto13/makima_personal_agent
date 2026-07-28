// Tela Diário — reescrita hi-fi conforme o handoff §7.3: tabela cronológica
// estilo Letterboxd, agrupada por mês/ano (diary-month), cada linha com
// dia + dia-da-semana, mini-pôster, título·ano, anotação em itálico e
// marcadores (estrelas / loop de revisão).
// A reordenação de sessões do mesmo dia (spec 050, US7) foi PRESERVADA,
// com as setas ▲▼ estilizadas no padrão do sistema.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { DiaryEntry } from '../types'
import { Icon } from '../ui/Icon'
import { Poster } from '../components/Poster'
import { Stars } from '../components/Stars'
import { matches } from '../searchUtils'
import { MESES, DIAS_CURTO } from '../dateUtils'

interface DiaryScreenProps {
  /** Abre o detalhe do filme da sessão. */
  onSelectMovie: (movieId: string) => void
  /** Query da busca contextual da topbar — filtra client-side. */
  query: string
}

// Agrupamento por mês/ano (ordem cronológica decrescente preservada)
interface MonthGroup { key: string; m: number; y: number; items: DiaryEntry[] }

function groupByMonth(entries: DiaryEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const e of entries) {
    const dt = new Date(e.watched_date + 'T00:00:00')
    const key = dt.getFullYear() + '-' + dt.getMonth()
    let g = groups.find(x => x.key === key)
    if (!g) { g = { key, m: dt.getMonth(), y: dt.getFullYear(), items: [] }; groups.push(g) }
    g.items.push(e)
  }
  return groups
}

/**
 * Sub-agrupa as entradas de um mês por dia, preservando a ordem.
 * Só linhas do mesmo dia ganham os controles de reordenar (spec 050, US7).
 */
function groupByDate(entries: DiaryEntry[]): Array<{ date: string; entries: DiaryEntry[] }> {
  const groups: Array<{ date: string; entries: DiaryEntry[] }> = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (last && last.date === entry.watched_date) {
      last.entries.push(entry)
    } else {
      groups.push({ date: entry.watched_date, entries: [entry] })
    }
  }
  return groups
}

/** Diário de sessões — cronológico, agrupado por mês. */
export function DiaryScreen({ onSelectMovie, query }: DiaryScreenProps) {
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Busca as 100 sessões mais recentes na montagem
  useEffect(() => {
    akaneApi.diary(100)
      .then(res => setEntries(res.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="empty-state">Carregando diário…</p>
  }

  // Reordena as entradas de um mesmo dia (spec 050, US7) — otimista
  const reorderDate = async (date: string, newOrder: DiaryEntry[]) => {
    setEntries(prev => {
      const ids = new Set(newOrder.map(e => e.id))
      const next = [...prev]
      const firstIdx = next.findIndex(e => ids.has(e.id))
      const rest = next.filter(e => !ids.has(e.id))
      rest.splice(firstIdx, 0, ...newOrder)
      return rest
    })
    try {
      await akaneApi.reorderDiary(date, newOrder.map(e => e.id))
    } catch {
      // Erro aqui só faz a ordem local divergir até a próxima visita à tela —
      // recarregar tudo por causa de uma reordenação seria pior.
    }
  }

  // Busca client-side antes do agrupamento (meses vazios somem)
  const filtered = entries.filter(e => matches(query, e.movie_title, e.review, e.tags))
  const hasQuery = query.trim().length > 0
  const groups = groupByMonth(filtered)

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 30 }}>Diário</h2>
        <span className="section-sub">{entries.length} sessões registradas · bebe da sua lista de filmes</span>
      </div>

      {entries.length === 0 && (
        <p className="empty-state">Diário vazio — registre sua primeira sessão em "Logar filme".</p>
      )}
      {entries.length > 0 && filtered.length === 0 && hasQuery && (
        <p className="empty-state">Nada encontrado para "{query}".</p>
      )}

      {groups.map(g => (
        <div className="diary-month" key={g.key}>
          <div className="diary-month-label">
            <span className="dm-name">{MESES[g.m].charAt(0).toUpperCase() + MESES[g.m].slice(1)}</span>
            <span className="dm-year">{g.y}</span>
            <span className="dm-count">{g.items.length} {g.items.length === 1 ? 'sessão' : 'sessões'}</span>
          </div>

          {groupByDate(g.items).map(dateGroup => (
            dateGroup.entries.map((e, i) => {
              const dt = new Date(e.watched_date + 'T00:00:00')
              // Setas só quando há mais de uma sessão no dia (e sem busca ativa —
              // a lista parcial gravaria posições erradas no servidor)
              const canReorder = !hasQuery && dateGroup.entries.length > 1
              return (
                <div className="diary-row" key={e.id} onClick={() => onSelectMovie(e.movie_id)}>
                  <div className="dr-day">
                    <div className="d-num">{dt.getDate()}</div>
                    <div className="d-wd">{DIAS_CURTO[dt.getDay()]}</div>
                  </div>
                  <div className="dr-poster">
                    <Poster title={e.movie_title ?? ''} posterUrl={e.poster_url} palette={e.poster_palette} />
                  </div>
                  <div className="dr-main">
                    <div className="dr-title">{e.movie_title}</div>
                    {e.review && <div className="dr-note">"{e.review}"</div>}
                  </div>
                  <div className="dr-marks">
                    {e.rating ? <Stars value={e.rating} /> : <span className="mk">—</span>}
                    {e.rewatch && <span className="mk rw"><Icon name="rewatch" /></span>}
                  </div>
                  {canReorder && (
                    <div className="dr-reorder" onClick={ev => ev.stopPropagation()}>
                      <button disabled={i === 0} title="Mover para cima (assistido antes)"
                              onClick={() => {
                                const next = [...dateGroup.entries]
                                ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                                reorderDate(dateGroup.date, next)
                              }}>▲</button>
                      <button disabled={i === dateGroup.entries.length - 1} title="Mover para baixo (assistido depois)"
                              onClick={() => {
                                const next = [...dateGroup.entries]
                                ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
                                reorderDate(dateGroup.date, next)
                              }}>▼</button>
                    </div>
                  )}
                </div>
              )
            })
          ))}
        </div>
      ))}
    </div>
  )
}
