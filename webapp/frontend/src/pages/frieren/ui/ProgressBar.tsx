// Barra de progresso horizontal simples — usada para indicar progresso de leitura
// em contextos fora da capa do livro (ex.: listas, cards de detalhe).
// Portada do protótipo ui.jsx.


// Props do componente ProgressBar
interface ProgressBarProps {
  // Valor do progresso entre 0 (início) e 1 (concluído)
  // Exemplo: 0.5 representa 50% do livro lido
  value: number
}

// Componente de barra de progresso.
// Renderiza um container (progress-track) com um elemento interno (i) cuja largura
// representa o percentual de progresso. O arredondamento evita decimais no CSS.
export function ProgressBar({ value }: ProgressBarProps) {
  return (
    // Container externo — define o fundo cinza e a altura da trilha via CSS
    <div className="progress-track">
      {/* Elemento de preenchimento — largura em % indica o progresso.
          Math.round garante valores inteiros (ex.: 67 em vez de 66.666...) */}
      <i style={{ width: Math.round(value * 100) + '%' }} />
    </div>
  )
}
