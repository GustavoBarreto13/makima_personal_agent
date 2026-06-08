// Ícones SVG no estilo Lucide (stroke). Portados do protótipo ui.jsx.
// Cada ícone é definido como um path SVG — facilita adicionar novos sem instalar bibliotecas externas.

import React from 'react'

// Mapa de nome de ícone → path SVG (viewBox 0 0 24 24)
// Os paths foram copiados diretamente do protótipo, preservando a estética Lucide (traços finos e arredondados)
const ICONS: Record<string, string> = {
  // Ícone de tela inicial — forma de casa estilizada
  inicio:    'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  // Ícone de catálogo — grade 2x2 de quadrados (será sobrescrito abaixo)
  catalogo:  'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  // Ícone de leitura — dois livros abertos frente a frente
  lendo:     'M3 5.5C5 4 8 4 10 5.5v13C8 17 5 17 3 18.5zM21 5.5C19 4 16 4 14 5.5v13c2-1.5 5-1.5 7 0z',
  // Ícone de lista de desejos — marcador/favorito
  wishlist:  'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  // Ícone de listas — linhas com pontos à direita
  listas:    'M3 6h13M3 12h13M3 18h13M20 6h.01M20 12h.01M20 18h.01',
  // Ícone de atividade — gráfico de pulso (estilo ECG)
  atividade: 'M3 12h4l2 6 4-14 2 8h6',
  // Ícone de resenhas — estrela (usada também como rating)
  resenhas:  'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.6 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z',
  // Ícone de estatísticas — barras verticais com linha de base
  stats:     'M4 20V10M10 20V4M16 20v-7M22 20H2',
  // Ícone de adicionar — cruz (+)
  plus:      'M12 5v14M5 12h14',
  // Ícone de busca — lupa
  search:    'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  // Ícone de fechar — x
  x:         'M18 6 6 18M6 6l12 12',
  // Ícone de voltar — seta para a esquerda
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  // Seta de navegação — chevron esquerdo
  chevL:     'M15 18l-6-6 6-6',
  // Seta de navegação — chevron direito
  chevR:     'M9 18l6-6-6-6',
  // Ícone de confirmação — check/visto
  check:     'M20 6 9 17l-5-5',
  // Ícone de filtros — controles deslizantes (sliders)
  sliders:   'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M6 10v4M16 16v4',
  // Ícone decorativo — faísca/brilho (sparkle)
  sparkle:   'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  // Ícone de livro aberto — capa esquerda e direita separadas por uma lombada central
  open:      'M12 6.5C9.5 4.8 6.5 4.5 4 5.5v13c2.5-1 5.5-.7 8 1 2.5-1.7 5.5-2 8-1v-13c-2.5-1-5.5-.7-8 1zM12 6.5V20.5',
}

// Interface TypeScript que define as props aceitas pelo componente Icon
interface IconProps {
  // Nome do ícone — deve ser uma das chaves do mapa ICONS acima
  name: string
  // Estilo inline opcional (ex.: cor, tamanho) para personalizar o ícone no contexto de uso
  style?: React.CSSProperties
}

// Componente genérico de ícone SVG.
// Recebe o nome do ícone e renderiza o SVG correspondente do mapa acima.
// Se o nome não for encontrado, não renderiza nada (retorna null).
export function Icon({ name, style }: IconProps) {
  // Busca o path SVG no mapa pelo nome recebido
  const d = ICONS[name]

  // Retorna null silenciosamente se o ícone não existir — evita erros visíveis no UI
  if (!d) return null

  // Ícones de resenha e sparkle têm fill (preenchimento), os demais usam apenas stroke (traço)
  // Isso diferencia ícones "sólidos" dos ícones de linha
  const filled = name === 'resenhas' || name === 'sparkle'

  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      style={style}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}
