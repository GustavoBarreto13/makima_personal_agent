// Registro de comandos e buscas da paleta (Ctrl+K). Cada shell registra um provedor
// { commands, search }; a paleta junta todos. Sem shell aberto, busca em todos os provedores.

import { useEffect, useSyncExternalStore } from 'react'

export interface Command {
  id: string
  label: string
  group?: string
  /** Nome de ícone do registro (ui/icons). */
  icon?: string
  /** Atalho exibido (ex.: 'n', 'g h', 'mod+k'). */
  shortcut?: string
  keywords?: string
  run: () => void
}

export interface SearchResult {
  id: string
  label: string
  group: string
  icon?: string
  run: () => void
}

export interface CommandProvider {
  id: string
  commands?: Command[]
  /** Busca por texto (itens do domínio). Deve ser síncrona e barata. */
  search?: (query: string) => SearchResult[]
}

let providers: CommandProvider[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function registerProvider(p: CommandProvider): () => void {
  providers = [...providers.filter((x) => x.id !== p.id), p]
  emit()
  return () => {
    providers = providers.filter((x) => x !== p)
    emit()
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => providers

export function useProviders(): CommandProvider[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Registra um provedor enquanto o componente estiver montado. */
export function useCommandProvider(provider: CommandProvider): void {
  useEffect(() => registerProvider(provider), [provider])
}

/** Filtra comandos por texto (rótulo + palavras-chave), sem acentos. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = fold(query.trim())
  if (!q) return commands
  return commands.filter((c) => fold(`${c.label} ${c.keywords ?? ''}`).includes(q))
}
