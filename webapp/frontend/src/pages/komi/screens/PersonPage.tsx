// PersonPage.tsx — Página de perfil de uma pessoa da Komi.
// Carrega os dados completos via komiApi.summary(id) — que retorna perfil + 4 domínios.
// Os dados de domínio são adaptados pelo toLinks() para o shape do design.
//
// Estrutura:
//   - Profile hero: avatar grande, categoria, apelidos, contatos, notas, datas
//   - Dom-grid 2×2: FinanceCard | TaskCard | DiaryCard | BookCard

import { useState, useEffect } from 'react'
import { Icon } from '../icons'
import { Avatar } from '../icons'
import { FinanceCard, TaskCard, DiaryCard, BookCard } from '../components/DomainCards'
import { REL_CATS, daysUntil, fmtDayMonth } from '../lib'
import { komiApi, toLinks } from '../komiApi'
import type { PersonDetail, PersonLinks } from '../types'

interface PersonPageProps {
  /** ID da pessoa cujo perfil deve ser exibido. */
  personId: string
  /** Dados parciais do overview para exibição enquanto carrega o perfil completo. */
  partialName?: string
  /** Callback para abrir o modal de edição. */
  onEdit: (id: string) => void
}

/**
 * Página de perfil de uma pessoa.
 * Carrega perfil completo + vínculos de domínio com uma chamada ao summary(id).
 * Enquanto carrega, exibe um spinner; em erro, exibe mensagem de fallback.
 */
