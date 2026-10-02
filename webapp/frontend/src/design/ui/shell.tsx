// Esqueleto de página do padrão: AppShell = Sidebar + Topbar + conteúdo + (celular) barra inferior e FAB.
// A anatomia é FIXA em todos os agentes (o estilo de arte nunca a muda):
//   Sidebar: marca (retrato + nome + subtítulo) → UM CTA primário → navegação → rodapé
//            (Voltar à Makima + seletor de agentes · tema · preferências).
//   Topbar:  título + subtítulo mono · busca · Ctrl+K · "+" contextual.
//   < 900px: sidebar em rail de 64px · < 640px: gaveta + barra inferior + botão flutuante.
// Layout por container query (ds-frame): funciona embutido na moldura de celular de /design.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ACTIVE_AGENTS, SOON_AGENTS, type AgentId } from '../core/agents'
import { SHORTCUTS } from '../core/hotkeys'
import { useCommandProvider, type Command } from '../headless/commands'
import { undoLast } from '../headless/toast'
import { useContainerBreakpoint } from '../headless/useBreakpoint'
import { useHotkeys } from '../headless/useHotkeys'
import { useDismissable } from '../headless/overlay'
import { usePrefs } from '../headless/usePrefs'
import { useTheme } from '../headless/useTheme'
import { shortcutLabel } from '../headless/web'
import { ToastHost } from './feedback'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { CommandPalette } from './palette'
import { ConfirmHost, OverlayRootContext, Sheet, usePortalRoot } from './overlay'
import { Button, cx, IconButton, SegmentedControl, SettingRow, Toggle } from './primitives'
import { createPortal } from 'react-dom'

// ── agente atual (cor, retrato) ──────────────────────────────────────────────

export interface AgentIdentity {
  id: string
  name: string
  /** Subtítulo mono da marca, ex.: "Tarefas · Agenda". */
  subtitle: string
  portrait?: string | null
  /** Matiz/croma do acento (omitidos = vêm de agents.json via data-agent). */
  hue?: number
  chroma?: number
}

const AgentContext = createContext<AgentIdentity | null>(null)
export const useAgent = (): AgentIdentity | null => useContext(AgentContext)

/** Silhueta usada quando o agente ainda não tem retrato. */
export function PortraitArt({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 140" width={size} height={Math.round(size * 1.17)} aria-hidden="true">
      <defs>
        <linearGradient id="ds-pg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="ds-pa-s1" />
          <stop offset="1" className="ds-pa-s2" />
        </linearGradient>
      </defs>
      <path d="M6 140c0-36 22-54 54-54s54 18 54 54z" fill="url(#ds-pg)" />
      <circle cx="60" cy="47" r="25" fill="url(#ds-pg)" />
      <path d="M33 44c3-24 51-28 56 0-13-9-42-9-56 0z" className="ds-pa-hair" />
    </svg>
  )
}

/** Aplica a cor de identidade de um agente a uma árvore: <AgentScope agent="nami">. */
export function AgentScope({ agent, hue, chroma, className, children }: { agent?: AgentId; hue?: number; chroma?: number; className?: string; children: ReactNode }) {
  const style = { ...(hue !== undefined ? { '--ds-accent-h': hue } : {}), ...(chroma !== undefined ? { '--ds-accent-c': chroma } : {}) } as CSSProperties
  return <div className={className} data-agent={agent ?? 'custom'} style={style}>{children}</div>
}

// ── tema (botão) ─────────────────────────────────────────────────────────────

export function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  return <IconButton icon={resolved === 'dark' ? 'moon' : 'sun'} label="Alternar tema claro e escuro" onClick={toggle} />
}

// ── Voltar à Makima + seletor de agentes ─────────────────────────────────────

export function BackToMakima({ onGo, href = '/' }: { onGo?: (route: string) => void; href?: string }) {
  return (
    <a
      className="ds-back"
      href={href}
      title="Voltar à Makima"
      onClick={(e) => { if (onGo) { e.preventDefault(); onGo(href) } }}
    >
      <span className="ds-mini-p" aria-hidden="true">M</span>
      <span className="ds-bt"><b>Voltar à Makima</b><span>Hub central</span></span>
      <Icon name="back" size={14} className="ds-arr" />
    </a>
  )
}

export interface AgentSwitcherProps {
  /** Agente atual: aparece marcado "Aqui". */
  currentId: string
  /** Agentes extras (ex.: o agente fictício da página /design). */
  extra?: SwitcherAgent[]
  onGo: (route: string, agent: { id: string; name: string }) => void
}

