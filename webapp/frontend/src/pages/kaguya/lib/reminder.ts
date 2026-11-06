// Antecedência do aviso por push de uma tarefa/evento com horário (campo `reminder_lead_min`).
//
// No servidor (agents/kaguya/reminder_engine.py): `null` = padrão (10 min antes) · `0` = na hora ·
// `-1` = não avisar · `N` = N minutos antes. O <select> trabalha com texto, então a conversão fica aqui.

/** Valor do <select> que representa "usar o padrão" (o servidor recebe `null`). */
export const DEFAULT_LEAD_VALUE = ''

/** Padrão do servidor (minutos) — só para o rótulo da primeira opção. */
export const DEFAULT_LEAD_MIN = 10

export interface LeadOption {
  value: string
  label: string
}

/** Opções do campo "Avisar", em ordem. */
export const LEAD_OPTIONS: LeadOption[] = [
  { value: DEFAULT_LEAD_VALUE, label: `Padrão (${DEFAULT_LEAD_MIN} min antes)` },
  { value: '-1', label: 'Sem aviso' },
  { value: '0', label: 'Na hora' },
  { value: '5', label: '5 min antes' },
  { value: '15', label: '15 min antes' },
  { value: '30', label: '30 min antes' },
  { value: '60', label: '1 hora antes' },
  { value: '120', label: '2 horas antes' },
  { value: '1440', label: '1 dia antes' },
]

/** Valor guardado na tarefa → valor do <select>. */
export function leadToSelect(lead: number | null | undefined): string {
  return lead === null || lead === undefined ? DEFAULT_LEAD_VALUE : String(lead)
}

/** Valor do <select> → o que vai para a API (`null` volta ao padrão). */
export function selectToLead(value: string): number | null {
  return value === DEFAULT_LEAD_VALUE ? null : Number(value)
}

/**
 * Opções para a antecedência atual: se a tarefa veio de fora (ex.: Telegram: "avisar 45 min antes") com um
 * valor que não está na lista, ele aparece como opção extra em vez de o select mentir mostrando o padrão.
 */
export function leadOptionsFor(lead: number | null | undefined): LeadOption[] {
  const atual = leadToSelect(lead)
  if (LEAD_OPTIONS.some((o) => o.value === atual)) return LEAD_OPTIONS
  const n = Number(atual)
  const label = n % 1440 === 0 ? `${n / 1440} dias antes` : n % 60 === 0 ? `${n / 60} horas antes` : `${n} min antes`
  return [...LEAD_OPTIONS, { value: atual, label }]
}
