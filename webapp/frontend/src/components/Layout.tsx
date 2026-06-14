// Layout principal da aplicação Makima com barra lateral baseada em personagens.
// Cada personagem representa um domínio (finanças = Nami, livros = Frieren, etc.)
// e tem sua cor temática que destaca o item ativo.

import { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface LayoutProps {
  children: ReactNode
}

// ── Estrutura de navegação por domínio ────────────────────────────────────────────────────────

// Cada domínio agrupa um personagem com suas rotas.
// "mainPath" é o link clicável no sidebar; "activePaths" lista todas as sub-rotas que
// fazem o item ficar "ativo" (ex: /transactions, /accounts → domínio Nami).
interface NavDomain {
  character: string          // Nome do personagem
  label:     string          // Rótulo exibido (nome do domínio em pt-BR)
  mainPath:  string          // Rota ao clicar no item
  activePaths: string[]      // Rotas que ativam este item
  color:     string          // Variável CSS da cor temática (ex: 'var(--c-nami)')
  colorDim:  string          // Variável CSS da cor apagada (fundo do badge ativo)
  sub?: Array<{ label: string; path: string }>  // Sub-links opcionais (expandidos quando ativo)
}

const DOMAINS: NavDomain[] = [
  {
    character:   'Nami',
    label:       'Finanças',
    // Nova rota do shell redesenhado — usa hash para navegação interna
    mainPath:    '/nami',
    activePaths: ['/nami'],
    color:       'var(--c-nami)',
    colorDim:    'var(--c-nami-dim)',
    sub: [
      // href com hash — não react-router Link, para que o NamiShell leia window.location.hash
      { label: 'Transações',    path: '/nami#transacoes' },
      { label: 'Contas',        path: '/nami#contas' },
      { label: 'Cartões',       path: '/nami#cartoes' },
      { label: 'Orçamentos',    path: '/nami#orcamentos' },
      { label: 'Assinaturas',   path: '/nami#assinaturas' },
      { label: 'Empréstimos',   path: '/nami#emprestimos' },
      { label: 'Financiamentos',path: '/nami#financiamentos' },
    ],
  },
  {
    character:   'Frieren',
    label:       'Livros',
    mainPath:    '/books',
    activePaths: ['/books'],
    color:       'var(--c-frieren)',
    colorDim:    'var(--c-frieren-dim)',
  },
  {
    character:   'Diário',
    label:       'Diário',
    mainPath:    '/journal',
    activePaths: ['/journal'],
    color:       'var(--c-journal)',
    colorDim:    'var(--c-journal-dim)',
  },
  {
    // Kaguya · Tarefas — quarto shell (sistema de tarefas próprio, spec 011)
    character:   'Kaguya',
    label:       'Tarefas',
    mainPath:    '/tasks',
    activePaths: ['/tasks'],
    color:       'var(--c-kaguya)',
    colorDim:    'var(--c-kaguya-dim)',
  },
  {
    // Akane · Filmes — cinemateca pessoal estilo Letterboxd (spec 015)
    character:   'Akane',
    label:       'Filmes',
    mainPath:    '/movies',
    activePaths: ['/movies'],
    color:       'var(--c-akane)',
    colorDim:    'var(--c-akane-dim)',
  },
  {
    // Mai · Séries — catálogo de séries de TV com TMDB e diário de episódios (spec 022)
    character:   'Mai',
    label:       'Séries',
    mainPath:    '/series',
    activePaths: ['/series'],
    color:       'var(--c-mai)',
    colorDim:    'var(--c-mai-dim)',
  },
  {
    // Marin · Animes — catálogo de animes com sync MAL e diário de episódios (spec 021)
    character:   'Marin',
    label:       'Animes',
    mainPath:    '/animes',
    activePaths: ['/animes'],
    color:       'var(--c-marin)',
    colorDim:    'var(--c-marin-dim)',
  },
]

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Layout com sidebar de personagens e área de conteúdo principal.
 *
 * Args:
 *   children - Conteúdo da página atual.
 *
 * Returns:
 *   Estrutura de dois painéis: sidebar fixa à esquerda + área principal flex-1.
 */
export default function Layout({ children }: LayoutProps) {
  // useLocation permite saber a rota atual para aplicar destaque correto
  const location = useLocation()

  return (
    // Container externo: full height, side-by-side layout
    <div
      className="flex min-h-screen"
      style={{ background: 'var(--bg-app)', color: 'var(--t1)', fontFamily: '"DM Sans", system-ui, sans-serif' }}
    >

      {/* ── Sidebar esquerda ── */}
      <aside
        className="w-[222px] shrink-0 flex flex-col"
        style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
      >

        {/* Logo Makima — tipografia display (Playfair Display) */}
        <div
          className="px-6 py-6 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {/* Playfair Display + cor Makima para o nome do coordenador */}
          <span
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: '"Playfair Display", Georgia, serif', color: 'var(--c-makima)' }}
          >
            Makima
          </span>
          {/* Subtítulo discreto */}
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>personal agent</p>
        </div>

        {/* Lista de domínios/personagens */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {DOMAINS.map((domain) => {
            // Verifica se a rota atual pertence a este domínio.
            // Para "/" usamos exact match; para os demais, startsWith basta.
            const isActive = domain.activePaths.some(p =>
              p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
            )

            return (
              <div key={domain.mainPath}>
                {/* ── Item principal do personagem ── */}
                <NavLink
                  to={domain.mainPath}
                  end={domain.mainPath === '/'}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full"
                  style={
                    isActive
                      ? {
                          // Ativo: fundo dim da cor do personagem + texto na cor temática
                          background: domain.colorDim,
                          color: domain.color,
                        }
                      : {
                          // Inativo: texto apagado
                          color: 'var(--t3)',
                        }
                  }
                  onMouseEnter={e => {
                    // Hover sutil: fundo levemente elevado quando não está ativo
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  {/* Indicador colorido à esquerda (bolinha) */}
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: isActive ? domain.color : 'var(--t4)' }}
                  />

                  {/* Nome do personagem como rótulo principal */}
                  <span className="flex-1">{domain.character}</span>

                  {/* Badge com o label do domínio — visível sempre */}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: isActive ? 'transparent' : 'var(--bg-card)',
                      color: isActive ? domain.color : 'var(--t4)',
                      border: `1px solid ${isActive ? domain.color + '44' : 'var(--border)'}`,
                    }}
                  >
                    {domain.label}
                  </span>
                </NavLink>

                {/* ── Sub-links (expandidos quando o domínio está ativo) ── */}
                {/* Aparecem apenas se o domínio tem sub-rotas e está ativo */}
                {isActive && domain.sub && (
                  <div className="mt-0.5 ml-4 space-y-0.5">
                    {domain.sub.map(sub => {
                      // Links com hash (ex.: /nami#transacoes) precisam de <a href> normal,
                      // não react-router <Link>, para que o NamiShell leia window.location.hash
                      const hasHash = sub.path.includes('#')
                      const subStyle = { color: 'var(--t4)', background: 'transparent' }
                      const subContent = (
                        <>
                          <span className="w-3 h-px shrink-0" style={{ background: 'var(--border)' }} />
                          {sub.label}
                        </>
                      )
                      return hasHash ? (
                        <a
                          key={sub.path}
                          href={sub.path}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors"
                          style={subStyle}
                        >
                          {subContent}
                        </a>
                      ) : (
                        <NavLink
                          key={sub.path}
                          to={sub.path}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors"
                          style={({ isActive: subIsActive }) => ({
                            color: subIsActive ? domain.color : 'var(--t4)',
                            background: subIsActive ? domain.colorDim : 'transparent',
                          })}
                        >
                          {subContent}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Rodapé: link de logout */}
        <div
          className="px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {/* /auth/logout apaga o cookie de sessão no backend */}
          <a
            href="/auth/logout"
            className="text-xs transition-colors"
            style={{ color: 'var(--t4)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--c-makima)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t4)' }}
          >
            Sair
          </a>
        </div>
      </aside>

      {/* ── Área principal ── */}
      {/* flex-1 faz esta área ocupar o espaço restante após a sidebar */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Conteúdo da página atual */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
