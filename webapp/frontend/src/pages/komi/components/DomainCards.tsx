// DomainCards.tsx — Cards de domínio da página de pessoa da Komi.
// Cada card mostra vínculos com um agente especialista (Nami/Kaguya/Violet/Frieren).
// DomCard é o wrapper genérico; os 4 cards especializados recebem os dados já
// adaptados pelo toLinks() do komiApi.ts (shape do design, não do backend).

import React from 'react'
import { Icon } from '../icons'
import { fmtDayMonth, brl, splitMentions } from '../lib'
import type { PersonLinks } from '../types'

// ─── DomCard genérico ─────────────────────────────────────────────────────────

interface DomCardProps {
  icon: string          // nome do ícone no mapa ICONS (wallet, checks, feather, book)
  title: string         // título do card (Finanças, Tarefas, Diário, Livros)
  agent: string         // nome do agente responsável (Nami, Kaguya, Violet, Frieren)
  color: string         // cor CSS do domínio (ex.: var(--fin))
  tint: string          // tint translúcido para fundo/borda (ex.: var(--fin-t))
  headval?: React.ReactNode | null  // valor em destaque no canto direito (ex.: saldo, contagem)
  headsub?: string      // subtítulo do headval (ex.: "te devem", "abertas")
  headcls?: string      // classe CSS adicional do headval (ex.: "pos", "neg")
  children?: React.ReactNode  // conteúdo do corpo do card (lista de itens)
  empty?: string        // mensagem de estado vazio (exibida em vez de children)
}

/**
 * Wrapper genérico para os 4 cards de domínio da PersonPage.
 * Aplica as variáveis CSS do domínio (--dc-color, --dc-tint) via estilo inline.
 * Se empty for passado, exibe ícone + texto em vez de children — nunca quebra.
 */
export function DomCard({ icon, title, agent, color, tint, headval, headsub, headcls, children, empty }: DomCardProps) {
  // Variáveis CSS aplicadas inline — o CSS .dom-card lê --dc-color e --dc-tint
  const style = { '--dc-color': color, '--dc-tint': tint } as React.CSSProperties

  return (
    <div className="dom-card" style={style}>
      {/* Cabeçalho: ícone + título + agente + valor resumo */}
      <div className="dom-head">
        <div className="dom-icon"><Icon name={icon} /></div>
        <div className="dom-titles">
          <div className="dom-title">{title}</div>
          <div className="dom-agent">{agent}</div>
        </div>
        {/* Valor destacado no canto direito (ex.: R$ 120,00 | 3 abertas) */}
        {headval != null && (
          <div className={'dom-headval ' + (headcls || '')}>
            {headval}
            {headsub && <span className="hv-sub">{headsub}</span>}
          </div>
        )}
      </div>

      {/* Corpo: estado vazio ou lista de itens */}
      <div className="dom-body">
        {empty ? (
          // Estado vazio: ícone grande + texto explicativo
          <div className="dom-empty">
            <Icon name={icon} />
            <div className="de-text">{empty}</div>
          </div>
        ) : children}
      </div>
    </div>
  )
}

// ─── FinanceCard ──────────────────────────────────────────────────────────────

interface FinanceCardProps {
  /** Dados de finanças já adaptados pelo toLinks() — pode ser undefined se ainda carregando. */
  data: PersonLinks['finances'] | undefined
}

/**
 * Card de Finanças (agente Nami).
 * Mostra saldo líquido (positivo = te devem, negativo = você deve)
 * e lista de transações vinculadas a esta pessoa.
 */
export function FinanceCard({ data }: FinanceCardProps) {
  // Se não há dados ainda, trata como vazio (não quebra durante o carregamento)
  const txns = data?.txns || []
  const net  = data?.net ?? 0

  // Classe CSS do saldo: pos (verde) | neg (vermelho) | sem classe (quitado)
  const headcls = net > 0 ? 'pos' : net < 0 ? 'neg' : ''
  const headsub = net > 0 ? 'te devem' : net < 0 ? 'você deve' : 'quitado'

  return (
    <DomCard
      icon="wallet" title="Finanças" agent="Nami"
      color="var(--fin)" tint="var(--fin-t)"
      // Não exibe headval se saldo = 0 E sem transações (sem relacionamento financeiro)
      headval={net === 0 && txns.length === 0 ? null : brl(net)}
      headsub={net === 0 && txns.length ? 'quitado' : headsub}
      headcls={headcls}
      empty={txns.length ? undefined : 'Nenhuma transação ligada'}
    >
      {/* Lista de transações: desc / data + método / valor com cor */}
      {txns.map((t, i) => (
        <div className="dom-row" key={i}>
          <div className="dr-main">
            <div className="dr-title">{t.desc}</div>
            <div className="dr-sub">{fmtDayMonth(t.date)} · {t.method}</div>
          </div>
          {/* Valor colorido: verde = receita (te devem), vermelho = despesa (você deve) */}
          <div className={'dr-amt ' + (t.amount > 0 ? 'pos' : 'neg')}>{brl(t.amount)}</div>
        </div>
      ))}
    </DomCard>
  )
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  /** Dados de tarefas já adaptados pelo toLinks(). */
  data: PersonLinks['tasks'] | undefined
}

