// Directory.tsx — Diretório de pessoas da Komi.
// Exibe o grid de PersonCards com filtro por categoria (chips) e busca por texto.
// A busca usa normalize() para ignorar acentos e maiúsculas (smart-match).

import { useMemo } from 'react'
import { Icon } from '../icons'
import { PersonCard } from '../components/PersonCard'
import { REL_CATS, normalize } from '../lib'
import type { OverviewPerson } from '../types'

interface DirectoryProps {
  /** Lista de pessoas do overview (tem dates para aniversário e category para filtro). */
  people: OverviewPerson[]
  /** Texto de busca atual (digitado na topbar). */
  query: string
  /** Categoria ativa no filtro: 'todos' | 'familia' | 'amigos' | 'trabalho' | 'outros'. */
  filter: string
  /** Atualiza o filtro de categoria ativo. */
  setFilter: (f: string) => void
  /** Abre o perfil de uma pessoa. */
  onOpen: (id: string) => void
  /** Abre o modal de criação de pessoa. */
  onNew: () => void
}

// Opções do filtro de categoria: 'todos' mais os 4 REL_CATS
const CATS = ['todos', 'familia', 'amigos', 'trabalho', 'outros'] as const

/**
 * Tela de diretório — grid de pessoas com filtro e busca.
 * O filtro de categoria mostra chips coloridos com contagem.
 * A busca aplica smart-match em nome, relacionamento, apelidos e cidade.
 * Ordenação: localeCompare('pt-BR') por nome.
 */
export function Directory({ people, query, filter, setFilter, onOpen, onNew }: DirectoryProps) {
  // ── Contagens por categoria ────────────────────────────────────────────
  // Calculadas uma vez (useMemo) — evita recomputar a cada render
  const counts = useMemo(() => {
    const m: Record<string, number> = { todos: people.length }
    people.forEach(p => {
      m[p.category] = (m[p.category] || 0) + 1
    })
    return m
  }, [people])

  // ── Filtragem + busca ─────────────────────────────────────────────────
  // Combina filtro de categoria E busca por texto em uma única passagem
  const filtered = useMemo(() => {
    // Normaliza a query para comparação sem acentos e maiúsculas
    const q = normalize(query)
    return people
      .filter(p => {
        // Filtro de categoria: 'todos' passa tudo, outros filtram por p.category
        if (filter !== 'todos' && p.category !== filter) return false
        // Busca: se não há query, passa tudo
        if (!q) return true
        // Monta o texto pesquisável: nome + relacionamento
        // (sem aliases e city pois OverviewPerson não tem esses campos)
        const hay = normalize(p.name + ' ' + (p.relationship || ''))
        return hay.includes(q)
      })
      // Ordenação alfabética respeitando o português (ex.: "Ângela" antes de "Bruno")
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [people, query, filter])

  return (
    <div className="page">
      {/* Cabeçalho da página: título + botão de nova pessoa */}
      <div className="page-head">
        <div>
          <div className="page-title">Diretório de pessoas</div>
          <div className="page-sub">
            Identidade canônica · todos os vínculos com os outros agentes num lugar só
          </div>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Icon name="plus" />Nova pessoa
        </button>
      </div>

      {/* Toolbar: chips de filtro por categoria + contador de resultados */}
      <div className="km-toolbar">
        {CATS.map(c => {
          // Metadata: 'todos' tem label próprio, as outras vêm do REL_CATS
          const meta = c === 'todos'
            ? { label: 'Todas', color: 'var(--km)' }
            : REL_CATS[c]

          return (
            <button
              key={c}
              className={'chip' + (filter === c ? ' active' : '')}
              onClick={() => setFilter(c)}
            >
              {/* Dot colorido para as categorias (não aparece em "Todas") */}
              {c !== 'todos' && <span className="sw" style={{ background: meta.color }} />}
              {meta.label}
              {/* Contagem de pessoas nesta categoria */}
              <span className="ct">{counts[c] || 0}</span>
            </button>
          )
        })}

        {/* Espaçador flexível empurra o contador para a direita */}
        <span className="toolbar-spacer" />

        {/* Contador de resultados filtrados */}
        <span className="result-count">
          {filtered.length} {filtered.length === 1 ? 'pessoa' : 'pessoas'}
        </span>
      </div>

      {/* Grid ou estado vazio */}
      {filtered.length === 0 ? (
        // Estado vazio: quando busca ou filtro não retorna nada
        <div className="empty-state">
          <div className="es-icon"><Icon name="users" /></div>
          <div className="es-title">Nenhuma pessoa encontrada</div>
          <div className="es-sub">
            {query
              ? 'Ajuste a busca ou cadastre alguém novo.'
              : 'Cadastre a primeira pessoa desta categoria.'}
          </div>
        </div>
      ) : (
        // Grid de cards: cada PersonCard é clicável e abre o perfil
        <div className="ppl-grid">
          {filtered.map(p => (
            <PersonCard key={p.id} p={p} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}
