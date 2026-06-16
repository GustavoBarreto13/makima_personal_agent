// TweaksPanel.tsx — Painel de preferências da Komi.
// Tema (Claro/Escuro), Acento (4 paletas de cor) e Nomes (Serifa/Sem serifa).
// Desliza da direita; fecha ao clicar no scrim ou no X.
// Persistido em localStorage (chave 'km-tweaks').

import React, { useEffect, useRef } from 'react'
import { Icon } from './icons'
import { KM_PALETTES } from './lib'

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface KomiTweaks {
  tema: 'Claro' | 'Escuro'
  acento: string  // chave de KM_PALETTES: '#5A4FCF' | '#A23B43' | '#3E7FB0' | '#3E8C6E'
  nomes: 'Serifa' | 'Sem serifa'
}

// Defaults: índigo claro com nomes em serifa (fiel ao design handoff)
export const TWEAK_DEFAULTS: KomiTweaks = {
  tema: 'Claro',
  acento: '#5A4FCF',
  nomes: 'Serifa',
}

const LS_KEY = 'km-tweaks'

/** Lê tweaks do localStorage; retorna defaults se ausente ou corrompido. */
export function loadTweaks(): KomiTweaks {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return TWEAK_DEFAULTS
    return { ...TWEAK_DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return TWEAK_DEFAULTS
  }
}

/** Salva tweaks no localStorage. */
export function saveTweaks(t: KomiTweaks): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(t)) } catch { /* sem acesso ao storage */ }
}

// ─── Rótulos dos acentos ──────────────────────────────────────────────────
// Cada valor hex tem um nome legível para acessibilidade e tooltip.

const ACCENT_LABELS: Record<string, string> = {
  '#5A4FCF': 'Índigo (padrão)',
  '#A23B43': 'Granada',
  '#3E7FB0': 'Azul',
  '#3E8C6E': 'Esmeralda',
}

// ─── Componente ───────────────────────────────────────────────────────────

interface TweaksPanelProps {
  tweaks: KomiTweaks
  onChange: (t: KomiTweaks) => void
  onClose: () => void
}

/**
 * Painel lateral deslizante de tweaks da Komi.
 * Renderizado dentro do .km-app; o CSS .km-tweaks-panel controla a animação.
 */
export function TweaksPanel({ tweaks, onChange, onClose }: TweaksPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Fecha com Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Abre o painel com animação (adiciona classe .open no próximo tick)
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    // setTimeout garante que a classe é adicionada DEPOIS do render inicial
    // para a transição CSS funcionar (de translateX(100%) para 0)
    const id = setTimeout(() => el.classList.add('open'), 10)
    return () => clearTimeout(id)
  }, [])

  /** Atualiza um campo dos tweaks e notifica o pai. */
  function set<K extends keyof KomiTweaks>(key: K, value: KomiTweaks[K]) {
    onChange({ ...tweaks, [key]: value })
  }

  return (
    <>
      {/* Scrim transparente — fecha ao clicar fora do painel */}
      <div className="km-tweaks-scrim" onClick={onClose} />

      {/* Painel propriamente dito */}
      <div className="km-tweaks-panel" ref={panelRef}>
        {/* Cabeçalho */}
        <div className="km-tweaks-head">
          <span className="km-tweaks-title">Aparência</span>
          <button className="km-tweaks-close" onClick={onClose} aria-label="Fechar tweaks">
            <Icon name="x" />
          </button>
        </div>

        {/* Corpo */}
        <div className="km-tweaks-body">
          {/* Seção: Tema */}
          <div className="km-tweak-section">Aparência</div>
          <div className="km-tweak-row">
            <div className="km-tweak-label">Tema</div>
            <div className="km-tweak-opts">
              {(['Claro', 'Escuro'] as const).map(opt => (
                <button
                  key={opt}
                  className={'km-tweak-opt' + (tweaks.tema === opt ? ' sel' : '')}
                  onClick={() => set('tema', opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Seção: Acento */}
          <div className="km-tweak-row">
            <div className="km-tweak-label">Acento da Komi</div>
            <div className="km-tweak-swatches">
              {Object.keys(KM_PALETTES).map(hex => (
                <button
                  key={hex}
                  className={'km-tweak-swatch' + (tweaks.acento === hex ? ' sel' : '')}
                  style={{ background: hex }}
                  title={ACCENT_LABELS[hex] || hex}
                  aria-label={ACCENT_LABELS[hex] || hex}
                  onClick={() => set('acento', hex)}
                />
              ))}
            </div>
          </div>

          {/* Seção: Tipografia */}
          <div className="km-tweak-section">Tipografia</div>
          <div className="km-tweak-row">
            <div className="km-tweak-label">Nomes</div>
            <div className="km-tweak-opts">
              {(['Serifa', 'Sem serifa'] as const).map(opt => (
                <button
                  key={opt}
                  className={'km-tweak-opt' + (tweaks.nomes === opt ? ' sel' : '')}
                  onClick={() => set('nomes', opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
