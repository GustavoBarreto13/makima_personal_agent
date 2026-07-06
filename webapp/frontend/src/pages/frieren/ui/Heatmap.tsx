// Heatmap de leitura — visualiza páginas lidas por dia agrupadas por mês.
// Cada mês é uma grade de 7 linhas (Dom–Sáb) com células coloridas por intensidade de leitura.
// Portado do protótipo ui.jsx.
//
// IMPORTANTE: o backend devolve apenas os dias que têm log de leitura (array esparso).
// O componente precisa de um array DENSO (todos os dias do ano, incluindo os com pages=0)
// para que a grade fique contínua e o alinhamento por dia da semana fique correto.
// A densificação acontece aqui dentro, usando o mesmo padrão do heatmap do Journal
// (violet/screens/Insights.tsx → buildHeatmapDays).

import { useMemo } from 'react'
import type { HeatmapDay } from '../types'

// Props do componente Heatmap
interface HeatmapProps {
  // Array de dias com data e quantidade de páginas lidas.
  // Pode ser esparso (só dias com leitura) — o componente densifica internamente.
  data: HeatmapDay[]
}

// Nomes dos meses em português — índice 0 = janeiro, 11 = dezembro
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Calcula o nível de intensidade de calor para um dado número de páginas.
// Retorna um índice de 0 a 4 que mapeia para variáveis CSS --heat-0 até --heat-4.
// 0 = sem leitura (célula fraca), 4 = leitura intensa (cor mais saturada).
function heatLevel(pages: number): number {
  if (pages <= 0) return 0   // Sem leitura — nível base (--heat-0 = var(--line-2))
  if (pages < 18) return 1   // Leitura leve (até ~17 páginas)
  if (pages < 38) return 2   // Leitura moderada (até ~37 páginas)
  if (pages < 62) return 3   // Leitura forte (até ~61 páginas)
  return 4                    // Leitura intensa (62+ páginas)
}

// Transforma o array esparso recebido do backend em um array DENSO que cobre
// todos os dias de 1º/jan até 31/dez do ano. Dias sem leitura (inclusive os
// futuros) recebem pages: 0 e são exibidos apagados (--heat-0).
//
// Por que denso? O componente calcula o alinhamento da primeira célula de cada mês
// usando g.days[0] — que deve ser sempre o dia 1 do mês. Com dados esparsos,
// g.days[0] seria o primeiro DIA COM LEITURA do mês, causando grade desalinhada
// e meses sem nenhuma leitura sumindo por completo.
//
// Por que partes locais em vez de toISOString()? toISOString() retorna UTC, o que
// perto da meia-noite em BRT (UTC-3) pode resultar no dia anterior ou no dia seguinte.
// Usando getFullYear/getMonth/getDate garantimos a data no horário do usuário.
function densify(sparse: HeatmapDay[]): HeatmapDay[] {
  // Monta um lookup rápido date → pages para evitar O(n²) na iteração
  const pagesByDate = new Map<string, number>()
  sparse.forEach(d => pagesByDate.set(d.date, d.pages))

  // Deriva o ano: se há dados, usa o ano do primeiro registro (o backend filtra por ano).
  // Fallback para o ano atual caso o array esteja vazio (ex.: usuário sem leituras ainda).
  const year = sparse.length > 0
    ? new Date(sparse[0].date + 'T00:00:00').getFullYear()
    : new Date().getFullYear()

  // Início: 1º de janeiro do ano
  const cur = new Date(year, 0, 1)

  // Fim: 31 de dezembro do ano — cobre o calendário completo. Os dias futuros
  // ficam com pages=0 e são renderizados apagados (--heat-0), deixando os meses
  // seguintes visíveis em vez de parar no "year to date".
  const end = new Date(year, 11, 31)

  // Itera dia a dia do início ao fim, criando uma entrada para cada dia
  const dense: HeatmapDay[] = []
  while (cur <= end) {
    // Monta a string "YYYY-MM-DD" a partir de partes locais para não sofrer com UTC
    const y = cur.getFullYear()
    const mo = String(cur.getMonth() + 1).padStart(2, '0')
    const d  = String(cur.getDate()).padStart(2, '0')
    const dateStr = `${y}-${mo}-${d}`

    // Se há leitura nesse dia, usa o valor; caso contrário, registra 0
    dense.push({ date: dateStr, pages: pagesByDate.get(dateStr) ?? 0 })

    // Avança um dia
    cur.setDate(cur.getDate() + 1)
  }

  return dense
}

