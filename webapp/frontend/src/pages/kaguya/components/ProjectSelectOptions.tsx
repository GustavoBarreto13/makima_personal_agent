// ProjectSelectOptions — filhos de um <select> de listas, agrupados por grupo.
//
// Renderiza <option>/<optgroup> na MESMA ordem da sidebar (ver SidebarNav):
//   Inbox → listas sem grupo (por position) → cada grupo (por position) num
//   <optgroup> com suas listas-filhas (por position). <optgroup> sem lista some.
//
// Uso: <select ...><ProjectSelectOptions projects={…} groups={…} /></select>
// Nunca renderiza o <select> em si — só os filhos. É o mesmo agrupamento do
// switcher de board do topbar (KaguyaShell), reaproveitado em todos os seletores
// de lista (TaskModal, FilterModal, "copiar board de…").

import type { Project, Group } from '../types'

interface ProjectSelectOptionsProps {
  projects: Project[]
  groups: Group[]
  // Quando presente, emite uma <option> inicial para o Inbox com este valor
  // (ex.: "" no TaskModal, onde project_id nulo = Inbox) e OMITE o Inbox real
  // da listagem. Ausente → o Inbox entra como lista comum, pela sua id.
  inbox?: { label: string; value: string }
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

function optionLabel(p: Project): string {
  return p.icon ? `${p.icon} ${p.name}` : p.name
}

export function ProjectSelectOptions({ projects, groups, inbox }: ProjectSelectOptionsProps) {
  // Listas sem grupo. Com `inbox` explícito, o Inbox real sai daqui (vira a
  // <option> inicial); sem ele, o Inbox fica fixado no topo das soltas.
  const ungrouped = [...projects]
    .filter((p) => p.group_id == null && !(inbox && p.is_inbox))
    .sort((a, b) => {
      if (a.is_inbox) return -1
      if (b.is_inbox) return 1
      return byPosition(a, b)
    })

  const orderedGroups = [...groups].sort(byPosition)

  return (
    <>
      {inbox && <option value={inbox.value}>{inbox.label}</option>}
      {ungrouped.map((p) => (
        <option key={p.id} value={p.id}>{optionLabel(p)}</option>
      ))}
      {orderedGroups.map((g) => {
        const inGroup = [...projects].filter((p) => p.group_id === g.id).sort(byPosition)
        if (inGroup.length === 0) return null
        return (
          <optgroup key={g.id} label={g.name}>
            {inGroup.map((p) => (
              <option key={p.id} value={p.id}>{optionLabel(p)}</option>
            ))}
          </optgroup>
        )
      })}
    </>
  )
}
