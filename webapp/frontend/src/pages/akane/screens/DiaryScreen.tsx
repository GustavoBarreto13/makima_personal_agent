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
import { SessionContextFields } from '../components/SessionContextFields'
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
  const [editingId, setEditingId] = useState<string | null>(null)

  // Busca as 100 sessões mais recentes na montagem
  useEffect(() => {
    akaneApi.diary(100)
      .then(res => setEntries(res.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="ak-empty-state">Carregando diário…</p>
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
    <div className="ak-page">
      <div className="ak-section-head" style={{ marginTop: 32 }}>
        <h2 className="ak-section-title" style={{ fontSize: 30 }}>Diário</h2>
        <span className="ak-section-sub">{entries.length} sessões registradas · bebe da sua lista de filmes</span>
      </div>

      {entries.length === 0 && (
        <p className="ak-empty-state">Diário vazio — registre sua primeira sessão em "Logar filme".</p>
      )}
      {entries.length > 0 && filtered.length === 0 && hasQuery && (
        <p className="ak-empty-state">Nada encontrado para "{query}".</p>
      )}

      {groups.map(g => (
        <div className="ak-diary-month" key={g.key}>
          <div className="ak-diary-month-label">
            <span className="ak-dm-name">{MESES[g.m].charAt(0).toUpperCase() + MESES[g.m].slice(1)}</span>
            <span className="ak-dm-year">{g.y}</span>
            <span className="ak-dm-count">{g.items.length} {g.items.length === 1 ? 'sessão' : 'sessões'}</span>
          </div>

          {groupByDate(g.items).map(dateGroup => (
            dateGroup.entries.map((e, i) => {
              const dt = new Date(e.watched_date + 'T00:00:00')
              // Setas só quando há mais de uma sessão no dia (e sem busca ativa —
              // a lista parcial gravaria posições erradas no servidor)
              const canReorder = !hasQuery && dateGroup.entries.length > 1
              return (
                <div className="ak-diary-row" key={e.id} onClick={() => onSelectMovie(e.movie_id)}>
                  <div className="ak-dr-day">
                    <div className="ak-d-num">{dt.getDate()}</div>
                    <div className="ak-d-wd">{DIAS_CURTO[dt.getDay()]}</div>
                  </div>
                  <div className="ak-dr-poster">
                    <Poster title={e.movie_title ?? ''} posterUrl={e.poster_url} palette={e.poster_palette} />
                  </div>
                  <div className="ak-dr-main">
                    <div className="ak-dr-title">{e.movie_title}</div>
                    {e.review && <div className="ak-dr-note">"{e.review}"</div>}
                  </div>
                  <div className="ak-dr-marks">
                    {e.rating ? <Stars value={e.rating} /> : <span className="ak-mk">—</span>}
                    {e.rewatch && <span className="ak-mk ak-rw"><Icon name="rewatch" /></span>}
                    <button title="Editar contexto da sessão" onClick={event => { event.stopPropagation(); setEditingId(editingId === e.id ? null : e.id) }}><Icon name="pen" /></button>
                  </div>
                  {(e.companions.length > 0 || e.watch_location) && <div className="ak-chips">
                    {e.companions.map(person => <span className="ak-tag-chip ak-person" key={person.id}><Icon name="user" />{person.name}</span>)}
                    {e.watch_location && <span className="ak-tag-chip"><Icon name={e.watch_location.kind === 'cinema' ? 'cinema' : 'streaming'} />{e.watch_location.name}</span>}
                  </div>}
                  {editingId === e.id && <DiaryContextEditor entry={e} onCancel={() => setEditingId(null)} onUpdated={updated => {
                    setEntries(previous => previous.map(item => item.id === updated.id ? updated : item))
                    setEditingId(null)
                  }} />}
                  {canReorder && (
                    <div className="ak-dr-reorder" onClick={ev => ev.stopPropagation()}>
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

/** Editar acompanhantes e local sem abrir o detalhe do filme. */
function DiaryContextEditor({ entry, onCancel, onUpdated }: {
  entry: DiaryEntry
  onCancel: () => void
  onUpdated: (entry: DiaryEntry) => void
}) {
  const [companionIds, setCompanionIds] = useState(entry.companions.map(person => person.id))
  const [watchLocationId, setWatchLocationId] = useState<string | null>(entry.watch_location?.id ?? null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const result = await akaneApi.updateDiaryEntry(entry.id, {
        companion_ids: companionIds,
        watch_location_id: watchLocationId,
      })
      onUpdated(result.entry)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ak-modal-field" onClick={event => event.stopPropagation()} style={{ gridColumn: '1 / -1' }}>
      <SessionContextFields companionIds={companionIds} onCompanionIdsChange={setCompanionIds}
        watchLocationId={watchLocationId} onWatchLocationIdChange={setWatchLocationId} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="ak-btn ak-btn-primary" type="button" onClick={save} disabled={saving}><Icon name="check" /> Salvar</button>
        <button className="ak-btn ak-btn-ghost" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </div>
  )
}
