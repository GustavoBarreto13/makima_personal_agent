/**
 * Heatmap — grade mensal de calor para visualizar sessões de assistência.
 *
 * Recebe o array `daily` retornado por `get_stats` (um registro por dia do
 * ano, com `date` e `count`). Agrupa os dias por mês e renderiza uma grade
 * de 7 linhas (Dom→Sáb) para cada mês, usando células coloridas com
 * intensidade proporcional ao número de sessões naquele dia.
 *
 * Níveis de calor (variáveis CSS --heat-0..4 definidas em mai.css):
 *   0 → nenhuma sessão (fundo transparente)
 *   1 → 1 sessão
 *   2 → 2 sessões
 *   3 → 3 sessões
 *   4 → ≥ 4 sessões (máximo visual)
 */

/** Par data + contagem de sessões (espelha o campo `daily` de Stats). */
interface DayData {
  date: string   // "YYYY-MM-DD"
  count: number
}

interface Props {
  /** Array contíguo de todos os dias do ano com sua contagem de sessões. */
  data: DayData[]
}

/** Abreviações dos meses em pt-BR para os cabeçalhos. */
const MES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

/**
 * Converte número de sessões em nível de intensidade de calor (0–4).
 * Escala manual para que mesmo 1 sessão já seja visível.
 */
function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count === 3) return 3
  return 4
}

/**
 * Heatmap — visualização anual de sessões em grade mensal.
 *
 * Args:
 *   data: Array contíguo `[{date, count}]` para o ano.
 *
 * Returns:
 *   Grade `.heat-months-wrap` com `.heat-month` por mês e legenda.
 */
export function Heatmap({ data }: Props) {
  // --- Agrupa os dias por mês (0=Jan … 11=Dez) ---
  const monthsMap: Map<number, DayData[]> = new Map()

  data.forEach(d => {
    // Forçar parse sem ajuste de fuso horário usando 'T00:00:00'
    const monthIdx = new Date(d.date + 'T00:00:00').getMonth()
    if (!monthsMap.has(monthIdx)) monthsMap.set(monthIdx, [])
    monthsMap.get(monthIdx)!.push(d)
  })

  // Converte o Map em array ordenado por índice de mês
  const months = Array.from(monthsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([m, days]) => ({ m, days }))

  return (
    <div>
      {/* Grade de meses */}
      <div className="heat-months-wrap">
        {months.map(({ m, days }) => {
          // Dia da semana do primeiro dia do mês (0=Dom, 6=Sáb)
          // Isso define quantas células em branco inserir antes do dia 1
          const firstDayOfWeek = new Date(days[0].date + 'T00:00:00').getDay()

          // Monta array de células: nulls de preenchimento + dias reais
          const cells: (DayData | null)[] = [
            ...Array(firstDayOfWeek).fill(null),  // espaços antes do dia 1
            ...days,
          ]

          // Completa a última semana com nulls para manter a grade uniforme
          while (cells.length % 7 !== 0) cells.push(null)

          // Soma de sessões no mês (exibida no cabeçalho)
          const monthTotal = days.reduce((acc, d) => acc + d.count, 0)

          return (
            <div className="heat-month" key={m}>
              {/* Cabeçalho: nome do mês + total do mês */}
              <div className="hm-head">
                <span className="hm-name">{MES_CURTO[m]}</span>
                <span className="hm-sum">{monthTotal}</span>
              </div>

              {/* Grade 7×N de células coloridas */}
              <div className="hm-cells">
                {cells.map((d, i) => (
                  <div
                    key={i}
                    className="hm-cell"
                    // Tooltip apenas para dias com dado real
                    title={d
                      ? `${d.date} · ${d.count} ${d.count === 1 ? 'sessão' : 'sessões'}`
                      : undefined
                    }
                    style={{
                      // Cor baseada no nível de calor; dias em branco ficam transparentes
                      background: d
                        ? `var(--heat-${heatLevel(d.count)})`
                        : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legenda "menos → mais" com amostras das 5 cores */}
      <div className="heat-legend">
        <span>menos</span>
        <span className="heat-sw">
          {([0, 1, 2, 3, 4] as const).map(lvl => (
            <i key={lvl} style={{ background: `var(--heat-${lvl})` }} />
          ))}
        </span>
        <span>mais</span>
      </div>
    </div>
  )
}
