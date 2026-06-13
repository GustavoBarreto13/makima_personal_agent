// Tela Rewind — year-in-review cinematográfico.
// Exibe: totais do ano, sessões por mês (gráfico de barras), destaques
// (mais assistido, favorito, nota mais alta) e histograma de notas.
// Dados de GET /api/movies/rewind?year=AAAA (vazio-seguro — SC-006).

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Rewind } from '../types'
// Stars não é usado no RewindScreen — notas aparecem como número, não ícones

// ── Utilitário de meses ──────────────────────────────────────────────────────

// Nomes curtos dos meses para o eixo X do gráfico
const _MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// ── Componente principal ─────────────────────────────────────────────────────

export function RewindScreen() {
  // Ano selecionado — padrão: ano corrente
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState<Rewind | null>(null)
  const [loading, setLoading] = useState(true)

  // Recarrega os dados quando o ano muda
  useEffect(() => {
    setLoading(true)
    akaneApi.rewind(year)
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year])

  // ── Seletor de ano ──────────────────────────────────────────────────────────

  const currentYear = new Date().getFullYear()
  // Exibe os últimos 6 anos como opções
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Cabeçalho com seletor de ano */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink)' }}>
          Rewind
        </h2>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="ak-input"
          style={{ fontSize: 14, padding: '4px 10px', width: 'auto', cursor: 'pointer' }}
        >
          {yearOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="ak-empty">
          <span className="ak-empty-icon">↺</span>
          <p className="ak-empty-title">Calculando o rewind…</p>
        </div>
      )}

      {/* Ano sem dados — estado vazio com mensagem amigável */}
      {!loading && data && data.total_films === 0 && (
        <div className="ak-empty">
          <span className="ak-empty-icon">↺</span>
          <p className="ak-empty-title">Nenhum filme em {year}</p>
          <p className="ak-empty-sub">Comece a logar sessões para ver o Rewind.</p>
        </div>
      )}

      {/* Conteúdo quando há dados */}
      {!loading && data && data.total_films > 0 && (
        <>
          {/* ── TOTAIS ────────────────────────────────────────────────────── */}
          <TotaisGrid data={data} />

          {/* ── GRÁFICO DE SESSÕES POR MÊS ───────────────────────────────── */}
          {data.monthly && data.monthly.length === 12 && (
            <MonthlyChart monthly={data.monthly} />
          )}

          {/* ── DESTAQUES DO ANO ─────────────────────────────────────────── */}
          <Destaques data={data} />

          {/* ── HISTOGRAMA DE NOTAS ───────────────────────────────────────── */}
          {data.rating_histogram && Object.keys(data.rating_histogram).length > 0 && (
            <HistogramaNotas histogram={data.rating_histogram} />
          )}

          {/* ── TOP DIRETORES / PESSOAS ───────────────────────────────────── */}
          {/* Stats.top_directors tem {director, count} — mapeia para {name, count} esperado por TopLista */}
          {data.top_directors && data.top_directors.length > 0 && (
            <TopLista
              titulo="Diretores mais assistidos"
              lista={data.top_directors.map(d => ({ name: d.director, count: d.count }))}
            />
          )}

          {/* ── TOP GÊNEROS ───────────────────────────────────────────────── */}
          {/* Stats.top_genres tem {genre, count} — mapeia para {name, count} esperado por TopLista */}
          {data.top_genres && data.top_genres.length > 0 && (
            <TopLista
              titulo="Gêneros mais assistidos"
              lista={data.top_genres.map(g => ({ name: g.genre, count: g.count }))}
            />
          )}
        </>
      )}

    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

// ── Grade de totais ─────────────────────────────────────────────────────────

function TotaisGrid({ data }: { data: Rewind }) {
  const items = [
    { icon: '◈', label: 'Filmes', value: data.total_films },
    { icon: '📽', label: 'Sessões', value: data.total_sessions },
    { icon: '🔁', label: 'Rewatches', value: data.rewatches },
    { icon: '⭐', label: 'Nota média', value: data.avg_rating != null ? data.avg_rating.toFixed(1) : '—' },
    ...(data.total_minutes != null ? [{ icon: '⏱', label: 'Horas', value: `${Math.round(data.total_minutes / 60)}h` }] : []),
    ...(data.liked_count != null ? [{ icon: '❤️', label: 'Curtidos', value: data.liked_count }] : []),
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
      {items.map(item => (
        <div
          key={item.label}
          className="ak-stat-card"
          style={{ textAlign: 'center', padding: '14px 10px' }}
        >
          <div style={{ fontSize: 20, marginBottom: 4 }}>{item.icon}</div>
          <div className="ak-stat-value">{item.value}</div>
          <div className="ak-stat-label">{item.label}</div>
        </div>
      ))}
    </div>
  )
}


