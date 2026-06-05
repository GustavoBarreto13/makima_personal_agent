// Componente raiz da aplicação Makima.
// Gerencia o estado de autenticação: decide se mostra a tela de login ou o conteúdo protegido.
// Ao carregar, verifica com o backend se o usuário está autenticado via cookie de sessão.

import { useEffect, useState } from 'react'   // Hooks do React: efeito colateral e estado local
import Login from './pages/Login'              // Tela de login com botão "Entrar com Google"
import { api } from './lib/api'                // Wrapper de fetch com cookie de sessão automático

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
      // Tela de carregamento: fundo escuro com spinner e mensagem
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

  // Usuário autenticado: mostra o conteúdo protegido da aplicação.
  // Por enquanto é uma tela simples de boas-vindas — será substituída nas próximas fatias.
  return (
    // Container principal: fundo escuro, conteúdo centralizado
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white">

      {/* Título da aplicação */}
      <h1 className="text-5xl font-bold tracking-tight mb-2">
        Makima
      </h1>

      {/* Mensagem de boas-vindas com o nome do usuário */}
      <p className="text-gray-300 text-lg mb-1">
        Bem-vindo, {user.name}
      </p>

      {/* Email do usuário autenticado */}
      <p className="text-gray-500 text-sm mb-8">
        {user.email}
      </p>

      {/* Link para encerrar a sessão */}
      {/* Ao clicar, o backend apaga o cookie e redireciona para "/", voltando para o login */}
      <a
        href="/auth/logout"
        className="text-gray-400 hover:text-white text-sm underline transition-colors"
      >
        Sair
      </a>

    </div>
  )
}

// Exporta o componente para ser usado em main.tsx
export default App
