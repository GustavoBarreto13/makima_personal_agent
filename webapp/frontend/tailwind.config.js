// Configuração do Tailwind CSS — define quais arquivos serão escaneados
// para gerar apenas as classes CSS que realmente são usadas no projeto.
// Isso reduz o tamanho do CSS final em produção.
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',           // Arquivo HTML principal do Vite
    './src/**/*.{ts,tsx}',    // Todos os componentes TypeScript/React em src/
  ],
  theme: {
    extend: {}, // Personalizações futuras de tema vão aqui (cores, fontes, etc.)
  },
  plugins: [],
}
