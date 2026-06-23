// PersonPage.tsx — Página de perfil de uma pessoa da Komi.
// Carrega os dados completos via komiApi.summary(id) — que retorna perfil + 4 domínios.
// Os dados de domínio são adaptados pelo toLinks() para o shape do design.
//
// Estrutura:
//   - Profile hero: avatar grande, categoria, apelidos, contatos, notas, datas
//   - Dom-grid 2×2: FinanceCard | TaskCard | DiaryCard | BookCard

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../icons'
import { Avatar } from '../icons'
import { FinanceCard, TaskCard, DiaryCard, BookCard } from '../components/DomainCards'
import { REL_CATS, daysUntil, fmtDayMonth } from '../lib'
import { komiApi, toLinks } from '../komiApi'
import type { PersonDetail, PersonLinks, ImportantDate } from '../types'
import { DatePicker } from '../../../components/DatePicker'

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

  // ── Estado do modal de edição de data (fase 026) ──────────────────────
  // null = modal fechado; objeto = data sendo editada
  const [editingDate, setEditingDate] = useState<ImportantDate | null>(null)
  // Campos do formulário de edição
  const [editLabel, setEditLabel] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editRecurring, setEditRecurring] = useState(true)
  // Estado de submissão do modal
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Carrega os dados ao montar ou quando o personId muda
  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPerfil(null)
    setLinks(null)

    try {
      const summary = await komiApi.summary(personId)
      setPerfil(summary.perfil)
      setLinks(toLinks(summary))
    } catch {
      setError('Não foi possível carregar o perfil.')
    } finally {
      setLoading(false)
    }
  }, [personId])

  useEffect(() => {
    let cancelled = false

    komiApi.summary(personId)
      .then(summary => {
        if (cancelled) return
        setPerfil(summary.perfil)
        setLinks(toLinks(summary))
      })
      .catch(() => {
        if (cancelled) return
        setError('Não foi possível carregar o perfil.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [personId])

  // ── Handlers do modal de edição de data ──────────────────────────────────

  /** Abre o modal preenchido com os dados da data selecionada. */
  function handleOpenEditDate(d: ImportantDate) {
    setEditingDate(d)
    setEditLabel(d.label)
    setEditDate(d.date)
    setEditRecurring(d.recurring)
    setEditError(null)
  }

  /** Fecha o modal sem salvar. */
  function handleCloseEditDate() {
    setEditingDate(null)
    setEditError(null)
  }

  /** Salva a edição da data via PATCH. */
  async function handleSaveDate() {
    if (!editingDate || !perfil) return
    setEditSaving(true)
    setEditError(null)

    try {
      await komiApi.updateDate(perfil.id, editingDate.id, {
        label: editLabel,
        date: editDate,
        recurring: editRecurring,
      })
      setEditingDate(null)
      // Recarrega o perfil para refletir as alterações (inclusive is_synced atualizado)
      await loadProfile()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar.'
      setEditError(msg)
    } finally {
      setEditSaving(false)
    }
  }

  /** Remove a data após confirmação. */
  async function handleDeleteDate(d: ImportantDate) {
    if (!perfil) return
    const confirmMsg = d.is_synced
      ? `Remover "${d.label}"? A tarefa de aniversário na Kaguya também será removida.`
      : `Remover "${d.label}"?`
    if (!confirm(confirmMsg)) return

    try {
      await komiApi.deleteDate(perfil.id, d.id)
      await loadProfile()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover data.'
      alert(msg)
    }
  }

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

          {/* Faixa de datas importantes (pills horizontais) — fase 026: + ✏/🗑 e badge sync */}
          {upcomingDates.length > 0 && (
            <div className="dates-strip">
              {upcomingDates.map((d, i) => (
                <div className="date-pill" key={i}>
                  {/* Ícone: bolo para aniversário, calendário para outros */}
                  <div className="dp-icon">
                    <Icon name={/anivers/i.test(d.label) ? 'cake' : 'calendar'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dp-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {d.label}
                      {/* Badge de sincronização: indica que a tarefa Kaguya existe */}
                      {d.is_synced && (
                        <span
                          title="Sincronizado com Kaguya — tarefa de aniversário ativa"
                          style={{ fontSize: 12, opacity: 0.8, cursor: 'default' }}
                        >
                          🎂
                        </span>
                      )}
                    </div>
                    {/* Data com alerta de proximidade: "em Xd" quando falta ≤ 30 dias */}
                    <div className={'dp-when' + (d.days >= 0 && d.days <= 30 ? ' dp-soon' : '')}>
                      {fmtDayMonth(d.date)}
                      {d.days === 0 ? ' · hoje!' : d.days >= 0 && d.days <= 30 ? ` · em ${d.days}d` : ''}
                    </div>
                  </div>
                  {/* Botões de edição e remoção — fase 026 */}
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Editar data"
                      onClick={() => handleOpenEditDate(d)}
                      style={{ padding: '2px 4px', opacity: 0.6 }}
                    >
                      ✏
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Remover data"
                      onClick={() => handleDeleteDate(d)}
                      style={{ padding: '2px 4px', opacity: 0.6, color: 'var(--danger, #e44)' }}
                    >
                      🗑
                    </button>
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

      {/* ── Modal de edição de data (fase 026) ───────────────────────── */}
      {/* Abre ao clicar ✏ em qualquer date-pill; fecha ao salvar, cancelar ou Escape */}
      {editingDate && (
        <div
          className="km-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Editar data"
          onClick={(e) => { if (e.target === e.currentTarget) handleCloseEditDate() }}
          style={{ zIndex: 60 }}
        >
          <div className="km-modal" style={{ maxWidth: 360, padding: '24px 20px' }}>

            {/* Cabeçalho do modal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Editar data</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCloseEditDate}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Formulário de edição */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Label da data (ex.: "aniversário", "formatura") */}
              <div>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                  Descrição
                </label>
                <input
                  className="kg-input"
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="Ex.: aniversário, formatura..."
                  disabled={editSaving}
                  autoFocus
                />
              </div>

              {/* Seletor de data — usa o DatePicker cross-shell (fase 026) */}
              <div>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                  Data
                </label>
                <DatePicker
                  value={editDate}
                  onChange={setEditDate}
                  disabled={editSaving}
                  placeholder="Selecionar data..."
                />
              </div>

              {/* Flag de recorrência anual */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={editRecurring}
                  onChange={(e) => setEditRecurring(e.target.checked)}
                  disabled={editSaving}
                />
                <span style={{ fontSize: 13 }}>Repete todo ano</span>
              </label>

              {/* Badge informativo quando a data está sincronizada com a Kaguya */}
              {editingDate.is_synced && (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, color: 'var(--success, #2a7)', opacity: 0.9,
                    padding: '6px 8px', background: 'rgba(0,180,100,0.1)', borderRadius: 6,
                  }}
                >
                  🎂 <span>Esta data está sincronizada com uma tarefa de aniversário na Kaguya. Alterações propagam automaticamente.</span>
                </div>
              )}

              {/* Mensagem de erro (se houver) */}
              {editError && (
                <div style={{ color: 'var(--danger, #e44)', fontSize: 12 }}>
                  ❌ {editError}
                </div>
              )}
            </div>

            {/* Ações do modal */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCloseEditDate}
                disabled={editSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleSaveDate}
                disabled={editSaving || !editLabel.trim() || !editDate}
              >
                {editSaving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
