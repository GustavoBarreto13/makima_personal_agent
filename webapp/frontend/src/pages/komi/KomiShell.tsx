// KomiShell.tsx — Shell raiz da Komi (Pessoas).
// Gerencia: sidebar (marca, nav, relacionamentos), topbar (busca, back, ações),
//           roteamento interno por estado (home | grid | dates | person),
//           modal de criar/editar pessoa, TweaksPanel (tema/acento/serifa).
//
// O shell carrega overview() uma vez e recarrega após criar/editar/excluir.
// Ao abrir uma pessoa, PersonPage carrega summary() de forma independente.
//
// Importa komi.css para aplicar os tokens OKLCH dentro de .km-app.

import './komi.css'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Icon } from './icons'
import { TweaksPanel, loadTweaks, saveTweaks } from './TweaksPanel'
import type { KomiTweaks } from './TweaksPanel'
import { Home }          from './screens/Home'
import { Directory }     from './screens/Directory'
import { UpcomingDates } from './screens/UpcomingDates'
import { PersonPage }    from './screens/PersonPage'
import { PersonModal }   from './modals/PersonModal'
import { REL_CATS, daysUntil } from './lib'
import { KM_PALETTES } from './lib'
import { komiApi } from './komiApi'
import type { OverviewPerson, PersonDetail } from './types'

// Views disponíveis no shell (roteamento interno por estado)
type KomiView = 'home' | 'grid' | 'dates' | 'person'

// Estado do modal: null = fechado; 'new' = criar; PersonDetail = editar
type ModalState = null | 'new' | PersonDetail

/**
 * Shell raiz da seção de Pessoas (Komi).
 * Exportado para ser registrado em App.tsx como <Route path="/people/*" />.
 * Não usa React Router interno — todo o roteamento é por estado (useState).
 */
