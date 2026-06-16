// Barra de navegação inferior da tela Write — navega entre entries do diário.
// Inclui botão de seletor de data para abrir qualquer dia (inclusive datas sem entrada).

import { useRef } from 'react'

interface WriteFooterProps {
  entryIdx: number
  totalEntries: number
  onNav: (action: 'prev' | 'next' | 'first' | 'latest' | 'today' | 'list') => void
  // Data atualmente exibida no Write (YYYY-MM-DD) — usada como valor inicial do picker
  currentDate: string
  // Callback chamado quando o usuário escolhe uma data no picker nativo
  onPickDate: (date: string) => void
}

export function WriteFooter({ entryIdx, totalEntries, onNav, currentDate, onPickDate }: WriteFooterProps) {
  const isFirst  = entryIdx <= 0
  const isLatest = entryIdx >= totalEntries - 1

  // Ref para o <input type="date"> oculto — acionado pelo botão de calendário.
  // Usamos um input oculto em vez de um picker customizado para aproveitar o
  // seletor nativo do navegador, que já é acessível e suporta teclado/mobile.
  const dateInputRef = useRef<HTMLInputElement>(null)

  // Abre o seletor de data nativo ao clicar no botão de calendário.
  // showPicker() é a forma moderna de abrir o seletor programaticamente;
  // o fallback focus() garante compatibilidade com navegadores mais antigos.
  function openDatePicker() {
    const input = dateInputRef.current
    if (!input) return
    try {
      input.showPicker()
    } catch {
      // Fallback para navegadores que não suportam showPicker (ex.: Safari antigo)
      input.focus()
    }
  }

  return (
    <div className="w-foot">
      <button className="foot-btn" disabled={isFirst}  onClick={() => onNav('first')}>«</button>
      <button className="foot-btn" disabled={isFirst}  onClick={() => onNav('prev')}>‹</button>
      <button className="foot-btn" onClick={() => onNav('list')}>Lista</button>
      <button className="foot-btn today" onClick={() => onNav('today')}>●</button>

      {/* Botão de calendário — abre seletor de data nativo para ir a qualquer dia.
          O <input type="date"> fica visualmente colapsado (largura zero, opacidade zero)
          mas permanece no DOM para o showPicker() funcionar. O value={currentDate}
          inicializa o picker na data atual, tornando a navegação mais intuitiva. */}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          className="foot-btn"
          onClick={openDatePicker}
          title="Ir para uma data específica"
          aria-label="Abrir seletor de data"
        >
          🗓
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={currentDate}
          onChange={e => {
            // Só dispara onPickDate se o usuário escolheu de fato uma data
            if (e.target.value) onPickDate(e.target.value)
          }}
          style={{
            // Input colapsado: ocupa zero espaço visual mas continua funcional para showPicker()
            position: 'absolute',
            width: 0,
            height: 0,
            opacity: 0,
            padding: 0,
            border: 'none',
            pointerEvents: 'none',
          }}
          // Leitura por screen readers: label descritivo mesmo com o input oculto
          aria-label="Data do diário"
          tabIndex={-1}
        />
      </div>

      <button className="foot-btn" disabled={isLatest} onClick={() => onNav('next')}>›</button>
      <button className="foot-btn" disabled={isLatest} onClick={() => onNav('latest')}>»</button>
    </div>
  )
}
