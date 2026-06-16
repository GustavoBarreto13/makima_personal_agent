// ReconnectCard.tsx — Card de reconexão para a seção "Que tal entrar em contato?"
// da Home. Mostra quem está há mais tempo sem contato e oferece CTA direto
// (Telegram / WhatsApp / Instagram) ou botão de abrir o perfil.

import { Icon } from '../icons'
import { Avatar } from '../icons'
import { REL_CATS, daysSince, humanGap, contactCTA, reconnectPrompt } from '../lib'
import type { OverviewPerson } from '../types'

interface ReconnectCardProps {
  /** Pessoa com last_interaction preenchido (filtrado no Home). */
  p: OverviewPerson
  /** Última interação: data, tipo e trecho de texto. */
  last: {
    date: string   // "YYYY-MM-DD"
    kind: string   // "diário" | "finanças" | "tarefa"
    text: string   // trecho da interação
  }
  /** Abre o perfil completo desta pessoa. */
  onOpen: (id: string) => void
}

/**
 * Card de reconexão na seção "Que tal entrar em contato?" da Home.
 * Mostra há quanto tempo a pessoa está sem interação, o contexto da
 * última conversa e CTAs de contato (Telegram > WhatsApp > Instagram).
 */
export function ReconnectCard({ p, last, onOpen }: ReconnectCardProps) {
  // Categoria para estilo visual (cor do dot)
  const cat = REL_CATS[p.category] || REL_CATS.outros

  // Quantos dias se passaram desde a última interação
  const days = daysSince(last.date)

  // CTA de contato mais direto disponível (Telegram > WhatsApp > Instagram)
  const cta = contactCTA({
    telegram:  p.telegram,
    phone:     p.phone,
    instagram: p.instagram,
  })

  // O badge de "tempo" fica laranja ("warm") quando >= 14 dias
  const gapClass = 'rc-gap' + (days !== null && days >= 14 ? ' warm' : '')

  return (
    // Clique no card inteiro abre o perfil
    <div className="reconnect-card" onClick={() => onOpen(p.id)}>
      {/* Linha superior: avatar + nome + relacionamento + badge de tempo */}
      <div className="rc-head">
        <Avatar person={p} size={40} />
        <div className="rc-id">
          <div className="rc-name">{p.name}</div>
          <div className="rc-rel">{p.relationship}</div>
        </div>
        {/* Badge de tempo sem interação — fica âmbar quando muito tempo */}
        <span className={gapClass}>{humanGap(days)}</span>
      </div>

      {/* Contexto da última interação: tipo + trecho do texto */}
      <div className="rc-context">
        <span className="rc-kind">{last.kind}</span> · {last.text}
      </div>

      {/* Mensagem de incentivo baseada no número de dias sem contato */}
      <div className="rc-prompt">{reconnectPrompt(days ?? 0)}</div>

      {/* Ações: CTA de contato e botão de abrir perfil */}
      {/* e.stopPropagation() evita que o clique nos botões abra o perfil também */}
      <div className="rc-actions" onClick={(e) => e.stopPropagation()}>
        {cta ? (
          // Link externo para o canal de comunicação (Telegram/WhatsApp/Instagram)
          <a className="rc-cta primary" href={cta.href} target="_blank" rel="noreferrer">
            <Icon name={cta.icon} />{cta.label}
          </a>
        ) : (
          // Sem canal configurado: botão para abrir o perfil
          <button className="rc-cta primary" onClick={() => onOpen(p.id)}>
            <Icon name="user" />Ver perfil
          </button>
        )}
        {/* Botão secundário sempre presente para abrir o perfil */}
        <button className="rc-cta ghost" onClick={() => onOpen(p.id)}>Abrir</button>
      </div>
    </div>
  )
}
