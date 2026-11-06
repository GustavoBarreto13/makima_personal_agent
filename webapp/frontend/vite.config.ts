import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync } from 'node:fs'

// Push no app Android só funciona se o Firebase estiver configurado no projeto nativo. Sem o
// google-services.json, o plugin lança uma exceção NATIVA em register() e o Android derruba o app.
// Por isso o build descobre sozinho se o arquivo existe e o front só tenta o push nesse caso.
const PUSH_ENABLED = existsSync(new URL('./android/app/google-services.json', import.meta.url))

// Configuração do Vite — bundler de frontend para React.
// Em desenvolvimento (npm run dev), o Vite serve os arquivos em modo HMR (Hot Module Replacement),
// atualizando o browser automaticamente a cada mudança no código.
export default defineConfig({
  define: { __PUSH_ENABLED__: JSON.stringify(PUSH_ENABLED) },
  plugins: [
    react(),
    // PWA: gera o service worker (sw.js) no build. O "ajudante" guarda os arquivos do app e
    // algumas leituras da API para abrir rápido e funcionar sem internet (docs/planos/app_android, Etapa 1).
    VitePWA({
      // 'prompt' = quando sai versão nova, o app avisa e o usuário escolhe atualizar (src/pwa/PwaPrompt.tsx).
      registerType: 'prompt',
      // O registro é feito à mão em src/pwa/register.ts (só em produção).
      injectRegister: false,
      // O manifesto já existe em public/manifest.webmanifest — o plugin não gera outro.
      manifest: false,
      workbox: {
        // Arquivos do app que entram no cache logo na instalação. As imagens grandes dos
        // personagens ficam de fora: são guardadas sob demanda (regra de imagens abaixo).
        globPatterns: ['**/*.{js,css,html,woff2}', 'pwa-*.png', 'apple-touch-icon.png', 'favicon.png'],
        cleanupOutdatedCaches: true,
        // Rotas do React Router (/tasks, /nami…) devolvem o index.html do cache quando offline,
        // mas NUNCA a API, o login nem os uploads.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/uploads\//],
        runtimeCaching: [
          {
            // Leituras da API: rede primeiro (dado fresco); se a rede falhar em 4s, usa a cópia.
            // Só Kaguya (tarefas/agenda), Yato (viagens) e o hub — úteis offline. De PROPÓSITO
            // fora da lista: diário (Violet), finanças (Nami) e pessoas (Komi), que são sensíveis
            // e não devem ficar guardados no aparelho. /auth nunca é guardado.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /^\/api\/(tasks|travel|hub)(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'makima-api', // nome usado por clearOfflineData() em src/pwa/register.ts
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Imagens do próprio site (personagens, capas): cache primeiro, atualiza em 30 dias.
            urlPattern: ({ url, request }) =>
              request.destination === 'image' && url.origin === self.location.origin,
            handler: 'CacheFirst',
            options: {
              cacheName: 'makima-images',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Proxy para a API em dev: /api/* → FastAPI na porta 8000
    // Sem isso, o navegador bloquearia as requisições por CORS (origens diferentes).
    // O Vite age como intermediário, repassando as chamadas para o backend.
    proxy: {
      '/api': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
    },
  },
  // Vitest: lógica pura roda em node; testes de componente declaram `// @vitest-environment jsdom`.
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
