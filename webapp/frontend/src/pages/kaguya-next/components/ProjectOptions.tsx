// Filhos de um <select> de listas, na mesma ordem da sidebar: Inbox, listas soltas e, por grupo, as listas dele.
// Grupo sem lista some. Só devolve as <option>; o <select> é de quem usa.

import type { Group, Project } from '../types'

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

export function ProjectOptions({ projects, groups }: { projects: Project[]; groups: Group[] }) {
  const loose = [...projects].filter((p) => p.group_id == null).sort((a, b) => (a.is_inbox ? -1 : b.is_inbox ? 1 : byPosition(a, b)))
  return (
    <>
      {loose.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      {[...groups].sort(byPosition).map((g) => {
        const inGroup = projects.filter((p) => p.group_id === g.id).sort(byPosition)
        return inGroup.length === 0 ? null : (
          <optgroup key={g.id} label={g.name}>{inGroup.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        )
      })}
    </>
  )
}
