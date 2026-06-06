// Configuração do PostCSS — processa o CSS antes de entregar ao browser.
// O Tailwind CSS usa o PostCSS como pipeline para gerar as classes utilitárias.
export default {
  plugins: {
    tailwindcss: {},   // Gera as classes CSS do Tailwind (ex.: text-xl, bg-blue-500)
    autoprefixer: {},  // Adiciona prefixos de browser automaticamente (-webkit-, -moz-)
  },
}
