// Helpers puros de busca por texto, usados por todas as telas filtráveis da Akane
// (Filmes, Diário, Watchlist, Listas, Etiquetas). A busca é sempre client-side —
// o backend não expõe um parâmetro de texto em /api/movies (ver ROADMAP/plano da
// caixa de pesquisa), então cada tela filtra o array que já carregou.

/**
 * Normaliza um texto para comparação: minúsculas + remove acentos.
 *
 * Sem isso, buscar "aviao" não encontraria "Avião" — o usuário não deveria
 * precisar digitar o acento certo para achar um filme.
 *
 * Args:
 *     text: Texto a normalizar (pode ser vazio).
 *
 * Returns:
 *     Texto em minúsculas, sem marcas diacríticas.
 *
 * Example:
 *     >>> normalize("Avião")
 *     "aviao"
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    // Remove os caracteres de marca diacrítica (acentos, til, cedilha etc.)
    // deixados isolados pelo NFD — faixa Unicode U+0300–U+036F.
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Verifica se uma query de busca aparece em algum dos campos informados.
 *
 * Aceita campos de tipos variados (string, lista de strings, número) para não
 * obrigar quem chama a converter tudo manualmente antes — cada tela passa os
 * campos do jeito que eles já existem no objeto (ex.: `movie.director` é
 * `string[]`, `movie.year` é `number | null`).
 *
 * Args:
 *     query: Texto digitado pelo usuário (pode ter espaços/maiúsculas — é
 *         normalizado internamente).
 *     fields: Um ou mais campos do item a comparar contra a query. Valores
 *         `null`/`undefined` são ignorados.
 *
 * Returns:
 *     `True` se a query (normalizada) for substring de algum campo — ou se a
 *     query estiver vazia (nesse caso, tudo "bate", ou seja, sem filtro).
 *
 * Example:
 *     >>> matches("nolan", "Oppenheimer", ["Christopher Nolan"], 2023)
 *     True
 */
export function matches(
  query: string,
  ...fields: (string | string[] | number | null | undefined)[]
): boolean {
  const q = normalize(query.trim())
  if (!q) return true  // Query vazia = nenhum filtro ativo, tudo passa

  for (const field of fields) {
    if (field == null) continue
    if (Array.isArray(field)) {
      if (field.some(v => normalize(String(v)).includes(q))) return true
    } else {
      if (normalize(String(field)).includes(q)) return true
    }
  }
  return false
}
