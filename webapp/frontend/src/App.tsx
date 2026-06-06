// Componente raiz da aplicação Makima.
// Gerencia o estado de autenticação e configura o roteamento de páginas.
// Ao carregar, verifica com o backend se o usuário está autenticado via cookie de sessão.
// Se autenticado, renderiza o layout completo com sidebar e as rotas de cada página.

import { useEffect, useState } from 'react'             // Hooks do React: efeito colateral e estado local
import { BrowserRouter, Routes, Route } from 'react-router-dom'  // Roteamento de páginas SPA

import Login         from './pages/Login'               // Tela de login com botão "Entrar com Google"
import Layout        from './components/Layout'         // Layout com sidebar de navegação
import Dashboard     from './pages/Dashboard'           // Página inicial com resumo financeiro
import Transactions  from './pages/Transactions'        // CRUD de transações
import Accounts      from './pages/Accounts'            // Listagem e criação de contas
import Cards         from './pages/Cards'               // Cartões de crédito com progress bar
import Loans         from './pages/Loans'               // Empréstimos e saldo devedor
import Budgets       from './pages/Budgets'             // Orçamentos por categoria
import Subscriptions from './pages/Subscriptions'       // Assinaturas recorrentes

import { api } from './lib/api'                          // Wrapper de fetch com cookie de sessão automático

// Tipo que representa os dados do usuário retornados pelo endpoint /auth/me
interface User {
  email: string  // Email da conta Google autenticada
  name: string   // Nome completo da conta Google
}

function App() {
  // Estado do usuário: null = não autenticado, objeto User = autenticado
  const [user, setUser] = useState<User | null>(null)

  // Estado de carregamento: true enquanto verificamos a sessão com o backend
  // Evita "flash" de tela de login antes de confirmar que o usuário está autenticado
  const [loading, setLoading] = useState(true)

  // useEffect executa a função uma única vez após o componente montar (array vazio = sem dependências).
  // Aqui usamos para verificar se o cookie de sessão é válido ao abrir a página.
  useEffect(() => {
    // Chama o endpoint /auth/me — retorna 200 com dados do usuário ou 401 se não autenticado
    api.get<User>('/auth/me')
      .then((userData) => {
        // Usuário autenticado: salva os dados no estado
        setUser(userData)
      })
      .catch(() => {
        // 401 ou qualquer erro: trata como não autenticado
        // (o api.get lança Error para status não-2xx)
        setUser(null)
      })
      .finally(() => {
        // Em ambos os casos (sucesso ou erro), termina o carregamento
        setLoading(false)
      })
  }, []) // Array vazio: executa só uma vez, na montagem do componente

  // Enquanto verifica a sessão, mostra uma tela de carregamento neutra.
  // Isso evita que o usuário veja um flash da tela de login antes de ser redirecionado.
  if (loading) {
    return (
      // Tela de carregamento: fundo escuro com spinner centralizado
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        {/* Spinner animado: borda com cor parcial que gira */}
        <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  // Se o usuário não está autenticado, mostra a tela de login
  if (!user) {
    return <Login />
  }

  // Usuário autenticado: configura o roteamento com BrowserRouter.
  // BrowserRouter habilita navegação SPA usando a History API do navegador (sem recarregamento de página).
  // Layout envolve todas as rotas, garantindo que sidebar e header apareçam em todas as páginas.
  return (
    <BrowserRouter>
      {/* Layout fornece o sidebar de navegação e o header; todas as páginas ficam dentro dele */}
      <Layout>
        <Routes>
          {/* Rota raiz: página inicial com resumo financeiro */}
          <Route path="/"              element={<Dashboard />} />

          {/* CRUD de transações financeiras */}
          <Route path="/transactions"  element={<Transactions />} />

          {/* Listagem e criação de contas bancárias */}
          <Route path="/accounts"      element={<Accounts />} />

          {/* Cartões de crédito com progresso de uso */}
          <Route path="/cards"         element={<Cards />} />

          {/* Empréstimos e financiamentos */}
          <Route path="/loans"         element={<Loans />} />

          {/* Orçamentos mensais por categoria */}
          <Route path="/budgets"       element={<Budgets />} />

          {/* Assinaturas recorrentes */}
          <Route path="/subscriptions" element={<Subscriptions />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

// Exporta o componente para ser usado em main.tsx
export default App
