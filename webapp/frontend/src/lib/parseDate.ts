// Parser determinístico de datas em português (quick-add, guia §6 / fatia 012).
// Sem LLM: reconhece relativos (hoje/amanhã), dias da semana, "próxima <dia>",
// DD/MM[/AAAA] e hora (9h, 17h30, 17:30). Espelha a semântica que a Kaguya usa por
// NLP no Telegram ("próxima ocorrência futura"), garantindo paridade de comportamento.
//
// Opera sobre a lista de tokens não-espaço do quick-add e devolve quais foram
// consumidos como data/hora (para o parseTask removê-los do título e pintá-los).

export interface DateParseResult {
  dueDate: string | null      // "YYYY-MM-DD" ou null
  dueTime: string | null      // "HH:MM" ou null
  consumed: Set<number>       // índices (na lista de tokens) consumidos como data/hora
}

// Nome do dia da semana → número do JS (Date.getDay(): 0=domingo .. 6=sábado).
// Exportado para o parseTask reutilizar ao montar RRULEs de recorrência.
export const WEEKDAY: Record<string, number> = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1,
  terca: 2, 'terça': 2, ter: 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sabado: 6, 'sábado': 6, sab: 6,
}

// Data de hoje à meia-noite local (o usuário está em America/Sao_Paulo ≈ hora local).
// Exportada para o parseTask derivar âncoras de recorrência.
export function midnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Formata um Date como "YYYY-MM-DD" usando os componentes LOCAIS (não UTC).
// Exportada para o parseTask formatar datas de âncora.
export function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Soma `n` dias a uma data (sem mutar a original).
export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Próxima ocorrência futura de um dia da semana. Hoje sendo esse dia → semana seguinte
// (sempre futuro). `extraWeek` ("próxima <dia>") empurra mais uma semana.
// Exportada para o parseTask derivar âncoras de "toda sexta", "toda segunda", etc.
export function nextWeekday(target: number, extraWeek = false): Date {
  const base = midnight()
  let delta = ((target - base.getDay()) + 7) % 7
  if (delta === 0) delta = 7        // hoje é esse dia → a próxima ocorrência é futura
  if (extraWeek) delta += 7         // "próxima sexta" → a da semana seguinte
  return addDays(base, delta)
}

// Tira pontuação final colada no token ("amanhã," → "amanhã") e baixa a caixa.
function norm(s: string): string {
  return s.toLowerCase().replace(/[.,;:!?]+$/, '')
}

// Reconhece hora: 9h, 17h, 17h30, 17:30, 9:00. Devolve "HH:MM" ou null.
function parseTime(tok: string): string | null {
  let m = tok.match(/^(\d{1,2})h(\d{2})?$/i)        // 9h | 17h30
  if (m) {
    const h = Number(m[1]); const mi = m[2] ? Number(m[2]) : 0
    if (h < 24 && mi < 60) return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
  }
  m = tok.match(/^(\d{1,2}):(\d{2})$/)              // 17:30
  if (m) {
    const h = Number(m[1]); const mi = Number(m[2])
    if (h < 24 && mi < 60) return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
  }
  return null
}

// Reconhece DD/MM ou DD/MM/AAAA. Devolve "YYYY-MM-DD" ou null (valida data real).
function parseDMY(tok: string): string | null {
  const m = tok.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!m) return null
  const day = Number(m[1]); const mon = Number(m[2])
  let year = m[3] ? Number(m[3]) : midnight().getFullYear()
  if (m[3] && m[3].length === 2) year += 2000       // "26" → 2026
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null
  const d = new Date(year, mon - 1, day)
  d.setHours(0, 0, 0, 0)
  // Rejeita datas impossíveis (ex.: 31/02 vira 03/03 → mês muda).
  if (d.getMonth() !== mon - 1) return null
  return iso(d)
}

/**
 * Extrai data e hora de uma lista de tokens (do quick-add).
 *
 * @param tokens Lista ordenada de tokens não-espaço já tokenizados pelo parseTask.
 * @returns Data/hora encontradas + os índices dos tokens consumidos.
 */
export function parseDate(tokens: string[]): DateParseResult {
  let dueDate: string | null = null
  let dueTime: string | null = null
  let timeIdx: number | null = null
  const consumed = new Set<number>()

  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue
    const t = norm(tokens[i])

    // Hora (independente da data; a primeira hora encontrada vale).
    if (dueTime === null) {
      const tm = parseTime(t)
      if (tm) { dueTime = tm; timeIdx = i; consumed.add(i); continue }
    }
    if (dueDate !== null) continue   // data já resolvida — segue procurando só hora

    // Relativos.
    if (t === 'hoje' || t === 'hj') { dueDate = iso(midnight()); consumed.add(i); continue }
    if (t === 'amanhã' || t === 'amanha') { dueDate = iso(addDays(midnight(), 1)); consumed.add(i); continue }
    // "depois de amanhã" (3 tokens).
    if (t === 'depois' && norm(tokens[i + 1] || '') === 'de'
        && ['amanhã', 'amanha'].includes(norm(tokens[i + 2] || ''))) {
      dueDate = iso(addDays(midnight(), 2))
      consumed.add(i); consumed.add(i + 1); consumed.add(i + 2)
      continue
    }
    // "próxima/próximo <dia>" (2 tokens) → semana seguinte.
    if (['próxima', 'proxima', 'próximo', 'proximo'].includes(t)
        && WEEKDAY[norm(tokens[i + 1] || '')] !== undefined) {
      dueDate = iso(nextWeekday(WEEKDAY[norm(tokens[i + 1] || '')], true))
      consumed.add(i); consumed.add(i + 1)
      continue
    }
    // Dia da semana isolado → próxima ocorrência futura.
    if (WEEKDAY[t] !== undefined) { dueDate = iso(nextWeekday(WEEKDAY[t])); consumed.add(i); continue }
    // DD/MM[/AAAA].
    const dmy = parseDMY(t)
    if (dmy) { dueDate = dmy; consumed.add(i); continue }
  }

  // Hora órfã (sem data): ignora — não inventa um dia. Devolve o token ao título.
  if (dueDate === null && timeIdx !== null) {
    consumed.delete(timeIdx)
    dueTime = null
  }
  return { dueDate, dueTime, consumed }
}
