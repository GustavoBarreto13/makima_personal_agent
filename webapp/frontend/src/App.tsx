// Componente raiz da aplicação Makima.
// Gerencia o estado de autenticação e configura o roteamento de páginas.
// Ao carregar, verifica com o backend se o usuário está autenticado via cookie de sessão.
// Se autenticado, renderiza o layout completo com sidebar e as rotas de cada página.

import { Suspense, lazy, useEffect, useState } from 'react'  // Hooks do React: efeito colateral, estado local e carregamento sob demanda
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'  // Roteamento de páginas SPA

import Login         from './pages/Login'               // Tela de login com botão "Entrar com Google"
import { FrierenShell } from './pages/frieren/FrierenShell'  // Shell de livros (Frieren, no Design System desde a spec 073)
import { VioletShell } from './pages/violet/VioletShell'     // Shell do diário Violet
import { NamiShell }   from './pages/nami/NamiShell'         // Shell completo da seção de finanças (redesign)
import { KaguyaNextShell } from './pages/kaguya-next/KaguyaNextShell'  // Kaguya no Design System (spec 075) — convive com /tasks até a troca
import { KaguyaShell } from './pages/kaguya/KaguyaShell'      // Shell de tarefas (sistema próprio, spec 011)
import { AkaneShell }  from './pages/akane/AkaneShell'         // Shell de filmes (cinemateca pessoal, spec 015; no Design System desde a spec 072)
import { MarinShell }  from './pages/marin/MarinShell'         // Shell de animes (catálogo Marin, spec 021)
import { MaiShell }   from './pages/mai/MaiShell'              // Shell de séries de TV (Mai Sakurajima, spec 022)
import { KomiShell }  from './pages/komi/KomiShell'            // Shell de pessoas e contatos (Komi, spec 014)
import { YatoShell }  from './pages/yato/YatoShell'            // Shell de viagens (Yato, spec 066)
import { MakimaShell } from './pages/makima/MakimaShell'        // Hub central da Makima — rota / em tela cheia (spec 023)

// Referência viva do Design System (agente fictício). Carregada sob demanda: o CSS do padrão só vai
// para o navegador quando /design é aberta, então nada muda nos shells existentes.
const DesignShell = lazy(() => import('./pages/design/DesignShell').then((m) => ({ default: m.DesignShell })))

import { api } from './lib/api'                          // Wrapper de fetch com cookie de sessão automático

// Tipo que representa os dados do usuário retornados pelo endpoint /auth/me
interface User {
  email: string  // Email da conta Google autenticada
  name: string   // Nome completo da conta Google
}

