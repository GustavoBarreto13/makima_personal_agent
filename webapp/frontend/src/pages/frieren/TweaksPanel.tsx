// Painel flutuante de configurações visuais ("tweaks") — aparece no canto
// inferior direito da tela. Permite ajustar tema, layout do hero, densidade
// da grade e ordenação do catálogo. Portado do protótipo app.jsx.

import { useState } from 'react'
import type { Tweaks } from './types'
import { Icon } from './ui/Icons'

// Props do painel de tweaks
interface TweaksPanelProps {
  // Estado atual das preferências visuais
  tweaks: Tweaks
  // Função para atualizar uma preferência específica pelo nome da chave
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void
}

// Props de um grupo de opções exclusivas (radio buttons estilizados)
interface TweakRadioProps<T extends string> {
  label: string         // Rótulo do campo
  value: T              // Opção atualmente selecionada
  options: T[]          // Todas as opções disponíveis
  onChange: (v: T) => void  // Callback ao selecionar uma opção
}

// Props de um seletor dropdown (select nativo)
interface TweakSelectProps<T extends string> {
  label: string
  value: T
  options: T[]
  onChange: (v: T) => void
}

// Grupo de botões de opção exclusiva (um clique seleciona, desseleciona os demais).
// Exibido como fileira de chips/pills clicáveis.
function TweakRadio<T extends string>({ label, value, options, onChange }: TweakRadioProps<T>) {
  return (
    <div className="tp-row">
      {/* Rótulo do campo à esquerda */}
      <span className="tp-label">{label}</span>
      {/* Fileira de opções à direita */}
      <div className="tp-opts">
        {options.map(opt => (
          <button
            key={opt}
            // Classe "sel" ativa o estilo de selecionado no CSS
            className={'tp-opt' + (opt === value ? ' sel' : '')}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

// Seletor dropdown nativo para opções com muitas alternativas (ex: ordenação).
function TweakSelect<T extends string>({ label, value, options, onChange }: TweakSelectProps<T>) {
  return (
    <div className="tp-row">
      <span className="tp-label">{label}</span>
      {/* Select nativo — mais compacto que um grupo de radio quando há muitas opções */}
      <select
        className="tp-select"
        value={value}
        onChange={e => onChange(e.target.value as T)}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * Painel flutuante de preferências visuais da interface Frieren.
 * Fica colapsado como um botão de ícone; expande ao clicar.
 * Persiste as preferências via prop setTweak (que salva no localStorage no shell).
 */
export function TweaksPanel({ tweaks, setTweak }: TweaksPanelProps) {
  // Controla se o painel está expandido ou colapsado
  const [open, setOpen] = useState(false)

  return (
    // Container fixo no canto inferior direito da viewport
    <div className="tweaks-panel" data-open={open ? 'true' : 'false'}>

      {/* Botão de abrir/fechar o painel */}
      <button
        className="tp-toggle"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Fechar tweaks' : 'Abrir tweaks'}
        title="Ajustes visuais"
      >
        <Icon name="sliders" />
      </button>

      {/* Corpo do painel — visível apenas quando open=true */}
      {open && (
        <div className="tp-body">
          {/* Cabeçalho com título e botão de fechar */}
          <div className="tp-head">
            <span className="tp-title">Tweaks</span>
            <button className="tp-close" onClick={() => setOpen(false)} aria-label="Fechar">
              <Icon name="x" />
            </button>
          </div>

          {/* Seção: Aparência */}
          <div className="tp-section">Aparência</div>
          <TweakRadio
            label="Tema"
            value={tweaks.tema}
            options={['Claro', 'Escuro'] as Tweaks['tema'][]}
            onChange={v => setTweak('tema', v)}
          />

          {/* Seção: Página inicial */}
          <div className="tp-section">Página inicial</div>
          <TweakRadio
            label="Layout do hero"
            value={tweaks.layoutInicio}
            options={['Cinemático', 'Editorial', 'Galeria'] as Tweaks['layoutInicio'][]}
            onChange={v => setTweak('layoutInicio', v)}
          />

          {/* Seção: Catálogo */}
          <div className="tp-section">Catálogo</div>
          <TweakRadio
            label="Densidade da grade"
            value={tweaks.densidade}
            options={['Grande', 'Médio', 'Compacto'] as Tweaks['densidade'][]}
            onChange={v => setTweak('densidade', v)}
          />
          <TweakSelect
            label="Ordenação"
            value={tweaks.ordenacao}
            options={['Recentes', 'Avaliação', 'Título', 'Autor', 'Progresso'] as Tweaks['ordenacao'][]}
            onChange={v => setTweak('ordenacao', v)}
          />
        </div>
      )}
    </div>
  )
}