/**
 * Card de Tarefas (agente Kaguya).
 * Mostra tarefas abertas e concluídas vinculadas a esta pessoa.
 */
export function TaskCard({ data }: TaskCardProps) {
  const items = data?.items || []
  // Separa abertas de concluídas para o contagem do cabeçalho
  const open  = items.filter(i => !i.done).length
  const done  = items.filter(i => i.done).length

  return (
    <DomCard
      icon="checks" title="Tarefas" agent="Kaguya"
      color="var(--task)" tint="var(--task-t)"
      headval={items.length ? open : null}   // mostra número de abertas
      headsub={items.length ? 'abertas' : undefined}
      empty={items.length ? undefined : 'Nenhuma tarefa ligada'}
    >
      {/* Lista de tarefas: checkbox visual (só exibição) + título + vencimento */}
      {items.map((t, i) => (
        <div className="dom-row" key={i}>
          {/* Caixa de seleção visual — não é interativa, só mostra o estado */}
          <span className={'dr-check' + (t.done ? ' on' : '')}>
            {t.done && <Icon name="check" />}
          </span>
          <div className="dr-main">
            {/* Título com classe "done" adiciona risco de texto quando concluída */}
            <div className={'dr-title' + (t.done ? ' done' : '')}>{t.title}</div>
            <div className="dr-sub">
              {t.done
                ? 'concluída'
                : t.due ? 'vence ' + fmtDayMonth(t.due) : 'sem vencimento'}
            </div>
          </div>
        </div>
      ))}
      {/* Rodapé com resumo quando há misto de abertas + concluídas */}
      {done > 0 && open > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', paddingTop: 10 }}>
          {done} concluída{done > 1 ? 's' : ''} · {open} aberta{open > 1 ? 's' : ''}
        </div>
      )}
    </DomCard>
  )
}

// ─── DiaryCard ────────────────────────────────────────────────────────────────

interface DiaryCardProps {
  /** Dados de diário já adaptados pelo toLinks(). */
  data: PersonLinks['journal'] | undefined
}

/**
 * Card de Diário (agente Violet).
 * Mostra trechos de entradas do diário que mencionam esta pessoa.
 * As @menções são realçadas com a classe CSS .mention.
 */
export function DiaryCard({ data }: DiaryCardProps) {
  const mentions = data?.mentions || []

  return (
    <DomCard
      icon="feather" title="Diário" agent="Violet"
      color="var(--diary)" tint="var(--diary-t)"
      headval={mentions.length ? mentions.length : null}
      headsub={mentions.length ? 'menções' : undefined}
      empty={mentions.length ? undefined : 'Nenhuma menção no diário'}
    >
      {/* Cada menção é um trecho do diário com data */}
      {mentions.map((m, i) => (
        <div className="diary-snippet" key={i}>
          <div className="ds-text">
            {/* splitMentions divide o texto em segmentos — @menções ficam com classe .mention */}
            {splitMentions(m.text).map((seg, j) => (
              seg.isMention
                ? <span key={j} className="mention">{seg.text}</span>
                : <React.Fragment key={j}>{seg.text}</React.Fragment>
            ))}
          </div>
          {/* Data e hora da entrada (hora pode ser vazia se o backend não guarda) */}
          <div className="ds-when">{fmtDayMonth(m.date)}{m.time ? ' · ' + m.time : ''}</div>
        </div>
      ))}
    </DomCard>
  )
}

// ─── BookCard ─────────────────────────────────────────────────────────────────

interface BookCardProps {
  /** Dados de livros já adaptados pelo toLinks() — é um array direto, não objeto. */
  data: PersonLinks['books'] | undefined
}

/**
 * Card de Livros (agente Frieren).
 * Mostra livros que foram lidos/discutidos com esta pessoa.
 */
export function BookCard({ data }: BookCardProps) {
  const books = data || []

  return (
    <DomCard
      icon="book" title="Livros" agent="Frieren"
      color="var(--book)" tint="var(--book-t)"
      headval={books.length ? books.length : null}
      headsub={books.length ? 'livros' : undefined}
      empty={books.length ? undefined : 'Nenhum livro ligado'}
    >
      {/* Lista de livros: capa placeholder + título + autor + status */}
      {books.map((b, i) => (
        <div className="dom-row book-row" key={i}>
          {/* Placeholder de capa (sem imagem na API — só título e autor) */}
          <div className="bk-cover" />
          <div className="dr-main">
            <div className="dr-title">{b.title}</div>
            <div className="dr-sub">{b.author}</div>
          </div>
          {/* Status do livro: "lendo", "lido", "quero ler", etc. */}
          <span className="bk-status">{b.status}</span>
        </div>
      ))}
    </DomCard>
  )
}