// ── Gráfico de barras por mês ─────────────────────────────────────────────────

function MonthlyChart({ monthly }: { monthly: number[] }) {
  const maxVal = Math.max(...monthly, 1)

  return (
    <section>
      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, margin: '0 0 12px' }}>
        Sessões por mês
      </p>

      {/* Barras verticais para cada mês */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
        {monthly.map((count, i) => {
          const barHeight = (count / maxVal) * 70  // Altura máxima 70px
          return (
            <div
              key={i}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
              title={`${_MONTHS_SHORT[i]}: ${count} sessão${count !== 1 ? 'ões' : ''}`}
            >
              {/* Contagem acima da barra (só quando > 0) */}
              {count > 0 && (
                <span style={{ fontSize: 9, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                  {count}
                </span>
              )}
              {/* Barra colorida com --rose (acento do domínio) */}
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(barHeight, count > 0 ? 4 : 1)}px`,
                  background: count > 0 ? 'var(--rose)' : 'var(--paper-2)',
                  borderRadius: '3px 3px 0 0',
                  opacity: count > 0 ? 1 : 0.4,
                  transition: 'height 0.3s ease',
                }}
              />
              {/* Rótulo do mês abaixo */}
              <span style={{ fontSize: 8, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>
                {_MONTHS_SHORT[i]}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}


// ── Destaques do ano ─────────────────────────────────────────────────────────

function Destaques({ data }: { data: Rewind }) {
  // Exibe apenas os destaques que têm dados.
  // Rewind.favorite é { id, title, rating } | null (não há "favorite_title" separado).
  // Rewind.max_sessions é o número de sessões no dia mais intenso (não um título).
  const destaques = [
    // Favorito do ano: usa data.favorite.title (shape correto do tipo)
    data.favorite && {
      label: 'Favorito do ano',
      value: data.favorite.title,
      extra: data.favorite.rating != null ? `⭐ ${data.favorite.rating}` : undefined,
      icon: '❤️',
    },
    // Maior maratona em um único dia
    data.max_sessions > 0 && {
      label: 'Maior maratona',
      value: `${data.max_sessions} ${data.max_sessions === 1 ? 'sessão' : 'sessões'} em um dia`,
      icon: '🔁',
    },
  ].filter(Boolean) as { label: string; value: string; extra?: string; icon: string }[]

  if (destaques.length === 0) return null

  return (
    <section>
      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, margin: '0 0 12px' }}>
        Destaques
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {destaques.map(d => (
          <div
            key={d.label}
            className="ak-stat-card"
            style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{d.icon}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 1 }}>
                {d.label}
              </span>
            </div>
            <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 600, fontFamily: 'var(--serif)' }}>
              {d.value}
            </span>
            {d.extra && (
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{d.extra}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}


// ── Histograma de notas ──────────────────────────────────────────────────────

function HistogramaNotas({ histogram }: { histogram: Record<string, number> }) {
  const keys = ['0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5']
  const values = keys.map(k => histogram[k] ?? 0)
  const maxVal = Math.max(...values, 1)

  return (
    <section>
      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, margin: '0 0 12px' }}>
        Distribuição de notas
      </p>
      <div className="ak-histogram">
        {keys.map((k, i) => {
          const val = values[i]
          const height = (val / maxVal) * 60
          return (
            <div key={k} className="ak-histogram-col">
              {val > 0 && <span className="ak-histogram-count">{val}</span>}
              <div className="ak-histogram-bar" style={{ height: `${Math.max(height, 2)}px` }} />
              <span className="ak-histogram-label">{k}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}


// ── Top lista genérica (diretores, gêneros) ───────────────────────────────────

function TopLista({ titulo, lista }: { titulo: string; lista: Array<{ name: string; count: number }> }) {
  const top = lista.slice(0, 5)  // Exibe no máximo 5 itens
  const maxCount = Math.max(...top.map(x => x.count), 1)

  return (
    <section>
      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, margin: '0 0 12px' }}>
        {titulo}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {top.map((item, i) => {
          const pct = (item.count / maxCount) * 100
          return (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Posição */}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', width: 16, textAlign: 'right', flexShrink: 0 }}>
                {i + 1}
              </span>
              {/* Nome */}
              <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              {/* Barra de progresso relativa */}
              <div style={{ width: 80, height: 4, background: 'var(--paper-2)', borderRadius: 2, flexShrink: 0 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--rose)', borderRadius: 2 }} />
              </div>
              {/* Contagem */}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', width: 24, textAlign: 'right', flexShrink: 0 }}>
                {item.count}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
