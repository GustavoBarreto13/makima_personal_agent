// Captura rápida de lançamento (a linha da tela inicial): "45 ifood @nubank", "1200 tv 10x @nubank"…
// Enter salva direto quando deu para entender tudo; Shift+Enter (ou faltar algo) abre o formulário preenchido.

import { QuickCapture, type CaptureLegendItem } from '../../../design'
import { useNami } from '../context'
import { entryParser } from '../lib/entry'

const EXAMPLES = ['45 ifood @nubank', '1200 tv 10x @nubank', 'ontem 30 uber', '+3500 salário @itau', '25 almoço +Ana']

const LEGEND: CaptureLegendItem[] = [
  { kind: 'amount', sample: '45 · 1.299,90' },
  { kind: 'place', sample: '@conta ou @cartão' },
  { kind: 'installments', sample: '10x' },
  { kind: 'date', sample: 'ontem · 12/09' },
  { kind: 'person', sample: '+pessoa' },
  { kind: 'tag', sample: '#categoria' },
]

export function EntryCapture() {
  const nami = useNami()
  return (
    <QuickCapture
      parser={entryParser}
      label="Lançar um gasto ou entrada em uma linha"
      placeholder="Ex.: 45 ifood @nubank"
      examples={EXAMPLES}
      legend={LEGEND}
      onSubmit={nami.quickCapture}
      onExpand={(r) => { nami.quickCapture(r, true) }}
    />
  )
}
