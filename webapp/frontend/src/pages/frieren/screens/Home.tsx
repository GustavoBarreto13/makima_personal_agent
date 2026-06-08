// Tela inicial (Home) da seção Frieren.
// Exibe: hero com saudação, cards de estatísticas, heatmap de leitura,
// carrossel "Lendo agora" e feed de atividade recente.

import { useMemo } from 'react'
import type { Book, HeatmapDay, ActivityEntry, Tweaks } from '../types'
import { Icon } from '../ui/Icons'
import { Cover } from '../ui/Cover'
import { Stars } from '../ui/Stars'
import { ProgressBar } from '../ui/ProgressBar'
import { Spark } from '../ui/Spark'
import { Heatmap } from '../ui/Heatmap'

// Props recebidas da FrierenShell
interface HomeProps {
  books: Book[]
  heatmap: HeatmapDay[]
  activity: ActivityEntry[]
  navigate: (view: string, param?: string | null) => void
  openLog: (bookId?: string | null) => void
  tweaks: Tweaks
  // Livro sendo lido com maior progresso — pode ser null se não houver leitura ativa
  atual: Book | null
}

// Retorna saudação baseada no horário atual
function saudacao(): string {
  const h = new Date().getHours()
  if (h < 5)  return 'Boa noite.'
  if (h < 12) return 'Bom dia.'
  if (h < 18) return 'Boa tarde.'
  return 'Boa noite.'
}

