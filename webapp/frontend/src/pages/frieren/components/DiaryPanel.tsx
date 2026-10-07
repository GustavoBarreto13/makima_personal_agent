// Painel lateral do Início (no estilo do perfil do Letterboxd, como o da Akane): Diário (últimas sessões
// agrupadas por mês) e Notas (histograma das notas dos livros terminados no ano, de meia a cinco estrelas).

import { Stars } from '../../../design'
import { MONTHS_SHORT } from '../../../design/core/format'
import { useFrieren } from '../context'
import type { Session } from '../types'

const MAX_ROWS = 9
const KEYS = ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0']

interface MonthGroup { key: string; month: number; year: string; items: Session[] }

/** Agrupa por mês na ordem recebida (a mais recente primeiro) e corta em `max` linhas no total. */
export function groupRecent(sessions: Session[], max = MAX_ROWS): MonthGroup[] {
  const groups: MonthGroup[] = []
  let shown = 0
  for (const s of sessions) {
    if (shown >= max) break
    const key = s.date.slice(0, 7)
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) { g = { key, month: Number(key.slice(5, 7)) - 1, year: key.slice(0, 4), items: [] }; groups.push(g) }
    g.items.push(s)
    shown++
  }
  return groups
}

export function DiaryPanel({ sessions, histogram }: { sessions: Session[]; histogram: Record<string, number> }) {
  const frieren = useFrieren()
  const groups = groupRecent(sessions)
  const dist = KEYS.map((k) => histogram[k] ?? 0)
  const maxD = Math.max(...dist, 1)
  const rated = dist.reduce((a, n) => a + n, 0)

  return (
    <aside className="ds-card fr-panel" aria-label="Diário e notas">
      <div className="fr-pblock">
        <div className="fr-phead"><span>Diário</span><button type="button" className="fr-plink" onClick={() => frieren.goto('diary')}>ver tudo</button></div>
        {groups.length === 0 && <p className="ds-hint">Nenhuma sessão ainda.</p>}
        {groups.map((g) => (
          <div className="fr-pmonth" key={g.key}>
            <div className="fr-mchip" aria-label={`${MONTHS_SHORT[g.month]} de ${g.year}`}><b>{MONTHS_SHORT[g.month]}</b><span>’{g.year.slice(2)}</span></div>
            <div className="fr-prows">
              {g.items.map((s) => (
                <button type="button" className="fr-prow" key={s.id} onClick={() => frieren.goto({ view: 'catalog', bookId: s.bookId })}>
                  <span className="fr-pday">{Number(s.date.slice(8, 10))}</span>
                  <span className="fr-ptitle">{s.title}</span>
                  {s.pages > 0 && <span className="fr-ppages">+{s.pages}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="fr-pblock">
        <div className="fr-phead"><span>Notas do ano</span><span>{rated}</span></div>
        <div className="fr-hist" role="img" aria-label="Quantos livros terminados neste ano receberam cada nota, de meia estrela a cinco">
          {dist.map((n, i) => <i key={KEYS[i]} className={n >= maxD * 0.7 && n > 0 ? 'fr-hi' : ''} style={{ height: `${Math.max(2, (n / maxD) * 100)}%` }} title={`${KEYS[i]} · ${n}`} />)}
        </div>
        <div className="fr-hist-foot"><Stars value={0.5} /><Stars value={5} /></div>
      </div>
    </aside>
  )
}
