/**
 * types.ts — Makima · Hub (Centro de Controle, fatia 023)
 *
 * Interfaces TypeScript do domínio do Hub. Descrevem tanto os dados estáticos
 * de cada card de agente (definidos em data.ts) quanto o payload de stats reais
 * que vem do endpoint agregador `/api/hub/summary` (consumido por makimaApi.ts).
 *
 * A separação é proposital: o que é fixo (nome, role, descrição, cores, rota)
 * vive em `Agent`; o que muda com o banco (os dois números/labels) vive em
 * `AgentSummary` e é mesclado em tempo de render no MakimaShell.
 */

// ── Stat (valor já formatado) ───────────────────────────────────────────────

/**
 * Um stat individual de um card.
 * O backend formata os números (ex.: "+R$ 2.480", "47%") — o frontend NÃO faz
 * formatação numérica, apenas exibe `v` em destaque e `k` como label mono.
 */
export interface Stat {
  v: string  // Valor pronto para exibir (string já formatada pelo backend)
  k: string  // Label curto em fonte mono (ex.: "saldo do mês")
}

// ── AgentAction (botão de ação de um card) ─────────────────────────────────

/**
 * Uma ação de um card (botão primário ou ghost).
 * `href` é a rota SPA interna do app (ex.: `/nami`) — navegada via <Link>,
 * NUNCA um arquivo `.html`. `icon` é o nome de um ícone em icons.tsx.
 */
export interface AgentAction {
  label: string  // Texto do botão (ex.: "Adicionar transação")
  href: string   // Rota SPA interna (ex.: "/nami")
  icon: string   // Nome do ícone em icons.tsx (ex.: "plus")
}

// ── Agent (card estático, sem os stats) ────────────────────────────────────

/**
 * Descreve cada card de agente do roster — apenas a parte estática.
 * Os stats (`stat` / `stat2`) NÃO ficam aqui: vêm da API em tempo de execução
 * e são resolvidos pelo MakimaShell a partir do `HubSummary`.
 */
export interface Agent {
  id: string             // Identificador estável (ex.: "nami") — chave no HubSummary
  name: string           // Nome exibido (ex.: "Nami")
  role: string           // Domínio em mono (ex.: "Finanças")
  img: string            // Caminho absoluto do retrato em public/ (ex.: "/nami.png")
  href: string           // Rota SPA do agente (usada pelo botão "abrir" ↗)
  does: string           // Frase curta descrevendo o que o agente faz
  action: AgentAction    // Ação primária (botão de fundo colorido)
  action2?: AgentAction  // Ação secundária opcional (botão ghost) — ex.: Kaguya
  accent: string         // Cor de acento OKLCH (--ac) — barra, glow, botão
  accentText: string     // Cor de acento para texto OKLCH (--ac-t) — role, ênfases
}

// ── AgentSummary (payload de stats de um agente vindo da API) ──────────────

/**
 * Os dois stats de um agente, conforme retornados por `/api/hub/summary`.
 * Sempre que o backend conseguir calcular, devolve este objeto; em caso de
 * falha isolada daquele agente, a chave correspondente vem `null` (ver HubSummary).
 */
export interface AgentSummary {
  stat: Stat   // Stat principal (ex.: saldo do mês)
  stat2: Stat  // Stat secundário (ex.: lançamentos na semana)
}

// ── HubSummary (resposta completa do endpoint) ─────────────────────────────

/**
 * Resposta de `/api/hub/summary`: um mapa chave-de-agente → stats.
 * As chaves esperadas são: nami, frieren, komi, violet, kaguya, mai, marin, akane.
 * O valor é `null` quando aquele agente falhou no backend (REQ-15) — nesse caso
 * o card cai no fallback gracioso ("—") sem quebrar.
 */
export type HubSummary = Record<string, AgentSummary | null>

// ── HeroCopy (textos do hero) ──────────────────────────────────────────────

/**
 * Toda a copy editorial do hero da Makima.
 * Textos fixos extraídos do handoff (data.js → window.MAKIMA.copy).
 */
export interface HeroCopy {
  kicker: string     // Kicker mono amarelo (ex.: "CENTRO DE CONTROLE")
  role: string       // Papel da Makima (ex.: "Orquestradora")
  hello: string      // Saudação itálica (ex.: "Bom te ver de volta.")
  lead: string       // Frase-âncora em destaque na tagline
  manifesto: string  // Parágrafo de manifesto
  tagline: string    // Complemento da tagline
  footer: string     // Texto do rodapé (ex.: "Tudo sob controle.")
}
