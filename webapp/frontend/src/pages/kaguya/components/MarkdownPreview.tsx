// MarkdownPreview — renderiza o campo `description` (notas) como Markdown real.
//
// Suporta GFM (GitHub Flavored Markdown): listas de tarefa (- [ ]), tabelas,
// strikethrough, links, código inline e em bloco, titles, etc.
//
// Menções são convertidas de tokens compactos para links antes do render:
//   @[Nome](komi:uuid)    → chip de pessoa (clique → /people)
//   [[id|Título]]         → chip de task  (clique → abre o modal da task)
//
// Links externos normais abrem em nova aba (_blank + noreferrer).

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import type { ComponentPropsWithoutRef } from 'react'

// ── Props ──────────────────────────────────────────────────────────────────────

interface MarkdownPreviewProps {
  // Conteúdo Markdown cru com tokens de menção (ex.: @[João](komi:abc) ou [[42|Revisar]])
  value: string
  // Callback chamado quando o usuário clica num chip de task para reabrir o modal
  onOpenTask?: (id: number) => void
}

// ── Pré-processamento das menções ─────────────────────────────────────────────

// Converte os tokens compactos de menção para links Markdown padrão que o
// componente MentionLink pode inspecionar via `href`.
//
// Transformações:
//   @[Nome Completo](komi:uuid)  →  [@Nome Completo](komi:uuid)
//   [[42|Título da Task]]        →  [#42 Título da Task](task:42)
//
// O prefixo "komi:" e "task:" são esquemas fictícios usados como sinalização
// no MentionLink abaixo — não são URLs reais e nunca chegam ao navegador.
function mentionsToLinks(md: string): string {
  let out = md

  // Converte menção de pessoa:
  // @[Nome](komi:id) → [@Nome](komi:id)
  // O grupo 1 captura o nome entre colchetes, o grupo 2 o href "komi:..."
  out = out.replace(
    /@\[([^\]]+)\]\((komi:[^)]+)\)/g,
    '[@$1]($2)',
  )

  // Converte menção de task (wiki-link estilo Obsidian):
  // [[123|Título da Task]] → [#123 Título da Task](task:123)
  // O grupo 1 é o id, o grupo 2 é o título
  out = out.replace(
    /\[\[(\d+)\|([^\]]+)\]\]/g,
    '[#$1 $2](task:$1)',
  )

  return out
}

// ── Renderizador de link customizado ──────────────────────────────────────────

// Substituímos o <a> padrão do react-markdown para dar comportamento especial
// aos links de menção (komi: e task:) sem que o navegador tente navegar de verdade.
function MentionLink({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  // Hook de navegação do react-router para ir para /people sem recarregar a página
  const navigate = useNavigate()

  if (href?.startsWith('komi:')) {
    // ── Chip de pessoa (Komi) ─────────────────────────────────────────────
    // Clique navega para a tela de pessoas; não abre nova aba
    return (
      <span
        className="kg-note-mention person"
        role="link"
        tabIndex={0}
        title="Ver pessoa na Komi"
        onClick={() => navigate('/people')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/people')}
      >
        {children}
      </span>
    )
  }

  if (href?.startsWith('task:')) {
    // ── Chip de task (menção) ─────────────────────────────────────────────
    // Extrai o id numérico do href "task:42" e chama o callback do pai
    const id = Number(href.slice('task:'.length))
    return (
      <span
        className="kg-note-mention task"
        role="link"
        tabIndex={0}
        title={`Abrir task #${id}`}
        // Usa o prop suprimido pelo TS (não é um atributo DOM padrão, mas passamos via rest)
        onClick={() => (rest as { onOpenTask?: (id: number) => void }).onOpenTask?.(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (rest as { onOpenTask?: (id: number) => void }).onOpenTask?.(id)
          }
        }}
      >
        {children}
      </span>
    )
  }

  // ── Link externo comum ────────────────────────────────────────────────────
  // Abre em nova aba com rel="noreferrer" (segurança: não vaza referrer)
  return (
    <a href={href} target="_blank" rel="noreferrer" className="kg-md-link">
      {children}
    </a>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export function MarkdownPreview({ value, onOpenTask }: MarkdownPreviewProps) {
  // Conteúdo vazio: exibe mensagem orientativa em vez de área em branco
  if (!value?.trim()) {
    return (
      <p className="kg-note-empty">
        Nenhuma nota ainda. Troque para <b>Escrever</b> para começar.
      </p>
    )
  }

  // MentionLink precisa acessar `onOpenTask`, mas o react-markdown só passa props HTML padrão.
  // Contornamos criando um wrapper que injeta o callback extra via rest props.
  // TypeScript não reclama porque já fizemos o cast no onClick do chip de task.
  function BoundMentionLink(props: ComponentPropsWithoutRef<'a'>) {
    return <MentionLink {...props} {...{ onOpenTask } as object} />
  }

  return (
    <div className="kg-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Substitui o elemento <a> padrão pelo nosso renderizador de menções
        components={{ a: BoundMentionLink as never }}
      >
        {/* Converte tokens compactos antes de entregar ao react-markdown */}
        {mentionsToLinks(value)}
      </ReactMarkdown>
    </div>
  )
}
