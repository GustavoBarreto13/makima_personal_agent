/**
 * ComfortMatrix.tsx — Yato · Viagens (fatia 066)
 *
 * Régua horizontal das 5 classes ANTT + fila de ROI. A régua visual (ângulos,
 * notas) é só apresentação — a recomendação em si vem do motor puro do
 * backend (`agents/yato/comfort_matrix.py`, GET /comfort). Regra §10.4: nenhuma
 * lógica de domínio no front.
 */

import type { ComfortResponse } from '../types'

const COMFORT_STEPS = [
  { key: 'convencional', name: 'Convencional', ang: '~45°', deg: 12, note: 'poltrona quase reta' },
  { key: 'executivo', name: 'Executivo', ang: '130–140°', deg: 26, note: 'ar e banheiro obrigatórios' },
  { key: 'semi_leito', name: 'Semi-leito', ang: '135–145°', deg: 36, note: 'apoio de pernas' },
  { key: 'leito', name: 'Leito', ang: '150–160°', deg: 52, note: 'quase deitado' },
  { key: 'leito_cama', name: 'Leito-cama', ang: '180°', deg: 78, note: 'totalmente plano' },
] as const

const ROI_LABEL: Record<string, string> = {
  transfer_privativo: 'Transfer privativo na chegada',
  upgrade_hospedagem: 'Hospedagem melhor localizada',
  passeio_privativo: 'Passeio privativo',
  executiva_domestica: 'Executiva doméstica',
}

interface ComfortMatrixProps {
  data: ComfortResponse
  hours: number
  night?: boolean
}

export function ComfortMatrix({ data, hours, night }: ComfortMatrixProps) {
  const recIdx = COMFORT_STEPS.findIndex(c => c.key === data.recommended_class)

  return (
    <div className="card comfort">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <span className="section-title">Economia × conforto</span>
        <span className="section-sub">trecho de {hours}h{night ? ' · noturno' : ''} · classes ANTT</span>
      </div>
      <div className="comfort-ruler">
        {COMFORT_STEPS.map((c, i) => (
          <div key={c.key} className={'cf' + (i === recIdx ? ' rec' : i > recIdx ? ' avail' : '')}>
            <div className="cf-name">{c.name}</div>
            <div className="seat">
              <div className="base" />
              <div className="back" style={{ transform: `rotate(${c.deg}deg)` }} />
            </div>
            <div className="cf-ang">{c.ang}</div>
            <div className="cf-ang" style={{ color: 'var(--ink-4)' }}>{c.note}</div>
            {i === recIdx && <div className="eyebrow" style={{ fontSize: 9 }}>recomendada</div>}
          </div>
        ))}
      </div>
      <div className="cf-balloon">{data.rationale}</div>
      <div className="roi">
        <div className="dos-foot-k">fila de upgrades por retorno</div>
        {data.roi_queue.map((r, i) => (
          <div className="roi-row" key={r}><span className="roi-n">{i + 1}.</span><span>{ROI_LABEL[r] || r}</span></div>
        ))}
      </div>
    </div>
  )
}
