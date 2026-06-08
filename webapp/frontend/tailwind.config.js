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
    extend: {
      // ── Fontes ──
      // Três famílias tipográficas do design system Makima.
      // Devem ser carregadas via Google Fonts no index.html.
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],  // títulos e logo
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],    // UI e corpo de texto
        mono:    ['"DM Mono"', 'monospace'],                   // código e timestamps
      },
      // ── Cores via variáveis CSS ──
      // Expõe os tokens definidos em index.css como classes Tailwind.
      // Ex: bg-[--bg-card], text-[--t1], border-[--border]
      colors: {
        'bg-app':      'var(--bg-app)',
        'bg-sidebar':  'var(--bg-sidebar)',
        'bg-card':     'var(--bg-card)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-hover':    'var(--bg-hover)',
        't1': 'var(--t1)',
        't2': 'var(--t2)',
        't3': 'var(--t3)',
        't4': 'var(--t4)',
        'border-base':  'var(--border)',
        'border-light': 'var(--border-light)',
        // Cores dos personagens
        'c-makima':  'var(--c-makima)',
        'c-nami':    'var(--c-nami)',
        'c-frieren': 'var(--c-frieren)',
        'c-kaguya':  'var(--c-kaguya)',
        'c-kurisu':  'var(--c-kurisu)',
        'c-journal': 'var(--c-journal)',
      },
    },
  },
  plugins: [],
}