// Estrutura interna que representa um mês agrupado com seus dias de leitura
interface MonthGroup {
  // Índice do mês (0=janeiro, 11=dezembro)
  m: number
  // Lista de TODOS os dias do mês (incluindo os com pages=0)
  days: HeatmapDay[]
}

// Componente Heatmap de leitura.
// Recebe dados esparsos do backend, densifica internamente, agrupa por mês,
// e exibe uma grade 7×N por mês (linhas = Dom-Sáb) com células coloridas.
export function Heatmap({ data }: HeatmapProps) {
  // Densifica o array esparso uma única vez, recalculando só quando `data` mudar.
  // Barato (~365 iterações/ano), mas o useMemo mantém consistência com o padrão do projeto.
  const dense = useMemo(() => densify(data), [data])

  // Agrupa os dias do array denso por mês em um array de MonthGroup.
  // A ordem de inserção é preservada para manter os meses na sequência correta.
  const months: MonthGroup[] = []

  dense.forEach(d => {
    // Usa 'T00:00:00' para forçar parsing em horário local e evitar offset de fuso horário
    // Sem isso, datas como "2026-01-01" poderiam ser interpretadas como UTC e retornar dia 31/dez
    const m = new Date(d.date + 'T00:00:00').getMonth()

    // Busca um grupo já existente para este mês, ou cria um novo
    let g = months.find(x => x.m === m)
    if (!g) {
      g = { m, days: [] }
      months.push(g)
    }
    g.days.push(d)
  })

  return (
    <div>
      {/* Grade horizontal de meses — cada mês tem sua própria coluna de células */}
      <div className="heat-months-wrap">
        {months.map(g => {
          // Obtém o dia da semana do primeiro dia do mês (0=Dom, 6=Sáb)
          // Isso determina quantas células vazias colocar antes do primeiro dia
          const first = new Date(g.days[0].date + 'T00:00:00')
          const lead = first.getDay()  // Número de células vazias no início da grade

          // Monta o array de células: começa com `lead` células nulas (vazias),
          // depois adiciona os dias reais do mês
          const cells: (HeatmapDay | null)[] = []

          // Células de preenchimento inicial para alinhar o primeiro dia na coluna correta
          for (let i = 0; i < lead; i++) {
            cells.push(null)
          }

          // Adiciona os dias reais de leitura do mês
          g.days.forEach(d => cells.push(d))

          // Completa a última semana com células nulas para manter a grade uniforme
          // A grade tem 7 linhas (uma por dia da semana), então o total deve ser múltiplo de 7
          while (cells.length % 7 !== 0) {
            cells.push(null)
          }

          return (
            <div className="heat-month" key={g.m}>
              {/* Rótulo do mês centralizado — mesmo estilo do heatmap da Violet */}
              <div className="hm-name">{MONTH_NAMES[g.m]}</div>

              {/* Grade de células do mês — layout em CSS grid de 7 colunas (uma por dia da semana) */}
              <div className="hm-cells">
                {cells.map((d, i) => (
                  <div
                    key={i}
                    className="hm-cell"
                    // Tooltip: dias com leitura mostram a data e o total de páginas;
                    // dias sem leitura mostram só a data; células de alinhamento (null) ficam vazias
                    title={d ? (d.pages > 0 ? `${d.date} · ${d.pages} págs` : d.date) : ''}
                    style={{
                      // Células reais (dias do ano) usam sempre a variável CSS de calor —
                      // pages=0 → --heat-0 (cor fraca mas visível, não transparente).
                      // Células de alinhamento (null) ficam transparentes para não poluir a grade.
                      background: d != null ? `var(--heat-${heatLevel(d.pages)})` : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legenda do heatmap — explica a escala de cores de "menos" para "mais" */}
      <div className="heat-legend">
        <span>menos</span>
        {/* Amostra das 5 cores de intensidade (níveis 0 a 4) */}
        <span className="heat-sw">
          {[0, 1, 2, 3, 4].map(i => (
            // Cada quadradinho usa a variável CSS correspondente ao nível de calor
            <i key={i} style={{ background: `var(--heat-${i})` }} />
          ))}
        </span>
        <span>mais</span>
      </div>
    </div>
  )
}