/** Agente exibido no seletor. Os reais vêm de agents.json; o agente de exemplo da /design entra por `extra`. */
export interface SwitcherAgent {
  id: string
  name: string
  domain: string
  hue: number
  route?: string
}

type SwitcherRow = SwitcherAgent

export function AgentSwitcher({ currentId, extra = [], onGo }: AgentSwitcherProps) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const root = usePortalRoot()
  const close = useCallback(() => { setOpen(false); btn.current?.focus() }, [])
  useDismissable(pop, close, open, btn)
  // Ao abrir, o foco vai para o primeiro agente que não é o atual.
  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLButtonElement>('button.ds-ag:not([aria-current]):not([disabled])')?.focus()
  }, [open])

  const rows: SwitcherRow[] = useMemo(() => [...extra, ...ACTIVE_AGENTS], [extra])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(pop.current?.querySelectorAll<HTMLButtonElement>('button.ds-ag:not([disabled])') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="ds-agbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Ir para outro agente"
        title="Ir para outro agente"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="apps" size={18} />
      </button>
      {open && root && createPortal(
        <>
          <div className="ds-agscrim" />
          <div ref={pop} className="ds-agsw" role="menu" aria-label="Ir para outro agente" onKeyDown={onKey}>
            <div className="ds-agh ds-mono">Ir para outro agente</div>
            {rows.map((a) => (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                className="ds-ag"
                aria-current={a.id === currentId ? 'true' : undefined}
                style={{ '--ds-ah': a.hue } as CSSProperties}
                onClick={() => { setOpen(false); onGo(a.route ?? `/${a.id}`, a) }}
              >
                <span className="ds-av" aria-hidden="true">{a.name[0]}</span>
                <span className="ds-tx"><b>{a.name}</b><small>{a.domain}</small></span>
                {a.id === currentId && <span className="ds-here">Aqui</span>}
              </button>
            ))}
            <div className="ds-agsep" />
            <div className="ds-agh ds-mono">Em breve</div>
            {SOON_AGENTS.map((a) => (
              <button key={a.id} type="button" role="menuitem" className="ds-ag" disabled style={{ '--ds-ah': a.hue } as CSSProperties}>
                <span className="ds-av" aria-hidden="true">{a.name[0]}</span>
                <span className="ds-tx"><b>{a.name}</b><small>{a.domain}</small></span>
              </button>
            ))}
          </div>
        </>,
        root,
      )}
    </>
  )
}

// ── Preferências ─────────────────────────────────────────────────────────────

export interface Appearance {
  density: 'comfy' | 'compact'
  /** true = sem animações (além do que o sistema já pede). */
  reduceMotion: boolean
}

export interface PreferencesPanelProps {
  onClose: () => void
  appearance: Appearance
  onAppearance: (patch: Partial<Appearance>) => void
  /** Título e conteúdo da seção do agente (toggles/segmentados declarados pelo domínio). */
  agentName: string
  agentSection?: ReactNode
  /** Seletor de estilo de arte (só aparece se informado; o estilo é escolhido por página). */
  art?: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }
}

export function PreferencesPanel({ onClose, appearance, onAppearance, agentName, agentSection, art }: PreferencesPanelProps) {
  const { preference, setPreference } = useTheme()
  return (
    <Sheet title="Preferências" onClose={onClose}>
      <div className="ds-fgrp">
        <span className="ds-mono">Aparência</span>
        <SettingRow title="Tema">
          <SegmentedControl label="Tema" value={preference} onChange={setPreference} options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }, { value: 'system', label: 'Sistema' }]} />
        </SettingRow>
        <SettingRow title="Densidade">
          <SegmentedControl label="Densidade" value={appearance.density} onChange={(density) => onAppearance({ density })} options={[{ value: 'comfy', label: 'Confortável' }, { value: 'compact', label: 'Compacta' }]} />
        </SettingRow>
        {art && (
          <SettingRow title="Estilo de arte" help="Muda só o visual. A estrutura é a mesma.">
            <SegmentedControl label="Estilo de arte" value={art.value} onChange={art.onChange} options={art.options} />
          </SettingRow>
        )}
        <SettingRow title="Reduzir animações">
          <Toggle label="Reduzir animações" checked={appearance.reduceMotion} onChange={(reduceMotion) => onAppearance({ reduceMotion })} />
        </SettingRow>
      </div>
      {agentSection && (
        <div className="ds-fgrp">
          <span className="ds-mono">{agentName}</span>
          {agentSection}
        </div>
      )}
      <div className="ds-fgrp">
        <span className="ds-mono">Atalhos</span>
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="ds-setrow">
            <span>{s.label}</span>
            <kbd className="ds-kbd">{s.keys.includes(' ') ? s.keys.split(' ').map((k) => k.toUpperCase()).join(' depois ') : shortcutLabel(s.keys)}</kbd>
          </div>
        ))}
        <p className="ds-hint">Todo atalho também existe como botão ou comando.</p>
      </div>
    </Sheet>
  )
}

