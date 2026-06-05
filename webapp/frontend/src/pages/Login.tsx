// Página de login da webapp Makima.
// Exibida quando o usuário não está autenticado (cookie de sessão ausente ou expirado).
// O login é feito exclusivamente via Google OAuth — não há formulário de senha.

// Componente da tela de login
function Login() {
  // Função chamada ao clicar no botão "Entrar com Google".
  // Redireciona o navegador para o endpoint do backend que inicia o fluxo OAuth.
  // O backend (FastAPI) vai redirecionar para o Google, que pedirá autorização ao usuário.
  const handleLogin = () => {
    // Navega para a rota de login do backend — o Google vai assumir a partir daqui
    window.location.href = '/auth/login'
  }

  return (
    // Container que ocupa a tela toda, com fundo escuro e conteúdo centralizado
    // min-h-screen: altura mínima de 100vh (ocupa a janela toda)
    // flex flex-col items-center justify-center: centraliza vertical e horizontalmente
    // bg-gray-900: fundo cinza escuro (quase preto)
    // text-white: todo o texto branco
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">

      {/* Título principal da aplicação */}
      <h1 className="text-6xl font-bold tracking-tight mb-2">
        Makima
      </h1>

      {/* Subtítulo descritivo */}
      <p className="text-gray-400 text-lg mb-10">
        Assistente pessoal
      </p>

      {/* Botão de login com Google */}
      {/* bg-white text-gray-900: estilo "cartão branco" para remeter à identidade visual do Google */}
      {/* hover:bg-gray-100: escurece levemente o fundo ao passar o mouse */}
      {/* font-medium: deixa o texto um pouco mais pesado para legibilidade */}
      {/* px-6 py-3: padding interno horizontal e vertical */}
      {/* rounded-lg: bordas arredondadas */}
      {/* flex items-center gap-3: coloca o ícone e o texto lado a lado com espaço entre eles */}
      {/* transition-colors: anima a mudança de cor no hover */}
      <button
        onClick={handleLogin}
        className="flex items-center gap-3 bg-white text-gray-900 font-medium px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors"
      >
        {/* Ícone do Google em SVG inline (não precisa de dependência externa) */}
        {/* viewBox="0 0 24 24" define o sistema de coordenadas do SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="20"
          height="20"
        >
          {/* Parte azul do logo Google */}
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          {/* Parte verde */}
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          {/* Parte amarela */}
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          {/* Parte vermelha */}
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>

        {/* Texto do botão */}
        Entrar com Google
      </button>

    </div>
  )
}

// Exporta o componente para uso no App.tsx
export default Login
