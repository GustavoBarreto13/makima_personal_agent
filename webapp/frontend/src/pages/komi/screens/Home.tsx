// Home.tsx — Tela inicial da Komi.
// Exibe: hero com saudação, estatísticas resumo, seção "Que tal entrar em contato?"
// (quem está há mais tempo sem interação), coluna de próximas datas e coluna "A acertar"
// (saldos financeiros pendentes).
//
// Todos os dados vêm do overview() — uma única chamada cross-pessoa que já calcula
// last_interaction, finance_net e dates para cada pessoa.

import { useMemo } from 'react'
import { Icon } from '../icons'
import { Avatar } from '../icons'
import { ReconnectCard } from '../components/ReconnectCard'
import { daysUntil, fmtDayMonth, brl, daysSince, greeting } from '../lib'
import type { OverviewPerson } from '../types'

interface HomeProps {
  /** Lista de todas as pessoas vivas com dados agregados do overview(). */
  overview: OverviewPerson[]
  /** Abre o perfil de uma pessoa. */
  onOpen: (id: string) => void
  /** Abre o modal de criação de pessoa. */
  onNew: () => void
  /** Navega para outra view (ex.: 'dates'). */
  goView: (v: string) => void
}

/**
 * Tela Home da Komi.
 * Mostra um hero de boas-vindas e 3 seções de insights:
 * 1. Reconectar — pessoas com > 7 dias sem interação (top 4)
 * 2. Próximas datas — eventos nos próximos 60 dias (top 5)
 * 3. A acertar — saldos financeiros pendentes (top 5)
 */
