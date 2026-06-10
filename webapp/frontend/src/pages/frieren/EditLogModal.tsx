// Modal de edição de sessão de leitura — permite corrigir a página alcançada,
// a anotação e a data de uma entrada do diário já existente.
// Mais simples que o LogModal: não tem carrossel de livros nem opção "terminei",
// pois o livro e o contexto já estão fixos.

import { useState, useEffect, useCallback } from 'react'
import type { ActivityEntry } from './types'
import { Icon } from './ui/Icons'

// ── Helper de data local ──────────────────────────────────────────────────────
// Retorna a data de HOJE em YYYY-MM-DD usando horário LOCAL do usuário.
// Não usamos toISOString() porque ele retorna UTC — perto da meia-noite pode
// devolver o dia errado para usuários no Brasil (UTC-3).
function todayISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Formata data ISO em texto amigável (ex.: "Hoje, 9 de junho" ou "5 de junho de 2026")
function formatDateLabel(dateISO: string): string {
  const today = todayISO()
  // Calcula ontem sem depender de toISOString() para manter consistência com BRT
  const yesterdayD = new Date()
  yesterdayD.setDate(yesterdayD.getDate() - 1)
  const yesterday = `${yesterdayD.getFullYear()}-${String(yesterdayD.getMonth() + 1).padStart(2, '0')}-${String(yesterdayD.getDate()).padStart(2, '0')}`

  // Formata o dia e mês em português para os rótulos "Hoje" e "Ontem"
  const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' })
    .format(new Date(dateISO + 'T12:00:00'))

  if (dateISO === today)     return `Hoje, ${dayMonth}`
  if (dateISO === yesterday) return `Ontem, ${dayMonth}`

  // Para datas mais antigas, inclui o ano no formato completo
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(dateISO + 'T12:00:00'))
}

// Payload enviado ao backend ao confirmar a edição
export interface EditLogPayload {
  // Página alcançada ao fim da sessão — backend recalcula pages_read
  current_page?: number
  // Texto da anotação da sessão (substitui o valor anterior)
  session_notes?: string
  // Data da sessão no formato YYYY-MM-DD
  log_date?: string
}

// Props do modal de edição
interface EditLogModalProps {
  // Entrada do diário a editar (null = modal fechado)
  entry: ActivityEntry | null
  // Callback chamado ao confirmar a edição — recebe o payload com os campos alterados
  onSave: (payload: EditLogPayload) => Promise<void>
  // Fecha o modal sem salvar
  onClose: () => void
}

/**
 * Modal de edição de uma sessão de leitura.
 * Pré-preenche os campos com os valores atuais da entrada e envia ao backend
 * apenas os campos que forem editados.
 */