export function PersonPage({ personId, partialName, onEdit }: PersonPageProps) {
  // Estado do perfil completo (PersonDetail com aliases, datas, contatos)
  const [perfil, setPerfil] = useState<PersonDetail | null>(null)
  // Estado dos vínculos de domínio (adaptados pelo toLinks)
  const [links, setLinks] = useState<PersonLinks | null>(null)
  // Estado de carregamento e erro
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Carrega os dados ao montar ou quando o personId muda
  useEffect(() => {
    let cancelled = false  // flag para ignorar resposta se o componente desmontar antes

    setLoading(true)
    setError(null)
    setPerfil(null)
    setLinks(null)

    // Uma única chamada ao summary() retorna perfil + todos os 4 domínios
    komiApi.summary(personId)
      .then(summary => {
        if (cancelled) return  // evita setState após desmontagem
        setPerfil(summary.perfil)
        setLinks(toLinks(summary))  // adapta o shape do backend para o shape do design
      })
      .catch(() => {
        if (cancelled) return
        setError('Não foi possível carregar o perfil.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    // Cleanup: marca como cancelado quando o componente desmonta
    return () => { cancelled = true }
  }, [personId])  // re-executa quando a pessoa muda

  // ── Estado de carregamento ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="person-page">
        <div className="empty-state">
          {/* Spinner simples enquanto carrega os dados */}
          <div className="km-spinner" />
          <div className="es-sub">{partialName || 'Carregando perfil…'}</div>
        </div>
      </div>
    )
  }

  // ── Estado de erro ────────────────────────────────────────────────────
  if (error || !perfil) {
    return (
      <div className="person-page">
        <div className="empty-state">
          <div className="es-icon"><Icon name="user" /></div>
          <div className="es-title">Perfil não encontrado</div>
          <div className="es-sub">{error || 'Pessoa removida ou inacessível.'}</div>
        </div>
      </div>
    )
  }

  // ── Dados derivados do perfil ─────────────────────────────────────────

  // Metadados da categoria (cor, tint, label)
  const cat = REL_CATS[perfil.category] || REL_CATS.outros

  // Variáveis CSS da categoria: usadas pelo .profile-hero e cards (--rel-color, --rel-tint)
  const style = { '--rel-color': cat.color, '--rel-tint': cat.tint } as React.CSSProperties

  // Lista de contatos disponíveis: cada item tem ícone, label e href (se clicável)
  const contacts = [
    perfil.phone    && { icon: 'phone', label: perfil.phone,    href: 'tel:' + perfil.phone.replace(/\s/g, '') },
    perfil.email    && { icon: 'mail',  label: perfil.email,    href: 'mailto:' + perfil.email },
    perfil.instagram&& { icon: 'at',   label: perfil.instagram, href: 'https://instagram.com/' + perfil.instagram.replace('@', '') },
    perfil.telegram && { icon: 'send', label: perfil.telegram,  href: undefined },  // só exibe, sem link
    perfil.city     && { icon: 'pin',  label: perfil.city,      href: undefined },
  ].filter(Boolean) as Array<{ icon: string; label: string; href?: string }>

  // Datas cadastradas ordenadas pela proximidade (mais próximas primeiro)
  const upcomingDates = (perfil.datas || [])
    .map(d => ({ ...d, days: daysUntil(d.date, d.recurring) }))
    .sort((a, b) => a.days - b.days)

  return (
    <div className="person-page" style={style}>
      {/* ── Profile Hero ──────────────────────────────────────────────── */}
      <div className="profile-hero">
        {/* Avatar grande (96px) */}
        <div className="ph-avatar">
          <Avatar person={perfil} size={96} />
        </div>

        <div className="ph-body">
          {/* Linha 1: badge de categoria + apelidos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Badge de categoria com dot colorido */}
            <span className="ph-rel tint">
              <span className="so-mark" style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color }} />
              {perfil.relationship || cat.label}
            </span>
            {/* Chips de apelidos (ex.: "Aninha", "Dede") */}
            {perfil.aliases.length > 0 && (
              <span className="ph-aliases">
                {perfil.aliases.map((a, i) => (
                  <span className="alias-chip" key={i}>"{a}"</span>
                ))}
              </span>
            )}
          </div>

          {/* Nome completo da pessoa */}
          <div className="ph-name" style={{ marginTop: 8 }}>{perfil.name}</div>

          {/* Contatos: telefone, email, instagram, telegram, cidade */}
          {contacts.length > 0 && (
            <div className="ph-contacts">
              {contacts.map((c, i) => (
                <span className="contact" key={i}>
                  <Icon name={c.icon} />
                  {/* Link clicável para contatos com href; texto simples para cidade/telegram */}
                  {c.href
                    ? <a href={c.href} target="_blank" rel="noreferrer">{c.label}</a>
                    : <span>{c.label}</span>}
                </span>
              ))}
            </div>
          )}

          {/* Notas livres (exibidas em itálico entre aspas) */}
          {perfil.notes && (
            <div className="ph-notes">"{perfil.notes}"</div>
          )}

          {/* Faixa de datas importantes (pills horizontais) */}
          {upcomingDates.length > 0 && (
            <div className="dates-strip">
              {upcomingDates.map((d, i) => (
                <div className="date-pill" key={i}>
                  {/* Ícone: bolo para aniversário, calendário para outros */}
                  <div className="dp-icon">
                    <Icon name={/anivers/i.test(d.label) ? 'cake' : 'calendar'} />
                  </div>
                  <div>
                    <div className="dp-label">{d.label}</div>
                    {/* Data com alerta de proximidade: "em Xd" quando falta ≤ 30 dias */}
                    <div className={'dp-when' + (d.days >= 0 && d.days <= 30 ? ' dp-soon' : '')}>
                      {fmtDayMonth(d.date)}
                      {d.days === 0 ? ' · hoje!' : d.days >= 0 && d.days <= 30 ? ` · em ${d.days}d` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ações do perfil: botão Editar */}
        <div className="ph-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(perfil.id)}>
            <Icon name="edit" />Editar
          </button>
        </div>
      </div>

      {/* ── Grid de domínios 2×2 ─────────────────────────────────────── */}
      {/* Cada card carrega seus dados do links (já adaptados pelo toLinks) */}
      {/* Se o domínio estiver vazio, o card mostra um estado vazio — nunca quebra */}
      <div className="dom-grid">
        <FinanceCard data={links?.finances} />
        <TaskCard    data={links?.tasks} />
        <DiaryCard   data={links?.journal} />
        <BookCard    data={links?.books} />
      </div>
    </div>
  )
}
