import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuração do Vite — bundler de frontend para React.
// Em desenvolvimento (npm run dev), o Vite serve os arquivos em modo HMR (Hot Module Replacement),
// atualizando o browser automaticamente a cada mudança no código.
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy para a API em dev: /api/* → FastAPI na porta 8000
    // Sem isso, o navegador bloquearia as requisições por CORS (origens diferentes).
    // O Vite age como intermediário, repassando as chamadas para o backend.
    proxy: {
      '/api': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
    },
  },
})
