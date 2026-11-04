// Links profundos do app: `makima://<agente>/<caminho…>` → rota do React Router.
//
// Usados quando algo de fora do app aponta para uma tela: toque numa notificação push
// (campo `link` enviado pelo backend), atalho do ícone, widget. O formato é de propósito simples:
//
//   makima://kaguya               → /tasks
//   makima://frieren/livro/12     → /books#livro/12
//   makima://kaguya/lista/7       → /tasks#lista/7
//
// A primeira parte é o agente (mapeada para a rota dele em design/agents.json); o resto vira o
// "hash" que cada shell já usa para navegar por dentro (#livro/<id>, #lista/<id>…). Assim o
// vocabulário de cada tela continua sendo do próprio shell — este módulo não precisa conhecê-lo.

import { AGENTS } from '../design/core/agents'

/** Esquema aceito. */
const SCHEME = 'makima://'

/** Cada parte do caminho: letras, números, `_`, `-`, `.` e `~` — nada que escape da rota. */
const SAFE_SEGMENT = /^[\w.~-]+$/

/** `.` e `..` são válidos pelo padrão acima, mas significam "subir de pasta": recusamos. */
const isDotSegment = (p: string) => /^\.+$/.test(p)

/** Rotas por id de agente (só os ativos). 'makima' é o hub (`/`). */
const ROUTES: Record<string, string> = Object.fromEntries(
  AGENTS.filter((a) => a.status === 'active').map((a) => [a.id, a.route]),
)

/**
 * Converte um deep link em rota interna.
 *
 * @param link - URL recebida (ex.: 'makima://frieren/livro/12').
 * @returns Rota para o `navigate()` do React Router, ou `null` se o link não for válido/seguro.
 *
 * @example
 *   parseDeepLink('makima://frieren/livro/12') // '/books#livro/12'
 *   parseDeepLink('https://evil.com')          // null
 */
export function parseDeepLink(link: string): string | null {
  if (typeof link !== 'string' || link.length > 300) return null
  if (!link.toLowerCase().startsWith(SCHEME)) return null

  // Tira query (?x=y) e fragmento (#…) que alguém tenha colocado: não fazem parte do formato.
  const semQuery = link.slice(SCHEME.length).split(/[?#]/)[0]
  const [agente, ...resto] = semQuery.split('/').filter(Boolean)
  if (!agente) return null

  const rota = ROUTES[agente.toLowerCase()]
  if (rota === undefined) return null

  if (!resto.every((p) => SAFE_SEGMENT.test(p) && !isDotSegment(p))) return null
  return resto.length ? `${rota}#${resto.join('/')}` : rota
}
