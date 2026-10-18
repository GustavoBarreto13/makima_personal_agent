// Briefing: o cartão do topo do perfil. Responde "o que eu preciso saber antes de falar com ela?" — aniversário
// chegando, ideias de presente e coisas que gosta, pendências (saldo na Nami, tarefas e o que está aguardando),
// o último contato e o resumo da IA. Cada bloco é opcional: o que não existe não aparece.

import { Button, ErrorState, Icon, LoadingState, Tag } from '../../../../design'
import { fmtMoney } from '../../../../design/core/format'
import { useKomi } from '../../context'
import { komiApi } from '../../komiApi'
import { inLabel, sinceLabel } from '../../lib/dates'
import { INTERACTION, NOTE } from '../../lib/kinds'
import { useLoad } from '../../lib/useLoad'
import type { NoteKind } from '../../types'

export function BriefingCard({ personId, onTab }: { personId: string; onTab: (tab: 'notes' | 'interactions' | 'dates') => void }) {
  const komi = useKomi()
  const { state, retry } = useLoad(() => komiApi.briefing(personId), [personId, komi.rev])

  if (state.status === 'loading') return <div className="ds-card km-brief"><LoadingState variant="row" count={2} /></div>
  if (state.status === 'error') return <div className="ds-card km-brief"><ErrorState title="Não foi possível montar o briefing" onRetry={retry} /></div>

  const b = state.data
  const gifts = b.notes.presente ?? []
  const likes = b.notes.gosta ?? []
  const dislikes = b.notes.nao_gosta ?? []
  const nextDate = b.dates[0]
  const hasPending = b.pending.balance !== 0 || b.pending.open_tasks > 0 || b.pending.waiting.length > 0
  const empty = !b.birthday && !nextDate && !gifts.length && !likes.length && !dislikes.length && !hasPending && !b.contact.last && !b.ai

  const list = (kind: NoteKind, items: { id: number; text: string }[]) => items.length > 0 && (
    <div className="km-brief-block">
      <span className="km-label"><Icon name={NOTE[kind].icon} size={13} /> {NOTE[kind].plural}</span>
      <ul className="km-brief-list">{items.slice(0, 4).map((n) => <li key={n.id}>{n.text}</li>)}</ul>
    </div>
  )

  return (
    <section className="ds-card km-brief" aria-label="Briefing">
      <header className="km-brief-head"><Icon name="sparkles" size={14} /> <b>Antes de falar com {b.perfil.nickname || b.perfil.name}</b></header>
      {empty && <p className="ds-hint">Ainda não há o que resumir. Registre um contato, anote do que ela gosta ou cadastre o aniversário — o briefing se monta sozinho.</p>}

      {b.ai && <p className="km-brief-ai">{b.ai.resumo}{b.ai.stale ? <> <Tag>desatualizado</Tag></> : null}</p>}

      <div className="km-brief-grid">
        {b.birthday && (
          <div className="km-brief-block">
            <span className="km-label"><Icon name="cake" size={13} /> Aniversário</span>
            <p>{b.birthday.in_days === 0 ? 'É hoje!' : `${inLabel(b.birthday.in_days)} (${b.birthday.next_date.split('-').reverse().slice(0, 2).join('/')})`}{b.birthday.turning ? ` · faz ${b.birthday.turning} anos` : ''}</p>
          </div>
        )}
        {nextDate && (
          <div className="km-brief-block">
            <span className="km-label"><Icon name="calendar" size={13} /> {nextDate.label}</span>
            <p>{inLabel(nextDate.in_days)}</p>
          </div>
        )}
        {b.contact.last && (
          <div className="km-brief-block">
            <span className="km-label"><Icon name="history" size={13} /> Último contato</span>
            <p>{sinceLabel(b.contact.days_since)}{b.contact.last.text ? ` · ${b.contact.last.text}` : ''}</p>
          </div>
        )}
        {list('presente', gifts)}
        {list('gosta', likes)}
        {list('nao_gosta', dislikes)}
        {hasPending && (
          <div className="km-brief-block">
            <span className="km-label"><Icon name="waiting" size={13} /> Pendências</span>
            <ul className="km-brief-list">
              {b.pending.balance !== 0 && <li>{b.pending.balance > 0 ? 'Te deve' : 'Você deve'} <b>{fmtMoney(Math.abs(b.pending.balance))}</b></li>}
              {b.pending.open_tasks > 0 && <li>{b.pending.open_tasks} {b.pending.open_tasks === 1 ? 'tarefa em aberto' : 'tarefas em aberto'}</li>}
              {b.pending.waiting.slice(0, 3).map((w, i) => <li key={i}>Aguardando: {String(w.title ?? 'item')}</li>)}
            </ul>
          </div>
        )}
        {b.contact.recent_interactions.length > 0 && (
          <div className="km-brief-block">
            <span className="km-label"><Icon name="phone" size={13} /> Últimos contatos</span>
            <ul className="km-brief-list">{b.contact.recent_interactions.slice(0, 3).map((x, i) => <li key={i}>{INTERACTION[x.kind]?.label ?? 'Contato'}{x.note ? ` — ${x.note}` : ''}</li>)}</ul>
          </div>
        )}
      </div>

      {b.suggestions_pending > 0 && (
        <p className="km-brief-sug">
          <Icon name="sparkles" size={13} /> A IA sugeriu {b.suggestions_pending} {b.suggestions_pending === 1 ? 'anotação' : 'anotações'}.{' '}
          <Button size="sm" variant="ghost" onClick={() => onTab('notes')}>Revisar</Button>
        </p>
      )}
    </section>
  )
}