export function KomiShell() {
  // ── Estado do shell ────────────────────────────────────────────────
  const [overview,   setOverview]   = useState<OverviewPerson[]>([])  // dados de todas as pessoas
  const [loading,    setLoading]    = useState(true)    // carregamento inicial do overview
  const [view,       setView]       = useState<KomiView>('home')       // tela ativa
  const [currentId,  setCurrentId]  = useState<string | null>(null)   // id da pessoa aberta
  const [query,      setQuery]      = useState('')      // texto de busca (topbar)
  const [filter,     setFilter]     = useState('todos') // filtro de categoria (Directory)
  const [modal,      setModal]      = useState<ModalState>(null)  // estado do PersonModal
  const [tweaksOpen, setTweaksOpen] = useState(false)   // TweaksPanel aberto?

  // Tweaks (tema/acento/nomes): carregados do localStorage na montagem
  const [tweaks, setTweaksState] = useState<KomiTweaks>(() => loadTweaks())

  // Ref do container de scroll — resetado ao trocar de view
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Carregar overview ─────────────────────────────────────────────

  /**
   * Carrega (ou recarrega) a lista de pessoas do /api/people/overview.
   * Chamado na montagem e após criar/editar/excluir uma pessoa.
   */
  const reloadOverview = useCallback(async () => {
    setLoading(true)
    try {
      const data = await komiApi.overview()
      setOverview(data.people || [])
    } catch {
      // Falha silenciosa: mantém o estado anterior e o shell continua funcional
    } finally {
      setLoading(false)
    }
  }, [])

  // Carrega ao montar o shell
  useEffect(() => { reloadOverview() }, [reloadOverview])

  // ── Efeitos de tweaks ─────────────────────────────────────────────

  /**
   * Aplica o tema (Claro/Escuro) como atributo data-theme no .km-app.
   * O CSS usa [data-theme='dark'] para inverter os tokens de cor.
   */
  useEffect(() => {
    const el = document.querySelector('.km-app')
    if (el) el.setAttribute('data-theme', tweaks.tema === 'Escuro' ? 'dark' : 'light')
  }, [tweaks.tema])

  /**
   * Aplica a paleta de acento como variáveis CSS inline no .km-app.
   * O CSS lê --km, --km-deep, --km-bright, --km-tint, --km-tint-2.
   */
  useEffect(() => {
    const p = KM_PALETTES[tweaks.acento] || KM_PALETTES['#5A4FCF']
    const el = document.querySelector('.km-app') as HTMLElement | null
    if (!el) return
    el.style.setProperty('--km',         p.base)
    el.style.setProperty('--km-deep',    p.deep)
    el.style.setProperty('--km-bright',  p.bright)
    el.style.setProperty('--km-tint',    p.t1)
    el.style.setProperty('--km-tint-2',  p.t2)
  }, [tweaks.acento])

  /**
   * Aplica a tipografia dos nomes via --serif.
   * Serifa: Playfair Display / Georgia; Sem serifa: Hanken Grotesk / DM Sans.
   */
  useEffect(() => {
    const el = document.querySelector('.km-app') as HTMLElement | null
    if (!el) return
    el.style.setProperty(
      '--serif',
      tweaks.nomes === 'Sem serifa'
        ? "'Hanken Grotesk', 'DM Sans', system-ui, sans-serif"
        : "'Playfair Display', Georgia, serif"
    )
  }, [tweaks.nomes])

  // ── Atalhos de teclado ────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Não dispara atalhos quando modal está aberto ou foco em input
      if (modal) return
      const tag = (e.target as HTMLElement).tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      // N: abre modal de nova pessoa
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setModal('new')
      }
      // Esc: volta da person page para o diretório
      if (e.key === 'Escape' && view === 'person') {
        goGrid()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, view])  // re-registra quando modal ou view mudam

  // ── Navegação ─────────────────────────────────────────────────────

  /** Reseta o scroll e navega para uma view qualquer. */
  function goView(v: KomiView) {
    setView(v)
    setCurrentId(null)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  /** Navega para o diretório (grid). Atalho para o botão "back" e Esc. */
  function goGrid() {
    setQuery('')     // limpa a busca ao voltar para o diretório
    goView('grid')
  }

  /** Abre o perfil de uma pessoa. */
  function openPerson(id: string) {
    setCurrentId(id)
    setView('person')
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  // ── Callbacks do modal ────────────────────────────────────────────

  /**
   * Após salvar (criar ou editar), recarrega o overview e navega apropriadamente.
   * @param id - id da pessoa salva
   * @param isNew - true = criação (abre o perfil), false = edição (permanece na view)
   */
  async function handleSaved(id: string, isNew: boolean) {
    setModal(null)
    await reloadOverview()   // atualiza sidebar e dados do home/grid
    if (isNew) {
      openPerson(id)          // criação: abre o perfil da nova pessoa
    }
    // edição: permanece na view atual (personPage se recarregará com os dados novos)
  }

  /**
   * Após excluir (soft delete), recarrega o overview e volta para o diretório.
   */
  async function handleDeleted() {
    setModal(null)
    await reloadOverview()
    goGrid()
  }

  // ── Dados derivados para a sidebar ───────────────────────────────

  // Contagem de datas nos próximos 60 dias (ícone de bolo na sidebar)
  const upcomingCount = useMemo(() => {
    let n = 0
    overview.forEach(p => (p.dates || []).forEach(d => {
      const days = daysUntil(d.date, d.recurring)
      if (days >= 0 && days <= 60) n++
    }))
    return n
  }, [overview])

  // Contagem de pessoas por categoria (sidebar Relacionamentos)
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {}
    overview.forEach(p => { m[p.category] = (m[p.category] || 0) + 1 })
    return m
  }, [overview])

  // Pessoa atual aberta (para o título da topbar e o modal de edição)
  const currentPerson = overview.find(p => p.id === currentId)

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="km-app">

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className="km-side">
        {/* Marca: logo + nome + subtítulo */}
        <div className="side-brand">
          <div className="brand-mark">
            <img src="/komi.png" alt="Komi" />
          </div>
          <div className="brand-text">
            <div className="brand-name">Komi</div>
            <div className="brand-role">Pessoas</div>
          </div>
        </div>

        {/* Botão de nova pessoa (atalho N) */}
        <button className="side-add" onClick={() => setModal('new')}>
          <Icon name="plus" /><span className="grow">Nova pessoa</span><kbd>N</kbd>
        </button>

        {/* Navegação principal */}
        <nav className="side-nav">
          <div className="nav-group-label">Diretório</div>

          {/* Início */}
          <button
            className={'nav-item' + (view === 'home' ? ' active' : '')}
            onClick={() => goView('home')}
          >
            <Icon name="sparkles" />
            <span className="nav-label">Início</span>
          </button>

          {/* Todas as pessoas */}
          <button
            className={'nav-item' + (view === 'grid' ? ' active' : '')}
            onClick={goGrid}
          >
            <Icon name="users" />
            <span className="nav-label">Todas as pessoas</span>
            <span className="nav-count">{overview.length}</span>
          </button>

          {/* Próximas datas */}
          <button
            className={'nav-item' + (view === 'dates' ? ' active' : '')}
            onClick={() => goView('dates')}
          >
            <Icon name="cake" />
            <span className="nav-label">Próximas datas</span>
            {upcomingCount > 0 && <span className="nav-count">{upcomingCount}</span>}
          </button>

          <div className="nav-group-label">Relacionamentos</div>

          {/* Uma entrada por categoria: Família / Amigos / Trabalho / Outros */}
          {Object.entries(REL_CATS).map(([key, meta]) => (
            <button
              key={key}
              className={'nav-item' + (view === 'grid' && filter === key ? ' active' : '')}
              onClick={() => { setFilter(key); goGrid() }}
            >
              {/* Dot colorido com a cor da categoria */}
              <span className="nav-dot" style={{ background: meta.color }} />
              <span className="nav-label">{meta.label}</span>
              {/* Contagem de pessoas nesta categoria */}
              <span className="nav-count">{catCounts[key] || 0}</span>
            </button>
          ))}
        </nav>

        {/* Rodapé: link para voltar à Makima e botão de tweaks */}
        <div className="side-foot">
          <a className="back-makima" href="/">
            <span className="dot" /><span>Voltar à Makima</span>
          </a>
          {/* Botão de configurações (abre TweaksPanel) */}
          <button
            className="side-tweaks"
            onClick={() => setTweaksOpen(true)}
            title="Aparência"
          >
            <Icon name="settings" />
          </button>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────── */}
      <main className="km-main">
        {/* Topbar: back / título / busca / ações */}
        <div className="km-topbar">
          {/* Botão "back" ao ver o perfil; título nas outras views */}
          {view === 'person' ? (
            <button className="topbar-back" onClick={goGrid}>
              <Icon name="chevL" />Diretório
            </button>
          ) : (
            <span className="topbar-title">
              <span className="t-dot" />
              {view === 'dates' ? 'Próximas datas' : view === 'home' ? 'Início' : 'Pessoas'}
            </span>
          )}

          <span className="topbar-spacer" />

          {/* Campo de busca: aparece só no diretório */}
          {view === 'grid' && (
            <div className="km-search">
              <Icon name="search" />
              <input
                value={query}
                placeholder="Buscar pessoa, apelido, cidade…"
                onChange={(e) => setQuery(e.target.value)}
              />
              {/* Limpa a busca quando há texto */}
              {query && (
                <button className="search-clear" onClick={() => setQuery('')}>
                  <Icon name="x" />
                </button>
              )}
            </div>
          )}

          {/* Botão Editar: aparece no perfil de uma pessoa */}
          {view === 'person' && currentPerson && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                // Carrega o PersonDetail completo para preencher o modal de edição
                try {
                  const data = await komiApi.get(currentPerson.id)
                  setModal(data.perfil)
                } catch {
                  // Fallback: abre modal com dados parciais do overview
                  setModal({
                    id: currentPerson.id,
                    name: currentPerson.name,
                    normalizado: '',
                    relationship: currentPerson.relationship,
                    category: currentPerson.category,
                    phone: null, email: null, instagram: null,
                    telegram: null, city: null,
                    avatar_url: currentPerson.avatar_url,
                    notes: null,
                    created_at: '', updated_at: '',
                    deleted: false,
                    aliases: [],
                    datas: [],
                  })
                }
              }}
            >
              <Icon name="edit" />Editar
            </button>
          )}

          {/* Botão Nova pessoa: sempre visível */}
          <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}>
            <Icon name="plus" />Nova
          </button>
        </div>

        {/* Área de scroll — cada tela ocupa 100% da área disponível */}
        <div className="km-scroll" ref={scrollRef}>
          {/* ── Home ──────────────────────────────────────────────── */}
          {view === 'home' && (
            <Home
              overview={overview}
              onOpen={openPerson}
              onNew={() => setModal('new')}
              goView={(v) => goView(v as KomiView)}
            />
          )}

          {/* ── Diretório ─────────────────────────────────────────── */}
          {view === 'grid' && (
            <Directory
              people={overview}
              query={query}
              filter={filter}
              setFilter={setFilter}
              onOpen={openPerson}
              onNew={() => setModal('new')}
            />
          )}

          {/* ── Próximas datas ────────────────────────────────────── */}
          {view === 'dates' && (
            <UpcomingDates people={overview} onOpen={openPerson} />
          )}

          {/* ── Perfil de pessoa ──────────────────────────────────── */}
          {view === 'person' && currentId && (
            <PersonPage
              personId={currentId}
              partialName={currentPerson?.name}
              onEdit={async (id) => {
                // Carrega PersonDetail completo para o modal de edição
                try {
                  const data = await komiApi.get(id)
                  setModal(data.perfil)
                } catch {
                  setModal('new')  // fallback improvável
                }
              }}
            />
          )}

          {/* Fallback: person view sem ID (não deveria acontecer) */}
          {view === 'person' && !currentId && (
            <div className="empty-state">
              <div className="es-icon"><Icon name="user" /></div>
              <div className="es-title">Pessoa não encontrada</div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 14 }}
                onClick={goGrid}
              >
                Voltar ao diretório
              </button>
            </div>
          )}

          {/* Spinner de carregamento inicial */}
          {loading && overview.length === 0 && (
            <div className="empty-state">
              <div className="km-spinner" />
              <div className="es-sub">Carregando pessoas…</div>
            </div>
          )}
        </div>
      </main>

      {/* ── PersonModal (criar / editar) ───────────────────────────── */}
      {modal && (
        <PersonModal
          // null = criar; PersonDetail = editar
          person={modal === 'new' ? null : modal as PersonDetail}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {/* ── TweaksPanel (aparência) ────────────────────────────────── */}
      {tweaksOpen && (
        <TweaksPanel
          tweaks={tweaks}
          onChange={(t) => { setTweaksState(t); saveTweaks(t) }}
          onClose={() => setTweaksOpen(false)}
        />
      )}
    </div>
  )
}