// ── AppShell ─────────────────────────────────────────────────────────────────

export interface NavEntry {
  id: string
  label: string
  icon: IconName
  count?: number | string
  /** Letra do atalho "g + letra". */
  key?: string
}

export interface NavGroup {
  label?: string
  items: NavEntry[]
}

export interface AppShellProps {
  agent: AgentIdentity
  nav: NavGroup[]
  active: string
  onNavigate: (id: string) => void
  /** UM CTA primário por contexto. */
  primary: { label: string; icon?: IconName; onClick: () => void; /** tecla, ex.: 'n' */ key?: string }
  title: string
  subtitle?: string
  search?: { placeholder?: string; onSubmit: (q: string) => void }
  /** Navegação entre agentes e Voltar à Makima (SPA: passe o navigate do router). */
  onGoAgent: (route: string, agent?: { id: string; name: string }) => void
  /** Conteúdo da seção do agente no painel de Preferências. */
  preferences?: ReactNode
  /** Comandos extras da paleta (Ctrl+K) deste shell. */
  commands?: Command[]
  /** Seletor de estilo de arte (demonstração). */
  art?: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }
  /** Valor de data-ds-art no .ds-app. */
  artValue?: string | null
  /** Ocupa o pai em vez da janela (página /design, moldura de celular). */
  embedded?: boolean
  /** Agentes extras no seletor (agente fictício). */
  extraAgents?: AgentSwitcherProps['extra']
  /** Ids do menu na barra inferior do celular (até 3). Padrão: os 3 primeiros. */
  mobileTabs?: string[]
  /** Área extra à direita da topbar. */
  topbarExtra?: ReactNode
  children: ReactNode
}

