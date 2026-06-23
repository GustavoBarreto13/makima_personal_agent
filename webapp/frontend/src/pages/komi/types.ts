// types.ts — Interfaces TypeScript da Komi (Pessoas).
// Espelham os schemas do backend (agents/komi/schema_pg.sql e tools.py).
// Divididas em: Person (lista), PersonDetail (perfil completo), OverviewPerson
// (agregação para a Home), PersonSummary (shape cru do backend de summary),
// e PersonLinks (shape adaptado do design handoff, consumido pelos cards de domínio).

// ─── Categorias de relacionamento ─────────────────────────────────────────

/** Categorias canônicas que dirigem filtros e cores no frontend. */
export type Category = 'familia' | 'amigos' | 'trabalho' | 'outros'

// ─── Pessoa (listagem básica) ──────────────────────────────────────────────

/** Formato retornado por GET /api/people/ — usado no grid e sidebar. */
export interface Person {
  id: string
  name: string
  relationship: string | null
  category: Category
  avatar_url: string | null
  link_count: number
}

// ─── Data importante ──────────────────────────────────────────────────────

/** Uma data importante (aniversário, casamento, formatura…). */
export interface ImportantDate {
  id: number         // ID numérico (person_dates.id) — necessário para PATCH/DELETE (fase 026)
  label: string
  date: string       // "YYYY-MM-DD" ou "MM-DD" (recorrente)
  recurring: boolean
  is_synced: boolean // TRUE = tem tarefa Kaguya correspondente via birthday_sync_links (fase 026)
}

// ─── Pessoa detalhe (perfil completo) ─────────────────────────────────────

/** Formato retornado por GET /api/people/{id} — inclui apelidos e datas. */
export interface PersonDetail {
  id: string
  name: string
  normalizado: string
  relationship: string | null
  category: Category
  phone: string | null
  email: string | null
  instagram: string | null
  telegram: string | null
  city: string | null
  avatar_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted: boolean
  aliases: string[]
  datas: ImportantDate[]
}

// ─── Overview (agregação para a Home) ─────────────────────────────────────

/** Formato retornado por GET /api/people/overview — uma entrada por pessoa. */
export interface OverviewPerson {
  id: string
  name: string
  relationship: string | null
  category: Category
  avatar_url: string | null
  dates: ImportantDate[]
  finance_net: number
  last_interaction: {
    date: string   // "YYYY-MM-DD"
    kind: string   // "diário" | "finanças" | "tarefa"
    text: string
  } | null
}

// ─── Summary (shape cru do backend) ───────────────────────────────────────

/** Uma transação financeira como o backend retorna. */
export interface BackendTransaction {
  id: string
  name: string
  valor: number
  tipo: 'Receita' | 'Despesa'
  categoria: string | null
  data: string  // "YYYY-MM-DD"
}

/** Uma tarefa em aberto como o backend retorna. */
export interface BackendTaskOpen {
  id: number
  title: string
  due_date: string | null
  priority: number
}

/** Uma tarefa concluída como o backend retorna. */
export interface BackendTaskDone {
  id: number
  title: string
  completed_at: string
}

/** Um trecho de diário como o backend retorna. */
export interface BackendBullet {
  id: number
  content: string
  date: string  // "YYYY-MM-DD"
}

/** Um livro como o backend retorna. */
export interface BackendBook {
  id: string
  title: string
  author: string | null
  status: string
  rating: number | null
}

/** Shape completo de GET /api/people/{id}/summary. */
export interface PersonSummary {
  status: 'ok'
  perfil: PersonDetail
  financas: {
    saldo: number
    transacoes: BackendTransaction[]
  }
  tarefas: {
    abertas: BackendTaskOpen[]
    concluidas: BackendTaskDone[]
  }
  diario: {
    contagem: number
    trechos: BackendBullet[]
  }
  livros: {
    livros: BackendBook[]
  }
}

// ─── PersonLinks (shape do design, pós-adaptador) ─────────────────────────

/** Uma transação no formato do design handoff. */
export interface DesignTransaction {
  date: string
  desc: string
  amount: number   // positivo = receita (te devem), negativo = despesa (você deve)
  method: string
}

/** Um item de tarefa no formato do design handoff. */
export interface DesignTask {
  title: string
  done: boolean
  due: string | null
  prio: number
}

/** Uma menção de diário no formato do design handoff. */
export interface DesignMention {
  date: string
  time: string
  text: string
}

/** Um livro no formato do design handoff. */
export interface DesignBook {
  title: string
  author: string
  status: string
}

/** Vínculos de domínio no shape consumido pelos cards (após toLinks). */
export interface PersonLinks {
  finances: {
    net: number
    txns: DesignTransaction[]
  }
  tasks: {
    items: DesignTask[]
  }
  journal: {
    mentions: DesignMention[]
  }
  books: DesignBook[]
}
