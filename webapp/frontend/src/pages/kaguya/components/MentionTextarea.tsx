// MentionTextarea — textarea controlado com autocomplete de @pessoa e [[task]].
//
// Detecta dois tipos de gatilho enquanto o usuário digita:
//   @ → abre dropdown filtrado da lista de pessoas da Komi
//   [[ → abre dropdown com busca de tasks (debounce 250ms via kaguyaApi.search)
//
// Ao selecionar um item, insere o token no lugar do texto digitado:
//   Pessoa: @[Nome Completo](komi:<uuid>)
//   Task:   [[<id>|Título da Task]]
//
// O token fica visível no modo "Escrever" como texto cru; no modo "Visualizar"
// (MarkdownPreview) ele é convertido para chip clicável.

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Person, Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'

// ── Props ──────────────────────────────────────────────────────────────────────

interface MentionTextareaProps {
  // Conteúdo atual (Markdown cru com tokens de menção)
  value: string
  // Chamado a cada mudança para atualizar o estado do pai
  onChange: (v: string) => void
  // Placeholder exibido quando o textarea está vazio
  placeholder?: string
}

// ── Estado interno do dropdown ─────────────────────────────────────────────────

type DropdownKind = 'person' | 'task'

interface DropdownState {
  kind: DropdownKind   // qual tipo de menção está sendo digitada
  query: string        // texto digitado após o gatilho (ex.: "jo" em "@jo")
  triggerStart: number // posição do caractere gatilho no texto (para substituição)
  active: number       // índice do item destacado na lista (nav por teclado)
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function MentionTextarea({ value, onChange, placeholder }: MentionTextareaProps) {
  // Referência ao elemento <textarea> para controlar o caret manualmente
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Cache de pessoas da Komi — carregado uma vez ao montar, reutilizado em todas as buscas
  const [people, setPeople] = useState<Person[]>([])

  // Resultados de busca de tasks (atualizado com debounce a cada mudança da query)
  const [taskResults, setTaskResults] = useState<Task[]>([])

  // Estado do dropdown: null = fechado, DropdownState = aberto com os dados de contexto
  const [dropdown, setDropdown] = useState<DropdownState | null>(null)

  // Timer de debounce para a busca de tasks (evita uma chamada de API por tecla)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Carrega a lista completa de pessoas da Komi uma única vez ao montar o componente.
  // A busca de pessoas é feita localmente (filter client-side) sem roundtrip por keystroke.
  useEffect(() => {
    kaguyaApi.listPeople().then(setPeople).catch(() => {
      // Falha silenciosa: dropdown de pessoa simplesmente fica vazio
    })
  }, [])

  // ── Filtragem local de pessoas ─────────────────────────────────────────────

  // Filtra o cache de pessoas pela query atual (case e acento insensitivos, máximo 8 resultados)
  const filteredPeople = dropdown?.kind === 'person'
    ? people
        .filter(p => {
          const q = dropdown.query.toLowerCase()
          // query vazia → mostra todos (estado inicial logo após digitar "@")
          return q === '' || p.name.toLowerCase().includes(q)
        })
        .slice(0, 8)
    : []

  // ── Detecção do gatilho de menção ──────────────────────────────────────────

  // Analisa o texto antes do cursor para identificar se o usuário está escrevendo uma menção.
  // Retorna o estado do dropdown a abrir, ou null se nenhum gatilho ativo.
  function detectMentionTrigger(text: string, cursor: number): DropdownState | null {
    // Texto antes do cursor — é onde procuramos o gatilho
    const before = text.slice(0, cursor)

    // ── Gatilho de task: [[ ────────────────────────────────────────────────
    // Busca a última ocorrência de "[[" antes do cursor
    const taskTriggerIdx = before.lastIndexOf('[[')
    if (taskTriggerIdx !== -1) {
      // Tudo que o usuário digitou depois do "[["
      const afterTrigger = before.slice(taskTriggerIdx + 2)
      // Só ativa se ainda não tiver fechado (]] ou quebra de linha encerram o gatilho)
      if (!afterTrigger.includes(']]') && !afterTrigger.includes('\n')) {
        return {
          kind: 'task',
          query: afterTrigger,
          triggerStart: taskTriggerIdx,
          active: 0,
        }
      }
    }

    // ── Gatilho de pessoa: @ ───────────────────────────────────────────────
    // Regex que casa "@" seguido de letras/acentos no FINAL do texto (antes do cursor).
    // \w não cobre acentos, então usamos [À-ÿ] para cobrir caracteres latinos acentuados.
    const atMatch = before.match(/@([\wÀ-ÿ]*)$/)
    if (atMatch) {
      return {
        kind: 'person',
        query: atMatch[1],
        triggerStart: before.lastIndexOf('@'),
        active: 0,
      }
    }

    // Nenhum gatilho ativo — fechar o dropdown
    return null
  }

  // ── Handler de mudança do textarea ────────────────────────────────────────

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value
      onChange(text)

      // Detecta menção baseada na posição atual do caret
      const cursor = e.target.selectionStart ?? text.length
      const trigger = detectMentionTrigger(text, cursor)

      if (!trigger) {
        // Nenhum gatilho: fecha o dropdown e limpa resultados de task
        setDropdown(null)
        return
      }

      // Mantém o estado do dropdown atualizado (query pode ter mudado a cada tecla)
      setDropdown(trigger)

      if (trigger.kind === 'task') {
        // ── Busca de tasks com debounce ────────────────────────────────────
        // Só busca após pelo menos 1 caractere digitado (query vazia não vale)
        if (trigger.query.length >= 1) {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(async () => {
            try {
              const results = await kaguyaApi.search(trigger.query)
              setTaskResults(results.slice(0, 8))
            } catch {
              setTaskResults([])
            }
          }, 250)
        } else {
          // Query vazia: limpa resultados sem fazer chamada de API
          setTaskResults([])
        }
      }
    },
    [onChange],
  )

  // ── Inserção do token escolhido ────────────────────────────────────────────

  // Substitui o trecho do gatilho (texto bruto que o usuário digitou) pelo token de menção.
  // Reposiciona o caret logo depois do token inserido.
  const insertMention = useCallback(
    (item: Person | Task, kind: DropdownKind) => {
      if (!dropdown || !textareaRef.current) return

      // Posição atual do caret para saber até onde vai o texto do gatilho
      const cursor = textareaRef.current.selectionStart ?? value.length
      // Texto antes do gatilho (intocado)
      const before = value.slice(0, dropdown.triggerStart)
      // Texto depois do caret (intocado)
      const after = value.slice(cursor)

      // Monta o token conforme o tipo de menção
      let token: string
      if (kind === 'person') {
        const p = item as Person
        // Formato: @[Nome Completo](komi:<uuid>) — legível e parsável pelo preview
        token = `@[${p.name}](komi:${p.id})`
      } else {
        const t = item as Task
        // Formato: [[<id>|Título da Task]] — estilo Obsidian wiki-link
        token = `[[${t.id}|${t.title}]]`
      }

      // Substitui o texto do gatilho pelo token completo e notifica o pai
      onChange(before + token + after)

      // Fecha o dropdown e limpa resultados
      setDropdown(null)
      setTaskResults([])

      // Reposiciona o caret imediatamente após o token (assíncrono: o DOM precisa atualizar)
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = before.length + token.length
          textareaRef.current.setSelectionRange(newPos, newPos)
          textareaRef.current.focus()
        }
      })
    },
    [dropdown, value, onChange],
  )

  // ── Navegação por teclado no dropdown ─────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Se o dropdown estiver fechado, não interceptamos nenhuma tecla
      if (!dropdown) return

      // Itens visíveis no dropdown (pessoas ou tasks conforme o tipo)
      const items = dropdown.kind === 'person' ? filteredPeople : taskResults
      if (items.length === 0) return

      if (e.key === 'ArrowDown') {
        // Move o destaque para o próximo item (não passa do último)
        e.preventDefault()
        setDropdown(d => d ? { ...d, active: Math.min(d.active + 1, items.length - 1) } : d)
      } else if (e.key === 'ArrowUp') {
        // Move o destaque para o item anterior (não passa do primeiro)
        e.preventDefault()
        setDropdown(d => d ? { ...d, active: Math.max(d.active - 1, 0) } : d)
      } else if (e.key === 'Enter') {
        // Confirma a seleção do item destacado (Enter normal: inserir quebra de linha)
        e.preventDefault()
        const chosen = items[dropdown.active]
        if (chosen) insertMention(chosen as Person | Task, dropdown.kind)
      } else if (e.key === 'Escape') {
        // Fecha o dropdown sem inserir nada
        e.preventDefault()
        setDropdown(null)
      }
    },
    [dropdown, filteredPeople, taskResults, insertMention],
  )

  // ── Itens renderizados no dropdown ────────────────────────────────────────

  // Define quais itens exibir com base no tipo de menção ativa
  const dropdownItems = dropdown?.kind === 'person' ? filteredPeople : taskResults

  return (
    // Wrapper relativo para ancorar o dropdown absolutamente dentro do componente
    <div className="kg-mention-wrap">
      <textarea
        ref={textareaRef}
        className="kg-textarea kg-note-textarea"
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={
          placeholder ??
          'Detalhes, links, contexto…\n\n@nome para mencionar pessoa\n[[ para mencionar outra task'
        }
      />

      {/* Dropdown de menção: aparece apenas quando há gatilho ativo e resultados disponíveis */}
      {dropdown && dropdownItems.length > 0 && (
        <div className="kg-pop kg-mention-drop">
          {dropdownItems.map((item, i) => {
            const isPerson = dropdown.kind === 'person'
            // Usa onMouseDown (em vez de onClick) para não perder o foco do textarea
            return (
              <button
                key={isPerson ? (item as Person).id : (item as Task).id}
                type="button"
                className={`kg-pop-item${i === dropdown.active ? ' active' : ''}`}
                onMouseDown={(e) => {
                  // Previne o blur do textarea (que fecharia o dropdown antes de inserir)
                  e.preventDefault()
                  insertMention(item as Person | Task, dropdown.kind)
                }}
              >
                {isPerson
                  ? `@${(item as Person).name}`
                  : `#${(item as Task).id} ${(item as Task).title}`}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
