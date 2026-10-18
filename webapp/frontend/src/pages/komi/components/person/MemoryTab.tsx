// Memória: tudo que os agentes sabem da pessoa, numa linha do tempo só — tarefas (Kaguya), transações (Nami),
// livros (Frieren), diário e cartas (Violet), filmes (Akane) e os contatos da própria Komi. A tela só desenha o
// que vem do servidor (rótulo, ícone e link são escolhidos por cada agente), então um agente novo aparece aqui
// sem mudança. Quem é "ambos" tem duas faixas, Pessoal e Trabalho, sem misturar. Em cada item dá para Desvincular.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, EmptyState, ErrorState, Icon, IconButton, LoadingState, Tag, type IconName } from '../../../../design'
import { confirm } from '../../../../design/headless/confirm'
import { toast } from '../../../../design/headless/toast'
import { fmtDate } from '../../../../design/core/format'
import { useKomi } from '../../context'
import { komiApi } from '../../komiApi'
import { RECORD_SPACE } from '../../lib/kinds'
import { useLoad } from '../../lib/useLoad'
import type { MemoryItem, PersonRow, RecordSpace } from '../../types'
import { SummaryCard } from './SummaryCard'

/** Ícone vindo do agente: só vale se existir no registro do Design System. */
export function safeIcon(name: string, fallback: IconName = 'link'): IconName {
  return (name || fallback) as IconName
}

export function MemoryRow({ item, onUnlink, onOpen }: { item: MemoryItem; onUnlink?: () => void; onOpen: () => void }) {
  return (
    <li className="km-mem">
      <span className="km-mem-icon" aria-hidden="true"><Icon name={safeIcon(item.icon)} size={16} /></span>
      <button type="button" className="km-link km-mem-main" onClick={onOpen} aria-label={`Abrir ${item.title}`}>
        <b className="km-mem-t">{item.title}</b>
        {item.snippet && <span className="km-mem-s">{item.snippet}</span>}
        <span className="km-mem-m">{item.label}{item.date ? ` · ${fmtDate(item.date)}` : ''}</span>
      </button>
      {onUnlink && <IconButton icon="delete" label={`Desvincular ${item.title}`} size={15} onClick={onUnlink} />}
    </li>
  )
}

function Lane({ title, items, onUnlink, onOpen }: { title?: string; items: MemoryItem[]; onUnlink: (i: MemoryItem) => void; onOpen: (i: MemoryItem) => void }) {
  return (
    <section className="km-lane">
      {title && <h3 className="km-lane-t">{title} <span className="ds-mono">{items.length}</span></h3>}
      {items.length === 0
        ? <p className="ds-hint">Nada aqui ainda.</p>
        : <ul className="ds-card km-memlist">{items.map((i) => <MemoryRow key={`${i.entity_type}:${i.entity_id}`} item={i} onOpen={() => onOpen(i)} onUnlink={i.agent === 'komi' ? undefined : () => onUnlink(i)} />)}</ul>}
    </section>
  )
}

export function MemoryTab({ person }: { person: PersonRow }) {
  const komi = useKomi()
  const navigate = useNavigate()
  const { state, retry } = useLoad(() => komiApi.memory(person.id), [person.id, komi.rev])
  const [agent, setAgent] = useState<string>('all')

  const items = useMemo(() => (state.status === 'ok' ? state.data.items : []), [state])
  const agents = useMemo(() => {
    const seen = new Map<string, { label: string; n: number }>()
    for (const i of items) seen.set(i.agent, { label: i.label, n: (seen.get(i.agent)?.n ?? 0) + 1 })
    return [...seen.entries()]
  }, [items])
  const shown = agent === 'all' ? items : items.filter((i) => i.agent === agent)

  const open = (i: MemoryItem) => {
    if (!i.deep_link) return
    if (/^https?:/.test(i.deep_link)) window.open(i.deep_link, '_blank', 'noopener,noreferrer')
    else navigate(i.deep_link)
  }

  const unlink = async (i: MemoryItem) => {
    const ok = await confirm({
      title: `Tirar ${person.name} de “${i.title}”?`,
      body: i.entity_type === 'journal_bullet' ? 'A menção também sai do texto do diário. Você pode desfazer logo depois.' : 'O item continua existindo; só deixa de estar ligado a esta pessoa.',
      confirmLabel: 'Desvincular',
      danger: true,
    })
    if (!ok) return
    try {
      const r = await komiApi.unlink(person.id, i.entity_type, i.entity_id)
      komi.reload()
      toast('Vínculo removido', {
        tone: 'success',
        undo: r.undoable ? () => { komiApi.relink(person.id, i.entity_type, i.entity_id).then(komi.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } : undefined,
      })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível desvincular.', { tone: 'error' })
    }
  }

  if (state.status === 'loading') return <LoadingState variant="row" count={4} />
  if (state.status === 'error') return <ErrorState onRetry={retry} />
  const mem = state.data
  const lanes: { space: RecordSpace; items: MemoryItem[] }[] = (['personal', 'work'] as const).map((space) => ({ space, items: shown.filter((i) => i.context === space) }))

  return (
    <div className="ds-stack km-tab">
      <SummaryCard person={person} />
      {mem.unavailable.length > 0 && (
        <p className="km-warn" role="status"><Icon name="warning" size={14} /> A memória pode estar incompleta: {mem.unavailable.join(', ')} não respondeu. <Button size="sm" variant="ghost" onClick={retry}>Tentar de novo</Button></p>
      )}
      {items.length === 0 ? (
        <EmptyState icon="journal" title="A memória está vazia" hint="Quando você citar a pessoa no diário, numa tarefa, numa transação, num livro ou num filme, ou registrar um contato, tudo aparece aqui." action={<Button icon="phone" onClick={() => komi.openContact({ personId: person.id, typedName: '', kind: 'encontro', date: komi.today, note: '', context: null })}>Registrar contato</Button>} />
      ) : (
        <>
          {agents.length > 1 && (
            <div className="ds-inline km-chips" role="group" aria-label="Filtrar por agente">
              <Chip on={agent === 'all'} onClick={() => setAgent('all')}>Tudo <span className="ds-mono">{items.length}</span></Chip>
              {agents.map(([id, { label, n }]) => <Chip key={id} on={agent === id} onClick={() => setAgent(id)}>{label} <span className="ds-mono">{n}</span></Chip>)}
            </div>
          )}
          {person.context === 'both'
            ? lanes.map((l) => <Lane key={l.space} title={RECORD_SPACE[l.space]} items={l.items} onUnlink={unlink} onOpen={open} />)
            : <Lane items={shown} onUnlink={unlink} onOpen={open} />}
        </>
      )}
      <p className="km-foot"><Tag>{items.length} {items.length === 1 ? 'registro' : 'registros'}</Tag></p>
    </div>
  )
}
