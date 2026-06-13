// Tela de estatísticas anuais.
// Exibe: totais (filmes, sessões, nota média), histograma de notas,
// top gêneros e top diretores do ano.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Stats } from '../types'

/**
 * Tela de estatísticas de filmes do ano.
 * Todos os blocos são vazio-seguros — nunca exibe erro quando não há dados (SC-006).
 */
export function StatsScreen() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    akaneApi.stats(year)
      .then(res => setStats(res))
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [year])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{
          width: 32, height: 32,
          border: '2px solid var(--line)',
          borderTopColor: 'var(--rose)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  // Mesmo sem dados, renderiza os cards zerados (SC-006: sem erro/crash)
  const s = stats

  return (
    <div>
      {/* ── Seletor de ano ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          className="ak-btn"
          onClick={() => setYear(y => y - 1)}
          aria-label="Ano anterior"
        >‹</button>
        <span style={{
          fontFamily: 'var(--display)',
          fontSize: 28,
          color: 'var(--rose-deep)',
          minWidth: 64,
          textAlign: 'center',
        }}>
          {year}
        </span>
        <button
          className="ak-btn"
          onClick={() => setYear(y => y + 1)}
          disabled={year >= new Date().getFullYear()}
          aria-label="Próximo ano"
        >›</button>
      </div>

      {/* ── Cards de totais ───────────────────────────────────────────── */}
      <div className="ak-stat-cards">
        <StatCard
          num={String(s?.total_films ?? 0)}
          label="Filmes assistidos"
        />
        <StatCard
          num={String(s?.total_sessions ?? 0)}
          label="Sessões"
        />
        <StatCard
          num={s?.rewatches ? String(s.rewatches) : '0'}
          label="Revisões"
        />
        <StatCard
          num={s?.avg_rating ? s.avg_rating.toFixed(1) : '—'}
          label="Nota média"
        />
      </div>

      {/* ── Histograma de notas ─────────────────────────────────────── */}
      {s && Object.values(s.rating_histogram).some(v => v > 0) && (
        <div style={{ marginBottom: 28 }}>
          <p style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 12,
          }}>
            Distribuição de notas
          </p>
          <Histogram histogram={s.rating_histogram} />
        </div>
      )}

      {/* ── Top gêneros ─────────────────────────────────────────────── */}
      {s && s.top_genres.length > 0 && (
        <TopList
          title="Gêneros mais vistos"
          items={s.top_genres.map(g => ({ name: g.genre, count: g.count }))}
        />
      )}

      {/* ── Top diretores ───────────────────────────────────────────── */}
      {s && s.top_directors.length > 0 && (
        <TopList
          title="Diretores mais vistos"
          items={s.top_directors.map(d => ({ name: d.director, count: d.count }))}
        />
      )}

      {/* Estado vazio do ano */}
      {s && s.total_sessions === 0 && (
        <div className="ak-empty" style={{ paddingTop: 20 }}>
          <p className="ak-empty-title">Nenhuma sessão em {year}</p>
          <p className="ak-empty-sub">Registre filmes assistidos para ver as estatísticas.</p>
        </div>
      )}
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

/** Card de estatística com número grande e rótulo. */
function StatCard({ num, label }: { num: string; label: string }) {
  return (
    <div className="ak-stat-card">
      <p className="ak-stat-num">{num}</p>
      <p className="ak-stat-label">{label}</p>
    </div>
  )
}

/** Histograma de notas (barras verticais com escala relativa). */
function Histogram({ histogram }: { histogram: Record<string, number> }) {
  // Ordena as notas de 0.5 a 5.0
  const keys = ['0.5','1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0']
  const values = keys.map(k => histogram[k] ?? 0)
  const max = Math.max(...values, 1)  // max nunca < 1 para evitar divisão por zero

  return (
    <div>
      {/* Barras */}
      <div className="ak-histogram">
        {keys.map((k, i) => (
          <div
            key={k}
            className="ak-hist-bar"
            style={{ height: `${Math.max((values[i] / max) * 100, 2)}%` }}
            title={`${k} estrelas: ${values[i]} sessão(ões)`}
          />
        ))}
      </div>
      {/* Rótulos do eixo X */}
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {keys.map(k => (
          <div
            key={k}
            style={{
              flex: 1, textAlign: 'center',
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-4)',
            }}
          >
            {k}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Lista de top itens (gêneros ou diretores) com barra de progresso relativa. */
function TopList({ title, items }: { title: string; items: Array<{ name: string; count: number }> }) {
  const max = Math.max(...items.map(i => i.count), 1)
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{
        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10,
      }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Nome */}
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink-2)', width: 140, flexShrink: 0 }}>
              {item.name}
            </span>
            {/* Barra relativa */}
            <div style={{ flex: 1, background: 'var(--line-2)', borderRadius: 99, height: 4 }}>
              <div style={{
                width: `${(item.count / max) * 100}%`,
                height: '100%',
                background: 'var(--gold)',    /* verde Letterboxd fixo */
                borderRadius: 99,
              }} />
            </div>
            {/* Contagem */}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', width: 24, textAlign: 'right' }}>
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
