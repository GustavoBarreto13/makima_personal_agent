// Linha rápida de "logar episódio": "Frieren ep 12", "Dungeon Meshi ep 5-8 ★4.5 ontem".
// Enter salva direto quando o anime e o episódio ficaram claros; Shift+Enter (ou ter dúvida) abre o formulário preenchido.

import { QuickCapture, type CaptureLegendItem } from '../../../design'
import { useMarin } from '../context'
import { logParser } from '../lib/log'

const EXAMPLES = ['Frieren ep 12', 'Dungeon Meshi ep 5-8', 'Frieren ep 3 ★4.5 ontem', 'Frieren']

const LEGEND: CaptureLegendItem[] = [
  { kind: 'progress', sample: 'ep 12 · ep 5-8' },
  { kind: 'date', sample: 'ontem · sexta · 12/09' },
  { kind: 'rating', sample: '★4.5' },
]

export function LogCapture() {
  const marin = useMarin()
  return (
    <QuickCapture
      parser={logParser}
      label="Logar episódio em uma linha"
      placeholder="Ex.: Frieren ep 12 ontem"
      examples={EXAMPLES}
      legend={LEGEND}
      today={marin.today}
      onSubmit={marin.quickLog}
      onExpand={(r) => { marin.quickLog(r, true) }}
    />
  )
}
