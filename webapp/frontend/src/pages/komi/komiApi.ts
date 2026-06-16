// komiApi.ts — Camada de API da Komi (Pessoas).
// Todos os componentes usam este objeto — NUNCA fetch diretamente nos componentes.
// Encapsula as URLs dos endpoints REST e converte os shapes do backend.

import { api } from '../../lib/api'
import type {
  Person,
  PersonDetail,
  OverviewPerson,
  PersonSummary,
  PersonLinks,
  DesignTransaction,
  DesignTask,
  DesignMention,
  DesignBook,
} from './types'

// ─── Adaptador de summary ─────────────────────────────────────────────────
// Converte o shape cru de get_person_summary (backend) para o shape do design
// handoff (PersonLinks), consumido pelos 4 cards de domínio na PersonPage.
// Esta é a única fronteira de impedância entre os dois shapes — se o backend
// mudar, só este adaptador precisa ser atualizado.

export function toLinks(summary: PersonSummary): PersonLinks {
  // ── Finanças ─────────────────────────────────────────────────────────────
  // Backend: {saldo, transacoes[{name, valor, tipo, categoria, data}]}
  // Design:  {net, txns[{date, desc, amount, method}]}
  const txns: DesignTransaction[] = (summary.financas?.transacoes || []).map(t => ({
    date: t.data || '',
    desc: t.name || '',
    // Receita = dinheiro que entra (+), Despesa = dinheiro que sai (-)
    amount: t.tipo === 'Receita' ? Math.abs(t.valor) : -Math.abs(t.valor),
    method: t.categoria || '',
  }))

  // ── Tarefas ──────────────────────────────────────────────────────────────
  // Backend: {abertas[{title, due_date, priority}], concluidas[{title, completed_at}]}
  // Design:  {items[{title, done, due, prio}]}
  const abertas: DesignTask[] = (summary.tarefas?.abertas || []).map(t => ({
    title: t.title,
    done: false,
    due: t.due_date || null,
    prio: t.priority,
  }))
  const concluidas: DesignTask[] = (summary.tarefas?.concluidas || []).map(t => ({
    title: t.title,
    done: true,
    due: t.completed_at || null,
    prio: 0,
  }))

  // ── Diário ───────────────────────────────────────────────────────────────
  // Backend: {trechos[{content, date}]}
  // Design:  {mentions[{date, time, text}]}
  const mentions: DesignMention[] = (summary.diario?.trechos || []).map(b => ({
    date: b.date || '',
    time: '',  // O backend não guarda hora por bullet — fica vazio
    text: b.content || '',
  }))

  // ── Livros ───────────────────────────────────────────────────────────────
  // Backend: {livros[{title, author, status}]}
  // Design:  [{title, author, status}]
  const books: DesignBook[] = (summary.livros?.livros || []).map(bk => ({
    title: bk.title,
    author: bk.author || '',
    status: bk.status || '',
  }))

  return {
    finances: { net: summary.financas?.saldo ?? 0, txns },
    tasks:    { items: [...abertas, ...concluidas] },
    journal:  { mentions },
    books,
  }
}

// ─── API da Komi ─────────────────────────────────────────────────────────

export const komiApi = {
  // ── Listagem e busca ─────────────────────────────────────────────────────

  /** Lista todas as pessoas vivas com link_count. */
  list: () =>
    api.get<{ status: string; people: Person[] }>('/api/people/'),

  /** Agregação cross-pessoa para a Home (dates, finance_net, last_interaction). */
  overview: () =>
    api.get<{ status: string; people: OverviewPerson[] }>('/api/people/overview'),

  /** Perfil completo de uma pessoa (sem cross-agent). */
  get: (id: string) =>
    api.get<{ status: string; perfil: PersonDetail; aliases: string[]; datas: any[] }>(
      `/api/people/${id}`
    ),

  /** Resumo agregado com vínculos cross-agent (finanças, tarefas, diário, livros). */
  summary: (id: string) =>
    api.get<PersonSummary>(`/api/people/${id}/summary`),

  /** Busca por nome ou apelido (smart-match, retorna 0/1/N resultados). */
  search: (q: string) =>
    api.get<{ status: string; matches: { id: string; name: string; relationship: string }[] }>(
      `/api/people/search?q=${encodeURIComponent(q)}`
    ),

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /** Cadastra uma nova pessoa. Retorna {status, id, message}. */
  create: (body: {
    name: string
    relationship?: string
    category?: string
    phone?: string
    email?: string
    instagram?: string
    telegram?: string
    city?: string
    avatar_url?: string
    notes?: string
  }) => api.post<{ status: string; id: string }>('/api/people/', body),

  /** Atualiza campos de uma pessoa (PATCH parcial). */
  update: (id: string, body: Partial<{
    name: string
    relationship: string
    category: string
    phone: string
    email: string
    instagram: string
    telegram: string
    city: string
    avatar_url: string
    notes: string
  }>) => api.patch<{ status: string }>(`/api/people/${id}`, body),

  /** Soft delete de uma pessoa (204 No Content). */
  del: (id: string) =>
    api.del<void>(`/api/people/${id}`),

  // ── Apelidos e datas ──────────────────────────────────────────────────────

  /** Adiciona um apelido a uma pessoa. */
  addAlias: (id: string, alias: string) =>
    api.post<{ status: string }>(`/api/people/${id}/aliases`, { alias }),

  /** Adiciona uma data importante a uma pessoa. */
  addDate: (id: string, date: { label: string; date: string; recurring: boolean }) =>
    api.post<{ status: string }>(`/api/people/${id}/dates`, date),

  // ── Upload de avatar ──────────────────────────────────────────────────────

  /**
   * Faz upload de uma imagem de avatar via multipart/form-data.
   * Retorna {url: "/uploads/icons/<filename>"} para guardar em avatar_url.
   *
   * @param file - Arquivo de imagem (png, jpeg, webp ou gif; máx 1 MB)
   */
  uploadAvatar: async (file: File): Promise<{ url: string }> => {
    // Monta FormData com o arquivo (padrão multipart/form-data)
    const formData = new FormData()
    formData.append('file', file)

    // fetch direto só aqui — api.post serializa para JSON, não suporta FormData
    // credentials: 'include' envia o cookie de sessão (obrigatório)
    const res = await fetch('/api/people/uploads/avatar', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'Erro ao fazer upload do avatar.')
    }

    return res.json()
  },
}
