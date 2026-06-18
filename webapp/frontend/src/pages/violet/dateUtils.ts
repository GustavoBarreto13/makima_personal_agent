// Utilitários de data para a Violet — isolados aqui para evitar repetição e garantir
// que TODOS os cálculos de "hoje" usem a mesma lógica de fuso horário.

/**
 * Retorna a data de HOJE no fuso LOCAL do navegador como "YYYY-MM-DD".
 *
 * Por que não usar `new Date().toISOString().slice(0,10)`:
 *   toISOString() sempre devolve a data em UTC. Para um usuário em UTC-3
 *   (America/Sao_Paulo), qualquer horário após as 21h local já é "amanhã" em UTC.
 *   Isso fazia bullets escritos à noite caírem na página do dia seguinte — o bug
 *   que foi corrigido aqui.
 *
 * Solução: usar getFullYear/getMonth/getDate, que leem as partes no fuso LOCAL
 * do navegador, independente do UTC.
 */
export function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  // getMonth() é baseado em 0 (0 = Janeiro), então somamos 1 para obter o mês real
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
