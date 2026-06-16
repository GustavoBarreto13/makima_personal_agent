// lib.ts — Helpers puros da Komi, portados de data.js do design handoff.
// Sem efeitos colaterais, sem fetch, sem estado — apenas funções de transformação.
// Pode ser importado por qualquer componente da Komi sem criar dependências circulares.

import type { Category, OverviewPerson } from './types'

// ─── Categorias de relacionamento ─────────────────────────────────────────
// Cada categoria tem uma cor principal e uma tinta (fundo translúcido).
// Usadas nos cards, chips de filtro e badge de categoria na PersonPage.

export const REL_CATS: Record<Category, { label: string; color: string; tint: string }> = {
  familia:  { label: 'Família',  color: 'var(--garnet)', tint: 'var(--garnet-t)' },
  amigos:   { label: 'Amigos',   color: 'var(--km)',     tint: 'var(--km-tint)' },
  trabalho: { label: 'Trabalho', color: 'var(--book)',   tint: 'var(--book-t)' },
  outros:   { label: 'Outros',   color: 'var(--ink-3)',  tint: 'var(--line-2)' },
}

// ─── Paletas de acento disponíveis ────────────────────────────────────────
// 4 variações de cor principal — escolhidas no TweaksPanel.
// A paleta default é 'indigo' (#5A4FCF).

export const KM_PALETTES: Record<string, {
  base: string; deep: string; bright: string; t1: string; t2: string
}> = {
  '#5A4FCF': {
    base: 'oklch(0.505 0.135 277)', deep: 'oklch(0.420 0.130 278)',
    bright: 'oklch(0.640 0.130 275)', t1: 'oklch(0.505 0.135 277 / 0.11)', t2: 'oklch(0.505 0.135 277 / 0.19)',
  }, /* índigo (padrão — cabelo/blazer da Komi) */
  '#A23B43': {
    base: 'oklch(0.535 0.165 19)',  deep: 'oklch(0.455 0.155 17)',
    bright: 'oklch(0.670 0.150 22)',  t1: 'oklch(0.535 0.165 19 / 0.12)',  t2: 'oklch(0.535 0.165 19 / 0.19)',
  }, /* granada — laço/gravata */
  '#3E7FB0': {
    base: 'oklch(0.555 0.110 248)', deep: 'oklch(0.465 0.110 250)',
    bright: 'oklch(0.685 0.105 246)', t1: 'oklch(0.555 0.110 248 / 0.12)', t2: 'oklch(0.555 0.110 248 / 0.19)',
  }, /* azul */
  '#3E8C6E': {
    base: 'oklch(0.560 0.105 165)', deep: 'oklch(0.470 0.098 166)',
    bright: 'oklch(0.700 0.105 166)', t1: 'oklch(0.560 0.105 165 / 0.12)', t2: 'oklch(0.560 0.105 165 / 0.19)',
  }, /* esmeralda */
}

// ─── Normalização (smart-match) ────────────────────────────────────────────
// Espelha _norm() do Python: minúsculo + sem acentos (NFD).
// Usada para busca e dedup de apelidos no frontend.

export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove marcas diacríticas
    .trim()
}

// ─── Avatar ────────────────────────────────────────────────────────────────

// Paleta determinística de cores para avatar de iniciais.
// O índice é calculado a partir do hash do nome — mesmo nome = mesma cor sempre.
const AV_PALETTE = [
  'oklch(0.55 0.13 277)', 'oklch(0.56 0.15 19)',  'oklch(0.58 0.12 184)',
  'oklch(0.58 0.13 158)', 'oklch(0.60 0.14 57)',  'oklch(0.56 0.15 340)',
  'oklch(0.55 0.13 253)', 'oklch(0.56 0.13 300)',
]

/** Cor de avatar determinística baseada no nome. Mesmo nome → mesma cor. */
export function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    // Hash simples: multiplica por 31 (primo) e soma o charCode
    h = ((h * 31) + name.charCodeAt(i)) >>> 0  // >>> 0 mantém unsigned 32-bit
  }
  return AV_PALETTE[h % AV_PALETTE.length]
}

/** Extrai iniciais do nome: "Ana Silva" → "AS", "Gustavo" → "GU". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  // Primeira letra do primeiro nome + primeira letra do último nome
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Datas ────────────────────────────────────────────────────────────────

/**
 * Calcula quantos dias faltam para a próxima ocorrência de uma data.
 *
 * @param dateStr - "MM-DD" (recorrente) ou "YYYY-MM-DD" (absoluta)
 * @param recurring - Se true, ignora o ano e conta a partir do próximo MM-DD
 * @returns Número de dias. 0 = hoje, negativo = passado.
 */
