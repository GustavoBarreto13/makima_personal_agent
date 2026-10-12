// Resultado da análise de escrita (Tutor de Idiomas, spec 031 — persona Kurisu): corrigido, como um nativo
// escreveria, pontos de atenção por conceito e o resumo dela.

import { Modal } from '../../../design'
import type { TutorAnalysis } from '../types'

const SEVERITY: Record<string, string> = { low: 'leve', medium: 'moderado', high: 'importante' }

export function TutorModal({ analysis, onClose }: { analysis: TutorAnalysis; onClose: () => void }) {
  return (
    <Modal title={`Análise da Kurisu · ${analysis.score}/100`} onClose={onClose} size="md">
      <section className="vl-tutor-block">
        <h4>Corrigido</h4>
        <p>{analysis.corrected_text}</p>
      </section>
      {analysis.natural_rewrite && analysis.natural_rewrite !== analysis.corrected_text && (
        <section className="vl-tutor-block">
          <h4>Como um nativo escreveria</h4>
          <p className="vl-italic">{analysis.natural_rewrite}</p>
        </section>
      )}
      {analysis.errors.length > 0 ? (
        <section className="vl-tutor-block">
          <h4>Pontos de atenção</h4>
          {analysis.errors.map((e, i) => (
            <div key={i} className={`vl-tutor-err vl-sev-${e.severity}`}>
              <div className="vl-row"><span className="vl-pill">{e.concept_label}</span><span className="vl-muted">{SEVERITY[e.severity] ?? e.severity}</span></div>
              <p><s>{e.wrong}</s> → <b>{e.right}</b></p>
              <p className="vl-muted">{e.explanation}</p>
            </div>
          ))}
        </section>
      ) : <p className="vl-muted">Nenhum erro encontrado — mandou bem. …Desta vez.</p>}
      <section className="vl-tutor-block">
        <h4>Kurisu diz</h4>
        <p>{analysis.summary}</p>
      </section>
    </Modal>
  )
}
