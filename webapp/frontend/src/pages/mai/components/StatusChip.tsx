// StatusChip — badge colorido do status da série (usa --st-* tokens do mai.css).
//
// Modo display (padrão): apenas exibe o status com cor e ponto.
// Modo interativo: quando recebe onSelect, vira um botão que abre um menu
//   com os 5 status disponíveis para o usuário escolher.
// O modo interativo é usado na DetailScreen; o display é usado em cards/pôsteres.

import { useState, useRef, useEffect } from 'react'
import type { MaiStatus } from '../types'

// Rótulo em pt-BR para cada status
const LABELS: Record<MaiStatus, string> = {
  quero_assistir: 'Quero assistir',
  assistindo:     'Assistindo',
  concluida:      'Concluída',
  pausada:        'Pausada',
  abandonada:     'Abandonada',
}

// Variável CSS de cor para cada status (definidas em mai.css como --st-*)
const COLORS: Record<MaiStatus, string> = {
  quero_assistir: 'var(--st-quero_assistir)',
  assistindo:     'var(--st-assistindo)',
  concluida:      'var(--st-concluida)',
  pausada:        'var(--st-pausada)',
  abandonada:     'var(--st-abandonada)',
}

// Todos os status disponíveis, na ordem em que aparecem no menu
const ALL_STATUSES: MaiStatus[] = [
  'assistindo',
  'quero_assistir',
  'concluida',
  'pausada',
  'abandonada',
]

interface Props {
  status: MaiStatus
  /** 'sm' = padrão (11px); 'md' = médio (12.5px) */
  size?: 'sm' | 'md'
  /** Adiciona backdrop-filter blur (para uso sobre pôsteres) */
  onPoster?: boolean
  /**
   * Se fornecido, ativa o modo interativo:
   *   - O chip vira um botão clicável
   *   - Clique abre um menu com todos os 5 status
   *   - Escolher um status chama onSelect(novoStatus)
   * Sem onSelect, o componente é puramente decorativo (modo display).
   */
  onSelect?: (status: MaiStatus) => void
}

/**
 * StatusChip — badge do status da série.
 *
 * Em modo display (sem onSelect): <span> colorido, não clicável.
 * Em modo interativo (com onSelect): <button> que abre um popover com os 5 status.
 * Fechar o menu: clicar em um item, clicar fora ou pressionar Esc.
 */
export function StatusChip({ status, size = 'sm', onPoster = false, onSelect }: Props) {
  const color = COLORS[status]

  // Controla se o menu de status está aberto
  const [menuOpen, setMenuOpen] = useState(false)

  // Ref para detectar cliques fora do menu e fechá-lo
  const containerRef = useRef<HTMLDivElement>(null)

  // Fecha o menu quando o usuário clica fora do container
  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(e: PointerEvent) {
      // Se o clique foi fora do container, fecha o menu
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }

    // Listener de pointerdown para capturar clique antes do click event
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [menuOpen])

  // Fecha o menu ao pressionar Esc
  useEffect(() => {
    if (!menuOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  // ── Modo display (sem onSelect) — apenas um <span> colorido ──────────────
  if (!onSelect) {
    return (
      <span
        className={`status-chip${size === 'md' ? ' md' : ''}${onPoster ? ' on-poster' : ''}`}
        style={{ color, background: `${color}22` }}
      >
        <span className="sc-dot" />
        {LABELS[status]}
      </span>
    )
  }

  // ── Modo interativo (com onSelect) — botão com popover ───────────────────

  /**
   * Ao escolher um status do menu:
   *   1. Fecha o menu
   *   2. Chama onSelect com o novo status
   */
  function handleSelect(newStatus: MaiStatus) {
    setMenuOpen(false)
    // onSelect é garantidamente definido aqui pois este código só executa quando onSelect foi passado
    onSelect?.(newStatus)
  }

  return (
    // Container relativo para ancorar o menu ao chip
    <div ref={containerRef} className="status-chip-wrap">
      {/* Botão que replica o visual do chip mas é clicável */}
      <button
        type="button"
        className={`status-chip interactive${size === 'md' ? ' md' : ''}${onPoster ? ' on-poster' : ''}`}
        style={{ color, background: `${color}22` }}
        onClick={() => setMenuOpen(prev => !prev)}
        title="Alterar status"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
      >
        <span className="sc-dot" />
        {LABELS[status]}
        {/* Seta indicando que é clicável */}
        <span className="sc-arrow" aria-hidden>▾</span>
      </button>

      {/* Menu de status — posicionado absolutamente abaixo do chip */}
      {menuOpen && (
        <div className="status-menu" role="listbox" aria-label="Selecionar status">
          {ALL_STATUSES.map(opt => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === status}
              className={`status-menu-item${opt === status ? ' active' : ''}`}
              onClick={() => handleSelect(opt)}
            >
              {/* Ponto de cor para identificar o status visualmente */}
              <span className="smi-dot" style={{ background: COLORS[opt] }} />
              {LABELS[opt]}
              {/* Checkmark no item atualmente selecionado */}
              {opt === status && <span className="smi-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Exporta o mapa de labels para uso em outros componentes. */
export { LABELS as STATUS_LABELS }