export function EditLogModal({ entry, onSave, onClose }: EditLogModalProps) {
  // Estado dos três campos editáveis — pré-preenchidos ao abrir o modal
  // Página: entry.page é o page_end do log (a página onde o usuário parou)
  const [page, setPage]           = useState<number | ''>(0)
  // Anotação: entry.note é o session_notes do log (pode ser null)
  const [note, setNote]           = useState('')
  // Data: entry.date é a data da sessão no formato YYYY-MM-DD
  const [date, setDate]           = useState(todayISO())
  // Controla se o seletor de data nativo está visível ou apenas o texto amigável
  const [showDatePicker, setShowDatePicker] = useState(false)
  // Spinner enquanto salva
  const [saving, setSaving]       = useState(false)

  // Pré-preenche os campos sempre que uma nova entrada for aberta para edição.
  // Depende de entry (não de entry.id) para que ao trocar de entrada os valores
  // sejam atualizados corretamente.
  useEffect(() => {
    if (!entry) return
    // entry.page é o page_end do log (página alcançada ao fim da sessão)
    setPage(entry.page ?? 0)
    // entry.note pode ser null — usa string vazia para o input
    setNote(entry.note ?? '')
    setDate(entry.date)
    // Fecha o seletor de data nativo ao abrir para não poluir a tela
    setShowDatePicker(false)
    setSaving(false)
  }, [entry])  // Reinicializa sempre que entry mudar (outra entrada aberta)

  // Atalho de teclado: Esc fecha sem salvar; Ctrl/Cmd+Enter salva
  useEffect(() => {
    if (!entry) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doSave()
    }
    window.addEventListener('keydown', onKey)
    // Remove o listener ao fechar o modal para não acumular handlers
    return () => window.removeEventListener('keydown', onKey)
  }, [entry, page, note, date]) // eslint-disable-line react-hooks/exhaustive-deps

  // Monta o payload e chama onSave — envia apenas os campos com valores válidos
  const doSave = useCallback(async () => {
    if (!entry) return
    setSaving(true)
    try {
      // Monta o payload com os campos que têm valor (evita enviar undefined)
      const payload: EditLogPayload = {}

      // Inclui a página se o campo tiver um número válido (não string vazia)
      if (page !== '' && page !== null) {
        payload.current_page = Number(page)
      }

      // Inclui a anotação sempre (string vazia limpa a anotação no backend)
      payload.session_notes = note.trim()

      // Inclui a data se foi preenchida
      if (date) {
        payload.log_date = date
      }

      await onSave(payload)
      // onSave fecha o modal ao terminar — não precisamos chamar onClose aqui
    } finally {
      setSaving(false)
    }
  }, [entry, page, note, date, onSave])

  // Não renderiza nada quando não há entrada selecionada (modal fechado)
  if (!entry) return null

  return (
    // Scrim (fundo semitransparente) — clique fora fecha o modal sem salvar
    <div
      className="modal-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Caixa do modal — reutiliza exatamente as mesmas classes do LogModal */}
      <div className="modal" role="dialog" aria-label="Editar registro de leitura">

        {/* Cabeçalho com título e botão de fechar */}
        <div className="modal-head">
          <span className="modal-title">Editar registro</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar" disabled={saving}>
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-body">

          {/* ── CAMPO DE PÁGINA ── */}
          <div className="modal-field">
            <label className="modal-label">Você parou na página…</label>
            <div className="page-input-row">
              {/* Input numérico — pré-preenchido com o page_end do log existente */}
              <input
                className="page-input"
                type="number"
                min={0}
                value={page}
                onChange={e => setPage(e.target.value === '' ? '' : Number(e.target.value))}
                autoFocus
                disabled={saving}
              />
            </div>
          </div>

          {/* ── CAMPO DE DATA ── */}
          <div className="modal-field">
            <label className="modal-label">Quando você leu?</label>

            {/* Modo compacto: texto amigável com link para trocar */}
            {!showDatePicker ? (
              <div className="date-display-row">
                {/* Texto formatado: "Hoje, 9 de junho", "Ontem, 8 de junho", etc. */}
                <span className="date-display">{formatDateLabel(date)}</span>
                {/* Botão discreto que abre o seletor nativo */}
                <button
                  className="date-change"
                  onClick={() => setShowDatePicker(true)}
                  disabled={saving}
                >
                  trocar
                </button>
              </div>
            ) : (
              // Modo expandido: input nativo de data
              <input
                type="date"
                className="book-search"
                value={date}
                max={todayISO()}            // Impede datas no futuro
                onChange={e => {
                  setDate(e.target.value)
                  setShowDatePicker(false)  // Fecha o seletor ao escolher
                }}
                disabled={saving}
                autoFocus
              />
            )}
          </div>

          {/* ── CAMPO DE ANOTAÇÃO ── */}
          <div className="modal-field">
            <label className="modal-label">Anotações da sessão</label>
            {/* Input de texto simples — reutiliza a classe note-input do LogModal */}
            <input
              className="note-input"
              type="text"
              placeholder="Pensamentos, citações, impressões…"
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={saving}
            />
          </div>

        </div>

        {/* ── RODAPÉ COM BOTÕES ── */}
        <div className="modal-footer">
          {/* Botão cancelar — fecha sem salvar */}
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>

          {/* Botão salvar — envia ao backend e mostra spinner */}
          <button
            className="btn btn-primary"
            onClick={doSave}
            disabled={saving}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>

      </div>
    </div>
  )
}
