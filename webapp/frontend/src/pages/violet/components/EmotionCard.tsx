// Cartão de um registro emocional: emoção, intensidade (barra), o alívio depois da resposta, as distorções
// identificadas e um trecho da situação. Abre o detalhe ao tocar.

import { Icon } from '../../../design'
import { fmtRelative } from '../../../design/core/format'
import { DISTORTION_LABEL } from '../lib/emotions'
import type { EmotionLog } from '../types'

export function EmotionCard({ log, today, onOpen, showDate }: { log: EmotionLog; today: string; onOpen: () => void; showDate?: boolean }) {
  const relief = log.reappraised_intensity != null ? log.intensity - log.reappraised_intensity : null
  return (
    <button type="button" className="vl-emo" onClick={onOpen}>
      <span className="vl-emo-top">
        <b className="vl-emo-name">{log.emotion_name}</b>
        <span className="vl-emo-bar" aria-label={`Intensidade ${log.intensity} de 10`}>
          <span style={{ ['--vl-level' as string]: log.intensity / 10 }} />
        </span>
        <span className="ds-mono">{log.intensity}{log.reappraised_intensity != null && <> → {log.reappraised_intensity}</>}</span>
        {relief != null && relief > 0 && <span className="vl-pill vl-pill-ok" title="Alívio depois da resposta">−{relief}</span>}
      </span>
      {log.situation && <span className="vl-emo-sit">{log.situation}</span>}
      <span className="vl-emo-meta">
        {showDate && log.date && <span>{fmtRelative(log.date, today)}</span>}
        {(log.distortions ?? []).map((d) => <span key={d} className="vl-pill">{DISTORTION_LABEL[d] ?? d}</span>)}
        {!log.adaptive_response && log.intensity >= 7 && <span className="vl-pill vl-pill-warn"><Icon name="warning" size={11} />sem resposta</span>}
      </span>
    </button>
  )
}
