/**
 * data.ts — Makima · Hub (Centro de Controle, fatia 023)
 *
 * Dados ESTÁTICOS do Hub: a copy do hero e os 8 cards de agente. Portado
 * fielmente do handoff de design (`design_handoff_makima_hub/makima/data.js`),
 * com duas adaptações deliberadas ao app real:
 *
 *   1. Os `href` apontam para as ROTAS SPA internas (ex.: `/nami`), não para os
 *      arquivos `.html` do protótipo — a navegação é feita com <Link> do
 *      react-router (REQ-10).
 *   2. Os `img` apontam para os retratos servidos de `public/` por caminho
 *      absoluto (ex.: `/nami.png`); Kaguya mantém `.jpg`.
 *
 * Os stats (stat/stat2) NÃO ficam aqui — são reais e vêm de `/api/hub/summary`,
 * resolvidos no MakimaShell em tempo de render.
 */

import type { Agent, HeroCopy } from './types'

// ── Copy do hero ────────────────────────────────────────────────────────────

/**
 * Textos editoriais do hero da Makima — exatamente como no handoff (data.js).
 * A voz é calma, precisa, no controle: ela orquestra; os 8 agentes executam.
 */
export const HERO_COPY: HeroCopy = {
  kicker: 'CENTRO DE CONTROLE',
  role: 'Orquestradora',
  hello: 'Bom te ver de volta.',
  lead: 'Cada parte da sua vida tem uma responsável.',
  manifesto:
    'Dinheiro, leituras, pessoas, tempo, histórias — nada fica solto, nada se perde. ' +
    'Cada agente cuida do que importa no seu domínio. Eu mantenho todas em ordem ' +
    'para que você só precise decidir o que de fato importa.',
  tagline: 'Oito agentes cuidam de tudo. Eu cuido delas.',
  footer: 'Tudo sob controle.',
}

// ── Retrato da Makima ───────────────────────────────────────────────────────

/** Caminho absoluto do retrato recortado da Makima, servido de public/. */
export const MAKIMA_IMG = '/makima.png'

// ── Os 8 agentes (cards do roster) ──────────────────────────────────────────

/**
 * Os 8 cards de agente, na ordem do handoff:
 * Nami → Frieren → Komi → Violet → Kaguya → Mai → Marin → Akane.
 *
 * Cada par accent/accentText usa os valores OKLCH EXATOS do SPEC (REQ-5).
 * Não alterar esses valores sem revisar o handoff — eles definem a identidade
 * cromática de cada domínio nos cards (barra de acento, glow, botão primário).
 */
export const AGENTS: Agent[] = [
  // 01 · Nami — Finanças (laranja/âmbar)
  {
    id: 'nami',
    name: 'Nami',
    role: 'Finanças',
    img: '/nami.png',
    href: '/nami',
    does: 'Controla cada real — contas, cartões, orçamentos e o saldo do mês.',
    action: { label: 'Adicionar transação', href: '/nami', icon: 'plus' },
    accent: 'oklch(0.74 0.168 57)',
    accentText: 'oklch(0.80 0.150 62)',
  },
  // 02 · Frieren — Livros (verde-água / teal)
  {
    id: 'frieren',
    name: 'Frieren',
    role: 'Livros',
    img: '/frieren.png',
    href: '/books',
    does: 'Guarda tudo que você lê — catálogo, progresso e o que vem depois.',
    action: { label: 'Registrar leitura', href: '/books', icon: 'book' },
    accent: 'oklch(0.77 0.118 184)',
    accentText: 'oklch(0.82 0.110 184)',
  },
  // 03 · Komi — Pessoas (violeta / índigo)
  {
    id: 'komi',
    name: 'Komi',
    role: 'Pessoas',
    img: '/komi.png',
    href: '/people',
    does: 'Cuida das suas relações — datas, contatos e quem anda sumido.',
    action: { label: 'Adicionar pessoa', href: '/people', icon: 'user' },
    accent: 'oklch(0.70 0.135 276)',
    accentText: 'oklch(0.78 0.125 276)',
  },
  // 04 · Violet — Diário (azul aço)
  {
    id: 'violet',
    name: 'Violet',
    role: 'Diário',
    img: '/violet.png',
    href: '/journal',
    does: 'Escreve com você — registra os dias e o que eles significaram.',
    action: { label: 'Nova entrada', href: '/journal', icon: 'pen' },
    accent: 'oklch(0.70 0.088 253)',
    accentText: 'oklch(0.78 0.090 253)',
  },
  // 05 · Kaguya — Tarefas · Agenda (rosa / magenta) — único com action2 (ghost)
  {
    id: 'kaguya',
    name: 'Kaguya',
    role: 'Tarefas · Agenda',
    img: '/kaguya.jpg',
    href: '/tasks',
    does: 'Comanda seu tempo — tarefas, hábitos e a agenda da semana.',
    action: { label: 'Nova tarefa', href: '/tasks', icon: 'check' },
    action2: { label: 'Abrir agenda', href: '/tasks', icon: 'calendar' },
    accent: 'oklch(0.72 0.165 340)',
    accentText: 'oklch(0.80 0.150 340)',
  },
  // 06 · Mai — Séries (roxo)
  {
    id: 'mai',
    name: 'Mai',
    role: 'Séries',
    img: '/mai.png',
    href: '/series',
    does: 'Acompanha suas séries — temporadas, episódios e notas.',
    action: { label: 'Adicionar série', href: '/series', icon: 'tv' },
    accent: 'oklch(0.70 0.120 292)',
    accentText: 'oklch(0.78 0.115 292)',
  },
  // 07 · Marin — Animes (azul ciano)
  {
    id: 'marin',
    name: 'Marin',
    role: 'Animes',
    img: '/marin.png',
    href: '/animes',
    does: 'Sua estante de animes — temporada atual, progresso e wishlist.',
    action: { label: 'Adicionar anime', href: '/animes', icon: 'sparkle' },
    accent: 'oklch(0.74 0.16 210)',
    accentText: 'oklch(0.84 0.14 208)',
  },
  // 08 · Akane — Filmes (ciano escuro / petróleo)
  {
    id: 'akane',
    name: 'Akane',
    role: 'Filmes',
    img: '/akane.png',
    href: '/movies',
    does: 'Seu diário de cinema — filmes vistos, notas e o que assistir.',
    action: { label: 'Marcar filme', href: '/movies', icon: 'film' },
    accent: 'oklch(0.66 0.115 196)',
    accentText: 'oklch(0.79 0.10 192)',
  },
]
