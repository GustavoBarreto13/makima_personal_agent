// Modal de criação / edição de estante (coleção de livros).
// Espelha o padrão dos outros modais da Frieren (EditBookModal / EditLogModal):
// classes modal-*, botões btn-primary/btn-ghost, Esc fecha, spinner ao salvar.
//
// A UI de estantes não existia — este modal é a porta de entrada para criar e
// editar. O backend (POST/PATCH /api/books/shelves) já estava pronto.

import { useState, useEffect, useCallback } from 'react'
import type { Shelf } from './types'
import { Icon } from './ui/Icons'

// Paleta de cores (accent) das estantes — strings oklch usadas direto como
// background da barra/ponto de identidade. Cobrem os tons já usados no shell.
export const SHELF_ACCENTS: string[] = [
  'oklch(0.58 0.085 195)', // teal (padrão)
  'oklch(0.66 0.098 80)',  // dourado
  'oklch(0.52 0.15 18)',   // garnet
  'oklch(0.55 0.11 250)',  // azul
  'oklch(0.60 0.11 155)',  // verde
  'oklch(0.55 0.13 300)',  // roxo
  'oklch(0.62 0.15 350)',  // rosa
  'oklch(0.62 0.02 240)',  // cinza
]

interface ShelfModalProps {
  // Modo do modal: 'create' (nova) ou 'edit' (estante existente)
  mode: 'create' | 'edit'
  // Estante sendo editada (só no modo 'edit') — usada para pré-preencher
  shelf?: Shelf | null
  // Controla a visibilidade
  open: boolean
  // Fecha sem salvar
  onClose: () => void
  // Envia os dados ao shell (que chama a API e re-sincroniza). Pode lançar erro.
  onSubmit: (name: string, description: string, accent: string) => Promise<void>
}

/**
 * Modal de criação/edição de estante.
 */
export function ShelfModal({ mode, shelf, open, onClose, onSubmit }: ShelfModalProps) {
  const [name, setName]           = useState('')
  const [description, setDesc]    = useState('')
  const [accent, setAccent]       = useState(SHELF_ACCENTS[0])
  const [saving, setSaving]       = useState(false)
  const [erro, setErro]           = useState('')

  // Pré-preenche ao abrir: no modo edit usa a estante; no create zera os campos
  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && shelf) {
      setName(shelf.name)
      setDesc(shelf.desc ?? '')
      setAccent(shelf.accent || SHELF_ACCENTS[0])
    } else {
      setName('')
      setDesc('')
      setAccent(SHELF_ACCENTS[0])
    }
    setErro('')
    setSaving(false)
  }, [open, mode, shelf])

  // Esc fecha (quando não está salvando)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  const doSave = useCallback(async () => {
    const nome = name.trim()
    if (!nome) { setErro('O nome da estante não pode ficar vazio.'); return }
    setSaving(true)
    setErro('')
    try {
      await onSubmit(nome, description.trim(), accent)
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar a estante.')
    } finally {
      setSaving(false)
    }
  }, [name, description, accent, onSubmit, onClose])

  if (!open) return null

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}
    >
      <div className="modal" role="dialog" aria-label={mode === 'edit' ? 'Editar estante' : 'Nova estante'}>

        <div className="modal-head">
          <span className="modal-title">{mode === 'edit' ? 'Editar estante' : 'Nova estante'}</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar" disabled={saving}>
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-body">

          {/* ── NOME ── */}
          <div className="modal-field">
            <label className="modal-label">Nome</label>
            <input
              className="book-search"
              type="text"
              placeholder="Ex.: Favoritos, Para reler…"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={saving}
              autoFocus
            />
          </div>

          {/* ── DESCRIÇÃO ── */}
          <div className="modal-field">
            <label className="modal-label">Descrição</label>
            <textarea
              className="note-input"
              placeholder="Uma nota sobre esta coleção (opcional)…"
              value={description}
              onChange={e => setDesc(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* ── COR (accent) ── */}
          <div className="modal-field">
            <label className="modal-label">Cor</label>
            <div className="shelf-swatches">
              {SHELF_ACCENTS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={'shelf-swatch' + (accent === c ? ' sel' : '')}
                  style={{ background: c }}
                  aria-label={`Cor ${c}`}
                  onClick={() => setAccent(c)}
                  disabled={saving}
                />
              ))}
            </div>
          </div>

          {erro && <p style={{ color: 'oklch(0.55 0.18 25)', marginTop: 14, fontSize: 13 }}>{erro}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={doSave} disabled={saving}>
            {saving ? 'Salvando…' : mode === 'edit' ? 'Salvar' : 'Criar estante'}
          </button>
        </div>

      </div>
    </div>
  )
}
