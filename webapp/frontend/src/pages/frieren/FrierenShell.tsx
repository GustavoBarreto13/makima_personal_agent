// Shell principal da seção Frieren — gerencia navegação interna, estado global
// dos livros/estantes/atividade/heatmap, tweaks, modal de registro e toast.
// Substitui o roteamento do React Router para esta seção: usa estado interno
// { view, param } para não poluir a URL com sub-rotas de livros.

import React, { useState, useEffect, useRef, useCallback } from 'react'
import './frieren.css'

import { booksApi } from '../../lib/api'
import type { ApiBook, ApiShelf, ApiActivityEntry, ApiHeatmapDay } from '../../lib/api'
import type { Book, Shelf, ActivityEntry, HeatmapDay, Tweaks } from './types'
import type { BookStatus } from './types'
import { coverKeyFromId } from './coverKey'

import { Icon } from './ui/Icons'
import { NowBar } from './NowBar'
import { LogModal } from './LogModal'
import type { LogPayload } from './LogModal'
import { Toast } from './Toast'
import { TweaksPanel } from './TweaksPanel'

// ── Mapeamento de status português → inglês ───────────────────────────────────

// O backend armazena status em português; o design system usa inglês
const STATUS_MAP: Record<string, BookStatus> = {
  lendo:      'reading',
  lido:       'read',
  quero_ler:  'owned',
  wishlist:   'wishlist',
  estante:    'owned',
  pausado:    'owned',
  abandonado: 'read',
}

// Converte um livro do formato do backend para o formato do frontend
function toBook(b: ApiBook): Book {
  // Mapeia o status português para o inglês esperado pelos componentes visuais
  const status = (STATUS_MAP[b.status] ?? 'owned') as BookStatus

  // Progresso (0–1) só faz sentido quando o livro está sendo lido
  const progress =
    status === 'reading' && b.total_pages && b.current_page
      ? b.current_page / b.total_pages
      : null

  return {
    id:        b.id,
    title:     b.title,
    author:    b.author,
    year:      b.published_year,
    pages:     b.total_pages,
    genre:     b.genre,
    status,
    progress,
    page:      b.current_page,
    started:   b.date_started,
    finished:  b.date_finished,
    rating:    b.rating,
    review:    b.notes ?? null,
    shelves:   b.shelves ?? [],
    storeLink: b.store_url ?? null,
    coverUrl:  b.cover_url,
    // CoverKey derivado deterministicamente do ID — mesma paleta sempre para o mesmo livro
    coverKey:  coverKeyFromId(b.id),
  }
}

// Converte uma estante do formato do backend para o formato do frontend
function toShelf(s: ApiShelf): Shelf {
  return {
    id:     s.id,
    name:   s.name,
    desc:   s.description,
    accent: s.accent,
  }
}

// Converte uma entrada de atividade do formato do backend para o frontend
function toActivity(a: ApiActivityEntry): ActivityEntry {
  return {
    id:     a.id,
    date:   a.date,
    bookId: a.book_id,
    // Normaliza tipo para os valores aceitos pela interface ActivityEntry
    type:   (a.type as ActivityEntry['type']) ?? 'progress',
    pages:  a.pages,
    page:   a.page,
    note:   a.note,
    rating: a.rating,
  }
}

// ── Mapeamento de view → título do topbar ─────────────────────────────────────
const TITLES: Record<string, string> = {
  home:      'Início',
  catalogo:  'Biblioteca',
  lendo:     'Lendo agora',
  querler:   'Quero ler',
  wishlist:  'Wishlist',
  listas:    'Estantes',
  estante:   'Estante',
  atividade: 'Atividade',
  resenhas:  'Resenhas',
  stats:     'Estatísticas',
  detalhe:   'Livro',
}

// Mapeamento de density string → atributo data-density do CSS
const DENSITY_MAP: Record<Tweaks['densidade'], string> = {
  'Grande':   'grande',
  'Médio':    'medio',
  'Compacto': 'compacto',
}

// ── Tweaks default e persistência ────────────────────────────────────────────
const TWEAK_DEFAULTS: Tweaks = {
  tema:        'Claro',
  layoutInicio:'Cinemático',
  densidade:   'Médio',
  ordenacao:   'Recentes',
}

// Chave do localStorage onde as preferências são salvas
const TWEAKS_KEY = 'fr-tweaks'

