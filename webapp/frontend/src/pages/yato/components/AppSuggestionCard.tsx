/**
 * AppSuggestionCard.tsx — Yato · Viagens (fatia 066)
 *
 * Ticket kraft pequeno. Selo "cobertura declarada — confirmar in-app" é
 * OBRIGATÓRIO e permanente — inclusive para Uber e 99 (FR-015, regra §10.8).
 */

import type { MobilityApp } from '../types'

const KIND_LABEL: Record<string, string> = {
  app_corrida: 'app de corrida', transporte_publico: 'transporte público', taxi: 'táxi',
}

const SCOPE_LABEL: Record<string, string> = {
  nacional: 'Cobertura declarada em todo o país.',
  regiao: 'Cobertura declarada regional.',
  uf: 'Cobertura declarada no estado.',
  cidades: 'Cobertura declarada nesta cidade.',
}

interface AppSuggestionCardProps {
  app: MobilityApp
}

export function AppSuggestionCard({ app }: AppSuggestionCardProps) {
  return (
    <div className="app-card">
      <div className="app-name">
        {app.url ? <a href={app.url} target="_blank" rel="noreferrer">{app.name}</a> : app.name}
        <span className="app-kind">{KIND_LABEL[app.kind] || app.kind}</span>
      </div>
      <div className="app-cov">{SCOPE_LABEL[app.coverage_scope] || 'Cobertura declarada.'}</div>
      <div className="app-seal">⚑ {app.label}</div>
    </div>
  )
}
