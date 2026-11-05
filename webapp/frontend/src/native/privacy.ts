// Privacidade das telas sensíveis: Diário (Violet) e Finanças (Nami).
//
// Nessas rotas o app bloqueia print/gravação de tela e esconde a prévia no seletor de "apps recentes".
// Nas outras o print funciona normalmente.

/** Prefixos de rota considerados sensíveis. */
const SENSITIVE_PREFIXES = ['/journal', '/nami']

/**
 * A rota é sensível (diário ou finanças)?
 *
 * @param pathname - Caminho atual (ex.: '/journal', '/nami/contas').
 *
 * @example
 *   isSensitiveRoute('/journal')  // true
 *   isSensitiveRoute('/journalx') // false  (não confunde com prefixo parcial)
 */
export function isSensitiveRoute(pathname: string): boolean {
  return SENSITIVE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