export function Home({ overview, onOpen, onNew, goView }: HomeProps) {
  // ── Estatísticas globais ────────────────────────────────────────────────

  // Número de datas no próximo mês (para o hero sub)
  const datesThisMonth = useMemo(() => {
    let count = 0
    overview.forEach(p => (p.dates || []).forEach(d => {
      const days = daysUntil(d.date, d.recurring)
      if (days >= 0 && days <= 31) count++
    }))
    return count
  }, [overview])

  // ── Seção Reconectar ───────────────────────────────────────────────────

  // Filtra pessoas com last_interaction há >= 7 dias, ordena pela mais distante
  // e pega as 4 primeiras para exibir no grid de reconexão
  const reconnect = useMemo(() => {
    return overview
      .filter(p => p.last_interaction !== null)
      .map(p => ({
        p,
        last: p.last_interaction!,    // ! = seguro pois filtramos null acima
        days: daysSince(p.last_interaction!.date) ?? 0,
      }))
      .filter(x => x.days >= 7)       // só quem está há >= 7 dias sem contato
      .sort((a, b) => b.days - a.days)  // mais tempo primeiro
      .slice(0, 4)                    // limita a 4 cards
  }, [overview])

  // ── Seção Próximas datas ──────────────────────────────────────────────

  // Coleta todas as datas futuras de todas as pessoas, ordena por proximidade
  const upcoming = useMemo(() => {
    const out: Array<{
      person: OverviewPerson
      label: string
      date: string
      recurring: boolean
      days: number
    }> = []
    overview.forEach(p => (p.dates || []).forEach(d => {
      const days = daysUntil(d.date, d.recurring)
      // Inclui datas no futuro (days >= 0) e nos próximos 365 dias
      if (days >= 0) out.push({ person: p, label: d.label, date: d.date, recurring: d.recurring, days })
    }))
    return out.sort((a, b) => a.days - b.days)  // mais próxima primeiro
  }, [overview])

  // ── Seção A acertar ───────────────────────────────────────────────────

  // Pessoas com saldo financeiro não-zerado (te devem ou você deve)
  // Ordenadas pelo valor absoluto do saldo (maior pendência primeiro)
  const settle = useMemo(() => {
    return overview
      .filter(p => p.finance_net !== 0)  // só quem tem saldo pendente
      .map(p => ({ p, net: p.finance_net }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))  // maior primeiro
  }, [overview])

  return (
    <div className="home">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="km-hero">
        <div className="hero-copy">
          {/* Eyebrow (rótulo pequeno acima do título) */}
          <div className="hero-eyebrow">Komi · Pessoas</div>

          {/* Saudação baseada no horário: "Bom dia.", "Boa tarde.", etc. */}
          <div className="hero-title">{greeting()}.</div>

          {/* Resumo de insights: pessoas, conversas pendentes, datas chegando */}
          <div className="hero-sub">
            Você acompanha <b>{overview.length} {overview.length === 1 ? 'pessoa' : 'pessoas'}</b>
            {reconnect.length > 0 && (
              <> · <b>{reconnect.length} conversa{reconnect.length > 1 ? 's' : ''}</b> pra retomar</>
            )}
            {datesThisMonth > 0 && (
              <> · <b>{datesThisMonth} data{datesThisMonth > 1 ? 's' : ''}</b> chegando</>
            )}.
          </div>

          {/* 3 estatísticas numéricas */}
          <div className="hero-stats">
            <div className="hstat">
              <div className="hs-num">{overview.length}</div>
              <div className="hs-lbl">Pessoas</div>
            </div>
            <div className="hstat">
              <div className="hs-num">{reconnect.length}</div>
              <div className="hs-lbl">Pra retomar</div>
            </div>
            <div className="hstat">
              <div className="hs-num">{datesThisMonth}</div>
              <div className="hs-lbl">Datas / mês</div>
            </div>
          </div>
        </div>

        {/* Glow decorativo atrás da ilustração */}
        <div className="hero-glow" />
        {/* Ilustração da Komi no canto direito */}
        <img className="hero-art" src="/komi.png" alt="Komi" />
      </div>

      {/* ── Seção Reconectar ─────────────────────────────────────────────── */}
      <div className="home-section">
        <div className="home-sec-head">
          <div className="home-sec-title">Que tal entrar em contato?</div>
          <div className="home-sec-sub">mais tempo sem falar</div>
          {/* Link para criar nova pessoa */}
          <button className="home-sec-link" onClick={onNew}>
            <Icon name="plus" />Nova pessoa
          </button>
        </div>

        {/* Grid de cards de reconexão ou mensagem de estado vazio */}
        {reconnect.length === 0 ? (
          <div className="home-empty">
            Você está em dia com todo mundo — nada pra retomar agora.
          </div>
        ) : (
          <div className="reconnect-grid">
            {reconnect.map(({ p, last }) => (
              <ReconnectCard key={p.id} p={p} last={last} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>

      {/* ── Colunas: Próximas datas + A acertar ──────────────────────────── */}
      <div className="home-cols">
        {/* Coluna esquerda: próximas datas */}
        <div className="home-panel">
          <div className="home-panel-head">
            {/* Ícone com a cor de "datas" (garnet) */}
            <span className="hp-icon" style={{ background: 'var(--garnet-t)', color: 'var(--garnet)' }}>
              <Icon name="cake" />
            </span>
            <span className="hp-title">Próximas datas</span>
            {/* Link para ver todas as datas */}
            <span className="home-sec-link" onClick={() => goView('dates')}>ver todas</span>
          </div>
          <div className="home-panel-body">
            {upcoming.length === 0 ? (
              <div className="home-empty">Nenhuma data cadastrada.</div>
            ) : (
              // Mostra as 5 mais próximas
              upcoming.slice(0, 5).map((d, i) => (
                <div className="mini-row" key={i} onClick={() => onOpen(d.person.id)}>
                  <Avatar person={d.person} size={28} />
                  <div className="mr-body">
                    <div className="mr-name">{d.person.name}</div>
                    <div className="mr-sub">{d.label} · {fmtDayMonth(d.date)}</div>
                  </div>
                  {/* Badge de contagem regressiva */}
                  <div className="mr-when">
                    <div className="mrw-big">{d.days === 0 ? 'hoje' : d.days}</div>
                    {d.days !== 0 && <div>{d.days === 1 ? 'dia' : 'dias'}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Coluna direita: saldos pendentes */}
        <div className="home-panel">
          <div className="home-panel-head">
            {/* Ícone com a cor de "finanças" (fin) */}
            <span className="hp-icon" style={{ background: 'var(--fin-t)', color: 'var(--fin)' }}>
              <Icon name="wallet" />
            </span>
            <span className="hp-title">A acertar</span>
            <span className="hp-count">
              {settle.length} pessoa{settle.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="home-panel-body">
            {settle.length === 0 ? (
              <div className="home-empty">Nenhuma conta pendente.</div>
            ) : (
              // Mostra as 5 com maior saldo pendente
              settle.slice(0, 5).map(({ p, net }, i) => (
                <div className="mini-row" key={i} onClick={() => onOpen(p.id)}>
                  <Avatar person={p} size={28} />
                  <div className="mr-body">
                    <div className="mr-name">{p.name}</div>
                    {/* Distingue quem deve a quem */}
                    <div className="mr-sub">{net > 0 ? 'te devem' : 'você deve'}</div>
                  </div>
                  {/* Valor com cor: verde = te devem, vermelho = você deve */}
                  <div className={'mr-amt ' + (net > 0 ? 'pos' : 'neg')}>{brl(net)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
