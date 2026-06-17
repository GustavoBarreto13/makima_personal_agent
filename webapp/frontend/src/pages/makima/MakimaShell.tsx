/**
 * MakimaShell.tsx — Makima · Hub (Centro de Controle, fatia 023)
 *
 * Shell em TELA CHEIA do Hub da Makima. Diferente dos outros shells do app,
 * ele NÃO usa o `Layout` global (sem sidebar de domínios) — é renderizado
 * direto na rota `/`. O elemento raiz é `<div className="mkA">`, sob o qual
 * todo o CSS do `makima.css` está escopado (zero vazamento para outros shells).
 *
 * Responsabilidades:
 *   - Renderizar o hero editorial + os 8 cards de agente (roster), fiéis ao handoff.
 *   - Buscar os stats reais uma única vez no mount via `makimaApi.getSummary()`.
 *   - Resolver cada stat com fallback gracioso "—" quando ausente/carregando/null.
 *   - Alternar e persistir o tema dark/light em localStorage.
 *   - Navegar para as rotas dos agentes via <Link> (SPA, sem reload de página).
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

import { AGENTS, HERO_COPY, MAKIMA_IMG } from './data'
import { MkIcon } from './icons'
import { makimaApi } from './makimaApi'
import type { HubSummary } from './types'

import './makima.css'

// Chave do localStorage onde o tema do Hub é persistido (REQ-6).
const THEME_KEY = 'makima-hub-theme'

/**
 * Lê o tema salvo no localStorage.
 * Retorna 'light' SÓ se o valor armazenado for exatamente 'light'; em qualquer
 * outro caso (ausente, 'dark', valor inválido, ou falha de acesso) cai no
 * default 'dark'. O try/catch protege contra ambientes onde localStorage lança
 * (modo privado restrito, etc.).
 */
function loadTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** MakimaShell — raiz do Hub em tela cheia. */
export function MakimaShell() {
  // Tema atual (dark por default) — controla o atributo data-theme do .mkA.
  const [theme, setTheme] = useState<'dark' | 'light'>(loadTheme)

  // Stats agregados dos 8 agentes. null = ainda carregando (mount).
  const [summary, setSummary] = useState<HubSummary | null>(null)

  // Busca os stats reais uma única vez ao montar.
  // Em erro total (ex.: rede caiu, 500), usamos objeto vazio para que TODOS os
  // cards caiam no fallback "—" em vez de quebrar a tela.
  useEffect(() => {
    makimaApi.getSummary()
      .then(setSummary)
      .catch(() => setSummary({}))
  }, [])

  // Persiste o tema sempre que ele muda (try/catch — localStorage pode falhar).
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch { /* ignora falha de persistência — não é crítico */ }
  }, [theme])

  // Alterna o tema entre escuro e claro.
  function toggleTheme() {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }

  /**
   * Resolve o texto de um stat de um agente com FALLBACK GRACIOSO (REQ-15).
   *
   * Retorna o valor real (`v` ou `k`) quando ele existe no summary. Em qualquer
   * cenário de ausência — summary ainda carregando (null), agente retornou null
   * no backend, ou o campo não veio — retorna '—'. Como o backend devolve `v` e
   * `k` juntos, quando um falta o outro também falta, então ambos exibem '—'
   * de forma coerente (o label some junto com o valor).
   */
  function statText(agentId: string, which: 'stat' | 'stat2', field: 'v' | 'k'): string {
    // `summary?.[agentId]` é undefined enquanto carrega e null se o agente falhou.
    const agentSummary = summary?.[agentId]
    if (!agentSummary) return '—'
    const value = agentSummary[which]?.[field]
    return value ?? '—'
  }

  return (
    // Wrapper raiz escopado: todo o makima.css vive sob `.mkA`. O data-theme
    // chaveia entre os blocos de token dark/light do CSS.
    <div className="mkA" data-theme={theme}>
      <div className="wrap">

        {/* ── topbar ──────────────────────────────────────────────────────── */}
        <div className="top">
          <span className="b"><span className="dot" />{HERO_COPY.kicker}</span>
          <div className="topr">
            <span>Hub · {AGENTS.length} agentes · 9 domínios</span>
            <button
              className="themetog"
              title="Alternar tema claro / escuro"
              aria-label="Alternar tema"
              onClick={toggleTheme}
            >
              <MkIcon name="moon" size={13} /> Tema
            </button>
          </div>
        </div>

        {/* ── hero ────────────────────────────────────────────────────────── */}
        <div className="hero">
          {/* Coluna de texto editorial */}
          <div>
            <div className="kick">{HERO_COPY.role}</div>
            {/* h1 "Makima" — o "i" em <em> renderiza vermelho itálico via CSS */}
            <h1 className="h1">Mak<em>i</em>ma</h1>
            <div className="role">{HERO_COPY.role} · Sistema de Vida</div>
            <p className="hello">{HERO_COPY.hello}</p>
            <p className="manifesto">{HERO_COPY.manifesto}</p>
            <p className="tagline"><b>{HERO_COPY.lead}</b> {HERO_COPY.tagline}</p>
            <div className="meta">
              <div><div className="n">8</div><div className="l">Agentes</div></div>
              <div><div className="n">9</div><div className="l">Domínios</div></div>
              <div><div className="n">1</div><div className="l">No comando</div></div>
            </div>
          </div>

          {/* Coluna do retrato: halo + anel vermelho tracejado + anel amarelo */}
          <div className="portrait">
            <div className="halo" />
            <div className="ring r2" />
            <div className="ring" />
            <img src={MAKIMA_IMG} alt="Makima" />
          </div>
        </div>

        {/* ── rótulo de seção ─────────────────────────────────────────────── */}
        <div className="seclbl">
          <span className="t">Os domínios</span>
          <span className="rule" />
          <span className="num">/ 09</span>
        </div>

        {/* ── roster (8 cards de agente) ──────────────────────────────────── */}
        <div className="roster">
          {AGENTS.map((a, i) => (
            <div
              className="card"
              key={a.id}
              // Injeta as cores de acento OKLCH do agente como custom properties.
              // O cast é necessário porque CSSProperties não conhece --ac/--ac-t.
              style={{ '--ac': a.accent, '--ac-t': a.accentText } as React.CSSProperties}
            >
              {/* Botão "abrir" ↗ no canto — navega para a rota do agente (SPA) */}
              <Link className="open" to={a.href} title={'Abrir ' + a.name}>
                <MkIcon name="arrowUR" size={14} />
              </Link>

              <div className="body">
                <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="nm">{a.name}</span>
                <span className="rl">{a.role}</span>
                <span className="ds">{a.does}</span>

                {/* Dois stats reais (ou "—" no fallback gracioso) */}
                <div className="stats">
                  <div className="stat">
                    <div className="v"><b>{statText(a.id, 'stat', 'v')}</b></div>
                    <div className="k">{statText(a.id, 'stat', 'k')}</div>
                  </div>
                  <div className="stat">
                    <div className="v">{statText(a.id, 'stat2', 'v')}</div>
                    <div className="k">{statText(a.id, 'stat2', 'k')}</div>
                  </div>
                </div>

                {/* Ações: botão primário sempre; ghost só quando action2 existe */}
                <div className="acts">
                  <Link className="btn primary" to={a.action.href}>
                    <MkIcon name={a.action.icon} size={15} />{a.action.label}
                  </Link>
                  {a.action2 && (
                    <Link className="btn ghost" to={a.action2.href}>
                      <MkIcon name={a.action2.icon} size={15} />{a.action2.label}
                    </Link>
                  )}
                </div>
              </div>

              {/* Retrato flutuante à direita: glow radial + imagem com máscara de fade */}
              <div className="ph">
                <div className="pg" />
                <img src={a.img} alt={a.name} style={{ objectPosition: 'bottom' }} />
              </div>
            </div>
          ))}
        </div>

        {/* ── footer ──────────────────────────────────────────────────────── */}
        <div className="foot">
          <span>Makima · Centro de Controle</span>
          <span className="r">{HERO_COPY.footer}</span>
        </div>

      </div>
    </div>
  )
}
