// Shell principal da seção Nami · Finanças.
// Gerencia: navegação interna por hash, seletor de mês, estado global de stats,
// atalhos de teclado, tweaks visuais e toast de feedback.
//
// ESTRUTURA DOM: portada do handoff de referência (docs/.../nami/app.jsx + styles.css).
// A LÓGICA DE DADOS é preservada integralmente; só a marcação HTML foi atualizada.

import { useState, useEffect, useRef, useCallback } from 'react'
import './nami.css'

import { namiApi } from './namiApi'
import type { StatsResponse, Account, Card, Subscription, Tweaks } from './types'
import { Toast } from './Toast'
import { TweaksPanel } from './TweaksPanel'
import { Icon } from './icons'
import { fmtMoney } from './ui'

// ── Importações das telas ─────────────────────────────────────────────────────
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

// ── Mapeamento hash → view (deep-link) ───────────────────────────────────────
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

// Views que exibem o seletor de mês na topbar
const VIEWS_WITH_MONTH: Set<NamiView> = new Set([
  'dashboard', 'transacoes', 'contas', 'cartoes', 'orcamentos',
])

// ── Ícones de cada view na sidebar ───────────────────────────────────────────
const VIEW_ICONS: Record<NamiView, string> = {
  dashboard:      'dashboard',
  transacoes:     'receipt',
  contas:         'bank',
  cartoes:        'card',
  orcamentos:     'target',
  assinaturas:    'repeat',
  emprestimos:    'handshake',
  financiamentos: 'building',
}

// ── Tweaks padrão e persistência ──────────────────────────────────────────────

const TWEAKS_DEFAULTS: Tweaks = {
  tema: 'Claro',
  acento: 'Tangerina',
  densidade: 'Confortável',
  privacidade: false,
}

function loadTweaks(): Tweaks {
  // Lê as preferências do localStorage; se não existir, usa os padrões
  try {
    return {
      tema:       (localStorage.getItem('nami:tema') as Tweaks['tema'])           ?? TWEAKS_DEFAULTS.tema,
      acento:     (localStorage.getItem('nami:acento') as Tweaks['acento'])       ?? TWEAKS_DEFAULTS.acento,
      densidade:  (localStorage.getItem('nami:densidade') as Tweaks['densidade']) ?? TWEAKS_DEFAULTS.densidade,
      privacidade: localStorage.getItem('nami:privacidade') === 'true',
    }
  } catch {
    return { ...TWEAKS_DEFAULTS }
  }
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

/** Formata YYYY-MM para exibição abreviada ("Jun 2026"). */
function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[m - 1]} ${y}`
}

/** Formata valor em reais compacto para badges da sidebar (ex.: 12.500 → "12,5k"). */
function formatCompact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1).replace('.', ',')}k`
  return v.toFixed(0)
}

// ── Componente Shell ──────────────────────────────────────────────────────────

