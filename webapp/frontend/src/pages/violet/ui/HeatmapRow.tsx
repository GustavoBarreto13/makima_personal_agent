// HeatmapRow — grade de atividade anual estilo GitHub, agrupada por mês.
// Recebe um array denso (todos os dias de 1º jan até hoje) e renderiza
// cada mês como uma coluna com rótulo + células 9×9px coloridas por nível.

// Nomes abreviados dos meses em português (jan..dez)
const MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

// Converte contagem de palavras em nível de intensidade 0–4 para --heat-N
// (thresholds alinhados com o design handoff ui.jsx)
function heatLevel(words: number): number {
  if (words <= 0)  return 0  // sem escrita
  if (words < 50)  return 1  // escrita leve
  if (words < 110) return 2  // escrita moderada
  if (words < 190) return 3  // escrita intensa
  return 4                    // escrita muito intensa
}

// Formata data ISO para tooltip amigável — "6 de junho"
function fmtDate(iso: string): string {
  const meses = ['janeiro','fevereiro','março','abril','maio','junho',
                 'julho','agosto','setembro','outubro','novembro','dezembro']
  // Usa partes locais para evitar bug de fuso UTC/BRT
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} de ${meses[d.getMonth()]}`
}

// Uma entrada de dia no array denso
interface DayEntry {
  date: string   // "YYYY-MM-DD"
  words: number  // 0 para dias sem escrita
}

interface HeatmapRowProps {
  // Array denso de todos os dias do período (1º jan → hoje), ordenado por data.
  // Dias sem escrita têm words = 0.
  data: DayEntry[]
}

export function HeatmapRow({ data }: HeatmapRowProps) {
  // ── Agrupa dias por mês, mantendo a ordem cronológica ──────────────────
  // Cada grupo tem um índice de mês (0–11) e seus dias
  const months: Array<{ m: number; days: DayEntry[] }> = []
  data.forEach(d => {
    // Usa 'T00:00:00' para evitar interpretação UTC que avança/recua um dia
    const m = new Date(d.date + 'T00:00:00').getMonth()
    let group = months.find(x => x.m === m)
    if (!group) {
      group = { m, days: [] }
      months.push(group)
    }
    group.days.push(d)
  })

  return (
    // Faixa rolável horizontalmente — uma coluna por mês
    <div className="heat-row-wrap">
      {months.map(g => {
        // Primeiro dia do mês — determina em qual coluna (dia da semana) começa
        const first = new Date(g.days[0].date + 'T00:00:00')
        const lead = first.getDay() // 0=dom, 1=seg, …, 6=sáb

        // Células: células nulas de alinhamento + dias reais + preenchimento até múltiplo de 7
        const cells: (DayEntry | null)[] = []
        for (let i = 0; i < lead; i++) cells.push(null)   // alinhamento inicial
        g.days.forEach(d => cells.push(d))
        while (cells.length % 7 !== 0) cells.push(null)   // preenchimento final

        return (
          <div className="heat-mo" key={g.m}>
            {/* Rótulo do mês — "jan", "fev", … */}
            <div className="mo-name">{MONTH_NAMES[g.m]}</div>

            {/* Grade de células: grid-template-rows: 7, auto-flow column
                → semanas crescem para a direita, dias da semana ficam fixos nas linhas */}
            <div className="mo-cells">
              {cells.map((d, i) => (
                <div
                  key={i}
                  className="hc"
                  title={d && d.words > 0 ? `${fmtDate(d.date)} · ${d.words} palavras` : (d ? fmtDate(d.date) : '')}
                  style={{
                    // Célula com dado: cor por nível; célula de alinhamento: transparente
                    background: d != null ? `var(--heat-${heatLevel(d.words)})` : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
