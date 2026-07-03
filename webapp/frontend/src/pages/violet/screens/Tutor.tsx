// Tela Tutor — progresso do Tutor de Idiomas (spec 031): skills por conceito,
// nível CEFR estimado, sugestão de próximo foco, histórico de análises e o
// guia de estudo (US4) que orienta a ênfase das próximas análises.

import { useEffect, useState } from 'react'
import { violetApi } from '../../../lib/api'
import type { TutorProgress, TutorAnalysisSummary, TutorConcept } from '../types'
import { Icon } from '../ui/Icon'

// Glyph de tendência — mesmo padrão visual dos hábitos da Kaguya (📈/📉/➡️).
const TREND_GLYPH: Record<string, string> = { up: '📈', down: '📉', flat: '➡️' }

const LANGUAGE = 'en' // seletor fixo nesta spec — tabelas/tools já levam `language` p/ expandir depois

export function Tutor() {
  const [progress, setProgress] = useState<TutorProgress | null>(null)
  const [analyses, setAnalyses] = useState<TutorAnalysisSummary[]>([])
  const [concepts, setConcepts] = useState<TutorConcept[]>([])
  const [loading, setLoading] = useState(true)

  // Formulário de edição do guia de estudo (US4) — null = não está editando
  const [editingGuide, setEditingGuide] = useState<{ description: string; targets: string[] } | null>(null)
  const [savingGuide, setSavingGuide] = useState(false)

  async function reload() {
    const [prog, hist, concepts] = await Promise.all([
      violetApi.tutorProgress(LANGUAGE).catch(() => null),
      violetApi.tutorAnalyses(LANGUAGE).catch(() => []),
      violetApi.tutorConcepts(LANGUAGE).catch(() => []),
    ])
    if (prog) setProgress(prog)
    setAnalyses(hist)
    setConcepts(concepts)
  }

  useEffect(() => {
    setLoading(true)
    reload().finally(() => setLoading(false))
  }, [])

  function startEditGuide() {
    setEditingGuide({
      description: progress?.active_guide?.description ?? '',
      targets: progress?.active_guide?.target_concepts ?? [],
    })
  }

  function toggleTarget(slug: string) {
    if (!editingGuide) return
    setEditingGuide({
      ...editingGuide,
      targets: editingGuide.targets.includes(slug)
        ? editingGuide.targets.filter(s => s !== slug)
        : [...editingGuide.targets, slug],
    })
  }

  async function saveGuide() {
    if (!editingGuide || !editingGuide.description.trim()) return
    setSavingGuide(true)
    try {
      await violetApi.saveTutorGuide({
        language: LANGUAGE,
        description: editingGuide.description.trim(),
        target_concepts: editingGuide.targets,
      })
      setEditingGuide(null)
      await reload()
    } catch {
      // Erro amigável — silencioso aqui, o formulário permanece aberto p/ nova tentativa
    } finally {
      setSavingGuide(false)
    }
  }

  async function removeGuide() {
    if (!window.confirm('Remover o guia de estudo ativo? Isso não afeta análises já feitas.')) return
    await violetApi.deleteTutorGuide(LANGUAGE).catch(() => {})
    await reload()
  }

  if (loading) return <div className="tt-page"><p className="tt-empty">Carregando progresso…</p></div>

  const hasAnyData = (progress?.skills.length ?? 0) > 0 || analyses.length > 0

  return (
    <div className="tt-page">
      {!hasAnyData ? (
        <p className="tt-empty">
          Ainda não há nenhuma análise. Escreva um bullet em inglês e peça uma análise ao Tutor
          para começar a acompanhar sua evolução.
        </p>
      ) : (
        <>
          {/* Nível CEFR estimado */}
          {progress?.level.level && (
            <div className="tt-level-card">
              <span className="tt-level-badge">{progress.level.level}</span>
              <div className="tt-level-info">
                <span className="tt-level-label">Nível estimado (CEFR)</span>
                {progress.level.preliminary && (
                  <span className="tt-level-preliminary">Estimativa preliminar — poucas análises ainda</span>
                )}
              </div>
            </div>
          )}

          {/* Sugestão de próximo foco */}
          {progress?.next_focus && (
            <div className="tt-focus-card">
              <span className="tt-focus-label">Kurisu sugere focar em</span>
              <span className="tt-focus-concept">{progress.next_focus.concept_label}</span>
              <span className="tt-focus-reason">{progress.next_focus.reason}</span>
            </div>
          )}

          {/* Guia de estudo (US4) */}
          <section>
            <h3 className="tt-section-title">Guia de estudo</h3>
            {editingGuide ? (
              <div className="tt-guide-card tt-guide-form">
                <textarea
                  className="lt-textarea"
                  placeholder="Ex.: English Grammar in Use — capítulo 4 (passado simples)"
                  value={editingGuide.description}
                  onChange={e => setEditingGuide({ ...editingGuide, description: e.target.value })}
                  rows={2}
                />
                <div className="tt-guide-concepts">
                  {concepts.map(c => (
                    <button
                      key={c.slug}
                      type="button"
                      className={`tt-concept-toggle ${editingGuide.targets.includes(c.slug) ? 'selected' : ''}`}
                      onClick={() => toggleTarget(c.slug)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="tt-guide-actions">
                  <button type="button" className="lt-save" disabled={savingGuide} onClick={saveGuide}>
                    Salvar guia
                  </button>
                  <button type="button" className="lt-cancel" onClick={() => setEditingGuide(null)}>Cancelar</button>
                </div>
              </div>
            ) : progress?.active_guide ? (
              <div className="tt-guide-card">
                <p className="tt-guide-desc">{progress.active_guide.description}</p>
                {progress.active_guide.target_concepts.length > 0 && (
                  <div className="tt-guide-targets">
                    {progress.active_guide.target_concepts.map(slug => (
                      <span key={slug} className="tt-concept-chip">
                        {concepts.find(c => c.slug === slug)?.label ?? slug}
                      </span>
                    ))}
                  </div>
                )}
                <div className="tt-guide-actions">
                  <button type="button" className="lt-link" onClick={startEditGuide}>editar</button>
                  <button type="button" className="lt-link lt-danger" onClick={removeGuide}>remover</button>
                </div>
              </div>
            ) : (
              <button type="button" className="lt-add-trigger" onClick={startEditGuide}>
                <Icon name="graduation" size={14} />
                <span>Definir um guia de estudo (livro, método ou foco)</span>
              </button>
            )}
          </section>

          {/* Skills por conceito */}
          {progress && progress.skills.length > 0 && (
            <section>
              <h3 className="tt-section-title">Progresso por conceito</h3>
              <div className="tt-skills">
                {progress.skills.map(s => (
                  <div key={s.concept_slug} className={`tt-skill ${s.is_target ? 'is-target' : ''}`}>
                    <span className="tt-skill-name">{s.concept_label}</span>
                    <span className="tt-skill-bar-wrap">
                      <span className="tt-skill-bar" style={{ width: `${s.mastery_pct}%` }} />
                    </span>
                    <span className="tt-skill-pct">{s.mastery_pct}%</span>
                    <span className="tt-skill-trend">{s.trend ? TREND_GLYPH[s.trend] : ''}</span>
                    {!s.enough_data && <span className="tt-skill-badge">poucos dados</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Histórico de análises recentes */}
          {analyses.length > 0 && (
            <section>
              <h3 className="tt-section-title">Análises recentes</h3>
              <div className="tt-history">
                {analyses.map(a => (
                  <div key={a.id} className="tt-history-item">
                    <span className="tt-history-score">{a.score}</span>
                    <span className="tt-history-summary">{a.summary}</span>
                    <span className="tt-history-date">
                      {new Date(a.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
