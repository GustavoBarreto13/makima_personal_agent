// Seção de Registro Emocional (TCC) da tela Escrever — Feature 006.
//
// Renderiza, para um dia (page), a área de registro emocional no formato do
// "Registro de Pensamentos" da terapia cognitivo-comportamental (TCC):
//   situação → emoção + intensidade → pensamento automático → resposta
//   adaptativa → reavaliação da intensidade.
//
// Apenas emoção + intensidade são obrigatórios; os demais campos são opcionais
// e podem ser preenchidos depois (preenchimento progressivo). O componente
// cuida de carregar a lista de registros do dia, o vocabulário de emoções
// (predefinidas + custom) e todo o fluxo de criar/editar/excluir.

import { useEffect, useState } from 'react'
import { violetApi } from '../../../lib/api'
import type { Emotion, EmotionLog } from '../types'
import { Icon } from '../ui/Icon'

// Props da seção: precisa apenas do id da página (dia) onde os registros ficam.
interface EmotionSectionProps {
  pageId: number | null
}

// Formato local do formulário enquanto o usuário preenche.
// emotion_id começa em null porque a emoção é uma escolha obrigatória ainda não feita.
interface FormState {
  id: number | null            // id do registro em edição; null = criando um novo
  emotion_id: number | null    // emoção escolhida
  intensity: number            // intensidade inicial (0–10)
  situation: string            // situação/gatilho
  automatic_thought: string    // pensamento automático
  adaptive_response: string    // resposta adaptativa
  reappraised_intensity: number | null  // intensidade após a resposta (0–10)
}

// Estado inicial de um formulário vazio (novo registro).
// Intensidade começa em 5 (meio da escala) como ponto de partida neutro.
const EMPTY_FORM: FormState = {
  id: null,
  emotion_id: null,
  intensity: 5,
  situation: '',
  automatic_thought: '',
  adaptive_response: '',
  reappraised_intensity: null,
}

