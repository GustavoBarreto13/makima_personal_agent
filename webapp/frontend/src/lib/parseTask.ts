// Parser determinístico pt-BR do quick-add (guia §6). Reconhece:
//   @lista              → lista/projeto (token, resolvido depois contra a sidebar)
//   #tag                → etiqueta(s) (fatia 013); pode haver várias
//   !alta|!média|!baixa → prioridade
//   datas (via parseDate): hoje, amanhã, sexta, próxima segunda, DD/MM, 17h, 17:30
//   recorrência (fatia 018): todo dia N, toda sexta, a cada 2 dias, todo mês, todo ano
//
// Preserva posições para o highlight ao vivo (ParseMirror): devolve `segments`
// com a classe de cada pedaço do texto.

import { parseDate, WEEKDAY, iso, midnight, nextWeekday } from './parseDate'
import type { RecurrenceMode } from '../pages/kaguya/types'

// Um pedaço do texto com sua classe de destaque (vazia = texto comum).
export interface ParseSegment {
  text: string
  cls: string
}

// Resultado de recorrência detectada no texto.
export interface ParsedRecur {
  mode: RecurrenceMode     // 'fixed' (todos os padrões pt-BR desta fatia)
  rule: string             // RRULE — ex.: "FREQ=MONTHLY;BYMONTHDAY=10"
  label: string            // descrição pt-BR — ex.: "todo dia 10"
  anchor: string           // "YYYY-MM-DD" — âncora inicial para o backend
}

export interface ParsedTask {
  title: string                 // texto limpo (sem os tokens reconhecidos)
  projectToken: string | null   // texto após o @ (nome da lista a resolver)
  tags: string[]                // nomes após cada # (etiquetas a vincular)
  priority: number | null       // 1..3 ou null
  dueDate: string | null        // "YYYY-MM-DD" ou null (parseDate ou recur.anchor)
  dueTime: string | null        // "HH:MM" ou null (parseDate)
  recur: ParsedRecur | null     // recorrência detectada no texto, ou null
  segments: ParseSegment[]      // para o mirror
}

// Palavras de prioridade → nível numérico.
const PRIO: Record<string, number> = { alta: 3, media: 2, 'média': 2, baixa: 1 }

// Mapa getDay() (JS: 0=domingo..6=sábado) → código iCal BYDAY (usado nas RRULEs semanais).
// Ex.: WEEKDAY['sexta']=5 → ICAL_BY_GETDAY[5]='FR' → "FREQ=WEEKLY;BYDAY=FR".
const ICAL_BY_GETDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

// Nomes pt-BR dos dias da semana alinhados com iCal (índice = 0=SU..6=SA).
// Usados para montar o label "toda <dia>" espelhando describe_rrule() do backend.
const ICAL_NAMES_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Tira pontuação final colada no token e baixa a caixa (igual ao parseDate).
function norm(s: string): string {
  return s.toLowerCase().replace(/[.,;:!?]+$/, '')
}

// Próximo dia-do-mês: se o dia N ainda não passou este mês, retorna neste mês;
// senão avança para o mês seguinte.
function nextMonthDay(day: number): string {
  const today = midnight()
  let candidate = new Date(today.getFullYear(), today.getMonth(), day)
  candidate.setHours(0, 0, 0, 0)
  // Se já passou (ou é hoje), vai para o próximo mês.
  if (candidate <= today) {
    candidate = new Date(today.getFullYear(), today.getMonth() + 1, day)
    candidate.setHours(0, 0, 0, 0)
  }
  return iso(candidate)
}

/**
 * Detecta padrões de recorrência na lista de tokens não-espaço do quick-add.
 *
 * Padrões suportados (FR-005):
 *   "todo dia N"            → mensal, dia N do mês (BYMONTHDAY)
 *   "toda <dia-da-semana>"  → semanal, no dia especificado (BYDAY)
 *   "a cada N dias"         → intervalo diário (INTERVAL)
 *   "todo mês"              → mensal, no dia atual do mês
 *   "todo ano" / "aniversário" → anual (YEARLY)
 *
 * @param tokens Lista de tokens não-espaço (os mesmos usados pelo parseDate).
 * @returns Resultado de recorrência + conjunto de índices consumidos.
 */
