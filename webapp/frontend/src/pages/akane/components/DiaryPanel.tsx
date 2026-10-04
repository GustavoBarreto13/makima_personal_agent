// Painel lateral do Início, no estilo do perfil do Letterboxd: Diário (últimas sessões por mês) e Notas (histograma).

import { Stars } from '../../../design'
import { MONTHS_SHORT } from '../../../design/core/format'
import { useAkane } from '../context'
import type { DiaryEntry } from '../types'

const MAX_ROWS = 9
const KEYS = ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0']

interface MonthGroup { key: string; month: number; year: string; items: DiaryEntry[] }

/** Agrupa por mês na ordem recebida (a mais recente primeiro) e corta em `max` linhas no total. */
export function groupRecent(entries: DiaryEntry[], max = MAX_ROWS): MonthGroup[] {
  const groups: MonthGroup[] = []
  let shown = 0
  for (const e of entries) {
    if (shown >= max) break
    const key = e.watched_date.slice(0, 7)
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) { g = { key, month: Number(key.slice(5, 7)) - 1, year: key.slice(0, 4), items: [] }; groups.push(g) }
    g.items.push(e)
    shown++
  }
  return groups
}

export function DiaryPanel({ diary, totalDiary, histogram }: { diary: DiaryEntry[]; totalDiary: number; histogram: Record<string, number> }) {
  const akane = useAkane()
  const groups = groupRecent(diary)
  const dist = KEYS.map((k) => histogram[k] ?? 0)
  const maxD = Math.max(...dist, 1)
  const rated = dist.reduce((a, n) => a + n, 0)

  return (
    <aside className="ds-card ax-panel" aria-label="Diário e notas">
      <div className="ax-pblock">
        <div className="ax-phead"><span>Diário</span><span>{totalDiary}</span></div>
        {groups.length === 0 && <p className="ds-hint">Nenhuma sessão ainda.</p>}
        {groups.map((g) => (
          <div className="ax-pmonth" key={g.key}>
            <div className="ax-mchip" aria-label={`${MONTHS_SHORT[g.month]} de ${g.year}`}><b>{MONTHS_SHORT[g.month]}</b><span>’{g.year.slice(2)}</span></div>
            <div className="ax-prows">
              {g.items.map((e) => (
                <button type="button" className="ax-prow" key={e.id} onClick={() => akane.goto({ view: 'films', movieId: e.movie_id })}>
                  <span className="ax-pday">{Number(e.watched_date.slice(8, 10))}</span>
                  <span className="ax-ptitle">{e.movie_title ?? 'Filme'}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ax-pblock">
        <div className="ax-phead"><span>Notas</span><span>{rated}</span></div>
        <div className="ax-hist" role="img" aria-label="Quantos filmes você avaliou com cada nota, de meia estrela a cinco">
          {dist.map((n, i) => <i key={KEYS[i]} className={n >= maxD * 0.7 && n > 0 ? 'ax-hi' : ''} style={{ height: `${Math.max(2, (n / maxD) * 100)}%` }} title={`${KEYS[i]} · ${n}`} />)}
        </div>
        <div className="ax-hist-foot"><Stars value={1} /><Stars value={5} /></div>
      </div>
    </aside>
  )
}