// Formata o horário (HH:MM) de um timestamp ISO para exibir no cartão.
function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function EmotionSection({ pageId }: EmotionSectionProps) {
  // Lista de registros emocionais do dia
  const [logs, setLogs] = useState<EmotionLog[]>([])
  // Vocabulário de emoções (predefinidas + custom)
  const [emotions, setEmotions] = useState<Emotion[]>([])
  // Formulário ativo (null = nenhum formulário aberto, só a lista + botão)
  const [form, setForm] = useState<FormState | null>(null)
  // Texto do campo "adicionar emoção custom" (vazio = campo fechado)
  const [newEmotion, setNewEmotion] = useState('')
  // Sinaliza tentativa de salvar sem emoção escolhida (para destacar o campo)
  const [emotionError, setEmotionError] = useState(false)

  // Carrega o vocabulário de emoções uma vez ao montar o componente.
  useEffect(() => {
    violetApi.listEmotions().then(setEmotions).catch(() => {})
  }, [])

  // (Re)carrega os registros sempre que a página (dia) muda.
  useEffect(() => {
    if (pageId == null) { setLogs([]); return }
    violetApi.emotionLogs(pageId).then(setLogs).catch(() => {})
    // Fecha qualquer formulário aberto ao trocar de dia
    setForm(null)
  }, [pageId])

  // Recarrega a lista de registros do dia atual a partir do backend.
  async function reloadLogs() {
    if (pageId == null) return
    const fresh = await violetApi.emotionLogs(pageId).catch(() => null)
    if (fresh) setLogs(fresh)
  }

  // Abre o formulário em branco para criar um novo registro.
  function startCreate() {
    setForm({ ...EMPTY_FORM })
    setEmotionError(false)
  }

  // Abre o formulário preenchido com os dados de um registro existente (edição).
  function startEdit(log: EmotionLog) {
    setForm({
      id: log.id,
      emotion_id: log.emotion_id,
      intensity: log.intensity,
      situation: log.situation ?? '',
      automatic_thought: log.automatic_thought ?? '',
      adaptive_response: log.adaptive_response ?? '',
      reappraised_intensity: log.reappraised_intensity,
    })
    setEmotionError(false)
  }

  // Fecha o formulário sem salvar.
  function cancelForm() {
    setForm(null)
    setNewEmotion('')
    setEmotionError(false)
  }

  // Cria uma emoção custom e já a seleciona no formulário.
  async function addCustomEmotion() {
    const name = newEmotion.trim()
    if (!name || !form) return
    const res = await violetApi.createEmotion(name).catch(() => null)
    if (res?.emotion) {
      // Atualiza o vocabulário local (recarrega para refletir ordenação do backend)
      const fresh = await violetApi.listEmotions().catch(() => null)
      if (fresh) setEmotions(fresh)
      // Seleciona a emoção recém-criada/reutilizada no formulário
      setForm({ ...form, emotion_id: res.emotion.id })
      setEmotionError(false)
    }
    setNewEmotion('')
  }

  // Salva o formulário (cria ou atualiza, conforme form.id).
  async function saveForm() {
    if (!form || pageId == null) return

    // Emoção é obrigatória — bloqueia e destaca o campo se não houver escolha
    if (form.emotion_id == null) {
      setEmotionError(true)
      return
    }

    // A reavaliação só vale com resposta adaptativa preenchida — espelha a regra do backend.
    // Se não houver resposta, descartamos a reavaliação para não enviar valor inválido.
    const hasResponse = form.adaptive_response.trim().length > 0
    const reappraised = hasResponse ? form.reappraised_intensity : null

    // Monta o corpo da requisição. Campos de texto vazios viram null (limpa o campo).
    const body = {
      emotion_id: form.emotion_id,
      intensity: form.intensity,
      situation: form.situation.trim() || null,
      automatic_thought: form.automatic_thought.trim() || null,
      adaptive_response: form.adaptive_response.trim() || null,
      reappraised_intensity: reappraised,
    }

    if (form.id == null) {
      // Criando um novo registro — inclui o page_id
      await violetApi.createEmotionLog({ page_id: pageId, ...body }).catch(() => {})
    } else {
      // Editando um registro existente
      await violetApi.updateEmotionLog(form.id, body).catch(() => {})
    }

    await reloadLogs()
    cancelForm()
  }

  // Exclui um registro após confirmação simples.
  async function removeLog(log: EmotionLog) {
    await violetApi.deleteEmotionLog(log.id).catch(() => {})
    await reloadLogs()
  }

  // Helper: nome da emoção atualmente selecionada no formulário (para destaque visual).
  const selectedEmotionId = form?.emotion_id ?? null

  return (
    <div className="em-section">
      {/* Cabeçalho da seção — ícone de coração + título */}
      <div className="em-head">
        <span className="em-head-icon"><Icon name="heart" size={15} /></span>
        <span className="em-head-title">Registro emocional</span>
      </div>

      {/* Lista de registros do dia */}
      {logs.map(log => (
        <EmotionCard
          key={log.id}
          log={log}
          onEdit={() => startEdit(log)}
          onDelete={() => removeLog(log)}
        />
      ))}

      {/* Formulário (criar/editar) ou botão de "registrar" */}
      {form ? (
        <div className="em-form">
          {/* 1. Situação */}
          <label className="em-field-label">Situação</label>
          <textarea
            className="em-textarea"
            placeholder="O que aconteceu? Qual foi o gatilho?"
            value={form.situation}
            onChange={e => setForm({ ...form, situation: e.target.value })}
            rows={2}
          />

          {/* 2. Emoção (obrigatória) — chips selecionáveis + adicionar custom */}
          <label className={`em-field-label ${emotionError ? 'em-required' : ''}`}>
            Emoção {emotionError && <span className="em-required-hint">— escolha uma emoção</span>}
          </label>
          <div className="em-emotions">
            {emotions.map(emo => (
              <button
                key={emo.id}
                type="button"
                className={`em-chip ${selectedEmotionId === emo.id ? 'active' : ''} ${emo.is_predefined ? '' : 'custom'}`}
                onClick={() => { setForm({ ...form, emotion_id: emo.id }); setEmotionError(false) }}
              >
                {emo.name}
              </button>
            ))}
          </div>
          {/* Campo para adicionar uma emoção custom */}
          <div className="em-addrow">
            <input
              className="em-input"
              placeholder="Outra emoção..."
              value={newEmotion}
              onChange={e => setNewEmotion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomEmotion() } }}
            />
            <button type="button" className="em-add-btn" onClick={addCustomEmotion}>
              adicionar
            </button>
          </div>

          {/* 3. Intensidade inicial (0–10) */}
          <label className="em-field-label">Intensidade: <strong>{form.intensity}</strong></label>
          <input
            type="range"
            min={0}
            max={10}
            value={form.intensity}
            onChange={e => setForm({ ...form, intensity: Number(e.target.value) })}
            className="em-range"
          />

          {/* 4. Pensamento automático */}
          <label className="em-field-label">Pensamento automático</label>
          <textarea
            className="em-textarea"
            placeholder="O que passou pela sua cabeça?"
            value={form.automatic_thought}
            onChange={e => setForm({ ...form, automatic_thought: e.target.value })}
            rows={2}
          />

          {/* 5. Resposta adaptativa */}
          <label className="em-field-label">Resposta adaptativa</label>
          <textarea
            className="em-textarea"
            placeholder="Um pensamento mais equilibrado e realista..."
            value={form.adaptive_response}
            onChange={e => setForm({ ...form, adaptive_response: e.target.value })}
            rows={2}
          />

          {/* 6. Reavaliação da intensidade — só habilita com resposta adaptativa preenchida */}
          {form.adaptive_response.trim().length > 0 && (
            <>
              <label className="em-field-label">
                Intensidade após a resposta: <strong>{form.reappraised_intensity ?? '—'}</strong>
              </label>
              <input
                type="range"
                min={0}
                max={10}
                value={form.reappraised_intensity ?? form.intensity}
                onChange={e => setForm({ ...form, reappraised_intensity: Number(e.target.value) })}
                className="em-range"
              />
            </>
          )}

          {/* Ações do formulário */}
          <div className="em-form-actions">
            <button type="button" className="em-save" onClick={saveForm}>Salvar</button>
            <button type="button" className="em-cancel" onClick={cancelForm}>Cancelar</button>
          </div>
        </div>
      ) : (
        // Estado fechado: convite a registrar (estilo do prompt de sonho)
        pageId != null && (
          <button type="button" className="em-add-trigger" onClick={startCreate}>
            <Icon name="heart" size={14} />
            <span>{logs.length === 0 ? 'Como você se sentiu? Registrar emoção' : 'Registrar outra emoção'}</span>
          </button>
        )
      )}
    </div>
  )
}

