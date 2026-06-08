// Tela de estatísticas — "ano em revista".
// Exibe métricas consolidadas: livros lidos, páginas totais, barras mensais,
// distribuição de notas e destaques do ano (gênero favorito, autor mais lido, streak).

import { useMemo } from 'react'
import type { Book, HeatmapDay, ActivityEntry } from '../types'
import { Stars } from '../ui/Stars'

// Props recebidas da FrierenShell
interface StatsProps {
  books: Book[]
  heatmap: HeatmapDay[]
  activity: ActivityEntry[]
}

// Nomes dos meses para os rótulos das barras
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                     'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Chave de destaque — pequeno bloco de label + valor + subtítulo
function Highlight({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub: string
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      paddingBottom: 14,
      borderBottom: '1px solid var(--line-2)',
    }}>
      {/* Rótulo em fonte mono maiúscula — identidade de metadado */}
      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: 9.5,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'var(--ink-4)',
      }}>
        {label}
      </span>
      {/* Valor principal em Newsreader com cor teal */}
      <span style={{
        fontFamily: 'var(--serif)',
        fontSize: 22,
        fontWeight: 500,
        color: 'var(--teal-deep)',
        letterSpacing: '-0.01em',
      }}>
        {value}
      </span>
      {/* Subtítulo descritivo */}
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span>
    </div>
  )
}

