// Canais de notificação do Android — um por agente.
//
// No Android, cada notificação pertence a um "canal"; o usuário pode silenciar um canal nas
// configurações do celular sem silenciar os outros (ex.: calar a Lucy e manter a Kaguya).
// Os ids daqui precisam ser IGUAIS ao `channel_id` que o backend manda
// (`scheduler/notify_channels.py` → parâmetro `agent`), senão a notificação cai no canal errado.

/** Um canal de notificação do app. */
export interface PushChannelDef {
  /** Id do canal (igual ao `agent` enviado pelo backend). */
  id: string
  /** Nome que aparece nas configurações do Android. */
  name: string
  /** Texto de ajuda que aparece nas configurações do Android. */
  description: string
  /** Esconde o conteúdo na tela de bloqueio (dados sensíveis). */
  private: boolean
}

/** Canal usado quando o backend não informa o agente (avisos do sistema). */
export const DEFAULT_CHANNEL_ID = 'makima'

/** Todos os canais criados no primeiro uso. */
export const PUSH_CHANNELS: PushChannelDef[] = [
  { id: 'makima', name: 'Makima (avisos gerais)', description: 'Avisos do sistema e do hub.', private: false },
  { id: 'kaguya', name: 'Kaguya · Tarefas', description: 'Resumo do dia, vencimentos e revisão semanal.', private: false },
  { id: 'nami', name: 'Nami · Finanças', description: 'Orçamento, cobranças e relatório do mês.', private: true },
  { id: 'violet', name: 'Violet · Diário', description: 'Revisão semanal e lembretes do diário.', private: true },
  { id: 'komi', name: 'Komi · Aniversários', description: 'Aniversários e lembretes de pessoas.', private: false },
  { id: 'lucy', name: 'Lucy · E-mails', description: 'Resumo matinal dos e-mails.', private: true },
  { id: 'yato', name: 'Yato · Viagens', description: 'Lembretes das suas viagens.', private: false },
  { id: 'kurisu', name: 'Kurisu · Conhecimento', description: 'Conselhos e avisos da base de conhecimento.', private: false },
]

/**
 * Devolve o id de canal válido para um agente (cai no canal geral se for desconhecido).
 *
 * @param agent - Valor do campo `agent` da notificação (pode vir vazio).
 */
export function channelFor(agent: string | null | undefined): string {
  const id = (agent ?? '').toLowerCase()
  return PUSH_CHANNELS.some((c) => c.id === id) ? id : DEFAULT_CHANNEL_ID
}