function App() {
  // Estado do usuário: null = não autenticado, objeto User = autenticado
  const [user, setUser] = useState<User | null>(null)

  // Estado de carregamento: true enquanto verificamos a sessão com o backend
  // Evita "flash" de tela de login antes de confirmar que o usuário está autenticado
  const [loading, setLoading] = useState(true)

  // useEffect executa a função uma única vez após o componente montar (array vazio = sem dependências).
  // Aqui usamos para verificar se o cookie de sessão é válido ao abrir a página.
  useEffect(() => {
    // Chama o endpoint /auth/me — retorna 200 com dados do usuário ou 401 se não autenticado
    api.get<User>('/auth/me')
      .then((userData) => {
        // Usuário autenticado: salva os dados no estado
        setUser(userData)
      })
      .catch(() => {
        // 401 ou qualquer erro: trata como não autenticado
        // (o api.get lança Error para status não-2xx)
        setUser(null)
      })
      .finally(() => {
        // Em ambos os casos (sucesso ou erro), termina o carregamento
        setLoading(false)
      })
  }, []) // Array vazio: executa só uma vez, na montagem do componente

  // Enquanto verifica a sessão, mostra uma tela de carregamento neutra.
  // Isso evita que o usuário veja um flash da tela de login antes de ser redirecionado.
  if (loading) {
    return (
      // Tela de carregamento: fundo escuro com spinner centralizado
      <div className="min-h-screen flex items-center justify-center bg-bg-app text-t1">
        {/* Spinner animado: borda com cor parcial que gira */}
        <div className="w-8 h-8 border-2 border-border-base border-t-t3 rounded-full animate-spin" />
      </div>
    )
  }

  // Se o usuário não está autenticado, mostra a tela de login
  if (!user) {
    return <Login />
  }

  // Usuário autenticado: configura o roteamento com BrowserRouter.
  // BrowserRouter habilita navegação SPA usando a History API do navegador (sem recarregamento de página).
  // Layout envolve todas as rotas, garantindo que sidebar e header apareçam em todas as páginas.
  return (
    <BrowserRouter>
      <Routes>
        {/* Frieren (livros) sobre o AppShell do Design System; a tela e o livro aberto vivem no hash (#livro/<id>). */}
        <Route path="/books/*" element={<FrierenShell />} />
        {/* A prévia /books-next virou o shell oficial (spec 073): quem tinha o link salvo cai em /books. */}
        <Route path="/books-next/*" element={<Navigate to="/books" replace />} />

        {/* Violet · Diário tem seu próprio shell com sidebar e tokens OKLCH isolados. */}
        <Route path="/journal/*" element={<VioletShell />} />

        {/* Nami (redesign) tem seu próprio shell com sidebar temática, tweaks e navegação por hash.
            Deve vir ANTES da rota /* para não ser capturado pelo catch-all. */}
        <Route path="/nami/*" element={<NamiShell />} />

        {/* Kaguya · Tarefas — shell próprio com sidebar do domínio e navegação por estado.
            Antes do catch-all /* para o shell assumir as sub-rotas de /tasks. */}
        <Route path="/tasks/*" element={<KaguyaShell />} />
        <Route path="/tasks-next/*" element={<KaguyaNextShell />} />

        {/* Akane · Filmes — cinemateca pessoal estilo Letterboxd (spec 015).
            Antes do catch-all /* para o shell assumir as sub-rotas de /movies. */}
        <Route path="/movies/*" element={<AkaneShell />} />
        {/* A prévia /movies-next virou o shell oficial (spec 072): quem tinha o link salvo cai em /movies. */}
        <Route path="/movies-next/*" element={<Navigate to="/movies" replace />} />

        {/* Marin · Animes — catálogo de animes com sync MAL e diário de episódios (spec 021).
            Antes do catch-all /* para o shell assumir as sub-rotas de /animes. */}
        <Route path="/animes/*" element={<MarinShell />} />

        {/* Mai · Séries de TV — catálogo com TMDB e diário de episódios (spec 022).
            Antes do catch-all /* para o shell assumir as sub-rotas de /series. */}
        <Route path="/series/*" element={<MaiShell />} />

        {/* Komi · Pessoas — identidade canônica de pessoas e contatos (spec 014).
            Antes do catch-all /* para o shell assumir as sub-rotas de /people. */}
        <Route path="/people/*" element={<KomiShell />} />

        {/* Yato · Viagens — roteiro, dossiê de mobilidade e orçamento (spec 066).
            Antes do catch-all /* para o shell assumir as sub-rotas de /travel. */}
        <Route path="/travel/*" element={<YatoShell />} />

        {/* Design System Makima — página de referência (tokens, componentes, estados) com agente fictício.
            Antes do catch-all /* para não ser capturada por ele. */}
        <Route path="/design" element={<Suspense fallback={null}><DesignShell /></Suspense>} />

        {/* Makima · Hub — Centro de Controle em tela cheia (spec 023).
            Rota exata `/`, renderizada SEM o Layout/sidebar global. Deve vir
            antes do catch-all /* para não ser capturada por ele. */}
        <Route path="/" element={<MakimaShell />} />

        {/* Endereços antigos das finanças (antes da nova Nami): levam à tela equivalente, para não quebrar atalhos salvos. */}
        <Route path="/transactions" element={<Navigate to="/nami#lancamentos" replace />} />
        <Route path="/accounts" element={<Navigate to="/nami#contas" replace />} />
        <Route path="/cards" element={<Navigate to="/nami#cartoes" replace />} />
        <Route path="/loans" element={<Navigate to="/nami#emprestimos" replace />} />
        <Route path="/budgets" element={<Navigate to="/nami#orcamentos" replace />} />
        <Route path="/subscriptions" element={<Navigate to="/nami#recorrentes" replace />} />

        {/* Qualquer outro endereço volta para o Hub. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// Exporta o componente para ser usado em main.tsx
export default App
