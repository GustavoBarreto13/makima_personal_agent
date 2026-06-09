// Painel de tweaks visuais da seção Nami.
// Botão de engrenagem fixo no canto inferior direito da sidebar;
// ao clicar, expande um painel com opções de tema, acento, densidade e privacidade.

import { useState } from 'react'
import type { Tweaks } from './types'

// Props recebidas do NamiShell
interface TweaksPanelProps {
  tweaks: Tweaks
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void
}

// Opções de acento disponíveis (espelham os data-accent do CSS)
const ACENTOS: Array<{ label: Tweaks['acento']; color: string }> = [
  { label: 'Tangerina', color: 'oklch(0.68 0.17 42)' },
  { label: 'Azul-maré', color: 'oklch(0.55 0.14 230)' },
  { label: 'Coral',     color: 'oklch(0.56 0.19 15)' },
  { label: 'Ouro',      color: 'oklch(0.72 0.13 78)' },
]

/** Painel deslizante de preferências visuais da seção Nami. */
export function TweaksPanel({ tweaks, setTweak }: TweaksPanelProps) {
  // Controla se o painel está aberto
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Botão de engrenagem fixo na borda inferior da sidebar */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          // Posiciona dentro da sidebar (250px de largura) alinhado à direita
          left: 218,
          bottom: 72,
          zIndex: 50,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--tang-tint)',
          border: '1px solid var(--line)',
          color: 'var(--tang)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.15s',
          boxShadow: 'var(--shadow-sm)',
        }}
        title="Personalizar aparência"
        aria-label="Abrir tweaks"
      >
        {/* Ícone de engrenagem SVG */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {/* Painel deslizante — aparece abaixo do botão de engrenagem */}
      {open && (
        <>
          {/* Clique fora fecha o painel */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 48 }}
            onClick={() => setOpen(false)}
          />

          <div style={{
            position: 'fixed',
            left: 12,
            bottom: 106,
            zIndex: 49,
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: '18px 16px',
            minWidth: 230,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            {/* Título do painel */}
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
              Aparência
            </div>

            {/* Seletor de tema */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Tema
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['Claro', 'Escuro'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTweak('tema', t)}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 'var(--r-sm)',
                      border: `1.5px solid ${tweaks.tema === t ? 'var(--tang)' : 'var(--line)'}`,
                      background: tweaks.tema === t ? 'var(--tang-tint)' : 'transparent',
                      color: tweaks.tema === t ? 'var(--tang-deep)' : 'var(--ink-2)',
                      fontSize: 12.5,
                      fontWeight: tweaks.tema === t ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {t === 'Claro' ? '☀️' : '🌙'} {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Seletor de acento */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Acento
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {ACENTOS.map(a => (
                  <button
                    key={a.label}
                    onClick={() => setTweak('acento', a.label)}
                    title={a.label}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: a.color,
                      border: tweaks.acento === a.label
                        ? `2.5px solid var(--ink)`
                        : '2px solid var(--line)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Seletor de densidade */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Densidade
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['Confortável', 'Compacto'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setTweak('densidade', d)}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 'var(--r-sm)',
                      border: `1.5px solid ${tweaks.densidade === d ? 'var(--tang)' : 'var(--line)'}`,
                      background: tweaks.densidade === d ? 'var(--tang-tint)' : 'transparent',
                      color: tweaks.densidade === d ? 'var(--tang-deep)' : 'var(--ink-2)',
                      fontSize: 12.5,
                      fontWeight: tweaks.densidade === d ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggle de privacidade */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Privacidade</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
                  Oculta valores monetários
                </div>
              </div>
              {/* Toggle pill */}
              <button
                onClick={() => setTweak('privacidade', !tweaks.privacidade)}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  background: tweaks.privacidade ? 'var(--tang)' : 'var(--line)',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute',
                  top: 3,
                  left: tweaks.privacidade ? 20 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: 'white',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
