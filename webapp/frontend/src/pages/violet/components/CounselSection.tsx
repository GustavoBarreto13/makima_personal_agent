// Seção "Conselho do Dia" da tela Escrever (spec 061).
//
// Sob demanda (um clique), a Violet lê o dia — bullets, registros emocionais, cartas — e
// cruza com a base de conhecimento pessoal (RAG da Kurisu) para devolver 4 blocos fixos:
// espelho do dia, ferramentas da base (com citação real), pergunta de reflexão e ações
// sugeridas. Uma análise por dia (o backend faz UPSERT); "Regerar" sobrescreve.
//
// A chamada é longa (até ~60s — SC-007 da spec 061), por isso o estado "gerando" é bem
// explícito (texto + botão desabilitado), diferente do resto do Violet que é quase tudo
// instantâneo.

import { useEffect, useState } from 'react'
import { violetApi } from '../../../lib/api'
import type { Counsel } from '../types'
import { Icon } from '../ui/Icon'
// kaguyaApi: cria a tarefa real a partir de uma ação sugerida (mesmo precedente de
// LetterLog.tsx importando komiApi — a UI própria evita depender do CSS de outro shell).
import { kaguyaApi } from '../../kaguya/kaguyaApi'

interface CounselSectionProps {
  pageId: number | null
  date: string
}

export function CounselSection({ pageId, date }: CounselSectionProps) {
  const [counsel, setCounsel] = useState<Counsel | null>(null)
  const [loading, setLoading] = useState(false)     // carregando o conselho já existente (rápido)
  const [generating, setGenerating] = useState(false) // gerando/regerando (lento — até ~60s)
  const [error, setError] = useState<string | null>(null)
  // Índices de ações já convertidas nesta sessão (evita clique duplo antes do reload do counsel)
  const [convertingIdx, setConvertingIdx] = useState<number | null>(null)

  // (Re)carrega o conselho já existente sempre que o dia muda.
  useEffect(() => {
    setCounsel(null)
    setError(null)
    if (pageId == null) return
    setLoading(true)
    violetApi.getCounsel(date)
      .then(res => setCounsel(res.counsel))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [pageId, date])

  async function handleGenerate() {
    if (pageId == null) return
    setGenerating(true)
    setError(null)
    try {
      const res = await violetApi.generateCounsel(date)
      setCounsel(res.counsel)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui gerar o conselho agora.')
    } finally {
      setGenerating(false)
    }
  }

  // Cria a tarefa na Kaguya a partir de uma ação sugerida, depois registra o vínculo
  // (marcar_acao_como_tarefa) — dois passos, nenhum endpoint novo de tarefas.
  async function handleTurnIntoTask(actionIndex: number) {
    if (!counsel) return
    const action = counsel.actions[actionIndex]
    if (!action || action.task_id != null) return

    setConvertingIdx(actionIndex)
    try {
      const created = await kaguyaApi.createTask({ title: action.texto, description: action.motivo || undefined })
      if (created.id == null) throw new Error('Tarefa criada sem id')
      const res = await violetApi.markActionAsTask(counsel.page_id, actionIndex, created.id)
      setCounsel(res.counsel)
    } catch {
      // Silencioso (padrão do Violet) — o botão simplesmente volta ao estado normal
    } finally {
      setConvertingIdx(null)
    }
  }

  if (pageId == null || loading) return null

  return (
    <div className="cs-section">
      <div className="cs-head">
        <span className="cs-head-icon"><Icon name="sparkles" size={15} /></span>
        <span className="cs-head-title">Conselho da Violet</span>
      </div>

      {!counsel && !generating && (
        <button type="button" className="cs-add-trigger" onClick={handleGenerate}>
          <Icon name="sparkles" size={14} />
          <span>Pedir o conselho da Violet</span>
        </button>
      )}

      {generating && (
        <div className="cs-generating">
          <span className="cs-spinner" />
          <span>A Violet está lendo o seu dia e a sua base de conhecimento…</span>
        </div>
      )}

      {counsel && !generating && (
        <div className="cs-card">
          <div className="cs-block">
            <div className="cs-block-title">Espelho do dia</div>
            <p className="cs-mirror">{counsel.mirror}</p>
          </div>

          {counsel.toolkit.length > 0 && (
            <div className="cs-block">
              <div className="cs-block-title">Da sua base: ferramentas e curadoria</div>
              <div className="cs-toolkit">
                {counsel.toolkit.map((item, i) => (
                  <div key={i} className={`cs-toolkit-item ${item.origem === 'web' ? 'cs-origem-web' : ''}`}>
                    <div className="cs-toolkit-top">
                      <span className="cs-toolkit-titulo">{item.titulo}</span>
                      {item.origem === 'web' ? (
                        <span className="cs-badge-web">fonte externa</span>
                      ) : (
                        item.fonte && <span className="cs-badge-base">{item.fonte}</span>
                      )}
                    </div>
                    {item.porque && <p className="cs-toolkit-text">{item.porque}</p>}
                    {item.como && (
                      <p className="cs-toolkit-text cs-toolkit-como">
                        <span className="cs-toolkit-label">Como aplicar:</span> {item.como}
                      </p>
                    )}
                    {item.exemplo_hoje && (
                      <p className="cs-toolkit-text cs-toolkit-exemplo">
                        <span className="cs-toolkit-label">No seu dia de hoje:</span> {item.exemplo_hoje}
                      </p>
                    )}
                    {item.lembrete && (
                      <p className="cs-toolkit-text cs-toolkit-lembrete">
                        <span className="cs-toolkit-label">Por que vale lembrar:</span> {item.lembrete}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {counsel.actions.length > 0 && (
            <div className="cs-block">
              <div className="cs-block-title">Ações sugeridas</div>
              <div className="cs-actions">
                {counsel.actions.map((action, i) => (
                  <div key={i} className="cs-action">
                    <div className="cs-action-text">
                      <span>{action.texto}</span>
                      {action.motivo && <span className="cs-action-motivo"> — {action.motivo}</span>}
                    </div>
                    <button
                      type="button"
                      className="cs-action-btn"
                      disabled={action.task_id != null || convertingIdx === i}
                      onClick={() => handleTurnIntoTask(i)}
                    >
                      {action.task_id != null ? '✓ virou tarefa' : convertingIdx === i ? 'criando…' : 'virar tarefa'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="button" className="cs-regen" onClick={handleGenerate}>
            Regerar
          </button>
        </div>
      )}

      {error && (
        <div className="cs-error-banner" onClick={() => setError(null)}>
          {error} <span className="cs-dismiss">(clique para dispensar)</span>
        </div>
      )}
    </div>
  )
}
