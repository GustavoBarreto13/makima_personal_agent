// Tela de Etiquetas — Onda 5 (US5).
// Exibe nuvem de etiquetas (tags de filmes e pessoas marcadas como is_person_tag).
// Clicar em uma etiqueta navega para FilmsScreen filtrada por essa tag.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Tag } from '../types'

// ── Props ────────────────────────────────────────────────────────────────────

interface TagsScreenProps {
  // Callback chamado ao clicar em uma tag — navega para FilmsScreen com filtro
  onSelectTag: (tag: string) => void
}

// ── Componente principal ─────────────────────────────────────────────────────

export function TagsScreen({ onSelectTag }: TagsScreenProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    akaneApi.tags()
      .then(r => setTags(r.tags))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="ak-empty">
        <span className="ak-empty-icon">⊕</span>
        <p className="ak-empty-title">Carregando etiquetas…</p>
      </div>
    )
  }

  if (tags.length === 0) {
    return (
      <div className="ak-empty">
        <span className="ak-empty-icon">⊕</span>
        <p className="ak-empty-title">Nenhuma etiqueta ainda</p>
        <p className="ak-empty-sub">
          Adicione tags ao logar uma sessão ou nos detalhes de um filme.
        </p>
      </div>
    )
  }

  // Encontra o count máximo para calcular o tamanho relativo de cada tag
  const maxCount = Math.max(...tags.map(t => t.count), 1)

  // Separa etiquetas de pessoas (person=true) das etiquetas comuns
  // O campo no backend é "person" — ver types.ts Tag.person
  const pessoasTags = tags.filter(t => t.person)
  const etiquetasComuns = tags.filter(t => !t.person)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Etiquetas comuns ────────────────────────────────────────────── */}
      {etiquetasComuns.length > 0 && (
        <section>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, margin: '0 0 16px' }}>
            Etiquetas ({etiquetasComuns.length})
          </p>
          <TagCloud tags={etiquetasComuns} maxCount={maxCount} onSelectTag={onSelectTag} />
        </section>
      )}

      {/* ── Pessoas (is_person_tag=true) ────────────────────────────────── */}
      {pessoasTags.length > 0 && (
        <section>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, margin: '0 0 16px' }}>
            Pessoas ({pessoasTags.length})
          </p>
          <TagCloud tags={pessoasTags} maxCount={maxCount} onSelectTag={onSelectTag} isPeople />
        </section>
      )}

    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTE: Nuvem de tags
// ─────────────────────────────────────────────────────────────────────────────

interface TagCloudProps {
  tags: Tag[]
  maxCount: number
  onSelectTag: (tag: string) => void
  isPeople?: boolean  // Se true, usa estilo diferente (pessoas vs. etiquetas)
}

function TagCloud({ tags, maxCount, onSelectTag, isPeople = false }: TagCloudProps) {
  // Ordena por count decrescente
  const sorted = [...tags].sort((a, b) => b.count - a.count)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {sorted.map(tag => {
        // Tamanho de fonte relativo ao count (entre 12px e 22px)
        const ratio = tag.count / maxCount
        const fontSize = Math.round(12 + ratio * 10)

        // Opacidade também varia com o count (mais frequentes = mais visíveis)
        const opacity = 0.5 + ratio * 0.5

        return (
          <button
            key={tag.name}
            onClick={() => onSelectTag(tag.name)}
            className="ak-chip"
            style={{
              fontSize,
              opacity,
              // Destaque visual para etiquetas de pessoas
              background: isPeople
                ? 'color-mix(in srgb, var(--rose) 12%, var(--paper-2))'
                : 'var(--paper-2)',
              border: isPeople
                ? '1px solid color-mix(in srgb, var(--rose) 30%, transparent)'
                : '1px solid var(--line)',
              cursor: 'pointer',
              padding: `${4 + Math.round(ratio * 2)}px ${8 + Math.round(ratio * 4)}px`,
              lineHeight: 1.3,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            title={`${tag.count} ${tag.count === 1 ? 'filme' : 'filmes'}`}
          >
            {/* Ícone de pessoa para is_person tags */}
            {isPeople && <span style={{ fontSize: fontSize * 0.8 }}>👤</span>}
            {tag.name}
            {/* Contador discreto */}
            <span
              style={{
                fontSize: Math.max(10, fontSize * 0.65),
                color: 'var(--ink-4)',
                fontFamily: 'var(--mono)',
              }}
            >
              {tag.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