// ── Cartão de um registro emocional já salvo ──────────────────────────────────

interface EmotionCardProps {
  log: EmotionLog
  onEdit: () => void
  onDelete: () => void
}

function EmotionCard({ log, onEdit, onDelete }: EmotionCardProps) {
  // Controla se os detalhes (situação/pensamento/resposta) estão expandidos.
  const [open, setOpen] = useState(false)

  // Há detalhes além de emoção+intensidade? Define se vale mostrar o "expandir".
  const hasDetails = Boolean(
    log.situation || log.automatic_thought || log.adaptive_response,
  )

  return (
    <div className="em-card">
      {/* Linha principal: emoção + intensidade + horário + ações */}
      <div className="em-card-top">
        <span className="em-emotion-name">{log.emotion_name}</span>
        <span className="em-intensity-badge">{log.intensity}/10</span>
        {/* Se houve reavaliação, mostra a transição de intensidade */}
        {log.reappraised_intensity != null && (
          <span className="em-reappraised">→ {log.reappraised_intensity}/10</span>
        )}
        <span className="em-time">{fmtTime(log.created_at)}</span>
        <span className="em-card-actions">
          <button type="button" className="em-link" onClick={onEdit}>editar</button>
          <button type="button" className="em-link em-danger" onClick={onDelete}>excluir</button>
        </span>
      </div>

      {/* Detalhes expansíveis (texto longo não domina a página) */}
      {hasDetails && (
        <button type="button" className="em-toggle" onClick={() => setOpen(o => !o)}>
          {open ? 'ocultar detalhes' : 'ver detalhes'}
        </button>
      )}
      {open && (
        <div className="em-details">
          {log.situation && (
            <p className="em-detail"><span className="em-detail-label">Situação:</span> {log.situation}</p>
          )}
          {log.automatic_thought && (
            <p className="em-detail"><span className="em-detail-label">Pensamento:</span> {log.automatic_thought}</p>
          )}
          {log.adaptive_response && (
            <p className="em-detail"><span className="em-detail-label">Resposta:</span> {log.adaptive_response}</p>
          )}
        </div>
      )}
    </div>
  )
}
