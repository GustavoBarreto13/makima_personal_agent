// Utilitários de data para a Akane — isolados aqui para evitar repetição e garantir
// que TODOS os cálculos de "hoje" usem a mesma lógica de fuso horário.

/**
 * Retorna a data de HOJE no fuso LOCAL do navegador como "YYYY-MM-DD".
 *
 * Por que não usar `new Date().toISOString().slice(0,10)`:
 *   toISOString() sempre devolve a data em UTC. Para um usuário em UTC-3
 *   (America/Sao_Paulo), qualquer horário após as 21h local já é "amanhã" em UTC —
 *   fazia o campo "assistido hoje" do modal de log gravar a sessão no dia errado.
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

// ── Helpers de exibição (pt-BR) — portados do design handoff (akane/ui.jsx) ──

/** Nomes completos dos meses, em minúsculas (padrão do protótipo). */
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Abreviações de 3 letras dos meses. */
export const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Abreviações dos dias da semana (índice = getDay()). */
export const DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * Formatar uma data ISO como "12 de julho".
 *
 * O sufixo T00:00:00 força o parse no fuso LOCAL (sem ele, "YYYY-MM-DD"
 * é interpretado como UTC e vira o dia anterior em UTC-3).
 */
export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} de ${MESES[d.getMonth()]}`
}

/** Formatar uma data ISO relativa a hoje: "hoje", "ontem", "N dias atrás"… */
export function relDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date(todayLocalISO() + 'T00:00:00')
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff > 1 && diff < 7) return `${diff} dias atrás`
  return fmtDate(iso)
}

/** Formatar minutos como duração legível: 145 → "2h 25min". */
export function fmtRuntime(min: number | null | undefined): string {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  return m > 0 ? `${h}h ${m.toString().padStart(2, '0')}min` : `${h}h`
}

/** Saudação conforme a hora local (usada no hero da Home). */
export function saudacao(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Boa madrugada'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}