/** Shell principal da seção Nami. Montado na rota /nami/*. */
export function NamiShell() {
  // ── Navegação interna ──────────────────────────────────────────────────────
  const [view, setView] = useState<NamiView>(() => {
    // Lê o hash da URL para suportar deep-link
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
      // Toast de erro em vez de engolir silenciosamente — evita Dashboard preso em "Carregando…"
      setToast('Erro ao carregar dados do mês')
    }
  }, [month])

  const loadGlobal = useCallback(async () => {
    // allSettled: mesmo que um endpoint retorne 500, os demais ainda preenchem seus estados.
    // Isso evita que um erro em /cards ou /subscriptions apague silenciosamente a lista de contas.
    const [accsR, cdsR, subsR] = await Promise.allSettled([
      namiApi.getAccounts(),
      namiApi.getCards(),
      namiApi.getSubscriptions(),
    ])

    // Seta cada estado de forma independente — só atualiza se o pedido teve sucesso
    if (accsR.status === 'fulfilled') setAccounts(accsR.value.accounts ?? [])
    if (cdsR.status  === 'fulfilled') setCards(cdsR.value.cards ?? [])
    if (subsR.status === 'fulfilled') setSubscriptions(subsR.value.subscriptions ?? [])

    // Avisa o usuário se algum endpoint falhou (sem engolir o erro em silêncio)
    if ([accsR, cdsR, subsR].some(r => r.status === 'rejected')) {
      setToast('Alguns dados não carregaram. Tente recarregar.')
    }
  }, []) // setToast e os setters são estáveis — não precisam entrar no array de deps

  useEffect(() => { loadStats() },  [loadStats])
  useEffect(() => { loadGlobal() }, [loadGlobal])

  // ── Efeito de tema — aplica data-* no elemento raiz ───────────────────────
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    // data-theme: "dark" | "light"
    el.setAttribute('data-theme', tweaks.tema === 'Escuro' ? 'dark' : 'light')
    // data-acento: label do acento (ex.: "Azul-maré") — lido pelo CSS via [data-acento='Azul-maré']
    el.setAttribute('data-acento', tweaks.acento)
    // data-privacy: "on" | "" — o CSS borra .amount quando "on"
    el.setAttribute('data-privacy', tweaks.privacidade ? 'on' : '')
    // data-density: "compacto" | "confortavel"
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
  // Total mensal de assinaturas ativas
  const subsTotal = subscriptions
    .filter(s => s.status === 'ativa' && s.ciclo === 'mensal')
    .reduce((s, sub) => s + sub.valor, 0)

  // ── Valores da SummBar ─────────────────────────────────────────────────────
  const income  = stats?.income  ?? 0
  const expense = stats?.expense ?? 0
  const net     = stats?.net     ?? 0

  // ── Grupos de navegação da sidebar ────────────────────────────────────────
  const navGroups: {
    label: string
    items: { id: NamiView; label: string; badge?: string | null }[]
  }[] = [
    {
      label: 'Visão geral',
      items: [{ id: 'dashboard', label: 'Dashboard' }],
    },
    {
      label: 'Dia a dia',
      items: [
        { id: 'transacoes',  label: 'Transações' },
        { id: 'contas',      label: 'Contas',  badge: patrimonioTotal > 0 ? formatCompact(patrimonioTotal) : null },
        { id: 'cartoes',     label: 'Cartões' },
      ],
    },
    {
      label: 'Planejamento',
      items: [
        { id: 'orcamentos',    label: 'Orçamentos' },
        { id: 'assinaturas',   label: 'Assinaturas', badge: subsTotal > 0 ? formatCompact(subsTotal) : null },
        { id: 'emprestimos',   label: 'Empréstimos' },
        { id: 'financiamentos',label: 'Financiamentos' },
      ],
    },
  ]

  // ── Renderização da view ativa ────────────────────────────────────────────
  function renderView() {
    // Props compartilhadas por todas as telas
    const commonProps = {
      month,
      stats,
      accounts,
      cards,
      subscriptions,
      onTransactionSaved: handleTransactionSaved,
      onToast: setToast,
      onNavigate: (v: string) => navigate(v as NamiView),
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
        return null
    }
  }

  return (
    // Elemento raiz — recebe todos os data-* do efeito de tema
    <div className="nami-app" ref={rootRef}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="nm-side">

        {/* Logo/marca da Nami */}
        <div className="side-brand">
          <img
            src="/nami.jpg"
            alt="Nami"
            className="brand-mark"
            // Fallback se a imagem não carregar (ex.: dev sem o asset)
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div>
            <div className="brand-name">Nami</div>
            <div className="brand-sub">Finanças pessoais</div>
          </div>
        </div>

        {/* Botão de ação principal com atalho de teclado */}
        <div className="side-add">
          <button className="side-add-btn" onClick={() => setAddOpen(true)}>
            <span>Nova transação</span>
            <kbd>A</kbd>
          </button>
        </div>

        {/* Grupos de navegação */}
        <nav className="side-nav">
          {navGroups.map(group => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map(item => (
                <button
                  key={item.id}
                  className={`nav-item${view === item.id ? ' active' : ''}`}
                  onClick={() => navigate(item.id)}
                >
                  {/* Ícone SVG (não emoji) */}
                  <Icon name={VIEW_ICONS[item.id]} size={16} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                  {/* Badge de valor (patrimônio, assinaturas) */}
                  {item.badge != null && (
                    <span className="nav-amt">{item.badge}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Rodapé da sidebar — volta ao painel principal */}
        <div className="side-foot">
          <a className="back-makima" href="/">
            <Icon name="arrowLeft" size={14} />
            Voltar à Makima
          </a>
        </div>
      </aside>

      {/* ── Área principal ──────────────────────────────────────────────── */}
      <div className="nm-main">

        {/* Topbar com título, seletor de mês e busca */}
        <header className="nm-topbar">
          <span className="topbar-title">{VIEW_TITLES[view]}</span>
          <span className="topbar-spacer" />

          {/* Seletor de mês — só nas views pertinentes */}
          {VIEWS_WITH_MONTH.has(view) && (
            <div className="month-switch">
              <button
                className="month-btn"
                onClick={() => setMonth(m => shiftMonth(m, -1))}
                aria-label="Mês anterior"
              >
                <Icon name="chevL" size={14} />
              </button>
              <span className="mlabel">{formatMonthLabel(month)}</span>
              <button
                className="month-btn"
                onClick={() => setMonth(m => shiftMonth(m, +1))}
                aria-label="Próximo mês"
              >
                <Icon name="chevR" size={14} />
              </button>
            </div>
          )}

          {/* Campo de busca — digitar 2+ chars navega para transações */}
          <div className="search">
            <Icon name="search" size={14} />
            <input
              value={searchQuery}
              placeholder="Buscar…"
              onChange={e => {
                setSearchQuery(e.target.value)
                // Navega para transações automaticamente quando busca ≥ 2 chars
                if (e.target.value.length >= 2 && view !== 'transacoes') navigate('transacoes')
              }}
            />
          </div>
        </header>

        {/* Área scrollável do conteúdo principal */}
        <main className="nm-scroll">
          {renderView()}
        </main>
      </div>

      {/* ── SummBar — barra de resumo no rodapé (grid-column: 2) ────────── */}
      <footer className="summbar">
        <div className="summbar-item">
          <span className="summbar-label">Entrou</span>
          <span className="summbar-val in amount">
            {fmtMoney(income)}
          </span>
        </div>
        <div className="summbar-sep" />
        <div className="summbar-item">
          <span className="summbar-label">Saiu</span>
          <span className="summbar-val out amount">
            {fmtMoney(expense)}
          </span>
        </div>
        <div className="summbar-sep" />
        <div className="summbar-item">
          <span className="summbar-label">Saldo do mês</span>
          <span className={`summbar-val amount ${net >= 0 ? 'in' : 'out'}`}>
            {fmtMoney(net)}
          </span>
        </div>
        <span className="summbar-spacer" />
        <button
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '5px 12px' }}
          onClick={() => setAddOpen(true)}
        >
          <Icon name="plus" size={13} />
          Nova transação
        </button>
      </footer>

      {/* ── Modal de nova transação ────────────────────────────────────── */}
      <AddModal
        open={addOpen}
        accounts={accounts}
        cards={cards}
        onClose={() => setAddOpen(false)}
        onSaved={handleTransactionSaved}
      />

      {/* ── Toast de feedback ─────────────────────────────────────────── */}
      <Toast message={toast} />

      {/* ── Painel de tweaks (tema / acento / densidade / privacidade) ── */}
      <TweaksPanel tweaks={tweaks} setTweak={setTweak} />
    </div>
  )
}
