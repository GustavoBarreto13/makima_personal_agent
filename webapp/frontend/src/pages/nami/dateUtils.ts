// Utilitários de data da Nami — isolados aqui para garantir que TODOS os
// cálculos de "hoje" usem a mesma lógica de fuso horário (padrão da Violet).
//
// Regra do projeto: nunca usar `new Date().toISOString().slice(0,10)` nem
// `new Date("YYYY-MM-DD")` (string ISO pura é interpretada como UTC-meia-noite,
// que no fuso UTC-3 vira o dia ANTERIOR). Sempre partes locais.

/**
 * Retorna a data de HOJE no fuso LOCAL do navegador como "YYYY-MM-DD".
 *
 * toISOString() devolveria a data em UTC — para um usuário em UTC-3,
 * qualquer horário após as 21h locais já seria "amanhã".
 */
export function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Retorna o mês atual no fuso LOCAL como "YYYY-MM". */
export function currentMonthLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Converte "YYYY-MM-DD" em Date no fuso LOCAL (meia-noite local).
 *
 * `new Date("2026-07-06")` seria interpretado como UTC e viraria 05/jul às
 * 21h no Brasil — por isso o parse explícito por partes.
 */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Date de hoje truncada para meia-noite local (para aritmética de dias). */
export function todayLocalDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * Diferença em dias inteiros entre hoje e uma data ISO (positivo = passado).
 * Ex.: ontem → 1, hoje → 0, amanhã → -1.
 */
export function daysAgo(iso: string): number {
  return Math.round((todayLocalDate().getTime() - parseLocalDate(iso).getTime()) / 86_400_000)
}
