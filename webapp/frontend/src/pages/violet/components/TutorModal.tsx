// Modal de análise do Tutor de Idiomas (spec 031) — persona Kurisu.
//
// Componente de exibição puro: recebe uma análise já concluída (o caller —
// Write.tsx — é quem chama violetApi.analyzeTutor e trata loading/erro) e mostra
// texto corrigido, reescrita natural, erros por conceito com explicação, o resumo
// na voz da Kurisu e a nota. Segue o padrão visual de EmotionLog/LetterLog
// (cartões com tokens .vl-app), mas como overlay modal — é a primeira vez que o
// Violet precisa de um modal de verdade.

import { useEffect } from 'react'
import type { TutorAnalysis } from '../types'
import { Icon } from '../ui/Icon'

interface TutorModalProps {
  analysis: TutorAnalysis
  onClose: () => void
}

const SEVERITY_LABEL: Record<string, string> = {
  low: 'leve',
  medium: 'moderado',
  high: 'importante',
}

export function TutorModal({ analysis, onClose }: TutorModalProps) {
  // Fecha no Escape — padrão de acessibilidade para overlays modais
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="tt-overlay" onClick={onClose}>
      <div className="tt-modal" onClick={e => e.stopPropagation()}>
        <div className="tt-modal-head">
          <span className="tt-modal-icon"><Icon name="sparkles" size={16} /></span>
          <span className="tt-modal-title">Análise da Kurisu</span>
          <span className="tt-score" title="Nota da escrita (0-100)">{analysis.score}</span>
          <button type="button" className="tt-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="tt-modal-body">
          {/* Texto corrigido — correção gramatical mínima, alimenta o toggle do bullet */}
          <section className="tt-block">
            <h4 className="tt-block-title">Corrigido</h4>
            <p className="tt-text">{analysis.corrected_text}</p>
          </section>

          {/* Reescrita natural — só aparece aqui no painel, nunca no toggle do bullet */}
          {analysis.natural_rewrite && analysis.natural_rewrite !== analysis.corrected_text && (
            <section className="tt-block">
              <h4 className="tt-block-title">Como um nativo escreveria</h4>
              <p className="tt-text tt-natural">{analysis.natural_rewrite}</p>
            </section>
          )}

          {/* Erros por conceito */}
          {analysis.errors.length > 0 && (
            <section className="tt-block">
              <h4 className="tt-block-title">Pontos de atenção</h4>
              <div className="tt-errors">
                {analysis.errors.map((e, i) => (
                  <div key={i} className={`tt-error tt-sev-${e.severity}`}>
                    <div className="tt-error-top">
                      <span className="tt-concept-chip">{e.concept_label}</span>
                      <span className="tt-sev-label">{SEVERITY_LABEL[e.severity] ?? e.severity}</span>
                    </div>
                    <div className="tt-error-diff">
                      <span className="tt-wrong">{e.wrong}</span>
                      <span className="tt-arrow">→</span>
                      <span className="tt-right">{e.right}</span>
                    </div>
                    <p className="tt-explanation">{e.explanation}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {analysis.errors.length === 0 && (
            <p className="tt-perfect">Nenhum erro encontrado — mandou bem. ...Desta vez.</p>
          )}

          {/* Resumo — voz Kurisu, PT-BR */}
          <section className="tt-block tt-summary-block">
            <h4 className="tt-block-title">Kurisu diz</h4>
            <p className="tt-summary">{analysis.summary}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
