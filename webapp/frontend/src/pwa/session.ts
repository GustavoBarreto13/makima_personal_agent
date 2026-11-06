// Verificação de sessão que entende "sem conexão".
//
// Problema: ao abrir o app/PWA SEM internet, a chamada /auth/me falha e o App tratava qualquer
// falha como "não logado" — mostrando a tela de login em vez das telas que estão em cache.
// Aqui separamos três situações:
//   - 'user'      → sessão válida (guardamos o usuário para uso offline);
//   - 'anonymous' → o servidor respondeu 401/403: precisa logar (e apagamos os dados guardados);
//   - 'offline'   → não deu para falar com o servidor (rede caiu, servidor reiniciando…): se já
//                   houve um login nesta máquina, segue com o último usuário conhecido.
// Isso NÃO libera dado nenhum: a API continua exigindo sessão em cada chamada; offline só se vê
// o que já estava em cache no aparelho.

import { ApiError } from '../lib/api'
import type { Storage } from '../design/core/ports'

export interface SessionUser {
  email: string
  name: string
}

export type SessionCheck =
  | { kind: 'user'; user: SessionUser }
  | { kind: 'anonymous' }
  // `reason`: 'network' = sem internet; 'server' = o servidor respondeu erro (5xx) — mensagens diferentes na tela.
  | { kind: 'offline'; user: SessionUser | null; reason: 'network' | 'server' }

/** Chave do último usuário conhecido (só nome e e-mail — nunca token ou cookie). */
export const LAST_USER_KEY = 'makima-last-user'

/** O erro significa "o servidor disse que não há sessão válida"? (e não "não consegui falar com ele") */
export function isAuthRejection(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403)
}

/**
 * Descobre o estado da sessão chamando `fetchMe` (normalmente `api.get('/auth/me')`).
 *
 * @param fetchMe - Função que consulta o usuário logado no servidor.
 * @param storage - Onde guardar/ler o último usuário (porta `Storage` do Design System).
 * @param onSignedOut - Chamado quando o servidor recusa a sessão (limpar caches do aparelho).
 */
export async function checkSession(
  fetchMe: () => Promise<SessionUser>,
  storage: Storage,
  onSignedOut: () => void = () => {},
): Promise<SessionCheck> {
  try {
    const user = await fetchMe()
    storage.set(LAST_USER_KEY, JSON.stringify({ email: user.email, name: user.name }))
    return { kind: 'user', user }
  } catch (err) {
    if (isAuthRejection(err)) {
      storage.remove(LAST_USER_KEY)
      onSignedOut()
      return { kind: 'anonymous' }
    }
    const reason = err instanceof ApiError && err.status >= 500 ? 'server' : 'network'
    return { kind: 'offline', user: readLastUser(storage), reason }
  }
}

/** Lê o último usuário guardado; devolve null se não houver ou estiver corrompido. */
export function readLastUser(storage: Storage): SessionUser | null {
  try {
    const raw = storage.get(LAST_USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.email === 'string' ? { email: parsed.email, name: String(parsed.name ?? '') } : null
  } catch {
    return null
  }
}
