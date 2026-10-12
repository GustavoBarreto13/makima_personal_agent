// Opções do seletor de lista (ListPicker) a partir de listas e grupos: a Inbox no topo, as soltas, depois cada grupo
// com as suas listas, na ordem da barra lateral. O ícone da lista (emoji) e a cor viajam junto.

import type { ListPickerOption } from '../../../design'
import type { Group, Project } from '../types'

const byPos = <T extends { position: number }>(a: T[]) => [...a].sort((x, y) => x.position - y.position)

export function listOptions(projects: Project[], groups: Group[]): ListPickerOption[] {
  const opt = (p: Project, group?: string): ListPickerOption => ({
    id: String(p.id), label: p.name, group, glyph: p.icon ?? undefined, color: p.icon ? undefined : p.color,
    hint: p.open_count ? String(p.open_count) : undefined,
  })
  const live = projects.filter((p) => !p.archived_at)
  return [
    ...live.filter((p) => p.is_inbox).map((p) => opt(p)),
    ...byPos(live.filter((p) => !p.is_inbox && p.group_id == null)).map((p) => opt(p)),
    ...byPos(groups).flatMap((g) => byPos(live.filter((p) => !p.is_inbox && p.group_id === g.id)).map((p) => opt(p, g.name))),
  ]
}