function loadTweaks(): Tweaks {
  try {
    const raw = localStorage.getItem(TWEAKS_KEY)
    if (raw) return { ...TWEAK_DEFAULTS, ...JSON.parse(raw) }
  } catch {
    // Se o JSON estiver corrompido, usa os defaults silenciosamente
  }
  return { ...TWEAK_DEFAULTS }
}

// ── Tipo de rota interna ──────────────────────────────────────────────────────
interface Route {
  view: string
  param: string | null
}

// ── Componente Shell ──────────────────────────────────────────────────────────

/**
 * Shell principal da seção de livros (Frieren).
 * Gerencia: carregamento de dados, navegação interna, tweaks, modal de registro
 * de leitura, notificações toast e barra "agora lendo".
 */
export function FrierenShell() {
  // ── Estado de dados ────────────────────────────────────────────────────────
  const [books,    setBooks]    = useState<Book[]>([])
  const [shelves,  setShelves]  = useState<Shelf[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [heatmap,  setHeatmap]  = useState<HeatmapDay[]>([])
  const [loading,  setLoading]  = useState(true)

  // ── Navegação interna ──────────────────────────────────────────────────────
  const [route, setRoute] = useState<Route>({ view: 'home', param: null })

  // ── Busca textual ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')

  // ── Modal de registro ──────────────────────────────────────────────────────
  const [modal, setModal] = useState<{ open: boolean; presetBookId: string | null }>({
    open: false,
    presetBookId: null,
  })

  // ── Toast de feedback ──────────────────────────────────────────────────────
  const [toast, setToast] = useState('')

  // ── Tweaks (preferências visuais) ─────────────────────────────────────────
  // Carregados do localStorage na inicialização
  const [tweaks, setTweaksState] = useState<Tweaks>(loadTweaks)

  // Referência ao container de scroll — para resetar ao trocar de view
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Carregamento inicial de dados ─────────────────────────────────────────
  useEffect(() => {
    const year = new Date().getFullYear()

    // Carrega todos os dados em paralelo para reduzir o tempo de espera
    Promise.all([
      booksApi.list(),
      booksApi.shelves(),
      booksApi.heatmap(year),
      booksApi.activity(100),
    ])
      .then(([booksRes, shelvesRes, heatmapRes, activityRes]) => {
        setBooks(booksRes.books.map(toBook))
        setShelves(shelvesRes.shelves.map(toShelf))
        setHeatmap(heatmapRes.heatmap.map((h: ApiHeatmapDay) => ({ date: h.date, pages: h.pages })))
        setActivity(activityRes.activity.map(toActivity))
      })
      .catch(err => {
        // Erro silencioso na UI — os dados ficam vazios mas o shell não quebra
        console.error('[FrierenShell] Erro ao carregar dados:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  // ── Efeito de densidade — aplica data-density no container principal ───────
  useEffect(() => {
    // O CSS usa o atributo data-density para ajustar tamanhos de grade e espaçamentos
    document.querySelector('.fr-app')?.setAttribute(
      'data-density',
      DENSITY_MAP[tweaks.densidade] ?? 'medio',
    )
  }, [tweaks.densidade])

  // ── Efeito de tema — aplica data-theme no container .fr-app ──────────────
  useEffect(() => {
    // data-theme="dark" ativa as variáveis CSS do modo escuro no design system
    const frApp = document.querySelector('.fr-app')
    if (frApp) {
      frApp.setAttribute('data-theme', tweaks.tema === 'Escuro' ? 'dark' : 'light')
    }
  }, [tweaks.tema])

  // ── Toast: auto-some após 2,6 s ──────────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(id)
  }, [toast])

  // ── Helpers de navegação ─────────────────────────────────────────────────
  const navigate = useCallback((view: string, param: string | null = null) => {
    setRoute({ view, param })
    // Rola o conteúdo de volta ao topo ao trocar de seção
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    // Limpa a busca ao sair das views que suportam busca
    if (!['catalogo', 'lendo', 'wishlist', 'querler'].includes(view)) {
      setQuery('')
    }
  }, [])

  const openLog = useCallback((presetBookId: string | null = null) => {
    setModal({
      open: true,
      presetBookId: typeof presetBookId === 'string' ? presetBookId : null,
    })
  }, [])

  // ── Atualização de tweak com persistência no localStorage ─────────────────
  function setTweak<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
    setTweaksState(prev => {
      const next = { ...prev, [key]: value }
      // Persiste toda a estrutura de tweaks para sobreviver a reload
      localStorage.setItem(TWEAKS_KEY, JSON.stringify(next))
      return next
    })
  }

  // ── Registro de leitura — envia ao backend e re-sincroniza estado ─────────
  const addLog = useCallback(async (payload: LogPayload) => {
    await booksApi.logReading(payload.bookId, {
      page:     payload.page,
      note:     payload.note || undefined,
      finished: payload.finished,
      rating:   payload.rating ?? undefined,
    })

    // Re-busca livros e atividade após salvar para refletir o progresso atualizado
    const [booksRes, activityRes] = await Promise.all([
      booksApi.list(),
      booksApi.activity(100),
    ])
    setBooks(booksRes.books.map(toBook))
    setActivity(activityRes.activity.map(toActivity))

    // Calcula delta de páginas para a mensagem do toast
    const oldBook = books.find(b => b.id === payload.bookId)
    const delta   = Math.max(0, payload.page - (oldBook?.page ?? 0))

    // Mensagem de sucesso contextual
    setToast(
      payload.finished
        ? 'Livro terminado — que jornada!'
        : `+${delta} ${delta === 1 ? 'página registrada' : 'páginas registradas'}`,
    )
  }, [books])

  // ── Deriva nav ativa a partir da view atual ───────────────────────────────
  const activeNav =
    ['lendo', 'wishlist', 'querler', 'catalogo'].includes(route.view) ? route.view
    : route.view === 'estante' ? 'listas'
    : route.view === 'detalhe' ? 'catalogo'
    : route.view

  // ── Livros lendo agora — usados pela NowBar ───────────────────────────────
  const readingBooks = books.filter(b => b.status === 'reading')
  // O livro exibido na NowBar é o com maior progresso entre os lendo
  const nowBook = readingBooks.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0] ?? null

  // ── Layout do hero (para a tela Home) ─────────────────────────────────────
  const layoutMap: Record<Tweaks['layoutInicio'], string> = {
    'Cinemático': 'cinematico',
    'Editorial':  'editorial',
    'Galeria':    'galeria',
  }
  const layout = layoutMap[tweaks.layoutInicio] ?? 'cinematico'

  // ── Renderização das telas ────────────────────────────────────────────────
  const renderView = () => {
    // As screens serão implementadas nas próximas tarefas.
    // Por ora, todas renderizam um placeholder com o nome da view.
    switch (route.view) {
      case 'home':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Home (layout={layout})
          </div>
        )
      case 'catalogo':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Biblioteca ({books.length} livros, busca="{query}")
          </div>
        )
      case 'lendo':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Lendo agora ({readingBooks.length} livros)
          </div>
        )
      case 'querler':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Quero ler
          </div>
        )
      case 'wishlist':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Wishlist
          </div>
        )
      case 'listas':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Estantes ({shelves.length} estantes)
          </div>
        )
      case 'estante':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Estante id={route.param}
          </div>
        )
      case 'atividade':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Atividade ({activity.length} entradas)
          </div>
        )
      case 'resenhas':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Resenhas
          </div>
        )
      case 'stats':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Estatísticas
          </div>
        )
      case 'detalhe':
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: Detalhe id={route.param}
          </div>
        )
      default:
        return (
          <div style={{ padding: 32, color: 'var(--ink-2)' }}>
            Em construção: {route.view}
          </div>
        )
    }
  }

  // ── Definição dos itens de navegação ─────────────────────────────────────
  // Cada item define: id (para comparar activeNav), view (para navigate()),
  // label (texto visível), icon (chave do componente Icon) e count (badge)
  const navBiblioteca = [
    {
      id: 'home',     view: 'home',     label: 'Início',      icon: 'inicio',
      count: null,
    },
    {
      id: 'catalogo', view: 'catalogo', label: 'Biblioteca',  icon: 'catalogo',
      count: books.length,
    },
    {
      id: 'lendo',    view: 'lendo',    label: 'Lendo agora', icon: 'lendo',
      count: readingBooks.length,
    },
    {
      id: 'querler',  view: 'querler',  label: 'Quero ler',   icon: 'wishlist',
      count: books.filter(b => b.status === 'owned').length,
    },
    {
      id: 'wishlist', view: 'wishlist', label: 'Wishlist',    icon: 'sparkle',
      count: books.filter(b => b.status === 'wishlist').length,
    },
  ]

  const navColecao = [
    {
      id: 'listas',    view: 'listas',    label: 'Estantes',     icon: 'listas',
      count: shelves.length,
    },
    {
      id: 'atividade', view: 'atividade', label: 'Atividade',    icon: 'atividade',
      count: null,
    },
    {
      id: 'resenhas',  view: 'resenhas',  label: 'Resenhas',     icon: 'resenhas',
      count: books.filter(b => b.review).length,
    },
    {
      id: 'stats',     view: 'stats',     label: 'Estatísticas', icon: 'stats',
      count: null,
    },
  ]

  // ── Tela de carregamento ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fr-app" data-density="medio">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', color: 'var(--ink-3)',
        }}>
          {/* Spinner simples enquanto carrega os dados */}
          <div style={{
            width: 32, height: 32, border: '2px solid var(--line)',
            borderTopColor: 'var(--teal)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      </div>
    )
  }

  // ── Render principal ──────────────────────────────────────────────────────
  return (
    // Container raiz — data-density e data-theme são controlados pelos efeitos acima
    <div className="fr-app" data-density={DENSITY_MAP[tweaks.densidade] ?? 'medio'}>

      {/* ── Sidebar de navegação ── */}
      <aside className="fr-side">

        {/* Marca da seção — ícone circular com foto + nome e subtítulo */}
        <div className="side-brand">
          <div className="brand-mark">
            {/* Imagem de identidade da seção Frieren */}
            <img src="/frieren.png" alt="Frieren" />
          </div>
          <div className="brand-text">
            <div className="brand-name">Frieren</div>
            <div className="brand-role">Livros</div>
          </div>
        </div>

        {/* Botão de ação principal — abre o modal de registro sem pré-selecionar livro */}
        <button className="side-log-btn" onClick={() => openLog()}>
          <Icon name="plus" /> <span>Registrar leitura</span>
        </button>

        {/* Navegação principal com dois grupos */}
        <nav className="side-nav">

          {/* Grupo "Biblioteca" — seções de status do livro */}
          <div className="nav-group-label">Biblioteca</div>
          {navBiblioteca.map(n => (
            <button
              key={n.id}
              className={'nav-item' + (activeNav === n.id ? ' active' : '')}
              onClick={() => navigate(n.view)}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {/* Badge de contagem — só aparece quando count > 0 */}
              {n.count != null && n.count > 0 && (
                <span className="nav-count">{n.count}</span>
              )}
            </button>
          ))}

          {/* Grupo "Coleção" — estantes, atividade, resenhas e estatísticas */}
          <div className="nav-group-label">Coleção</div>
          {navColecao.map(n => (
            <button
              key={n.id}
              className={'nav-item' + (activeNav === n.id ? ' active' : '')}
              onClick={() => navigate(n.view)}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.count != null && n.count > 0 && (
                <span className="nav-count">{n.count}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Rodapé da sidebar — link para voltar ao dashboard principal */}
        <div className="side-foot">
          <a className="back-makima" href="/">
            <span className="dot" /> Voltar à Makima
          </a>
        </div>
      </aside>

      {/* ── Conteúdo principal ── */}
      <main className="fr-main">

        {/* Barra superior com título da view atual e campo de busca */}
        <div className="fr-topbar">
          <span className="topbar-title">
            {TITLES[route.view] ?? 'Frieren'}
          </span>
          <div className="topbar-spacer" />
          {/* Campo de busca — ao digitar em outra view, navega para Biblioteca */}
          <div className="search">
            <Icon name="search" />
            <input
              value={query}
              placeholder="Buscar título ou autor…"
              onChange={e => {
                setQuery(e.target.value)
                // Redireciona para Biblioteca ao iniciar busca em outra view
                if (
                  e.target.value &&
                  !['catalogo', 'lendo', 'wishlist', 'querler'].includes(route.view)
                ) {
                  navigate('catalogo')
                }
              }}
            />
          </div>
        </div>

        {/* Área de scroll do conteúdo — referência usada para resetar ao trocar view */}
        <div className="fr-scroll" ref={scrollRef}>
          {renderView()}
        </div>
      </main>

      {/* ── Barra "Agora lendo" — só aparece quando há livro sendo lido ── */}
      {nowBook && (
        <NowBar
          book={nowBook}
          books={books}
          navigate={navigate}
          openLog={openLog}
        />
      )}

      {/* ── Modal de registro de leitura ── */}
      <LogModal
        open={modal.open}
        presetBookId={modal.presetBookId}
        books={books}
        onClose={() => setModal({ open: false, presetBookId: null })}
        onSave={addLog}
      />

      {/* ── Notificação toast de feedback ── */}
      <Toast message={toast} />

      {/* ── Painel de tweaks visuais ── */}
      <TweaksPanel tweaks={tweaks} setTweak={setTweak} />
    </div>
  )
}
