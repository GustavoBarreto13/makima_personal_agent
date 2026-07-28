// Painel lateral estilo perfil do Letterboxd — porte do LbPanel do handoff
// (akane/screens-a.jsx). Dois blocos:
//   · Diário — sessões agrupadas por mês (chip mês/ano + dia + título),
//     limitado a ~9 linhas; contagem total no canto.
//   · Notas  — histograma de notas 0.5–5.0 com meia-estrela verde à esquerda
//     e 5 estrelas verdes à direita (widget RATINGS do Letterboxd).

import type { DiaryEntry } from '../types'
import { StarShape } from '../ui/Heart'
import { MESES_CURTO } from '../dateUtils'

interface LbPanelProps {
  /** Sessões recentes (bastam ~30 — o painel limita a 9 linhas). */
  diary: DiaryEntry[]
  /** Total de sessões do diário (contagem exibida no canto do bloco). */
  totalDiary: number
  /** Histograma de notas do catálogo ({"0.5": n, … "5.0": n}). */
  histogram: Record<string, number>
  /** Abrir o detalhe do filme de uma linha. */
  onSelectMovie: (id: string) => void
}

// Agrupamento das sessões por mês/ano, preservando a ordem cronológica
interface MonthGroup { key: string; m: number; y: number; items: DiaryEntry[] }

/** Painel Diário + Notas da coluna lateral da Home. */
export function LbPanel({ diary, totalDiary, histogram, onSelectMovie }: LbPanelProps) {
  // Agrupa por mês…
  const groups: MonthGroup[] = []
  for (const e of diary) {
    const dt = new Date(e.watched_date + 'T00:00:00')
    const key = dt.getFullYear() + '-' + dt.getMonth()
    let g = groups.find(x => x.key === key)
    if (!g) { g = { key, m: dt.getMonth(), y: dt.getFullYear(), items: [] }; groups.push(g) }
    g.items.push(e)
  }
  // …e limita o total exibido a 9 linhas (regra do handoff)
  let shown = 0
  const MAX = 9
  const limited: MonthGroup[] = []
  for (const g of groups) {
    if (shown >= MAX) break
    const items = g.items.slice(0, MAX - shown)
    shown += items.length
    limited.push({ ...g, items })
  }

  // Histograma: 10 colunas de 0.5 a 5.0
  const keys = ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0']
  const dist = keys.map(k => histogram[k] ?? 0)
  const maxD = Math.max(...dist, 1)
  const ratedTotal = dist.reduce((a, n) => a + n, 0)

  return (
    <div className="lb-panel">
      {/* ── Bloco Diário ── */}
      <div className="lb-block">
        <div className="lb-head"><span className="t">Diário</span><span className="c">{totalDiary}</span></div>
        {limited.map(g => (
          <div className="lb-month" key={g.key}>
            <div className="lb-chip">
              <div className="m">{MESES_CURTO[g.m]}</div>
              <div className="y">'{String(g.y).slice(2)}</div>
            </div>
            <div className="lb-rows">
              {g.items.map(e => (
                <div className="lb-row" key={e.id} onClick={() => onSelectMovie(e.movie_id)}>
                  <span className="d">{new Date(e.watched_date + 'T00:00:00').getDate()}</span>
                  <span className="ti">{e.movie_title}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {limited.length === 0 && (
          <p className="empty-state" style={{ padding: '14px 0' }}>Nenhuma sessão ainda.</p>
        )}
      </div>

      {/* ── Bloco Notas (histograma verde Letterboxd) ── */}
      <div className="lb-block">
        <div className="lb-head"><span className="t">Notas</span><span className="c">{ratedTotal}</span></div>
        <div className="lb-hist">
          {dist.map((n, i) => (
            <div key={i} className={'col' + (n >= maxD * 0.7 && n > 0 ? ' hi' : '')}
                 style={{ height: Math.max(2, (n / maxD) * 100) + '%' }}
                 title={((i + 1) / 2).toFixed(1) + '★ · ' + n} />
          ))}
        </div>
        <div className="lb-foot">
          <span className="lb-star"><StarShape filled /></span>
          <span className="lb-star">{[0, 1, 2, 3, 4].map(i => <StarShape key={i} filled />)}</span>
        </div>
      </div>
    </div>
  )
}
