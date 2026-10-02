// Atalhos de teclado do Design System — lógica pura (sem DOM).
//
// Regras:
//   - Padrão Windows: `mod` = Ctrl (aceita também ⌘ do Mac). Exibição via formatShortcut().
//   - Atalhos são ACELERADORES, nunca o único caminho: toda ação existe também como botão ou comando.
//   - Atalhos de uma tecla só valem quando o foco NÃO está num campo de texto.

export interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export interface ShortcutDef {
  /** Combinação, ex.: 'mod+k', 'n', 'g h', '?'. "g h" = sequência (g, depois h). */
  keys: string
  /** Texto exibido na lista de atalhos. */
  label: string
  /** Disponível mesmo com foco em campo de texto (ex.: Ctrl+K, Esc). */
  global?: boolean
  /** id do comando equivalente: toda ação com atalho também existe como botão/comando. */
  command: string
}

/** Catálogo oficial: a lista da seção "Atalhos" das preferências vem daqui. */
export const SHORTCUTS: ShortcutDef[] = [
  { keys: 'mod+k', label: 'Paleta de comandos', global: true, command: 'palette.open' },
  { keys: 'mod+enter', label: 'Salvar o formulário aberto', global: true, command: 'form.save' },
  { keys: 'mod+z', label: 'Desfazer a última ação', command: 'undo' },
  { keys: 'n', label: 'Ação primária (novo)', command: 'primary.new' },
  { keys: '/', label: 'Buscar', command: 'search.focus' },
  { keys: 'g h', label: 'Ir para o Início', command: 'nav.home' },
  { keys: 'g t', label: 'Ir para a lista principal', command: 'nav.list' },
  { keys: 'g e', label: 'Ir para as estatísticas', command: 'nav.stats' },
  { keys: '?', label: 'Abrir preferências e atalhos', command: 'prefs.open' },
  { keys: 'esc', label: 'Fechar', global: true, command: 'close' },
]

/** O elemento focado aceita digitação? (Atalhos de uma tecla devem ser ignorados.) */
export function isTypingTarget(tag: string | undefined, editable: boolean): boolean {
  return editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** O evento casa com uma combinação simples ('mod+k', 'n', '?', 'esc', 'mod+enter')? */
export function matchShortcut(e: KeyLike, combo: string): boolean {
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  const wantMod = parts.includes('mod')
  const wantAlt = parts.includes('alt')
  const wantShift = parts.includes('shift')
  const k = e.key.toLowerCase()
  const keyName = key === 'esc' ? 'escape' : key
  if (k !== keyName) return false
  const hasMod = e.ctrlKey || e.metaKey
  if (wantMod !== hasMod) return false
  if (wantAlt !== e.altKey) return false
  // Shift só é exigido quando pedido; caracteres como '?' já vêm com shift embutido na tecla.
  if (wantShift && !e.shiftKey) return false
  return true
}

/** Máquina da sequência "g" + letra. Devolve a nova espera e, se completou, a letra. */
export function stepSequence(
  state: { pending: boolean; at: number },
  e: KeyLike,
  now: number,
  windowMs = 900,
): { state: { pending: boolean; at: number }; completed: string | null } {
  const k = e.key.toLowerCase()
  if (state.pending && now - state.at <= windowMs && k.length === 1 && k !== 'g') {
    return { state: { pending: false, at: 0 }, completed: k }
  }
  if (k === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) return { state: { pending: true, at: now }, completed: null }
  return { state: { pending: false, at: 0 }, completed: null }
}
