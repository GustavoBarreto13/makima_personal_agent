// Linha rápida de "logar filme": "Duna 2 ★4.5 ontem @Cinemark +Ana #ficção".
// Enter salva direto quando o filme foi reconhecido com certeza; Shift+Enter (ou ter dúvida) abre o formulário preenchido.

import { QuickCapture, type CaptureLegendItem } from '../../../design'
import { useAkane } from '../context'
import { logParser } from '../lib/log'

const EXAMPLES = ['Perfect Blue ★4.5', 'Duna ontem @Cinemark', 'Parasita ★5 +Ana #coreano', 'Her sexta @Netflix']

const LEGEND: CaptureLegendItem[] = [
  { kind: 'rating', sample: '★4.5' },
  { kind: 'date', sample: 'ontem · 12/09' },
  { kind: 'place', sample: '@cinema ou @plataforma' },
  { kind: 'person', sample: '+pessoa' },
  { kind: 'tag', sample: '#etiqueta' },
]

export function LogCapture() {
  const akane = useAkane()
  return (
    <QuickCapture
      parser={logParser}
      label="Logar um filme em uma linha"
      placeholder="Ex.: Perfect Blue ★4.5 ontem @Cinemark"
      examples={EXAMPLES}
      legend={LEGEND}
      onSubmit={akane.quickLog}
      onExpand={(r) => { akane.quickLog(r, true) }}
    />
  )
}