export function daysUntil(dateStr: string, recurring: boolean): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)  // compara apenas a data, sem hora

  let target: Date

  if (recurring) {
    // Extrai MM e DD da string (suporta "MM-DD" ou "YYYY-MM-DD")
    const parts = dateStr.split('-')
    const mm = parseInt(parts[parts.length - 2], 10) - 1  // mês base 0
    const dd = parseInt(parts[parts.length - 1], 10)

    // Tenta a data neste ano; se já passou, usa o próximo ano
    target = new Date(today.getFullYear(), mm, dd)
    if (target < today) {
      target = new Date(today.getFullYear() + 1, mm, dd)
    }
  } else {
    // Data absoluta: converte direto
    target = new Date(dateStr + 'T00:00:00')
  }

  // Diferença em dias (arredondada — evita bugs de horário de verão)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/**
 * Formata uma data no estilo "15 jun" para exibição compacta.
 *
 * @param dateStr - "MM-DD" ou "YYYY-MM-DD"
 * @returns String formatada ex.: "15 jun"
 */
export function fmtDayMonth(dateStr: string): string {
  const parts = dateStr.split('-')
  const mm = parseInt(parts[parts.length - 2], 10)
  const dd = parts[parts.length - 1]
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  return `${dd} ${meses[mm - 1]}`
}

// ─── Finanças ─────────────────────────────────────────────────────────────

/**
 * Formata um valor em Reais (BRL) com sinal e duas casas decimais.
 * Ex.: -120.50 → "−R$ 120,50"  |  230 → "R$ 230,00"
 */
export function brl(v: number): string {
  const abs = Math.abs(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (v < 0 ? '−' : '') + 'R$ ' + abs
}

// ─── Interações / reconectar ──────────────────────────────────────────────

/**
 * Calcula quantos dias se passaram desde uma data ISO (YYYY-MM-DD).
 * Retorna null se a data for inválida.
 */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const then = new Date(iso + 'T00:00:00')
  return Math.round((today.getTime() - then.getTime()) / 86_400_000)
}

/**
 * Converte dias em texto amigável para o badge de "tempo sem falar".
 * Ex.: 1 → "ontem"  |  10 → "há 10 dias"  |  45 → "há 1 mês"
 */
export function humanGap(days: number | null): string {
  if (days == null) return 'sem registro'
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 14) return `há ${days} dias`
  if (days < 30) return `há ${Math.round(days / 7)} semanas`
  if (days < 60) return 'há 1 mês'
  if (days < 365) return `há ${Math.round(days / 30)} meses`
  return 'há mais de um ano'
}

// ─── Home — helpers de contexto ────────────────────────────────────────────

/** Saudação baseada no horário local. */
export function greeting(): string {
  const h = new Date().getHours()
  if (h < 6)  return 'Boa madrugada'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * Retorna o CTA de contato mais direto para uma pessoa (prioridade: Telegram > WhatsApp > Instagram).
 * Retorna null se nenhum canal de contato estiver disponível.
 */
export function contactCTA(p: {
  telegram?: string | null
  phone?: string | null
  instagram?: string | null
}): { label: string; icon: string; href: string } | null {
  if (p.telegram) {
    return { label: 'Telegram', icon: 'send', href: 'https://t.me/' + p.telegram.replace('@', '') }
  }
  if (p.phone) {
    return { label: 'WhatsApp', icon: 'phone', href: 'https://wa.me/' + p.phone.replace(/[^\d]/g, '') }
  }
  if (p.instagram) {
    return { label: 'Instagram', icon: 'at', href: 'https://instagram.com/' + p.instagram.replace('@', '') }
  }
  return null
}

/**
 * Gera o texto de incentivo para reconectar com uma pessoa.
 * A urgência aumenta com o tempo sem contato.
 */
export function reconnectPrompt(days: number): string {
  if (days >= 60) return 'Faz muito tempo — que tal retomar?'
  if (days >= 30) return 'Mais de um mês sem falar. Manda um oi?'
  if (days >= 14) return 'Já fazem semanas. Dá um alô?'
  return 'Uma semana quietos. Que tal um oi?'
}

// ─── Highlight de @menções ────────────────────────────────────────────────

/**
 * Divide um texto em segmentos e marca @menções com a classe "mention".
 * Retorna um array de React nodes — usar dentro de {highlightMentions(text)}.
 * Importar React antes de usar!
 */
export function splitMentions(text: string): Array<{ isMention: boolean; text: string }> {
  // Divide a string nas @menções (padrão: @ seguido de letras/números/acentos)
  const parts = text.split(/(@[\wÀ-ÿ]+)/g)
  return parts.map(seg => ({
    isMention: seg.startsWith('@'),
    text: seg,
  }))
}

// ─── Vínculos da OverviewPerson ────────────────────────────────────────────

/**
 * Calcula o total de vínculos de uma pessoa no overview.
 * Como o overview não tem contagens individuais por domínio, este helper
 * serve como placeholder — a contagem real vem de list_people() com link_count.
 */
export function totalLinks(p: OverviewPerson): number {
  // Proxy: usa datas como indicador de "riqueza" do perfil
  // A contagem real de vínculos vem do GET / (Person.link_count)
  return p.dates?.length ?? 0
}
