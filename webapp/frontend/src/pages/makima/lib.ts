// Regras puras da home: widgets de números, ações rápidas por agente, saudação e hooks de carga.

import { useCallback, useEffect, useState } from 'react'
import type { AgentId } from '../../design/core/agents'
import type { IconName } from '../../design'

export interface WidgetDef {
  id: string
  label: string
  agent: AgentId
  icon: IconName
}

/** Catálogo de widgets de "Seus números" (a ordem aqui é a ordem padrão). */
export const WIDGETS: WidgetDef[] = [
  { id: 'nami_livre', label: 'Livre pra gastar', agent: 'nami', icon: 'money' },
  { id: 'kaguya_hoje', label: 'Tarefas de hoje', agent: 'kaguya', icon: 'task' },
  { id: 'habitos', label: 'Hábitos de hoje', agent: 'kaguya', icon: 'habit' },
  { id: 'violet_dias', label: 'Dias escritos', agent: 'violet', icon: 'journal' },
]

export interface HomePrefs {
  /** Ids dos widgets na ordem escolhida. */
  order: string[]
  /** Ids dos widgets ocultos. */
  hidden: string[]
}

export const DEFAULT_PREFS: HomePrefs = { order: WIDGETS.map((w) => w.id), hidden: [] }

/** Aplica a ordem e as ocultações; ids novos no catálogo entram no fim (nunca somem por prefs antigas). */
export function visibleWidgets(prefs: HomePrefs): WidgetDef[] {
  const byId = new Map(WIDGETS.map((w) => [w.id, w]))
  const ordered = [...prefs.order.filter((id) => byId.has(id)), ...WIDGETS.map((w) => w.id).filter((id) => !prefs.order.includes(id))]
  return ordered.filter((id) => !prefs.hidden.includes(id)).map((id) => byId.get(id)!)
}

/** Move um item para cima (-1) ou para baixo (+1) na ordem completa. */
export function moveWidget(prefs: HomePrefs, id: string, dir: -1 | 1): string[] {
  const all = [...prefs.order.filter((x) => WIDGETS.some((w) => w.id === x)), ...WIDGETS.map((w) => w.id).filter((x) => !prefs.order.includes(x))]
  const i = all.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= all.length) return all
  ;[all[i], all[j]] = [all[j], all[i]]
  return all
}

/** Ação rápida (+) de cada agente na grade da home: `label` curto no botão, `long` para leitores de tela. */
export const QUICK_ACTIONS: Partial<Record<AgentId, { label: string; long: string; href: string }>> = {
  nami: { label: 'Gasto', long: 'Novo gasto', href: '/nami' },
  kaguya: { label: 'Tarefa', long: 'Nova tarefa', href: '/tasks#nova' },
  violet: { label: 'Escrever', long: 'Escrever no diário', href: '/journal' },
  frieren: { label: 'Leitura', long: 'Registrar leitura', href: '/books' },
  komi: { label: 'Pessoa', long: 'Nova pessoa', href: '/people' },
  marin: { label: 'Episódio', long: 'Registrar episódio', href: '/animes' },
  akane: { label: 'Filme', long: 'Marcar filme', href: '/movies' },
  mai: { label: 'Episódio', long: 'Registrar episódio', href: '/series' },
  yato: { label: 'Viagem', long: 'Nova viagem', href: '/travel' },
}

