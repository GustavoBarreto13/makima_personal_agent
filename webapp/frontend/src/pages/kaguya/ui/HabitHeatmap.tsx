// HabitHeatmap — grade anual de check-ins de um hábito (uma célula por dia, agrupada por mês).
// Portado do heatmap de leitura da Frieren (frieren/ui/Heatmap.tsx): mesma densificação dia-a-dia
// e mesmo alinhamento por dia da semana, mas com CLASSES PRÓPRIAS do domínio Kaguya (kg-heat-*)
// e tokens --kg-heat-* — sem reusar os .heat-* da Frieren (isolamento de domínio, pages/CLAUDE.md).
//
// O backend devolve só os dias COM check-in (array esparso). Densificamos aqui para o ano inteiro
// (todos os dias até hoje, os sem check-in com done=false) para a grade ficar contínua.

import { useMemo } from 'react'
import type { HabitHeatDay } from '../types'

interface HabitHeatmapProps {
  // Histórico esparso do ano (só dias com check-in). Densificado internamente.
  data: HabitHeatDay[]
  // Ano exibido (define o intervalo 1º/jan → hoje, ou 31/dez se for ano passado).
  year: number
  // Meta do hábito (mensurável). Define a intensidade da célula; null = sim/não (feito = nível máximo).
  target: number | null
  // Unidade (ex.: "páginas") para o tooltip da célula.
  unit?: string | null
}

// Nomes dos meses em português — índice 0 = janeiro, 11 = dezembro.
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Calcula o nível de intensidade (0–4) de uma célula a partir do dia.
// - Sim/não (sem meta): cumpriu → nível 4; não cumpriu → nível 0.
// - Mensurável (com meta): a razão valor/meta vira níveis 1–4 (acima da meta satura no 4).
function heatLevel(day: HabitHeatDay, target: number | null): number {
  if (!day.done && (day.value == null || day.value <= 0)) return 0  // dia sem progresso
  if (target == null) return day.done ? 4 : 0                       // sim/não
  const ratio = (day.value ?? 0) / target                          // mensurável: proporção da meta
  if (ratio <= 0) return 0
  if (ratio < 0.34) return 1
  if (ratio < 0.67) return 2
  if (ratio < 1) return 3
  return 4                                                          // alcançou/superou a meta
}

// Transforma o array esparso num array DENSO cobrindo 1º/jan até hoje (ou 31/dez de anos passados).
// Dias sem check-in entram com value=null, done=false. Usa partes locais da data (não toISOString,
// que é UTC) para o "hoje" não escorregar de dia perto da meia-noite em BRT (UTC-3).
function densify(sparse: HabitHeatDay[], year: number): HabitHeatDay[] {
  // Lookup rápido data → dia para evitar O(n²).
  const byDate = new Map<string, HabitHeatDay>()
  sparse.forEach((d) => byDate.set(d.date, d))

  const cur = new Date(year, 0, 1)  // 1º de janeiro do ano exibido
  // Fim do intervalo: hoje (se for o ano corrente) ou 31/dez (anos passados).
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = year < today.getFullYear() ? new Date(year, 11, 31) : today

  const dense: HabitHeatDay[] = []
  while (cur <= end) {
    const y = cur.getFullYear()
    const mo = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    const dateStr = `${y}-${mo}-${d}`
    // Se houver check-in nesse dia, usa-o; senão, dia "vazio".
    dense.push(byDate.get(dateStr) ?? { date: dateStr, value: null, done: false })
    cur.setDate(cur.getDate() + 1)  // avança um dia
  }
  return dense
}

// Estrutura interna: um mês com TODOS os seus dias (incluindo os vazios).
interface MonthGroup {
  m: number
  days: HabitHeatDay[]
}

export function HabitHeatmap({ data, year, target, unit }: HabitHeatmapProps) {
  // Densifica uma vez; recalcula só quando os dados ou o ano mudam.
  const dense = useMemo(() => densify(data, year), [data, year])

  // Agrupa os dias por mês, preservando a ordem.
  const months: MonthGroup[] = []
  dense.forEach((d) => {
    // 'T00:00:00' força parsing local (evita o offset de fuso de "2026-01-01" virar 31/dez UTC).
    const m = new Date(d.date + 'T00:00:00').getMonth()
    let g = months.find((x) => x.m === m)
    if (!g) { g = { m, days: [] }; months.push(g) }
    g.days.push(d)
  })

  return (
    <div className="kg-heat">
      <div className="kg-heat-months">
        {months.map((g) => {
          // Dia da semana do 1º dia do mês (0=Dom … 6=Sáb): define as células vazias de alinhamento.
          const first = new Date(g.days[0].date + 'T00:00:00')
          const lead = first.getDay()

          // Monta as células: `lead` nulas + os dias do mês + preenche a última semana até múltiplo de 7.
          const cells: (HabitHeatDay | null)[] = []
          for (let i = 0; i < lead; i++) cells.push(null)
          g.days.forEach((d) => cells.push(d))
          while (cells.length % 7 !== 0) cells.push(null)

          // Total de dias cumpridos no mês (mostrado no cabeçalho).
          const done = g.days.reduce((a, d) => a + (d.done ? 1 : 0), 0)

          return (
            <div className="kg-heat-month" key={g.m}>
              <div className="kg-heat-head">
                <span className="kg-heat-name">{MONTH_NAMES[g.m]}</span>
                <span className="kg-heat-sum">{done}</span>
              </div>
              <div className="kg-heat-cells">
                {cells.map((d, i) => (
                  <div
                    key={i}
                    className="kg-heat-cell"
                    title={
                      d
                        ? d.value != null
                          ? `${d.date} · ${d.value}${unit ? ' ' + unit : ''}`
                          : d.done ? `${d.date} · cumprido` : d.date
                        : ''
                    }
                    style={{
                      // Células reais usam o token de calor; as de alinhamento (null) ficam transparentes.
                      background: d != null ? `var(--kg-heat-${heatLevel(d, target)})` : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legenda — escala de "menos" a "mais". */}
      <div className="kg-heat-legend">
        <span>menos</span>
        <span className="kg-heat-sw">
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} style={{ background: `var(--kg-heat-${i})` }} />
          ))}
        </span>
        <span>mais</span>
      </div>
    </div>
  )
}
