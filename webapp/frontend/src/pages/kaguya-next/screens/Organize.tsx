// Organizar: um só lugar para criar, editar, reordenar e arquivar listas, grupos e smart-lists, e para gerenciar os locais
// (“Onde (@)”). A ordem aqui é a ordem da barra lateral. Reordenar troca a posição de dois vizinhos — por botão, então
// funciona no teclado e no celular (o arrastar fica para a barra lateral).

import { Button, Chip, EmptyState, IconButton, Page, SectionHeader, toast } from '../../../design'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import type { Filter, Group, Project } from '../types'

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position
const reason = (e: unknown) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível reordenar.')

function Arrows({ i, n, label, onMove }: { i: number; n: number; label: string; onMove: (dir: -1 | 1) => void }) {
  return (
    <span className="kn-quick-i">
      <IconButton icon="up" label={`Subir ${label}`} size={14} disabled={i === 0} onClick={() => onMove(-1)} />
      <IconButton icon="down" label={`Descer ${label}`} size={14} disabled={i === n - 1} onClick={() => onMove(1)} />
    </span>
  )
}

export function Organize() {
  const k = useKaguya()
  const { manage } = k
  const inbox = k.projects.find((p) => p.is_inbox)
  const loose = k.projects.filter((p) => !p.is_inbox && p.group_id == null).sort(byPos)
  const groups = [...k.groups].sort(byPos)
  const filters = [...k.filters].sort(byPos)

  // Troca as posições dos dois vizinhos (as posições podem ter lacunas, então não basta somar 1).
  const swap = async <T extends { id: number; position: number }>(list: T[], i: number, dir: -1 | 1, write: (id: number, position: number) => Promise<unknown>) => {
    const a = list[i]
    const b = list[i + dir]
    if (!b) return
    try { await write(a.id, b.position); await write(b.id, a.position); k.reload() } catch (e) { toast(reason(e), { tone: 'error' }) }
  }
  const moveProject = (list: Project[], i: number, dir: -1 | 1) => swap(list, i, dir, (id, position) => kaguyaApi.updateProject(id, { position }))
  const moveGroup = (i: number, dir: -1 | 1) => swap(groups, i, dir, (id, position) => kaguyaApi.updateGroup(id, { position }))
  const moveFilter = (i: number, dir: -1 | 1) => swap(filters, i, dir, (id, position) => kaguyaApi.updateFilter(id, { position }))

  const row = (p: Project, list: Project[], i: number) => (
    <li key={p.id}>
      <Arrows i={i} n={list.length} label={p.name} onMove={(d) => void moveProject(list, i, d)} />
      <button type="button" className="kn-main" onClick={() => k.goto({ view: 'list', id: p.id })}><span className="kn-title">{p.name}</span></button>
      {p.context === 'work' && <Chip on icon="work">Trabalho</Chip>}
      {p.sequential && <Chip on icon="dependency">Sequencial</Chip>}
      <span className="ds-mono">{p.open_count} abertas</span>
      <IconButton icon="edit" label={`Editar a lista ${p.name}`} size={14} onClick={() => manage.project(p)} />
    </li>
  )

  const empty = k.projects.length === 0 && k.groups.length === 0 && k.filters.length === 0
  return (
    <Page wide className="kn-page">
      <div className="kn-quick">
        <Button variant="primary" icon="add" onClick={() => manage.project()}>Nova lista</Button>
        <Button icon="folder" onClick={() => manage.group()}>Novo grupo</Button>
        <Button icon="filter" onClick={() => manage.filter()}>Nova smart-list</Button>
        <Button icon="place" onClick={() => manage.contexts()}>Onde (@)</Button>
      </div>
      <p className="ds-hint">A ordem aqui é a ordem da barra lateral. O espaço (Trabalho/Pessoal) de cada lista filtra todas as telas.</p>

      {empty && <EmptyState icon="folder" title="Nada para organizar ainda" hint="Crie sua primeira lista ou grupo para começar." />}

      {(inbox || loose.length > 0) && (
        <section aria-label="Listas soltas">
          <SectionHeader title="Listas" mono={`${loose.length + (inbox ? 1 : 0)}`} />
          <ul className="kn-sublist">
            {inbox && (
              <li>
                <span className="kn-quick-i" aria-hidden="true" />
                <button type="button" className="kn-main" onClick={() => k.goto({ view: 'list', id: inbox.id })}><span className="kn-title">{inbox.name}</span></button>
                <Chip on>Inbox</Chip>
                <span className="ds-mono">{inbox.open_count} abertas</span>
              </li>
            )}
            {loose.map((p, i) => row(p, loose, i))}
          </ul>
        </section>
      )}

      {groups.map((g: Group, gi) => {
        const lists = k.projects.filter((p) => p.group_id === g.id).sort(byPos)
        return (
          <section key={g.id} aria-label={`Grupo ${g.name}`}>
            <SectionHeader
              title={g.name}
              action={(
                <span className="kn-quick-i">
                  {g.context === 'work' && <Chip on icon="work">Trabalho</Chip>}
                  <Arrows i={gi} n={groups.length} label={`o grupo ${g.name}`} onMove={(d) => void moveGroup(gi, d)} />
                  <Button size="sm" icon="add" onClick={() => manage.project(undefined, g.id)}>Lista</Button>
                  <IconButton icon="edit" label={`Editar o grupo ${g.name}`} size={14} onClick={() => manage.group(g)} />
                </span>
              )}
            />
            {lists.length === 0 ? <p className="ds-hint">Grupo sem listas.</p> : <ul className="kn-sublist">{lists.map((p, i) => row(p, lists, i))}</ul>}
          </section>
        )
      })}

      {filters.length > 0 && (
        <section aria-label="Smart-listas">
          <SectionHeader title="Smart-listas" mono={`${filters.length}`} />
          <ul className="kn-sublist">
            {filters.map((f: Filter, i) => (
              <li key={f.id}>
                <Arrows i={i} n={filters.length} label={f.name} onMove={(d) => void moveFilter(i, d)} />
                <button type="button" className="kn-main" onClick={() => k.goto({ view: 'filter', id: f.id })}><span className="kn-title">{f.name}</span></button>
                <span className="ds-mono">{f.rules.conditions.length} condição(ões)</span>
                <IconButton icon="edit" label={`Editar a smart-list ${f.name}`} size={14} onClick={() => manage.filter(f)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  )
}
