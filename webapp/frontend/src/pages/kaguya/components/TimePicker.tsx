// TimePicker — seletor de hora no tema Kaguya, substitui <input type="time"> nativo.
//
// O <input type="time"> nativo usa o spinner/pop-up do sistema, que ignora o
// tema OKLCH e aparece visualmente desconexo do shell.
//
// Este componente oferece:
//   - Botão-gatilho com visual idêntico a .kg-input
//   - Dropdown rolável com horários de 15 em 15 minutos (96 opções: 00:00 a 23:45)
//   - Horário selecionado destacado e rolado para a posição visível ao abrir
//   - Fecha ao clicar fora (listener mousedown + ref.contains)
//   - Fecha ao pressionar Escape
//
// Props:
//   value       — string "HH:MM" (ex.: "14:30") ou "" para sem hora
//   onChange    — chamado com novo "HH:MM" (ou "" para limpar)
//   disabled    — desabilita o campo (ex.: quando não há data selecionada)
//   placeholder — texto quando sem hora (padrão: "Sem hora")

import { useState, useRef, useEffect } from 'react'
import { Icon } from '../ui/Icons'

// ── Geração dos slots de horário ─────────────────────────────────────────────

/**
 * Gera um array com todos os horários de 00:00 até 23:45 em passos de 15 min.
 * Total: 24 horas × 4 passos = 96 slots.
 */
function buildTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = 0; h < 24; h++) {
    // Para cada hora, gera os minutos 0, 15, 30, 45
    for (const m of [0, 15, 30, 45]) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      slots.push(`${hh}:${mm}`)
    }
  }
  return slots
}

// Pré-calculado fora do componente: não muda entre renders
const TIME_SLOTS = buildTimeSlots()

// ── Componente ────────────────────────────────────────────────────────────────

interface TimePickerProps {
  // Hora atual em formato "HH:MM" ou "" para sem hora
  value: string
  // Chamado quando o usuário escolhe um horário
  onChange: (time: string) => void
  // Quando true, o campo fica cinza e não responde a cliques
  // (tipicamente true quando não há data selecionada)
  disabled?: boolean
  // Texto exibido quando value é "" (sem hora escolhida)
  placeholder?: string
}

export function TimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Sem hora',
}: TimePickerProps) {

  // Controla se o dropdown está aberto ou fechado
  const [open, setOpen] = useState(false)

  // Ref do container inteiro — usado para detectar clique fora e fechar
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Ref do item atualmente selecionado — para rolar até ele ao abrir o dropdown
  const activeRef = useRef<HTMLButtonElement | null>(null)

  // ── Fecha ao clicar fora ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return

    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

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

  // ── Rola até o horário selecionado ao abrir o dropdown ───────────────────
  useEffect(() => {
    if (open && activeRef.current) {
      // scrollIntoView centra o item na área visível do dropdown
      activeRef.current.scrollIntoView({ block: 'center' })
    }
  }, [open])

  // Usuário clicou em um horário da lista
  function handleSelect(slot: string) {
    onChange(slot)
    setOpen(false)  // fecha imediatamente após a escolha
  }

  return (
    // Container relativo: o dropdown se posiciona absolutamente dentro dele
    <div ref={wrapRef} className="kg-timefield-wrap">

      {/* ── Botão-gatilho: visual idêntico a .kg-input ── */}
      <button
        type="button"
        className={[
          'kg-timefield',
          open     && 'open',
          disabled && 'disabled',
        ].filter(Boolean).join(' ')}
        onClick={() => { if (!disabled) setOpen((v) => !v) }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={value || placeholder}
      >
        {/* Exibe o horário escolhido ou o placeholder apagado */}
        <span className={`kg-timefield-label${!value ? ' placeholder' : ''}`}>
          {value || placeholder}
        </span>

        {/* Glifo de relógio à direita */}
        <Icon name="clock" size={14} />
      </button>

      {/* ── Dropdown com lista de horários ── */}
      {open && (
        <div
          className="kg-time-pop"
          role="listbox"
          aria-label="Selecionar horário"
        >
          {TIME_SLOTS.map((slot) => {
            const isActive = slot === value  // horário atualmente selecionado

            return (
              <button
                key={slot}
                type="button"
                role="option"
                aria-selected={isActive}
                // Guarda a ref do item ativo para rolar até ele ao abrir
                ref={isActive ? activeRef : null}
                className={`kg-time-opt${isActive ? ' active' : ''}`}
                onClick={() => handleSelect(slot)}
              >
                {slot}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
