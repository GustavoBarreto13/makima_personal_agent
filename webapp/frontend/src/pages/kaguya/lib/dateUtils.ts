// dateUtils.ts — helpers canônicos de data para o Kaguya.
//
// IMPORTANTE — fuso horário UTC-3 (America/Sao_Paulo):
//   Nunca usar `toISOString()` para derivar "hoje": ela retorna UTC e
//   após as 21h local (21:00 BRT = 00:00 UTC+1 dia) já aponta para o
//   dia seguinte. Sempre usar as partes locais do navegador:
//   getFullYear() / getMonth() / getDate().
//
// Este arquivo é a fonte canônica de todos os helpers de data do Kaguya.
// Centraliza lógica duplicada que estava espalhada em CalendarsAside,
// TaskTree, FilterModal e KanbanViewModal.

// ─── Conversão Date → string ISO ────────────────────────────────────────────

/**
 * Converte uma Date para string "AAAA-MM-DD" usando o fuso local do navegador.
 *
 * É intencionalmente mais seguro que `toISOString().slice(0,10)`, que usa UTC.
 *
 * Exemplo: às 22h de 20/06/2026 em BRT:
 *   - toISO(new Date())     → "2026-06-20"  ✅ correto
 *   - toISOString().slice() → "2026-06-21"  ❌ errado (já é dia 21 em UTC)
 */
export function toISO(d: Date): string {
  // Partes locais do navegador — respeitam o UTC-3 do usuário
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')  // getMonth() é 0-indexado
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Retorna a data de hoje em formato ISO "AAAA-MM-DD", no fuso local.
 * Nunca usa `new Date().toISOString()`.
 */
export function todayISO(): string {
  return toISO(new Date())
}

// ─── Aritmética de datas ──────────────────────────────────────────────────────

/**
 * Retorna uma nova Date com `n` dias somados (ou subtraídos se n < 0).
 * Não muta o objeto original.
 *
 * Exemplo: addDays(new Date("2026-06-20"), 5) → Date("2026-06-25")
 */
export function addDays(d: Date, n: number): Date {
  // Cria uma cópia para não mutar o parâmetro original
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// ─── Constantes de localização ─────────────────────────────────────────────

/**
 * Nomes abreviados dos meses em pt-BR, indexados por mês (0 = jan, 11 = dez).
 * Usados no cabeçalho do mini-calendário e no rótulo do DatePicker.
 */
export const MONTHS_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

/**
 * Abreviação de 1 letra para os dias da semana, indexados por getDay():
 * 0 = Dom, 1 = Seg … 6 = Sáb.
 */
export const WEEKDAY_1 = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

// ─── Datetime com fuso local ──────────────────────────────────────────────────

/**
 * Monta uma string ISO 8601 com offset local a partir de uma data e um minuto do dia.
 *
 * Exemplo: localISO("2026-06-26", 870) → "2026-06-26T14:30:00-03:00"
 *
 * Por que não usar `new Date(...).toISOString()`:
 *   toISOString() retorna UTC — ao colar o offset local depois, o horário ficaria
 *   errado (offset aplicado duas vezes). Aqui montamos o wall-clock local diretamente
 *   e o etiquetamos com o offset correto, sem passar por UTC.
 *
 * @param dateISO - Data no formato "AAAA-MM-DD" (já deve estar em fuso local).
 * @param minuteOfDay - Minuto absoluto do dia: 0 = 00:00, 870 = 14:30, 1439 = 23:59.
 * @returns String ISO 8601 com offset local: "AAAA-MM-DDTHH:MM:00±HH:MM".
 */
export function localISO(dateISO: string, minuteOfDay: number): string {
  // Hora e minuto a partir do minuto absoluto do dia
  const h = Math.floor(minuteOfDay / 60)
  const m = minuteOfDay % 60
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')

  // Offset do fuso local em minutos (ex.: BRT = UTC-3 → getTimezoneOffset() = 180)
  // Negamos para ter a convenção "+HH:MM" / "-HH:MM" do ISO 8601.
  const off     = -new Date().getTimezoneOffset()   // ex.: -180 para BRT
  const sign    = off >= 0 ? '+' : '-'
  const offH    = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')  // '03'
  const offM    = String(Math.abs(off) % 60).padStart(2, '0')              // '00'

  // Monta o resultado sem toISOString() (que devolveria UTC)
  return `${dateISO}T${hh}:${mm}:00${sign}${offH}:${offM}`
}

// ─── Formatação para exibição ─────────────────────────────────────────────────

/**
 * Formata uma data ISO "AAAA-MM-DD" como rótulo legível em pt-BR.
 *
 * Exemplos:
 *   fmtDateLabel("2026-06-20") → "20 jun 2026"
 *   fmtDateLabel("")           → ""
 *
 * Parseia diretamente as partes do ISO sem passar por `new Date()`,
 * evitando que "2026-06-20" seja tratado como meia-noite UTC e
 * rendereize como "19 jun 2026" em UTC-3.
 */
export function fmtDateLabel(iso: string): string {
  if (!iso) return ''
  // Separa as partes: ["2026", "06", "20"]
  const parts = iso.split('-').map(Number)
  const [y, m, d] = parts
  // Valida que todas as partes são números válidos
  if (!y || !m || !d) return ''
  // MONTHS_PT é 0-indexado, mas o mês no ISO é 1-indexado
  return `${d} ${MONTHS_PT[m - 1]} ${y}`
}