export function parseRecur(tokens: string[]): { recur: ParsedRecur | null; consumed: Set<number> } {
  // Normaliza o token i (sem mutar); retorna '' se o índice estiver fora dos limites.
  const n = (i: number) => (i < tokens.length ? norm(tokens[i]) : '')

  for (let i = 0; i < tokens.length; i++) {
    const t = n(i)

    // ── "a cada N dias" (4 tokens) ──────────────────────────────────────────
    if (t === 'a' && n(i + 1) === 'cada' && /^\d+$/.test(n(i + 2)) && /^dias?$/.test(n(i + 3))) {
      const interval = parseInt(n(i + 2), 10)
      // Intervalo 1 = "todo dia" (sem INTERVAL na RRULE — forma canônica do backend).
      const rule = interval === 1 ? 'FREQ=DAILY' : `FREQ=DAILY;INTERVAL=${interval}`
      const label = interval === 1 ? 'todo dia' : `a cada ${interval} dias`
      return {
        recur: { mode: 'fixed', rule, label, anchor: iso(midnight()) },
        consumed: new Set([i, i + 1, i + 2, i + 3]),
      }
    }

    // ── "todo dia N" → mensal no dia N (3 tokens) ───────────────────────────
    // Distingue de "toda <dia-da-semana>" pela presença de "dia" seguido de número.
    if ((t === 'todo' || t === 'toda') && n(i + 1) === 'dia' && /^\d{1,2}$/.test(n(i + 2))) {
      const day = parseInt(n(i + 2), 10)
      // Valida intervalo razoável (1–31).
      if (day >= 1 && day <= 31) {
        const rule = `FREQ=MONTHLY;BYMONTHDAY=${day}`
        return {
          recur: { mode: 'fixed', rule, label: `todo dia ${day}`, anchor: nextMonthDay(day) },
          consumed: new Set([i, i + 1, i + 2]),
        }
      }
    }

    // ── "toda <dia-da-semana>" → semanal (2 tokens) ─────────────────────────
    if ((t === 'toda' || t === 'todo') && WEEKDAY[n(i + 1)] !== undefined) {
      const dayName = n(i + 1)
      const getDay = WEEKDAY[dayName]                   // 0=dom .. 6=sab
      const ical = ICAL_BY_GETDAY[getDay]               // 'MO'..'SU'
      const ptLabel = ICAL_NAMES_PT[getDay]             // nome normalizado pt-BR
      const rule = `FREQ=WEEKLY;BYDAY=${ical}`
      return {
        recur: { mode: 'fixed', rule, label: `toda ${ptLabel}`, anchor: iso(nextWeekday(getDay)) },
        consumed: new Set([i, i + 1]),
      }
    }

    // ── "todo mês" (2 tokens) ────────────────────────────────────────────────
    if (t === 'todo' && (n(i + 1) === 'mês' || n(i + 1) === 'mes')) {
      const today = midnight()
      // Âncora = hoje; BYMONTHDAY = dia atual do mês.
      const rule = `FREQ=MONTHLY;BYMONTHDAY=${today.getDate()}`
      return {
        recur: { mode: 'fixed', rule, label: 'todo mês', anchor: iso(today) },
        consumed: new Set([i, i + 1]),
      }
    }

    // ── "todo ano" (2 tokens) ────────────────────────────────────────────────
    if (t === 'todo' && n(i + 1) === 'ano') {
      return {
        recur: { mode: 'fixed', rule: 'FREQ=YEARLY', label: 'todo ano', anchor: iso(midnight()) },
        consumed: new Set([i, i + 1]),
      }
    }

    // ── "aniversário" (1 token) ──────────────────────────────────────────────
    if (t === 'aniversário' || t === 'aniversario') {
      return {
        recur: { mode: 'fixed', rule: 'FREQ=YEARLY', label: 'todo ano', anchor: iso(midnight()) },
        consumed: new Set([i]),
      }
    }
  }

  // Nenhum padrão encontrado — sem recorrência.
  return { recur: null, consumed: new Set() }
}

/**
 * Tokeniza a entrada do quick-add preservando os espaços (para o mirror).
 *
 * @param input Texto digitado pelo usuário.
 * @returns Título limpo + token de lista + prioridade + data/hora + recorrência + segmentos coloridos.
 */
