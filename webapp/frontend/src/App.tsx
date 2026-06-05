// Componente principal da aplicação Makima.
// Por enquanto é uma tela placeholder — será substituído pelas telas reais nas próximas fatias.

function App() {
  return (
    // Div que ocupa a tela toda, centraliza o conteúdo vertical e horizontalmente
    // Classes Tailwind: min-h-screen = altura mínima 100vh, flex = flexbox,
    // flex-col = coluna, items-center = centraliza horizontal, justify-center = centraliza vertical
    // bg-gray-950 = fundo quase preto, text-white = texto branco
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white">

      {/* Título principal */}
      <h1 className="text-5xl font-bold tracking-tight mb-4">
        Makima
      </h1>

      {/* Subtítulo em construção */}
      <p className="text-gray-400 text-lg">
        Em construção
      </p>

    </div>
  )
}

// Exporta o componente para ser usado em main.tsx
export default App
