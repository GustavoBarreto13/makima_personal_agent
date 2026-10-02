// Ponto de entrada do React — inicializa a aplicação e a renderiza na página HTML.
// Este arquivo é o primeiro a ser executado quando o browser carrega o app.

import { StrictMode } from 'react'        // Modo estrito: detecta problemas em desenvolvimento
import { createRoot } from 'react-dom/client'  // Cria a raiz do React no DOM
import './index.css'                        // Importa os estilos globais (Tailwind)
import App from './App.tsx'                 // Componente principal da aplicação
import { initTheme } from './design/headless/useTheme'  // Tema global claro/escuro/sistema do Design System

// Aplica o tema salvo (data-ds-theme no <html>) antes do primeiro render. O index.html já faz o mesmo
// em um script inline para não piscar; aqui garante o estado do hook.
initTheme()

// Busca o elemento <div id="root"> no HTML e monta o React dentro dele.
// O '!' no final diz ao TypeScript: "tenho certeza que este elemento existe"
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* StrictMode renderiza cada componente duas vezes em dev para detectar efeitos colaterais */}
    <App />
  </StrictMode>,
)
