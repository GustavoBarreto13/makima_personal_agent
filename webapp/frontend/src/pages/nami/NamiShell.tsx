// Shell principal da seção Nami · Finanças.
// Gerencia: navegação interna por hash, seletor de mês, estado global de stats,
// atalhos de teclado, tweaks visuais e toast de feedback.

import { useState, useEffect, useRef, useCallback } from 'react'
import './nami.css'

import { namiApi } from './namiApi'
import type { StatsResponse, Account, Card, Subscription, Tweaks } from './types'
import { Toast } from './Toast'
import { TweaksPanel } from './TweaksPanel'

// ── Importações das telas (carregadas sob demanda pelo bundler) ───────────────
import { Dashboard }     from './screens/Dashboard'
import { Transactions }  from './screens/Transactions'
import { Accounts }      from './screens/Accounts'
import { Cards }         from './screens/Cards'
import { Budgets }       from './screens/Budgets'
import { Subscriptions } from './screens/Subscriptions'
import { Loans }         from './screens/Loans'
import { Financings }    from './screens/Financings'
import { AddModal }      from './modals/AddModal'

// ── Tipos internos ────────────────────────────────────────────────────────────

/** Identificadores das views internas da seção Nami. */
type NamiView =
  | 'dashboard' | 'transacoes' | 'contas' | 'cartoes'
  | 'orcamentos' | 'assinaturas' | 'emprestimos' | 'financiamentos'

/** Estrutura de um item de navegação da sidebar. */
interface NavItem {
  id: NamiView
  label: string
  icon: string   // codepoint de emoji ou SVG path key
  badge?: string | null
}

// ── Mapeamento hash → view (deep-link FR-006) ─────────────────────────────────
const HASH_TO_VIEW: Record<string, NamiView> = {
  '#dashboard':     'dashboard',
  '#transacoes':    'transacoes',
  '#contas':        'contas',
  '#cartoes':       'cartoes',
  '#orcamentos':    'orcamentos',
  '#assinaturas':   'assinaturas',
  '#emprestimos':   'emprestimos',
  '#financiamentos':'financiamentos',
}

const VIEW_TO_HASH: Record<NamiView, string> = {
  dashboard:      '#dashboard',
  transacoes:     '#transacoes',
  contas:         '#contas',
  cartoes:        '#cartoes',
  orcamentos:     '#orcamentos',
  assinaturas:    '#assinaturas',
  emprestimos:    '#emprestimos',
  financiamentos: '#financiamentos',
}

const VIEW_TITLES: Record<NamiView, string> = {
  dashboard:      'Dashboard',
  transacoes:     'Transações',
  contas:         'Contas',
  cartoes:        'Cartões',
  orcamentos:     'Orçamentos',
  assinaturas:    'Assinaturas',
  emprestimos:    'Empréstimos',
  financiamentos: 'Financiamentos',
}

// Views que exibem o seletor de mês na topbar (FR-004)
const VIEWS_WITH_MONTH: Set<NamiView> = new Set([
  'dashboard', 'transacoes', 'contas', 'cartoes', 'orcamentos',
])

// ── Tweaks padrão e persistência ──────────────────────────────────────────────

const TWEAKS_DEFAULTS: Tweaks = {
  tema: 'Claro',
  acento: 'Tangerina',
  densidade: 'Confortável',
  privacidade: false,
}

const ACENTO_ATTR: Record<Tweaks['acento'], string> = {
  'Tangerina': 'tangerina',
  'Azul-maré': 'azul-mare',
  'Coral':     'coral',
  'Ouro':      'ouro',
}

function loadTweaks(): Tweaks {
  try {
    return {
      tema:       (localStorage.getItem('nami:tema') as Tweaks['tema'])       ?? TWEAKS_DEFAULTS.tema,
      acento:     (localStorage.getItem('nami:acento') as Tweaks['acento'])   ?? TWEAKS_DEFAULTS.acento,
      densidade:  (localStorage.getItem('nami:densidade') as Tweaks['densidade']) ?? TWEAKS_DEFAULTS.densidade,
      privacidade: localStorage.getItem('nami:privacidade') === 'true',
    }
  } catch {
    return { ...TWEAKS_DEFAULTS }
  }
}

/** Formata valor em reais compacto para badges da sidebar (ex.: 12.500 → "12,5k"). */
function formatCompact(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')}k`
  return v.toFixed(2).replace('.', ',')
}

