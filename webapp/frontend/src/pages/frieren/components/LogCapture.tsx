// Linha rápida de "registrar leitura": "Duna p. 240 ontem", "Hobbit terminei ★4.5".
// Enter salva direto quando o livro e a página ficaram claros; Shift+Enter (ou ter dúvida) abre o formulário preenchido.

import { QuickCapture, type CaptureLegendItem } from '../../../design'
import { useFrieren } from '../context'
import { logParser } from '../lib/log'

const EXAMPLES = ['Duna p. 240', 'O Hobbit p. 120 ontem', 'Frieren terminei ★4.5', 'p. 88']

const LEGEND: CaptureLegendItem[] = [
  { kind: 'progress', sample: 'p. 240' },
  { kind: 'date', sample: 'ontem · sexta · 12/09' },
  { kind: 'rating', sample: '★4.5 (com "terminei")' },
]

export function LogCapture() {
  const frieren = useFrieren()
  return (
    <QuickCapture
      parser={logParser}
      label="Registrar leitura em uma linha"
      placeholder="Ex.: Duna p. 240 ontem"
      examples={EXAMPLES}
      legend={LEGEND}
      today={frieren.today}
      onSubmit={frieren.quickLog}
      onExpand={(r) => { frieren.quickLog(r, true) }}
    />
  )
}