export function AppShell({
  agent, nav, active, onNavigate, primary, title, subtitle, search, onGoAgent, preferences, commands = [], art, artValue,
  embedded, extraAgents, mobileTabs, topbarExtra, children,
}: AppShellProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [appEl, setAppEl] = useState<HTMLDivElement | null>(null)
  const bp = useContainerBreakpoint(frameRef)
  const isPhone = bp === 'sm'
  const [drawer, setDrawer] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [appearance, setAppearance] = usePrefs<Appearance>('appearance', { density: 'comfy', reduceMotion: false })
  const searchRef = useRef<HTMLInputElement>(null)
  const { toggle: toggleTheme } = useTheme()

  const entries = useMemo(() => nav.flatMap((g) => g.items), [nav])
  const go = useCallback((id: string) => { setDrawer(false); onNavigate(id) }, [onNavigate])

  // Atalhos: Ctrl+K, N (ação primária), / (busca), ? (preferências), g + letra (navegar). Esc fecha a gaveta.
  useHotkeys([
    { keys: 'mod+k', global: true, handler: (e) => { e.preventDefault(); setPaletteOpen(true) } },
    { keys: primary.key ?? 'n', handler: (e) => { e.preventDefault(); primary.onClick() } },
    { keys: '/', handler: (e) => { e.preventDefault(); searchRef.current?.focus() } },
    { keys: '?', handler: () => setPrefsOpen(true) },
    // Ctrl+Z: a mesma ação do "Desfazer" do aviso (em campos de texto vale o desfazer nativo do navegador).
    { keys: 'mod+z', handler: (e) => { if (undoLast()) e.preventDefault() } },
    { keys: 'esc', global: true, handler: () => setDrawer(false) },
    ...entries.filter((n) => n.key).map((n) => ({ keys: `g ${n.key}`, handler: () => go(n.id) })),
  ])

  const shellCommands: Command[] = useMemo(() => [
    { id: 'primary', label: primary.label, icon: primary.icon ?? 'add', shortcut: primary.key ?? 'n', run: primary.onClick },
    ...entries.map((n) => ({ id: `nav.${n.id}`, label: `Ir para ${n.label}`, icon: n.icon, shortcut: n.key ? `g ${n.key}` : undefined, run: () => go(n.id) })),
    { id: 'theme', label: 'Alternar tema claro e escuro', icon: 'sun', keywords: 'escuro claro dark', run: toggleTheme },
    { id: 'prefs', label: 'Abrir preferências', icon: 'prefs', shortcut: '?', run: () => setPrefsOpen(true) },
    { id: 'makima', label: 'Voltar à Makima', icon: 'back', run: () => onGoAgent('/', { id: 'makima', name: 'Makima' }) },
    ...ACTIVE_AGENTS.map((a) => ({ id: `agent.${a.id}`, label: `Ir para ${a.name}`, icon: 'apps' as IconName, group: 'Agentes', keywords: a.domain, run: () => onGoAgent(a.route, a) })),
    ...commands,
  ], [primary, entries, go, onGoAgent, commands, toggleTheme])
  useCommandProvider(useMemo(() => ({ id: `shell:${agent.id}`, commands: shellCommands }), [agent.id, shellCommands]))

  const tabs = (mobileTabs ?? entries.slice(0, 3).map((e) => e.id)).map((id) => entries.find((e) => e.id === id)).filter((e): e is NavEntry => !!e)
  const accentStyle = { ...(agent.hue !== undefined ? { '--ds-accent-h': agent.hue } : {}), ...(agent.chroma !== undefined ? { '--ds-accent-c': agent.chroma } : {}) } as CSSProperties
  const sideHidden = isPhone && !drawer

  return (
    <AgentContext.Provider value={agent}>
      <div ref={frameRef} className={cx('ds-frame', embedded && 'ds-embedded')} data-agent={agent.id} data-ds-density={appearance.density} style={accentStyle}>
        <div
          ref={setAppEl}
          className={cx('ds-app', drawer && 'ds-drawer-open')}
          data-ds-art={artValue && artValue !== 'default' ? artValue : undefined}
          data-ds-motion={appearance.reduceMotion ? 'off' : undefined}
        >
          <OverlayRootContext.Provider value={appEl}>
            <a className="ds-skip" href="#ds-content">Pular para o conteúdo</a>

            <aside className="ds-side" id="ds-side" aria-label={`Menu do ${agent.name}`} aria-hidden={sideHidden || undefined} inert={sideHidden}>
              <div className="ds-brand">
                <div className="ds-portrait">
                  {agent.portrait ? <img src={agent.portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PortraitArt />}
                </div>
                <div className="ds-txt"><b>{agent.name}</b><span className="ds-mono">{agent.subtitle}</span></div>
              </div>
              <div className="ds-side-cta">
                <Button variant="primary" block icon={primary.icon ?? 'add'} kbd={shortcutLabel(primary.key ?? 'n')} title={`${primary.label} (${shortcutLabel(primary.key ?? 'n')})`} onClick={primary.onClick}>
                  {primary.label}
                </Button>
              </div>
              <nav className="ds-nav" aria-label="Seções">
                {nav.map((g, gi) => (
                  <div key={gi} style={{ display: 'contents' }}>
                    {g.label && <span className="ds-nav-label ds-mono">{g.label}</span>}
                    {g.items.map((n) => (
                      <button key={n.id} type="button" className="ds-nav-item" aria-current={n.id === active ? 'page' : undefined} title={n.label} onClick={() => go(n.id)}>
                        <Icon name={n.icon} size={18} />
                        <span className="ds-lbl">{n.label}</span>
                        {n.count !== undefined && <span className="ds-cnt ds-lbl">{n.count}</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
              <div className="ds-side-foot">
                <div className="ds-back-row">
                  <BackToMakima onGo={(r) => onGoAgent(r, { id: 'makima', name: 'Makima' })} />
                  <AgentSwitcher currentId={agent.id} extra={extraAgents} onGo={onGoAgent} />
                </div>
                <div className="ds-foot-row">
                  <ThemeToggle />
                  <IconButton icon="prefs" label="Preferências" onClick={() => setPrefsOpen(true)} />
                </div>
              </div>
            </aside>
            {isPhone && drawer && <div className="ds-scrim-d" onClick={() => setDrawer(false)} />}

            <div className="ds-main">
              <header className="ds-topbar">
                <IconButton className="ds-menu-btn" icon="menu" label="Abrir menu" size={20} onClick={() => setDrawer(true)} />
                <div className="ds-tt">
                  <h1>{title}</h1>
                  {subtitle && <span className="ds-mono">{subtitle}</span>}
                </div>
                <div className="ds-tb-right">
                  {search && (
                    <label className="ds-search">
                      <Icon name="search" size={16} />
                      <input
                        ref={searchRef}
                        type="search"
                        placeholder={search.placeholder ?? 'Buscar…'}
                        aria-label={search.placeholder ?? 'Buscar'}
                        autoComplete="off"
                        onKeyDown={(e) => { if (e.key === 'Enter') { search.onSubmit(e.currentTarget.value); e.currentTarget.value = '' } }}
                      />
                      <kbd className="ds-kbd">/</kbd>
                    </label>
                  )}
                  {topbarExtra}
                  <Button size="sm" className="ds-cmdk" aria-label="Abrir a paleta de comandos" title="Busca e comandos" onClick={() => setPaletteOpen(true)}>
                    <kbd className="ds-kbd">{shortcutLabel('mod+k')}</kbd>
                  </Button>
                  <IconButton primary icon="add" label={primary.label} onClick={primary.onClick} />
                </div>
              </header>
              <main className="ds-content" id="ds-content" tabIndex={-1}>{children}</main>
              <nav className="ds-bottomnav" aria-label="Navegação principal">
                {tabs.map((n) => (
                  <button key={n.id} type="button" aria-current={n.id === active ? 'page' : undefined} onClick={() => go(n.id)}>
                    <Icon name={n.icon} size={22} />{n.label}
                  </button>
                ))}
                <button type="button" onClick={() => setDrawer(true)}><Icon name="menu" size={22} />Mais</button>
              </nav>
              <button type="button" className="ds-fab" aria-label={primary.label} onClick={primary.onClick}><Icon name="add" size={26} /></button>
            </div>

            {prefsOpen && (
              <PreferencesPanel onClose={() => setPrefsOpen(false)} appearance={appearance} onAppearance={setAppearance} agentName={agent.name} agentSection={preferences} art={art} />
            )}
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            <ToastHost />
            <ConfirmHost />
          </OverlayRootContext.Provider>
        </div>
      </div>
    </AgentContext.Provider>
  )
}

// ── Página e seção ───────────────────────────────────────────────────────────

export function Page({ wide, children, className }: { wide?: boolean; children: ReactNode; className?: string }) {
  return <div className={cx('ds-page', wide && 'ds-wide', className)}>{children}</div>
}

export function SectionHeader({ title, id, action, mono }: { title: string; id?: string; action?: ReactNode; mono?: ReactNode }) {
  return (
    <div className="ds-sec-h">
      <h2 id={id}>{title}</h2>
      {action ?? (mono ? <span className="ds-mono">{mono}</span> : null)}
    </div>
  )
}

// ── Hero (padrão da Marin) ───────────────────────────────────────────────────

export interface HeroProps {
  eyebrow: string
  eyebrowIcon?: IconName
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  /** Cor do hero (ex.: tirada da capa). Padrão: acento do agente. */
  tone?: { hue: number }
  /** Retrato: URL, `null` (sem retrato) ou omitido (usa o do agente do AppShell). */
  portrait?: string | null
  texture?: 'sparkle' | 'none'
  /** Versão compacta (topo das estatísticas). */
  compact?: boolean
}

export function Hero({ eyebrow, eyebrowIcon = 'sparkles', title, meta, actions, tone, portrait, texture = 'sparkle', compact }: HeroProps) {
  const agent = useAgent()
  const src = portrait === undefined ? agent?.portrait ?? null : portrait
  const showPortrait = portrait !== null
  const style = (tone ? { '--ds-accent-h': tone.hue, ...(compact ? { minHeight: 190 } : {}) } : compact ? { minHeight: 190 } : undefined) as CSSProperties | undefined
  return (
    <section className="ds-hero" style={style} aria-label={eyebrow}>
      {texture === 'sparkle' && <div className="ds-spark" />}
      <div className="ds-hero-in" style={compact ? { padding: '28px 32px', maxWidth: '70%' } : undefined}>
        <p className="ds-eyebrow"><Icon name={eyebrowIcon} size={14} /> {eyebrow}</p>
        <h2>{title}</h2>
        {meta && <div className="ds-meta">{meta}</div>}
        {actions && <div className="ds-inline" style={{ marginTop: 6 }}>{actions}</div>}
      </div>
      {showPortrait && (
        <div className="ds-hero-p" style={compact ? { width: 170 } : undefined}>
          <div className="ds-halo" />
          {src ? <img src={src} alt="" className="ds-hero-img" /> : <PortraitArt size={230} />}
        </div>
      )}
    </section>
  )
}