/** Retorna o mês atual no formato YYYY-MM. */
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Navega o mês ±1 a partir de um YYYY-MM. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Formata YYYY-MM para exibição ("Junho 2026"). */
function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${names[m - 1]} ${y}`
}

// ── Componente Shell ──────────────────────────────────────────────────────────

/** Shell principal da seção Nami. Montado na rota /nami/*. */
export function NamiShell() {
  // ── Navegação interna ──────────────────────────────────────────────────────
  const [view, setView] = useState<NamiView>(() => {
    // Lê o hash da URL para suportar deep-link (FR-006)
    const hash = window.location.hash.toLowerCase()
    return HASH_TO_VIEW[hash] ?? 'dashboard'
  })

  // ── Mês selecionado ────────────────────────────────────────────────────────
  const [month, setMonth] = useState(currentMonth)

  // ── Busca ──────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')

  // ── Modal de nova transação ────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState('')

  // ── Tweaks ─────────────────────────────────────────────────────────────────
  const [tweaks, setTweaksState] = useState<Tweaks>(loadTweaks)

  // ── Dados globais carregados pelo shell ────────────────────────────────────
  const [stats, setStats]               = useState<StatsResponse | null>(null)
  const [accounts, setAccounts]         = useState<Account[]>([])
  const [cards, setCards]               = useState<Card[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  // Referência ao elemento raiz — usado para aplicar data-theme e data-privacy
  const rootRef = useRef<HTMLDivElement>(null)

  // ── Carregamento de stats e dados globais ──────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const s = await namiApi.getStats(month)
      setStats(s)
    } catch {
      // Dados indisponíveis — mantém o estado anterior sem quebrar a tela
    }
  }, [month])

  const loadGlobal = useCallback(async () => {
    try {
      const [accs, cds, subs] = await Promise.all([
        namiApi.getAccounts(),
        namiApi.getCards(),
        namiApi.getSubscriptions(),
      ])
      setAccounts(accs.accounts ?? [])
      setCards(cds.cards ?? [])
      setSubscriptions(subs.subscriptions ?? [])
    } catch {
      // Continua com arrays vazios em caso de erro de rede
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    loadGlobal()
  }, [loadGlobal])

  // ── Efeito de tema ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    el.setAttribute('data-theme', tweaks.tema === 'Escuro' ? 'dark' : 'light')
    el.setAttribute('data-accent', ACENTO_ATTR[tweaks.acento])
    el.setAttribute('data-privacy', tweaks.privacidade ? 'on' : '')
    el.setAttribute('data-density', tweaks.densidade === 'Compacto' ? 'compacto' : 'confortavel')
  }, [tweaks])

  // ── Toast auto-some após 2600 ms ──────────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(id)
  }, [toast])

  // ── Atalho global A / + para abrir AddModal ───────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      // Ignora quando o foco está em campo de texto
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.key === 'a' || e.key === 'A' || e.key === '+') {
        e.preventDefault()
        setAddOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Navegação interna com deep-link hash ──────────────────────────────────
  const navigate = useCallback((v: NamiView) => {
    setView(v)
    history.replaceState(null, '', `/nami${VIEW_TO_HASH[v]}`)
    setSearchQuery('')
  }, [])

  // ── Callback após transação salva — recarrega stats ───────────────────────
  const handleTransactionSaved = useCallback(async (msg = 'Lançado ✓') => {
    setToast(msg)
    await loadStats()
  }, [loadStats])

  // ── Atualização de tweak com persistência no localStorage ─────────────────
  function setTweak<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
    setTweaksState(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(`nami:${key}`, String(value))
      return next
    })
  }

  // ── Badges da sidebar ──────────────────────────────────────────────────────
  // Patrimônio total (soma dos saldos de todas as contas)
  const patrimonioTotal = accounts.reduce((s, a) => s + (a.balance_inicial ?? 0), 0)
  // Fatura total dos cartões no mês (aproximação via stats)
  const faturaTotal = stats?.expense ?? 0
  // Total mensal de assinaturas
  const subsTotal = subscriptions
    .filter(s => s.status === 'ativa' && s.ciclo === 'mensal')
    .reduce((s, sub) => s + sub.valor, 0)

  // ── Itens de navegação da sidebar ─────────────────────────────────────────
  const navGroups: { label: string; items: NavItem[] }[] = [
    {
      label: 'Visão geral',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
      ],
    },
    {
      label: 'Dia a dia',
      items: [
        { id: 'transacoes',  label: 'Transações', icon: '↕' },
        { id: 'contas',      label: 'Contas',     icon: '🏦', badge: patrimonioTotal > 0 ? formatCompact(patrimonioTotal) : null },
        { id: 'cartoes',     label: 'Cartões',    icon: '💳', badge: faturaTotal > 0 ? formatCompact(faturaTotal) : null },
      ],
    },
    {
      label: 'Planejamento',
      items: [
        { id: 'orcamentos',    label: 'Orçamentos',    icon: '◎' },
        { id: 'assinaturas',   label: 'Assinaturas',   icon: '↻', badge: subsTotal > 0 ? formatCompact(subsTotal) : null },
        { id: 'emprestimos',   label: 'Empréstimos',   icon: '🤝' },
        { id: 'financiamentos',label: 'Financiamentos',icon: '🏗' },
      ],
    },
  ]

  // ── Valores da SummBar ─────────────────────────────────────────────────────
  const income  = stats?.income  ?? 0
  const expense = stats?.expense ?? 0
  const net     = stats?.net     ?? 0
  const flowPct = income > 0 ? Math.min((expense / income) * 100, 100) : 0

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)

  // ── Renderização da view ativa ────────────────────────────────────────────
  function renderView() {
    const commonProps = {
      month,
      stats,
      accounts,
      cards,
      subscriptions,
      onTransactionSaved: handleTransactionSaved,
      onToast: setToast,
      onNavigate: navigate,
      onOpenAddModal: () => setAddOpen(true),
    }

    switch (view) {
      case 'dashboard':
        return <Dashboard {...commonProps} searchQuery={searchQuery} />
      case 'transacoes':
        return <Transactions {...commonProps} searchQuery={searchQuery} />
      case 'contas':
        return <Accounts {...commonProps} onAccountsChanged={loadGlobal} />
      case 'cartoes':
        return <Cards {...commonProps} onCardsChanged={loadGlobal} />
      case 'orcamentos':
        return <Budgets {...commonProps} />
      case 'assinaturas':
        return <Subscriptions {...commonProps} onSubscriptionsChanged={loadGlobal} />
      case 'emprestimos':
        return <Loans onToast={setToast} />
      case 'financiamentos':
        return <Financings onToast={setToast} stats={stats} />
      default:
        return <div className="nami-empty"><span className="nami-empty-text">View não encontrada.</span></div>
    }
  }

  return (
    // Elemento raiz — data-theme, data-accent, data-privacy, data-density aplicados pelo efeito
    <div className="nami-app" ref={rootRef}>

      {/* ── Sidebar ── */}
      <aside className="nami-side">
        <div className="nami-brand">
          <div className="nami-brand-mark">
            <img src="/nami.jpg" alt="Nami" />
          </div>
          <div>
            <div className="nami-brand-name">Nami</div>
            <div className="nami-brand-role">Finanças</div>
          </div>
        </div>

        {/* Botão de ação principal */}
        <button className="nami-side-btn" onClick={() => setAddOpen(true)}>
          <span>+</span>
          <span className="side-log-label">Nova transação</span>
          <span className="nami-side-btn-shortcut">A</span>
        </button>

        {/* Grupos de navegação */}
        {navGroups.map(group => (
          <div key={group.label} className="nami-nav-group">
            <div className="nami-nav-group-label">{group.label}</div>
            {group.items.map(item => (
              <button
                key={item.id}
                className={'nami-nav-item' + (view === item.id ? ' active' : '')}
                onClick={() => navigate(item.id)}
              >
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.badge != null && (
                  <span className="nami-nav-badge nav-badge">{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}

        {/* Rodapé: volta à Makima */}
        <div className="nami-side-foot">
          <a className="nami-back-link" href="/">
            <span className="nami-back-dot" />
            <span className="side-foot-label">Voltar à Makima</span>
          </a>
        </div>
      </aside>

      {/* ── Topbar ── */}
      <header className="nami-topbar">
        <span className="nami-topbar-title">{VIEW_TITLES[view]}</span>

        {/* Seletor de mês — só nas views pertinentes (FR-004) */}
        {VIEWS_WITH_MONTH.has(view) && (
          <div className="nami-month-selector">
            <button className="nami-month-btn" onClick={() => setMonth(m => shiftMonth(m, -1))}>‹</button>
            <span className="nami-month-label">{formatMonthLabel(month)}</span>
            <button className="nami-month-btn" onClick={() => setMonth(m => shiftMonth(m, +1))}>›</button>
          </div>
        )}

        {/* Campo de busca — digitar 2+ chars navega para transações */}
        <div className="nami-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={searchQuery}
            placeholder="Buscar…"
            onChange={e => {
              setSearchQuery(e.target.value)
              if (e.target.value.length >= 2 && view !== 'transacoes') navigate('transacoes')
            }}
          />
        </div>
      </header>

      {/* ── Área de conteúdo ── */}
      <main className="nami-content">
        {renderView()}
      </main>

      {/* ── SummBar ── */}
      <footer className="nami-summbar">
        <div className="nami-summbar-item">
          <span className="nami-summbar-label">Entrou</span>
          <span className="nami-summbar-value nami-summbar-in amount">R$ {fmt(income)}</span>
        </div>
        <div className="nami-summbar-item">
          <span className="nami-summbar-label">Saiu</span>
          <span className="nami-summbar-value nami-summbar-out amount">R$ {fmt(expense)}</span>
        </div>
        <div className="nami-summbar-divider" />
        <div className="nami-summbar-item">
          <span className="nami-summbar-label">Saldo do mês</span>
          <span className={`nami-summbar-value amount ${net >= 0 ? 'nami-summbar-in' : 'nami-summbar-out'}`}>
            R$ {fmt(net)}
          </span>
        </div>
        <div className="nami-flow-bar">
          <div className="nami-flow-bar-fill" style={{ width: `${flowPct}%` }} />
        </div>
        <button className="nami-summbar-new-btn" onClick={() => setAddOpen(true)}>
          + Nova transação
        </button>
      </footer>

      {/* ── Modal de nova transação ── */}
      <AddModal
        open={addOpen}
        accounts={accounts}
        cards={cards}
        onClose={() => setAddOpen(false)}
        onSaved={handleTransactionSaved}
      />

      {/* ── Toast de feedback ── */}
      <Toast message={toast} />

      {/* ── Painel de tweaks ── */}
      <TweaksPanel tweaks={tweaks} setTweak={setTweak} />
    </div>
  )
}
