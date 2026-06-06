// Layout principal da aplicação Makima com barra lateral de navegação.
// Envolve todas as páginas protegidas, fornecendo o menu lateral e o cabeçalho.
// Qualquer página que precise do sidebar deve ser renderizada como filho deste componente.

import { ReactNode } from 'react'           // Tipo do React para representar elementos JSX filhos
import { NavLink } from 'react-router-dom'  // Componente de link que sabe se está "ativo" na rota atual

// Interface que define as props aceitas por este componente
interface LayoutProps {
  children: ReactNode  // Conteúdo da página atual (ex: <Dashboard />, <Transactions />)
}

// Lista de itens do menu lateral com rótulo e caminho de rota
// Cada item tem um 'label' (texto exibido) e um 'path' (rota React Router)
const NAV_ITEMS = [
  { label: 'Dashboard',     path: '/' },
  { label: 'Transações',    path: '/transactions' },
  { label: 'Contas',        path: '/accounts' },
  { label: 'Cartões',       path: '/cards' },
  { label: 'Empréstimos',   path: '/loans' },
  { label: 'Orçamentos',    path: '/budgets' },
  { label: 'Assinaturas',   path: '/subscriptions' },
  { label: 'Livros',       path: '/books' },
]

/**
 * Componente de layout com sidebar e header para todas as páginas autenticadas.
 *
 * Args:
 *   children - O conteúdo da página atual a ser renderizado na área principal.
 *
 * Returns:
 *   Estrutura completa com sidebar à esquerda e área de conteúdo à direita.
 */
export default function Layout({ children }: LayoutProps) {
  return (
    // Container externo: ocupa toda a tela, organiza sidebar + conteúdo lado a lado
    <div className="flex min-h-screen bg-gray-950 text-white">

      {/* ── Sidebar (barra lateral) ── */}
      <aside className="w-56 shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">

        {/* Cabeçalho do sidebar: título da aplicação */}
        <div className="px-6 py-5 border-b border-gray-800">
          <span className="text-xl font-bold tracking-tight text-white">Makima</span>
        </div>

        {/* Lista de links de navegação */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ label, path }) => (
            <NavLink
              key={path}
              to={path}
              // end=true no "/" evita que o Dashboard fique "ativo" em todas as rotas
              end={path === '/'}
              className={({ isActive }) =>
                // Quando a rota está ativa: texto branco e fundo levemente destacado
                // Quando inativa: texto cinza mais apagado
                isActive
                  ? 'flex items-center px-3 py-2 rounded-md text-sm font-semibold text-white bg-gray-800'
                  : 'flex items-center px-3 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors'
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Rodapé do sidebar: link de logout */}
        <div className="px-6 py-4 border-t border-gray-800">
          {/* href="/auth/logout" chama o endpoint do backend que apaga o cookie de sessão */}
          <a
            href="/auth/logout"
            className="text-sm text-gray-500 hover:text-red-400 transition-colors"
          >
            Sair
          </a>
        </div>
      </aside>

      {/* ── Área principal ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Cabeçalho superior da área de conteúdo */}
        <header className="h-14 flex items-center px-6 border-b border-gray-800 bg-gray-900 shrink-0">
          <span className="text-gray-400 text-sm">Makima Personal Agent</span>
        </header>

        {/* Conteúdo da página atual, passado como children */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