// Componente principal da tela de estatísticas
export function Stats({ books, heatmap, activity: _activity }: StatsProps) {
  // Ano corrente — base de todos os cálculos
  const year = new Date().getFullYear()

  // ── CÁLCULOS MEMOIZADOS ────────────────────────────────────────────────────

  // Livros terminados no ano corrente
  const readThisYear = useMemo(
    () => books.filter(b => b.status === 'read' && b.finished?.startsWith(String(year))),
    [books, year]
  )

  // Total de páginas em todo o heatmap (não só no ano)
  const totalPages = useMemo(
    () => heatmap.reduce((s, d) => s + d.pages, 0),
    [heatmap]
  )

  // Páginas por mês (array de 12 posições, índice 0 = janeiro)
  const monthly = useMemo(() => {
    const arr = Array(12).fill(0) as number[]
    heatmap.forEach(d => {
      // Força horário local para evitar off-by-one de fuso horário
      const month = new Date(d.date + 'T00:00:00').getMonth()
      arr[month] += d.pages
    })
    return arr
  }, [heatmap])

  // Maior valor mensal — usado para normalizar a altura das barras
  const maxMonthly = Math.max(...monthly, 1)

  // Melhor streak do histórico completo
  const bestStreak = useMemo(() => {
    let best = 0
    let cur = 0
    heatmap.forEach(d => {
      if (d.pages > 0) {
        cur++
        if (cur > best) best = cur
      } else {
        cur = 0
      }
    })
    return best
  }, [heatmap])

  // Distribuição de notas dos livros terminados no ano
  const ratingDist = useMemo(() => {
    const dist: Record<string, number> = {}
    readThisYear
      .filter(b => b.rating != null)
      .forEach(b => {
        const k = String(b.rating)
        dist[k] = (dist[k] ?? 0) + 1
      })
    return dist
  }, [readThisYear])

  // Maior contagem na distribuição — para normalizar as barras de rating
  const maxRating = Math.max(...Object.values(ratingDist), 1)

  // Chaves de rating a exibir — da maior para a menor nota
  const ratingKeys = ['5', '4.5', '4', '3.5', '3']

  // Gênero mais lido no ano
  const topGenre = useMemo(() => {
    const count: Record<string, number> = {}
    readThisYear.forEach(b => {
      if (b.genre) count[b.genre] = (count[b.genre] ?? 0) + 1
    })
    const entries = Object.entries(count).sort((a, b) => b[1] - a[1])
    return entries[0] ?? null
  }, [readThisYear])

  // Autor mais lido no ano
  const topAuthor = useMemo(() => {
    const count: Record<string, number> = {}
    readThisYear.forEach(b => {
      count[b.author] = (count[b.author] ?? 0) + 1
    })
    const entries = Object.entries(count).sort((a, b) => b[1] - a[1])
    return entries[0] ?? null
  }, [readThisYear])

  // Nota média dos livros terminados no ano
  const avgRating = useMemo(() => {
    const rated = readThisYear.filter(b => b.rating != null)
    if (rated.length === 0) return 0
    return rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length
  }, [readThisYear])

  // Gêneros únicos explorados no ano
  const genreList = useMemo(() => {
    const genres = new Set(readThisYear.map(b => b.genre).filter(Boolean) as string[])
    return [...genres]
  }, [readThisYear])

  return (
    <div className="page">

      {/* ── HERO ── */}
      <div className="stats-hero">
        <div className="eyebrow">Seu ano em leitura</div>
        <h2>{year}, até aqui</h2>
      </div>

      {/* ── ESTATÍSTICAS GRANDES ── */}
      {/* 3 métricas principais em destaque — livros, páginas e nota média */}
      <div className="big-stat-row">
        <div className="big-stat">
          <div className="n">{readThisYear.length}</div>
          <div className="l">livros terminados</div>
        </div>
        <div className="big-stat">
          <div className="n">{totalPages.toLocaleString('pt-BR')}</div>
          <div className="l">páginas percorridas</div>
        </div>
        <div className="big-stat">
          <div className="n">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</div>
          <div className="l">nota média</div>
        </div>
      </div>

      {/* ── GRÁFICO DE BARRAS MENSAIS ── */}
      {/* Cada mês tem uma barra proporcional ao total de páginas lidas */}
      <div className="section">
        <div className="heat-card">
          <div className="heat-head">
            <span className="heat-title">Páginas por mês</span>
          </div>

          {/* Container das barras — alinhadas na base para comparação visual */}
          <div className="bars">
            {monthly.map((v, i) => (
              <div key={i} className="bar-col">
                {/* Valor acima da barra em formato compacto (k = mil) */}
                <span className="bar-val">
                  {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v > 0 ? String(v) : ''}
                </span>
                {/* Barra com altura proporcional ao máximo mensal */}
                <div
                  className="bar"
                  style={{ height: `${Math.max(2, (v / maxMonthly) * 100)}%` }}
                />
                {/* Rótulo do mês abaixo da barra */}
                <span className="bar-lbl">{MONTH_NAMES[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DISTRIBUIÇÃO DE NOTAS E DESTAQUES ── */}
      {/* Grade de dois cartões lado a lado */}
      <div className="section" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 18,
      }}>

        {/* Cartão: distribuição de notas */}
        <div className="heat-card">
          <div className="heat-head">
            <span className="heat-title">Como você avalia</span>
          </div>
          {ratingKeys.map(k => {
            // Contagem de livros com esta nota
            const count = ratingDist[k] ?? 0
            // Percentual em relação ao máximo — para a largura da barra
            const pct = (count / maxRating) * 100
            return (
              <div key={k} className="dist-row">
                {/* Estrelas da nota */}
                <span className="dl">
                  <Stars value={Number(k)} />
                </span>
                {/* Barra de progresso dourada */}
                <span className="dist-bar">
                  <i style={{ width: `${pct}%` }} />
                </span>
                {/* Contagem numérica */}
                <span className="dist-n">{count}</span>
              </div>
            )
          })}
        </div>

        {/* Cartão: destaques do ano */}
        <div className="heat-card">
          <div className="heat-head">
            <span className="heat-title">Destaques do ano</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
            {/* Gênero favorito */}
            <Highlight
              label="Gênero favorito"
              value={topGenre ? topGenre[0] : '—'}
              sub={topGenre ? `${topGenre[1]} ${topGenre[1] === 1 ? 'livro' : 'livros'}` : 'sem dados ainda'}
            />
            {/* Autor mais lido */}
            <Highlight
              label="Autor mais lido"
              value={topAuthor ? topAuthor[0] : '—'}
              sub={topAuthor ? `${topAuthor[1]} ${topAuthor[1] === 1 ? 'livro' : 'livros'}` : 'sem dados ainda'}
            />
            {/* Maior sequência de leitura do histórico */}
            <Highlight
              label="Maior sequência"
              value={`${bestStreak} dias`}
              sub="lendo sem parar"
            />
            {/* Quantidade de gêneros diferentes explorados */}
            <Highlight
              label="Gêneros explorados"
              value={genreList.length}
              sub={genreList.length > 0
                ? genreList.join(' · ')
                : 'nenhum registrado ainda'}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
