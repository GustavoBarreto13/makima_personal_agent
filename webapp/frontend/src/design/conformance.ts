// Manifesto de conformidade: cada página declara o que já adotou do padrão (dados em conformance.json).
// O `npm run audit:design` confere o manifesto contra o código (a página declarada "conformant" tem
// que realmente usar AppShell, Hero, useCollection etc.) e gera webapp/docs/DESIGN_CONFORMANCE.md.
//
// Política:
//   legacy      só aparece no relatório; não falha o build.
//   migrating   falha o lint estático dos arquivos da página.
//   conformant  falha em QUALQUER item: nenhuma página "volta" a sair do padrão depois de migrada.
//
// Ao migrar uma página: troque o status e preencha os campos em conformance.json. A skill
// makima-design-system faz isso e roda a auditoria.

import data from './conformance.json'
import type { AgentId } from './core/agents'

export type ConformanceStatus = 'legacy' | 'migrating' | 'conformant'

export interface PageConformance {
  status: ConformanceStatus
  /** Pasta da página (relativa à raiz do frontend). */
  dir: string
  /** Arquivo do shell da página. */
  shell: string
  /** Estilo de arte escolhido pelo usuário (null = ainda não perguntado; 'default' = padrão Makima). */
  art: string | null
  /** Usa <AppShell> (sidebar + topbar + Voltar à Makima + seletor de agentes). */
  appShell: boolean
  /** A tela Início abre com <Hero>. */
  hero: boolean
  /** Tema global (useTheme), sem toggle próprio. */
  theme: boolean
  /** Ícones só do design/ (Icon), sem arquivo de ícones local e sem emoji de UI. */
  icons: boolean
  /** Coleções que usam useCollection (scope dos esquemas). */
  collections: string[]
  /** Captura rápida do domínio (id) ou null se o domínio não tem criação frequente. */
  quickCapture: string | null
  /** Tela de estatísticas no <StatsPage> e as métricas que ela cobre. */
  stats: { page: boolean; metrics: string[] }
  /** Detalhe no <DetailPage>. */
  detail: boolean
  /** Preferências no <PreferencesPanel> (sem TweaksPanel próprio). */
  prefs: boolean
  /** Atalhos e paleta Ctrl+K do AppShell. */
  hotkeys: boolean
  /** Funciona no celular (gaveta, barra inferior, FAB). */
  mobile: boolean
}

export const CONFORMANCE = data.pages as Record<AgentId | 'design', PageConformance>

/** Métricas mínimas de estatísticas por domínio (o que "faz sentido"; vale para toda feature nova). */
export const STATS_REQUIRED = data.statsRequired as Partial<Record<AgentId | 'design', string[]>>