// Formata uma data ISO em texto legível (ex: "3 de Mar")
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${d.getDate()} de ${MESES[d.getMonth()]}`
}

// Retorna tempo relativo legível (ex: "hoje", "ontem", "há 3 dias")
function relDate(iso: string): string {
  const hoje = new Date().toISOString().slice(0, 10)
  if (iso === hoje) return 'hoje'
  const diff = Math.round(
    (new Date(hoje).getTime() - new Date(iso + 'T00:00:00').getTime()) / 86400000
  )
  if (diff === 1) return 'ontem'
  if (diff < 7) return `há ${diff} dias`
  return fmtDate(iso)
}

// Item do feed de atividade — exibido na seção "Atividade recente"
function FeedItem({
  a,
  books,
  navigate,
}: {
  a: ActivityEntry
  books: Book[]
  navigate: (view: string, param?: string | null) => void
}) {
  // Busca os dados do livro correspondente à entrada de atividade
  const b = books.find(book => book.id === a.bookId)
  if (!b) return null

  // Texto do verbo conforme o tipo de atividade
  const verb: Record<ActivityEntry['type'], string> = {
    progress: 'leu',
    finished: 'terminou',
    started: 'começou',
    review: 'resenhou',
  }

  return (
    <div className="feed-item">
      {/* Capa clicável — navega para o detalhe do livro */}
      <div
        className="feed-cover"
        onClick={() => navigate('detalhe', b.id)}
        style={{ cursor: 'pointer' }}
      >
        <Cover book={b} />
      </div>

      <div className="feed-body">
        <div className="feed-line">
          <span className="verb">{verb[a.type]} </span>
          {/* Título clicável */}
          <b style={{ cursor: 'pointer' }} onClick={() => navigate('detalhe', b.id)}>
            {b.title}
          </b>
          {/* Informações extras conforme o tipo */}
          {a.type === 'progress' && (
            <span className="verb"> · {a.pages} páginas</span>
          )}
          {a.type === 'started' && (
            <span className="verb"> · {b.author}</span>
          )}
        </div>

        {/* Nota/comentário da sessão de leitura, se houver */}
        {a.note && <div className="feed-note">"{a.note}"</div>}

        <div className="feed-meta">
          <span>{relDate(a.date)}</span>
          {/* Badges contextuais por tipo */}
          {a.type === 'finished' && <span className="feed-tag done">terminado</span>}
          {a.type === 'started' && <span className="feed-tag">novo</span>}
          {a.type === 'progress' && a.page && (
            <span>até a pág. {a.page}</span>
          )}
          {/* Estrelas de avaliação se a entrada tiver nota */}
          {a.rating != null && <Stars value={a.rating} />}
        </div>
      </div>
    </div>
  )
}

// Componente principal da tela inicial
export function Home({ books, heatmap, activity, navigate, openLog, tweaks, atual }: HomeProps) {
  // ── Cálculos de estatísticas ───────────────────────────────────────────────

  // Total de páginas nos últimos 7 dias
  const last7 = useMemo(
    () => heatmap.slice(-7).reduce((s, d) => s + d.pages, 0),
    [heatmap]
  )

  // Total de páginas nos 7 dias anteriores (para comparação percentual)
  const prev7 = useMemo(
    () => heatmap.slice(-14, -7).reduce((s, d) => s + d.pages, 0),
    [heatmap]
  )

  // Delta percentual em relação à semana anterior
  const pct7 = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : 0

  // Sequência atual de dias com leitura (streak)
  const streak = useMemo(() => {
    let s = 0
    for (let i = heatmap.length - 1; i >= 0; i--) {
      if (heatmap[i].pages > 0) s++
      else break
    }
    return s
  }, [heatmap])

  // Quantidade de livros terminados no ano corrente
  const year = new Date().getFullYear()
  const readThisYear = useMemo(
    () => books.filter(b => b.status === 'read' && b.finished?.startsWith(String(year))).length,
    [books, year]
  )

  // Dados do sparkline (últimos 14 dias)
  const sparkData = useMemo(() => heatmap.slice(-14).map(d => d.pages), [heatmap])

  // Média de páginas por dia nos últimos 30 dias
  const avgDaily = useMemo(() => {
    const slice = heatmap.slice(-30)
    if (slice.length === 0) return 0
    return Math.round(slice.reduce((s, d) => s + d.pages, 0) / slice.length)
  }, [heatmap])

  // Total de páginas no ano (para exibição no heatmap)
  const totalPages = useMemo(
    () => heatmap.reduce((s, d) => s + d.pages, 0),
    [heatmap]
  )

  // Livros sendo lidos agora
  const lendo = books.filter(b => b.status === 'reading')

  // Mapeamento de layoutInicio para o atributo data-layout do hero
  const layoutMap: Record<Tweaks['layoutInicio'], string> = {
    'Cinemático': 'cinematico',
    'Editorial':  'editorial',
    'Galeria':    'galeria',
  }
  const layout = layoutMap[tweaks.layoutInicio] ?? 'cinematico'

  return (
    <div className="page">

      {/* ── HERO ── */}
      {/* Layout controlado pelo tweak "layoutInicio" via data-layout */}
      <div className="hero" data-layout={layout}>
        {/* Sobreposição de ruído granulado para textura no hero */}
        <div className="hero-grain" />

        <div className="hero-inner">
          {/* Coluna esquerda: saudação, livro atual, CTAs */}
          <div className="hero-copy">
            <div className="hero-eyebrow">Biblioteca de Frieren</div>

            {/* Saudação dinâmica conforme horário */}
            <h1 className="hero-greet">{saudacao()}</h1>

            {/* Livro sendo lido com maior progresso — exibido se houver */}
            {atual ? (
              <p className="hero-now">
                No meio de <em>{atual.title}</em>
                {atual.page != null && atual.pages != null
                  ? ` · pág. ${atual.page} de ${atual.pages}`
                  : ''}
              </p>
            ) : (
              <p className="hero-now">Nenhum livro em leitura no momento.</p>
            )}

            {/* Citação decorativa */}
            <p className="hero-quote">
              "A magia é a arte de imaginar o mundo. Os livros também — e a vantagem é que
              neles a gente nunca esquece."
            </p>

            {/* Botões de ação */}
            <div className="hero-cta">
              <button className="btn btn-primary" onClick={() => openLog()}>
                <Icon name="plus" /> Registrar leitura
              </button>
              {atual && (
                <button
                  className="btn btn-ghost"
                  onClick={() => navigate('detalhe', atual.id)}
                >
                  <Icon name="open" />
                  {/* Encurta o título se muito longo para o botão */}
                  Continuar {atual.title.length > 18 ? 'leitura' : atual.title}
                </button>
              )}
            </div>
          </div>

          {/* Coluna direita: ilustração da Frieren */}
          <div className="hero-portrait">
            <div className="halo" />
            <img src="/frieren.png" alt="Frieren" />
          </div>
        </div>
      </div>

      {/* ── CARDS DE ESTATÍSTICAS ── */}
      {/* Grade de 4 cartões com métricas rápidas de leitura */}
      <div className="stat-row">

        {/* Card 1: Páginas nos últimos 7 dias com sparkline */}
        <div className="stat-card">
          <div className="stat-label">
            <Icon name="open" style={{ width: 12, height: 12 }} /> Páginas · 7 dias
          </div>
          <div className="stat-value">{last7.toLocaleString('pt-BR')}</div>
          {/* Sparkline dos últimos 14 dias para visualizar tendência */}
          <Spark data={sparkData} />
          <div className="stat-foot">
            {/* Indicador de variação em relação à semana anterior */}
            {pct7 >= 0
              ? <span className="up">↑ {pct7}%</span>
              : <span>↓ {Math.abs(pct7)}%</span>
            }
            {' '}vs. semana anterior
          </div>
        </div>

        {/* Card 2: Sequência de dias lendo (streak) */}
        <div className="stat-card">
          <div className="stat-label">
            <Icon name="atividade" style={{ width: 12, height: 12 }} /> Sequência
          </div>
          <div className="stat-value">
            {streak}
            <span className="unit">dias</span>
          </div>
          <div className="stat-foot" style={{ marginTop: 14 }}>
            Dias lendo sem parar
          </div>
        </div>

        {/* Card 3: Livros terminados no ano corrente */}
        <div className="stat-card">
          <div className="stat-label">
            <Icon name="stats" style={{ width: 12, height: 12 }} /> Lidos · {year}
          </div>
          <div className="stat-value">
            {readThisYear}
            <span className="unit">livros</span>
          </div>
          <div className="stat-foot" style={{ marginTop: 14 }}>
            No ano de {year}
          </div>
        </div>

        {/* Card 4: Média de páginas por dia nos últimos 30 dias */}
        <div className="stat-card">
          <div className="stat-label">
            <Icon name="catalogo" style={{ width: 12, height: 12 }} /> Média diária
          </div>
          <div className="stat-value">
            {avgDaily}
            <span className="unit">págs/dia</span>
          </div>
          <div className="stat-foot" style={{ marginTop: 14 }}>
            ≈ {Math.round(avgDaily / 0.6)} min de leitura
          </div>
        </div>
      </div>

      {/* ── HEATMAP DE LEITURA ── */}
      {/* Visualiza a consistência de leitura ao longo do ano */}
      <div className="section">
        <div className="heat-card">
          <div className="heat-head">
            <span className="heat-title">Constância de leitura</span>
            <span className="section-sub">páginas por dia · {year}</span>
            {/* Total de páginas no ano no canto direito */}
            <span style={{
              marginLeft: 'auto',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--ink-3)',
            }}>
              {totalPages.toLocaleString('pt-BR')} págs no ano
            </span>
          </div>
          <Heatmap data={heatmap} />
        </div>
      </div>

      {/* ── LENDO AGORA ── */}
      {/* Carrossel horizontal com os livros em leitura ativa */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Lendo agora</h2>
          <span className="section-sub">{lendo.length} em progresso</span>
        </div>

        {lendo.length > 0 ? (
          // Scroll horizontal para múltiplos livros
          <div className="row-scroll">
            {lendo.map(b => (
              <div
                key={b.id}
                className="reading-card"
                onClick={() => navigate('detalhe', b.id)}
              >
                {/* Capa do livro */}
                <Cover book={b} />

                <div className="rc-body">
                  <div className="rc-title">{b.title}</div>
                  <div className="rc-author">{b.author}</div>

                  {/* Progresso: página atual e percentual */}
                  {b.page != null && b.pages != null && (
                    <div className="rc-prog-meta">
                      <span>pág. {b.page} de {b.pages}</span>
                      <span>{b.progress != null ? Math.round(b.progress * 100) : 0}%</span>
                    </div>
                  )}

                  {/* Barra de progresso visual */}
                  {b.progress != null && <ProgressBar value={b.progress} />}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Estado vazio — convite para iniciar uma leitura
          <p style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontFamily: 'var(--serif)', marginTop: 16 }}>
            Nenhum livro em leitura no momento.
          </p>
        )}
      </div>

      {/* ── ATIVIDADE RECENTE ── */}
      {/* Exibe as últimas 4 entradas do diário de leitura */}
      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Atividade recente</h2>
          {/* Link para ver o histórico completo */}
          <span
            className="section-link"
            onClick={() => navigate('atividade')}
            style={{ cursor: 'pointer' }}
          >
            Ver diário completo →
          </span>
        </div>

        <div className="feed">
          {activity.slice(0, 4).map(a => (
            <FeedItem key={a.id} a={a} books={books} navigate={navigate} />
          ))}
        </div>
      </div>

    </div>
  )
}
