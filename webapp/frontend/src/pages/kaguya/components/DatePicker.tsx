// DatePicker — seletor de data no tema Kaguya, substitui <input type="date"> nativo.
//
// O <input type="date"> nativo abre o calendar picker do sistema operacional, que
// ignora completamente o tema OKLCH e fica visualmente fora do shell.
//
// Este componente usa:
//   - Botão-gatilho com aparência idêntica a .kg-input (borda, fundo, foco)
//   - Popover (.kg-datefield-pop) com <MiniCalendar> + rodapé "Hoje"/"Limpar"
//   - Fecha ao clicar fora (listener mousedown + ref.contains, padrão CalendarsAside)
//   - Fecha ao pressionar Escape
//   - Respeita fuso UTC-3: nunca usa toISOString()
//
// Props:
//   value       — string ISO "AAAA-MM-DD" ou "" para sem data
//   onChange    — chamado com novo ISO (ou "" para limpar)
//   disabled    — desabilita o campo visualmente e bloqueia interação
//   placeholder — texto quando não há data (padrão: "Sem data")

import { useState, useRef, useEffect } from 'react'
import { MiniCalendar } from './MiniCalendar'
import { todayISO, fmtDateLabel } from '../lib/dateUtils'
import { Icon } from '../ui/Icons'

interface DatePickerProps {
  // Data atual em ISO "AAAA-MM-DD"; string vazia = sem data
  value: string
  // Chamado quando o usuário seleciona ou limpa uma data
  onChange: (iso: string) => void
  // Quando true, o campo fica cinza e não responde a cliques
  disabled?: boolean
  // Texto exibido quando value é "" (sem data selecionada)
  placeholder?: string
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Sem data',
}: DatePickerProps) {

  // Controla se o popover está visível ou não
  const [open, setOpen] = useState(false)

  // Âncora do mini-calendário: determina qual mês está sendo exibido.
  // Inicializa no mês da data atual; cai no mês corrente se não há valor.
  const [anchor, setAnchor] = useState<Date>(() => {
    if (value) {
      // Parseia ano e mês da string ISO para posicionar o calendário
      const [y, m] = value.split('-').map(Number)
      if (y && m) return new Date(y, m - 1, 1)
    }
    // Sem valor: mês atual
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  // Ref do container do popover — para detectar clique fora e fechar
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // ── Fecha ao clicar fora do popover ──────────────────────────────────────
  useEffect(() => {
    if (!open) return

    function onMouseDown(e: MouseEvent) {
      // Se o clique aconteceu fora do container, fecha o popover
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    // Registra no document para capturar cliques em qualquer lugar da página
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // ── Fecha ao pressionar Escape ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // ── Ressincroniza a âncora quando o valor muda externamente ──────────────
  // (ex.: usuário clica "Hoje" no rodapé ou limpa a data de fora)
  useEffect(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      if (y && m) setAnchor(new Date(y, m - 1, 1))
    }
  }, [value])

  // Usuário clicou em um dia na grade do mini-calendário
  function handleSelect(iso: string) {
    onChange(iso)
    setOpen(false)  // fecha o popover imediatamente após a seleção
  }

  // Navega o mini-calendário um mês para frente (+1) ou para trás (-1)
  function handleNavMonth(delta: 1 | -1) {
    setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  // Rótulo exibido no botão (ex.: "20 jun 2026" ou o placeholder)
  const label = fmtDateLabel(value)

  return (
    // Container relativo: o popover se posiciona absolutamente dentro dele
    <div ref={wrapRef} className="kg-datefield-wrap">

      {/* ── Botão-gatilho: visual idêntico a .kg-input ── */}
      <button
        type="button"
        className={[
          'kg-datefield',
          open      && 'open',      // estado de foco (anel azul)
          disabled  && 'disabled',  // aparência acinzentada
        ].filter(Boolean).join(' ')}
        onClick={() => { if (!disabled) setOpen((v) => !v) }}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        title={label || placeholder}
      >
        {/* Texto da data selecionada ou placeholder apagado */}
        <span className={`kg-datefield-label${!value ? ' placeholder' : ''}`}>
          {label || placeholder}
        </span>

        {/* Glifo de calendário à direita — indica que é um picker */}
        <Icon name="calendar" size={14} />
      </button>

      {/* ── Popover do calendário ── */}
      {open && (
        <div
          className="kg-datefield-pop"
          role="dialog"
          aria-label="Selecionar data"
          aria-modal="false"
        >
          {/* Grade do mini-calendário */}
          <MiniCalendar
            anchor={anchor}
            selected={value}
            onSelect={handleSelect}
            onNavMonth={handleNavMonth}
          />

          {/* Rodapé com atalhos rápidos */}
          <div className="kg-pop-foot">
            {/* "Hoje" define a data para hoje e fecha o popover */}
            <button
              type="button"
              className="kg-pop-foot-btn"
              onClick={() => {
                onChange(todayISO())
                setOpen(false)
              }}
            >
              Hoje
            </button>

            {/* "Limpar" só aparece quando há uma data definida */}
            {value && (
              <button
                type="button"
                className="kg-pop-foot-btn danger"
                onClick={() => {
                  onChange('')   // '' = sem data
                  setOpen(false)
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
