// Paleta para recolorir calendários: as 8 cores categóricas do Design System (contraste garantido nos dois temas).
// A cor escolhida é gravada como texto nas preferências do calendário (`var(--ds-chart-N)`); preferências antigas, com
// outras cores, continuam renderizando — o valor é só uma cor CSS.

import { chartColor } from '../../../design/core/dataviz'

export const CAL_SWATCHES: string[] = Array.from({ length: 8 }, (_, i) => chartColor(i))