/** "Boa noite" etc., pela hora LOCAL do navegador (UTC-3 do usuário; nunca UTC puro). */
export function greeting(hour: number): string {
  if (hour < 5) return 'Boa madrugada'
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Data longa em pt-BR a partir das partes locais (evita `new Date('YYYY-MM-DD')`, que vira UTC). */
export function longDate(d: Date): string {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "18 min" / "45 s" restantes do foco (arredonda para cima; some ao zerar). */
export function remaining(sec: number | null): string {
  if (sec == null) return ''
  return sec >= 60 ? `${Math.ceil(sec / 60)} min` : `${sec} s`
}

export function attentionText(n: number): string {
  if (n === 0) return 'Nada pede sua atenção agora'
  return n === 1 ? '1 coisa pede atenção' : `${n} coisas pedem atenção`
}

export type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T; /** Instante (ms) em que o dado chegou. */ at: number }

/** Carrega dados da tela: carregando, erro (com "tentar de novo") e dados; recarregar não pisca a tela pronta. */
export function useLoad<T>(load: () => Promise<T>): { state: Loaded<T>; retry: () => void; refresh: () => void } {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  const [tries, setTries] = useState(0)
  useEffect(() => {
    let live = true
    load()
      .then((data) => { if (live) setState({ status: 'ok', data, at: Date.now() }) })
      // Recarga silenciosa que falha NÃO derruba o que já está na tela; só vira erro se ainda não havia dado.
      .catch(() => { if (live) setState((cur) => (cur.status === 'ok' ? cur : { status: 'error' })) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tries])
  return {
    state,
    retry: useCallback(() => { setState({ status: 'loading' }); setTries((n) => n + 1) }, []),
    // Recarrega sem piscar a tela já pronta (usado depois de salvar algo).
    refresh: useCallback(() => setTries((n) => n + 1), []),
  }
}

// ── Chat: o que o agente fez, em português ──────────────────────────────────

/** Ferramentas de escrita mais comuns → frase curta no passado. Chave `agente:ferramenta` vence a chave só da ferramenta. */
const TOOL_TEXT: Record<string, string> = {
  create_transaction: 'Lançou uma transação', update_transaction: 'Editou uma transação', delete_transaction: 'Apagou uma transação',
  create_transfer: 'Registrou uma transferência', create_installment: 'Registrou uma compra parcelada',
  create_subscription: 'Cadastrou uma conta recorrente', mark_subscription_paid: 'Marcou uma conta como paga',
  register_card_payment: 'Registrou o pagamento da fatura', set_budget: 'Definiu um orçamento',
  add_shopping_items: 'Adicionou itens à lista de compras', finish_shopping: 'Finalizou a compra',
  register_loan_payment: 'Registrou o pagamento de uma parcela',
  create_task: 'Criou uma tarefa', update_task: 'Atualizou uma tarefa', complete_task: 'Concluiu uma tarefa',
  reopen_task: 'Reabriu uma tarefa', delete_task: 'Apagou uma tarefa', restore_task: 'Restaurou uma tarefa',
  add_to_my_day_by_name: 'Colocou no Meu Dia', remove_from_my_day_by_name: 'Tirou do Meu Dia',
  check_in_habit: 'Marcou um hábito de hoje', create_habit: 'Criou um hábito', archive_habit: 'Arquivou um hábito',
  start_focus_session: 'Iniciou um foco', finish_focus_session: 'Concluiu um foco', cancel_focus_session: 'Cancelou um foco',
  complete_payment_task: 'Concluiu a tarefa e lançou o pagamento', create_expense_reminder: 'Criou um lembrete de pagamento',
  set_time_block: 'Marcou um horário', set_task_recurrence: 'Definiu uma repetição', create_goal: 'Criou uma meta',
  create_person: 'Cadastrou uma pessoa', log_interaction: 'Registrou um contato', add_person_note: 'Anotou sobre uma pessoa',
  set_birthday: 'Definiu um aniversário', add_important_date: 'Adicionou uma data importante',
  escrever_no_diario: 'Escreveu no diário', upsert_bullet: 'Escreveu no diário', create_letter: 'Escreveu uma carta',
  create_emotion_log: 'Registrou uma emoção', create_unsaid: 'Guardou algo não dito', checkin_de_valores: 'Fez o check-in de valores',
  log_reading: 'Registrou uma leitura', add_book: 'Adicionou um livro', finish_book: 'Marcou um livro como lido',
  add_movie: 'Adicionou um filme', add_to_watchlist: 'Colocou na lista de filmes para ver', add_anime: 'Adicionou um anime',
  add_series: 'Adicionou uma série', create_trip: 'Criou uma viagem', log_trip_expense: 'Lançou um gasto da viagem',
  'akane:log_watch': 'Registrou um filme assistido', 'marin:log_watch': 'Registrou um episódio de anime',
  'mai:log_watch': 'Registrou um episódio de série',
}

const VERB_TEXT: [RegExp, string][] = [
  [/^(create|add|register|record|apply|duplicate)/, 'Criou algo'], [/^(update|set|mark|link|relate|merge)/, 'Atualizou algo'],
  [/^(complete|finish)/, 'Concluiu algo'], [/^(delete|remove|apagar)/, 'Removeu algo'], [/^(archive)/, 'Arquivou algo'],
  [/^(restore|reopen)/, 'Restaurou algo'], [/^(log|check|checkin|upsert|escrever|salvar|bulk|process)/, 'Registrou algo'],
  [/^(start|resume)/, 'Iniciou algo'], [/^(pause|cancel)/, 'Pausou ou cancelou algo'],
]

/**
 * Frase em português do que a ferramenta fez (para o cartão do chat). Nome conhecido → frase própria;
 * desconhecido → verbo + "em {domínio}" (nunca o nome técnico em inglês).
 *
 * @example actionText({ agent: 'nami', tool: 'create_transaction', label: '' }, 'Finanças') // 'Lançou uma transação'
 */
export function actionText(a: { agent: string | null; tool: string }, domain = ''): string {
  const exact = (a.agent && TOOL_TEXT[`${a.agent}:${a.tool}`]) || TOOL_TEXT[a.tool]
  if (exact) return exact
  const verb = VERB_TEXT.find(([re]) => re.test(a.tool))?.[1] ?? 'Fez uma alteração'
  return domain && verb.endsWith('algo') ? `${verb} em ${domain}` : verb
}

/** "14:05" na hora local do aparelho (nunca UTC). */
export function formatClock(d: Date | string | number): string {
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return ''
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}

/** Teclado virtual como entrada principal (celular/tablet): Enter quebra a linha e o botão envia. */
export function prefersTouchKeyboard(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

/** Tempo restante de um foco, descontando o que já passou desde que o dado chegou (para a contagem andar sem recarregar). */
export function remainingNow(totalSec: number | null, loadedAtMs: number, nowMs: number): number | null {
  if (totalSec == null) return null
  return Math.max(0, totalSec - Math.floor((nowMs - loadedAtMs) / 1000))
}