export function parseTask(input: string): ParsedTask {
  // split que mantém os espaços como tokens próprios (grupos de captura).
  const raw = input.split(/(\s+)/)

  // Lista ordenada de tokens NÃO-espaço (é o que parseDate e parseRecur enxergam).
  const words: string[] = []
  for (const tok of raw) {
    if (tok !== '' && !/^\s+$/.test(tok)) words.push(tok)
  }

  // ── Recorrência primeiro (fatia 018) ──────────────────────────────────────
  // Precisa rodar ANTES de parseDate porque "toda sexta" seria consumido por parseDate
  // como data — precisamos marcar esses índices como 'recur' e passá-los em branco para
  // o parseDate não reconsumir.
  const { recur, consumed: recurConsumed } = parseRecur(words)

  // Tokens de recorrência "mascarados" como '' para o parseDate não consumi-los.
  // Índices permanecem alinhados (substituição no-place).
  const wordsForDate = words.map((w, i) => (recurConsumed.has(i) ? '' : w))

  // ── Datas/horas segundo ───────────────────────────────────────────────────
  const { dueDate: parsedDate, dueTime, consumed } = parseDate(wordsForDate)

  // ── Monta dueDate final ───────────────────────────────────────────────────
  // Se o usuário digitou uma data explícita E há recorrência → a data explícita
  // vira a âncora (FR-006 edge case: "data solta é a primeira ocorrência").
  // Se há só recorrência → âncora derivada do padrão vira o dueDate.
  let dueDate = parsedDate
  let finalRecur = recur
  if (finalRecur) {
    if (parsedDate) {
      // Data explícita prevalece como âncora — sobrescreve a derivada.
      finalRecur = { ...finalRecur, anchor: parsedDate }
    } else {
      // Usa a âncora derivada como dueDate para o backend (a 012 exige due_date).
      dueDate = finalRecur.anchor
    }
  }

  // ── Constrói os segmentos do mirror ──────────────────────────────────────
  const segments: ParseSegment[] = []
  const titleParts: string[] = []
  let projectToken: string | null = null
  const tags: string[] = []
  let priority: number | null = null
  let wordI = -1   // índice do token não-espaço atual

  for (const tok of raw) {
    if (tok === '') continue
    if (/^\s+$/.test(tok)) { segments.push({ text: tok, cls: '' }); continue }
    wordI++

    // Consumido como recorrência → pinta de tok-recur, não entra no título.
    if (recurConsumed.has(wordI)) { segments.push({ text: tok, cls: 'tok-recur' }); continue }

    // Consumido como data/hora → pinta de tok-date, não entra no título.
    if (consumed.has(wordI)) { segments.push({ text: tok, cls: 'tok-date' }); continue }

    // @lista → token de projeto.
    if (tok.startsWith('@') && tok.length > 1) {
      projectToken = tok.slice(1)
      segments.push({ text: tok, cls: 'tok-proj' })
      continue
    }
    // #tag → etiqueta. Recorta o nome até o primeiro caractere inválido.
    if (tok.startsWith('#') && tok.length > 1) {
      const name = tok.slice(1).match(/^[\p{L}\p{N}_-]+/u)?.[0]
      if (name) {
        tags.push(name)
        segments.push({ text: tok, cls: 'tok-tag' })
        continue
      }
    }
    // !prioridade
    if (tok.startsWith('!')) {
      const p = PRIO[tok.slice(1).toLowerCase()]
      if (p !== undefined) {
        priority = p
        segments.push({ text: tok, cls: `tok-prio-${p}` })
        continue
      }
    }
    // texto comum → entra no título
    segments.push({ text: tok, cls: '' })
    titleParts.push(tok)
  }

  return {
    title: titleParts.join(' ').replace(/\s+/g, ' ').trim(),
    projectToken,
    tags,
    priority,
    dueDate,
    dueTime,
    recur: finalRecur,
    segments,
  }
}

/**
 * Constrói os parâmetros para `kaguyaApi.createTask` a partir do resultado do parser.
 * Helper compartilhado pelo QuickAdd e pelo CommandPalette (FR-007: mesma rota de criação).
 *
 * @param parsed Resultado de parseTask().
 * @param projects Lista de projetos da sidebar (para resolver @projectToken).
 * @returns Objeto pronto para passar ao createTask.
 */
export function taskFromParse(
  parsed: ParsedTask,
  projects: { id: number; name: string }[]
) {
  // Resolve o token @lista contra as listas carregadas (exato > prefixo, case-insensitive).
  const resolveProject = (token: string | null) => {
    if (!token) return null
    const n = token.toLowerCase()
    return (
      projects.find((p) => p.name.toLowerCase() === n) ??
      projects.find((p) => p.name.toLowerCase().startsWith(n)) ??
      null
    )
  }
  const proj = resolveProject(parsed.projectToken)

  return {
    title: parsed.title,
    project_id: proj?.id,                                   // undefined → Inbox no backend
    priority: parsed.priority ?? 0,
    due_date: parsed.dueDate,                               // já inclui âncora de recorrência
    due_time: parsed.dueTime,
    tags: parsed.tags.length ? parsed.tags : undefined,
    // Passa a recorrência se detectada (o backend chama set_recurrence internamente).
    recurrence: parsed.recur
      ? { rrule: parsed.recur.rule, mode: parsed.recur.mode }
      : undefined,
  }
}
