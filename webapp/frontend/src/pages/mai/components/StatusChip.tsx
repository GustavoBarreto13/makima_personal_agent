// StatusChip — badge colorido do status da série (usa --st-* tokens do mai.css).
//
// Modo display (padrão): apenas exibe o status com cor e ponto.
// Modo interativo: quando recebe onSelect, vira um botão que abre um menu
//   com os 5 status disponíveis para o usuário escolher.
// O modo interativo é usado na DetailScreen; o display é usado em cards/pôsteres.
//
// O menu usa position: fixed com coordenadas calculadas via getBoundingClientRect()
// para escapar do overflow: hidden do .detail-banner sem precisar de portal.

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

/** Coordenadas do menu fixo calculadas a partir do botão. */
interface MenuPos {
  top: number
  left: number
}

/**
 * StatusChip — badge do status da série.
 *
 * Em modo display (sem onSelect): <span> colorido, não clicável.
 * Em modo interativo (com onSelect): <button> que abre um popover com os 5 status.
 *
 * O menu usa position:fixed para escapar do overflow:hidden do banner.
 * Fechar: clicar em um item, clicar fora ou pressionar Esc.
 */
export function StatusChip({ status, size = 'sm', onPoster = false, onSelect }: Props) {
  const color = COLORS[status]

  // Controla se o menu está aberto
  const [menuOpen, setMenuOpen] = useState(false)
  // Posição absoluta em viewport para o menu (position:fixed)
  const [menuPos, setMenuPos] = useState<MenuPos>({ top: 0, left: 0 })

  // Ref para o botão — usado para calcular a posição do menu
  const btnRef = useRef<HTMLButtonElement>(null)

  // Ao abrir o menu, calcula a posição do botão na viewport
  function openMenu() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      // Posiciona o menu abaixo do botão com 6px de espaço
      setMenuPos({ top: rect.bottom + 6, left: rect.left })
    }
    setMenuOpen(true)
  }

  // Fecha o menu ao clicar fora dele
  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      // Verifica se o clique foi fora do botão E fora do menu
      const clickedBtn  = btnRef.current?.contains(target)
      const clickedMenu = document.getElementById('sc-status-menu')?.contains(target)
      if (!clickedBtn && !clickedMenu) {
        setMenuOpen(false)
      }
    }

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

  // ── Modo interativo (com onSelect) ────────────────────────────────────────

  function handleSelect(newStatus: MaiStatus) {
    setMenuOpen(false)
    onSelect?.(newStatus)
  }

  return (
    <>
      {/* Botão que replica o visual do chip */}
      <button
        ref={btnRef}
        type="button"
        className={`status-chip interactive${size === 'md' ? ' md' : ''}${onPoster ? ' on-poster' : ''}`}
        style={{ color, background: `${color}22` }}
        onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
        title="Alterar status"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
      >
        <span className="sc-dot" />
        {LABELS[status]}
        {/* Seta indicando que é clicável */}
        <span className="sc-arrow" aria-hidden>▾</span>
      </button>

      {/*
        Menu de status com position:fixed ancorado às coordenadas do botão.
        Fica fora do fluxo normal do DOM, escapando do overflow:hidden do banner.
      */}
      {menuOpen && (
        <div
          id="sc-status-menu"
          className="status-menu"
          role="listbox"
          aria-label="Selecionar status"
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
        >
          {ALL_STATUSES.map(opt => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === status}
              className={`status-menu-item${opt === status ? ' active' : ''}`}
              onClick={() => handleSelect(opt)}
            >
              {/* Ponto de cor identificador */}
              <span className="smi-dot" style={{ background: COLORS[opt] }} />
              {LABELS[opt]}
              {/* Checkmark no item ativo */}
              {opt === status && <span className="smi-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/** Exporta o mapa de labels para uso em outros componentes. */
export { LABELS as STATUS_LABELS }
