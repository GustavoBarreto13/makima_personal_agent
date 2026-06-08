// Heatmap de leitura — visualiza páginas lidas por dia agrupadas por mês.
// Cada mês é uma grade de 7 linhas (Dom–Sáb) com células coloridas por intensidade de leitura.
// Portado do protótipo ui.jsx.

import React from 'react'
import type { HeatmapDay } from '../types'

// Props do componente Heatmap
interface HeatmapProps {
  // Array de dias com data e quantidade de páginas lidas
  // Tipicamente cobre os últimos 12 meses de atividade
  data: HeatmapDay[]
}

// Nomes dos meses em português — índice 0 = janeiro, 11 = dezembro
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Calcula o nível de intensidade de calor para um dado número de páginas.
// Retorna um índice de 0 a 4 que mapeia para variáveis CSS --heat-0 até --heat-4.
// 0 = sem leitura (transparente), 4 = leitura intensa (cor mais saturada).
function heatLevel(pages: number): number {
  if (pages <= 0) return 0   // Sem leitura — célula transparente
  if (pages < 18) return 1   // Leitura leve (até ~17 páginas)
  if (pages < 38) return 2   // Leitura moderada (até ~37 páginas)
  if (pages < 62) return 3   // Leitura forte (até ~61 páginas)
  return 4                    // Leitura intensa (62+ páginas)
}

// Estrutura interna que representa um mês agrupado com seus dias de leitura
interface MonthGroup {
  // Índice do mês (0=janeiro, 11=dezembro)
  m: number
  // Lista de dias de leitura pertencentes a este mês
  days: HeatmapDay[]
}

// Componente Heatmap de leitura.
// Agrupa os dias recebidos por mês, cria uma grade 7×N para cada mês (Dom-Sáb),
// e exibe células coloridas de acordo com a intensidade de leitura.
export function Heatmap({ data }: HeatmapProps) {
  // Agrupa os dias de leitura por mês em um array de MonthGroup
  // A ordem de inserção é preservada para manter os meses na sequência correta
  const months: MonthGroup[] = []

  data.forEach(d => {
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

          // Soma total de páginas lidas no mês — exibida no cabeçalho em formato "Xk"
          const sum = g.days.reduce((a, d) => a + d.pages, 0)

          return (
            <div className="heat-month" key={g.m}>
              {/* Cabeçalho do mês: nome abreviado + total de páginas em formato compacto */}
              <div className="hm-head">
                <span className="hm-name">{MONTH_NAMES[g.m]}</span>
                {/* Divide por 1000 para exibir "1.2k" em vez de "1200" — mais legível */}
                <span className="hm-sum">{(sum / 1000).toFixed(1)}k</span>
              </div>

              {/* Grade de células do mês — layout em CSS grid de 7 colunas (uma por dia da semana) */}
              <div className="hm-cells">
                {cells.map((d, i) => (
                  <div
                    key={i}
                    className="hm-cell"
                    // Tooltip com data e quantidade de páginas ao passar o mouse
                    title={d ? `${d.date} · ${d.pages} págs` : ''}
                    style={{
                      // Células com dados usam variável CSS de calor; células vazias são transparentes
                      background: d ? `var(--heat-${heatLevel(d.pages)})` : 'transparent',
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
