// MarkdownNotesEditor — painel de notas em Markdown com toggle Escrever/Visualizar.
//
// Compõe dois sub-componentes:
//   - MentionTextarea: textarea com autocomplete de @pessoa e [[task]]
//   - MarkdownPreview: renderizador GFM com chips de menção clicáveis
//
// O estado do texto (description) é gerenciado pelo TaskModal e passado via props.
// O toggle Escrever/Visualizar é estado local deste componente.

import { useState } from 'react'
import { MentionTextarea } from './MentionTextarea'
import { MarkdownPreview } from './MarkdownPreview'

// ── Tipos de aba disponíveis no editor ────────────────────────────────────────

type NoteTab = 'write' | 'preview'

// ── Props ──────────────────────────────────────────────────────────────────────

interface MarkdownNotesEditorProps {
  // Conteúdo atual das notas (Markdown cru com tokens de menção)
  value: string
  // Callback chamado a cada mudança para atualizar o estado do pai (TaskModal)
  onChange: (v: string) => void
  // Callback chamado quando o usuário clica num chip de task para reabrir a tarefa referenciada
  onOpenTask?: (id: number) => void
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function MarkdownNotesEditor({ value, onChange, onOpenTask }: MarkdownNotesEditorProps) {
  // Aba ativa: "write" (edição) ou "preview" (visualização renderizada)
  const [tab, setTab] = useState<NoteTab>('write')

  return (
    // Contêiner principal do painel de notas
    // Ocupa toda a altura disponível na coluna direita do modal
    <div className="kg-note-editor">

      {/* Cabeçalho do painel: label + toggle de aba */}
      <div className="kg-note-toolbar">
        {/* Label "NOTAS" no estilo dos outros campos do modal */}
        <span className="kg-field-label">Notas</span>

        {/* Toggle segmentado Escrever / Visualizar */}
        {/* Reusa .kg-segment e .kg-seg-opt que já existem no kaguya.css */}
        <div className="kg-segment kg-note-toggle">
          <button
            type="button"
            className={`kg-seg-opt${tab === 'write' ? ' active' : ''}`}
            onClick={() => setTab('write')}
            aria-pressed={tab === 'write'}
          >
            Escrever
          </button>
          <button
            type="button"
            className={`kg-seg-opt${tab === 'preview' ? ' active' : ''}`}
            onClick={() => setTab('preview')}
            aria-pressed={tab === 'preview'}
          >
            Visualizar
          </button>
        </div>
      </div>

      {/* Área de conteúdo: textarea no modo Escrever, preview no modo Visualizar */}
      <div className="kg-note-content">
        {tab === 'write' ? (
          // Modo edição: textarea com autocomplete de menções
          <MentionTextarea value={value} onChange={onChange} />
        ) : (
          // Modo visualização: Markdown renderizado com chips de menção
          <MarkdownPreview value={value} onOpenTask={onOpenTask} />
        )}
      </div>
    </div>
  )
}
