// Pessoas da Komi para o diário: busca (autocomplete de @, destinatário das cartas) e cadastro de quem ainda não existe.
// A Komi é a dona da identidade — a Violet só guarda o id no texto (@[Nome](komi:id)) e nos vínculos.

import type { PersonOption } from '../../../design'
import { komiApi } from '../../komi/komiApi'
import { violetApi } from '../violetApi'

export async function searchPeople(q: string): Promise<PersonOption[]> {
  const r = await violetApi.suggestPeople(q)
  return (r.people ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    hint: p.alias && p.alias !== p.name ? `“${p.alias}”` : p.relationship ?? undefined,
    avatar: p.avatar_url,
  }))
}

export async function createPerson(name: string): Promise<PersonOption> {
  const r = await komiApi.create({ name: name.trim() })
  return { id: r.id, name: name.trim() }
}
