// PersonModal.tsx — Modal de criação e edição de pessoa da Komi.
// Criação: komiApi.create() → retorna id → abre perfil.
// Edição: komiApi.update() + addAlias() para apelidos novos + addDate() para novas datas.
// Exclusão (soft delete): komiApi.del() → volta ao diretório.
// Foto: upload real via komiApi.uploadAvatar(file) → guarda apenas a URL no backend.
// (O design mock usava base64 dataURL — aqui usamos upload de arquivo real.)

import React, { useState, useRef } from 'react'
import { Icon } from '../icons'
import { Avatar } from '../icons'
import { REL_CATS, normalize, fmtDayMonth } from '../lib'
import { komiApi } from '../komiApi'
import type { PersonDetail } from '../types'

// ─── Opções de categoria / relacionamento ─────────────────────────────────────

// Cada categoria tem label para o segmentado e label padrão para o campo relationship
const REL_OPTIONS = [
  { cat: 'familia',  label: 'Família',  defaultRel: 'família' },
  { cat: 'amigos',   label: 'Amigos',   defaultRel: 'amigo' },
  { cat: 'trabalho', label: 'Trabalho', defaultRel: 'colega de trabalho' },
  { cat: 'outros',   label: 'Outros',   defaultRel: 'contato' },
] as const

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PersonModalProps {
  /** null = modo criação; PersonDetail = modo edição */
  person: PersonDetail | null
  /** Fecha o modal sem salvar. */
  onClose: () => void
  /** Chamado após salvar (criação abre o perfil; edição apenas recarrega). */
  onSaved: (id: string, isNew: boolean) => void
  /** Chamado após excluir (soft delete). */
  onDeleted: (id: string) => void
}

// Rascunho de data importante — preenchido pelo usuário antes de adicionar
interface DateDraft {
  label: string
  date: string      // "MM-DD" ou "YYYY-MM-DD"
  recurring: boolean
}

/**
 * Valida uma data importante no MESMO contrato do backend Komi: "MM-DD"
 * (mês-dia, sem ano) ou "AAAA-MM-DD" (ISO). Rejeita datas impossíveis (ex.:
 * "02-30") construindo um Date real e conferindo se nenhum campo "rolou" para
 * outro dia. No caso MM-DD usa o ano-sentinela bissexto 2000 (igual ao backend),
 * para que "02-29" seja aceito.
 *
 * Importante: o mês vem PRIMEIRO (MM-DD). "15-05" é inválido (não existe mês 15).
 *
 * @param s - String digitada pelo usuário
 * @returns true se for um MM-DD ou AAAA-MM-DD de calendário válido
 */
function isValidImportantDate(s: string): boolean {
  // Regex: ano opcional (4 dígitos) + mês (1-2) + dia (1-2), separados por '-'
  const m = s.trim().match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/)
  if (!m) return false
  const year = m[1] ? parseInt(m[1], 10) : 2000  // ano-sentinela bissexto (igual ao backend)
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  // Date usa mês 0-indexado (month - 1). Se algum campo for impossível, o JS
  // "rola" a data (ex.: 02-30 vira 03-02) e os getters deixam de bater → inválido.
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

/**
 * Modal de criação e edição de pessoa.
 * Em modo criação (person=null): salva com create() e chama onSaved com isNew=true.
 * Em modo edição: atualiza campos com update(), apelidos com addAlias() e
 *   datas novas com addDate(); chama onSaved com isNew=false.
 * Upload de foto: usa komiApi.uploadAvatar(file) — armazena só a URL no backend.
 */
export function PersonModal({ person, onClose, onSaved, onDeleted }: PersonModalProps) {
  const isNew = !person  // true = criando, false = editando

  // ── Campos do formulário ─────────────────────────────────────────────
  const [name,       setName]       = useState(person?.name        || '')
  const [category,   setCategory]   = useState<'familia'|'amigos'|'trabalho'|'outros'>(
    person?.category || 'amigos'
  )
  const [relationship, setRelationship] = useState(person?.relationship || '')
  const [phone,      setPhone]      = useState(person?.phone       || '')
  const [email,      setEmail]      = useState(person?.email       || '')
  const [instagram,  setInstagram]  = useState(person?.instagram   || '')
  const [telegram,   setTelegram]   = useState(person?.telegram    || '')
  const [city,       setCity]       = useState(person?.city        || '')
  const [notes,      setNotes]      = useState(person?.notes       || '')
  const [avatarUrl,  setAvatarUrl]  = useState(person?.avatar_url  || '')

  // Apelidos: lista atual (ao editar) + preview dos novos (só adicionados no modal)
  // Ao salvar, os novos são enviados um a um via addAlias()
  const existingAliases = person?.aliases || []
  const [newAliases, setNewAliases] = useState<string[]>([])
  const [aliasDraft,  setAliasDraft] = useState('')

  // Datas: lista atual (ao editar, só exibe) + novas (adicionadas no modal).
  // newDates usa DateDraft (sem id/is_synced) — são rascunhos antes de serem persistidos.
  const existingDates = person?.datas || []
  const [newDates, setNewDates] = useState<DateDraft[]>([])
  const [dateDraft, setDateDraft] = useState<DateDraft>({ label: '', date: '', recurring: true })

  // Estados de carregamento/upload/erro
  const [uploading, setUploading]   = useState(false)  // upload de avatar em andamento
  const [saving,    setSaving]      = useState(false)   // salvar em andamento
  const [deleting,  setDeleting]    = useState(false)   // excluir em andamento
  const [error,     setError]       = useState<string | null>(null)

  // Ref do input de arquivo de foto (oculto)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Upload de avatar ─────────────────────────────────────────────────

  /** Faz upload do arquivo de foto e armazena a URL retornada pelo backend. */
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      // Envia multipart/form-data — komiApi.uploadAvatar usa fetch direto (não api.post)
      const { url } = await komiApi.uploadAvatar(file)
      setAvatarUrl(url)  // armazena apenas a URL, não o arquivo em si
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer upload da foto.')
    } finally {
      setUploading(false)
      // Reseta o input para permitir selecionar o mesmo arquivo novamente
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Apelidos ─────────────────────────────────────────────────────────

  /** Adiciona o rascunho à lista de novos apelidos (com dedup por normalize). */
  function addAlias() {
    const a = aliasDraft.trim()
    if (!a) return
    // Dedup: não adiciona se já existe (comparando sem acentos e maiúsculas)
    const allAliases = [...existingAliases, ...newAliases]
    if (!allAliases.some(x => normalize(x) === normalize(a))) {
      setNewAliases(prev => [...prev, a])
    }
    setAliasDraft('')
  }

  /** Remove um apelido novo (os existentes não podem ser removidos via modal — requer API). */
  function removeNewAlias(i: number) {
    setNewAliases(prev => prev.filter((_, k) => k !== i))
  }

  // ── Datas importantes ─────────────────────────────────────────────────

  /** Adiciona o rascunho de data à lista de novas datas (valida o formato antes). */
  function addDate() {
    const label = dateDraft.label.trim()
    const dateStr = dateDraft.date.trim()
    // Precisa de rótulo e data preenchidos
    if (!label || !dateStr) return
    // Valida o formato AQUI, no momento de adicionar. Antes, uma data inválida
    // entrava no rascunho e falhava silenciosamente no save (o backend devolvia
    // 400 e a tela engolia o erro — "não acontecia nada"). Agora o usuário vê o
    // motivo na hora e a data inválida nem é adicionada.
    if (!isValidImportantDate(dateStr)) {
      setError('Data inválida. Use MM-DD (ex.: 05-15, mês primeiro) ou AAAA-MM-DD (ex.: 1998-05-15).')
      return
    }
    setError(null)  // limpa erro anterior ao adicionar uma data válida
    setNewDates(prev => [...prev, { label, date: dateStr, recurring: dateDraft.recurring }])
    // Reseta o rascunho mantendo o toggle de recorrente
    setDateDraft({ label: '', date: '', recurring: dateDraft.recurring })
  }

  /** Remove uma nova data (as existentes não podem ser removidas via modal). */
  function removeNewDate(i: number) {
    setNewDates(prev => prev.filter((_, k) => k !== i))
  }

  // ── Salvar ────────────────────────────────────────────────────────────

  // Validação mínima: nome não pode estar vazio
  const canSave = name.trim().length > 0 && !uploading && !saving

  /** Salva a pessoa (criação ou edição) e notifica o pai. */
  async function submit() {
    if (!canSave) return
    setSaving(true)
    setError(null)

    try {
      // Relationship padrão: se não preenchido, usa o label da categoria
      const finalRelationship = relationship.trim() ||
        REL_OPTIONS.find(r => r.cat === category)?.defaultRel || category

      if (isNew) {
        // ── Modo criação ──────────────────────────────────────────────
        // Cria a pessoa com todos os campos de uma vez
        const res = await komiApi.create({
          name:         name.trim(),
          relationship: finalRelationship,
          category,
          phone:        phone.trim() || undefined,
          email:        email.trim() || undefined,
          instagram:    instagram.trim() || undefined,
          telegram:     telegram.trim() || undefined,
          city:         city.trim() || undefined,
          avatar_url:   avatarUrl || undefined,
          notes:        notes.trim() || undefined,
        })
        const newId = res.id

        // Adiciona apelidos novos um a um (API aceita só um por vez)
        for (const alias of newAliases) {
          await komiApi.addAlias(newId, alias).catch(() => {})  // ignora erros individuais
        }
        // Adiciona datas novas uma a uma
        for (const date of newDates) {
          await komiApi.addDate(newId, date).catch(() => {})
        }

        // Notifica o pai: criação abriu o perfil automaticamente
        onSaved(newId, true)

      } else {
        // ── Modo edição ───────────────────────────────────────────────
        // Atualiza apenas os campos alterados (PATCH parcial)
        await komiApi.update(person!.id, {
          name:         name.trim(),
          relationship: finalRelationship,
          category,
          phone:        phone.trim() || undefined,
          email:        email.trim() || undefined,
          instagram:    instagram.trim() || undefined,
          telegram:     telegram.trim() || undefined,
          city:         city.trim() || undefined,
          avatar_url:   avatarUrl || undefined,
          notes:        notes.trim() || undefined,
        })

        // Adiciona apelidos novos (os existentes permanecem no backend)
        for (const alias of newAliases) {
          await komiApi.addAlias(person!.id, alias).catch(() => {})
        }
        // Adiciona datas novas (as existentes permanecem)
        for (const date of newDates) {
          await komiApi.addDate(person!.id, date).catch(() => {})
        }

        // Notifica o pai: edição recarrega o perfil
        onSaved(person!.id, false)
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // ── Excluir ───────────────────────────────────────────────────────────

  /** Soft delete da pessoa. Pede confirmação antes de executar. */
  async function handleDelete() {
    if (!person) return
    if (!confirm(`Excluir ${person.name}? Esta ação pode ser revertida pelo suporte.`)) return
    setDeleting(true)
    setError(null)
    try {
      await komiApi.del(person.id)
      onDeleted(person.id)
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir. Tente novamente.')
      setDeleting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    // Scrim: clique fora do modal fecha sem salvar
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {/* Modal propriamente dito: stopPropagation evita fechar ao clicar dentro */}
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>

        {/* Cabeçalho do modal */}
        <div className="form-head">
          <div className="form-title">{isNew ? 'Nova pessoa' : 'Editar pessoa'}</div>
          <button className="modal-x" onClick={onClose}><Icon name="x" /></button>
        </div>

        {/* Corpo rolável */}
        <div className="modal-body">

          {/* ── Foto de avatar ─────────────────────────────────────── */}
          <div className="modal-field">
            <div className="avatar-upload">
              {/* Preview do avatar: foto ou iniciais */}
              <div className="au-preview">
                <Avatar
                  person={{ name: name || '?', avatar_url: avatarUrl || null }}
                  size={96}
                />
              </div>
              <div className="au-actions">
                {/* Input de arquivo oculto — acionado pelo botão abaixo */}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={onPhoto}
                />
                <button
                  className="au-btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Icon name="camera" />
                  {uploading ? 'Enviando…' : avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
                </button>
                {/* Botão de remover foto (só aparece quando há avatar_url) */}
                {avatarUrl && !uploading && (
                  <button className="au-btn danger" onClick={() => setAvatarUrl('')}>
                    <Icon name="trash" />Remover
                  </button>
                )}
                {!avatarUrl && !uploading && (
                  <span className="au-hint">sem foto → usa as iniciais</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Nome ─────────────────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Nome</label>
            <input
              className="text-field title-field"
              autoFocus
              placeholder="Nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              // Enter atalha para salvar
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            />
          </div>

          {/* ── Relacionamento: categoria (segmentado) + rótulo livre ── */}
          <div className="modal-field">
            <label className="modal-label">Relacionamento</label>
            {/* Segmentado de categoria: 4 botões com cor da categoria */}
            <div className="seg-field" style={{ marginBottom: 10 }}>
              {REL_OPTIONS.map(r => {
                const meta = REL_CATS[r.cat]
                const sel  = category === r.cat
                return (
                  <button
                    key={r.cat}
                    className={'seg-opt' + (sel ? ' sel' : '')}
                    style={{ '--so-color': meta.color, '--so-tint': meta.tint } as React.CSSProperties}
                    onClick={() => setCategory(r.cat)}
                  >
                    {/* Dot colorido com a cor da categoria */}
                    <span className="so-mark" />
                    {r.label}
                  </button>
                )
              })}
            </div>
            {/* Campo livre: "amiga", "irmã", "colega de trabalho", etc. */}
            <input
              className="text-field"
              placeholder={`Rótulo (ex.: ${REL_OPTIONS.find(r => r.cat === category)?.defaultRel})`}
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            />
          </div>

          {/* ── Contatos ─────────────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Contatos</label>
            <div className="row-2">
              <input className="text-field" placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className="text-field" placeholder="E-mail"   value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="row-2" style={{ marginTop: 12 }}>
              <input className="text-field" placeholder="Instagram (@)" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
              <input className="text-field" placeholder="Telegram (@)"  value={telegram}  onChange={(e) => setTelegram(e.target.value)} />
            </div>
            <input className="text-field" style={{ marginTop: 12 }} placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>

          {/* ── Apelidos ─────────────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Apelidos — resolvem para esta pessoa</label>
            <div className="edit-list">
              {/* Chips dos apelidos existentes (somente leitura no modal) */}
              {existingAliases.length > 0 && (
                <div className="edit-chip-row">
                  {existingAliases.map((a, i) => (
                    <span className="edit-chip" key={i} style={{ opacity: 0.7 }}>"{a}"</span>
                  ))}
                </div>
              )}
              {/* Chips dos apelidos novos (com botão de remover) */}
              {newAliases.length > 0 && (
                <div className="edit-chip-row">
                  {newAliases.map((a, i) => (
                    <span className="edit-chip" key={i}>
                      "{a}"
                      <button onClick={() => removeNewAlias(i)}><Icon name="x" /></button>
                    </span>
                  ))}
                </div>
              )}
              {/* Campo para adicionar novo apelido */}
              <div className="inline-add">
                <input
                  className="text-field"
                  placeholder='Adicionar apelido (ex.: "Aninha")'
                  value={aliasDraft}
                  onChange={(e) => setAliasDraft(e.target.value)}
                  // Enter adiciona o apelido (sem submeter o formulário)
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias() } }}
                />
                <button className="mini-add" onClick={addAlias}><Icon name="plus" /></button>
              </div>
            </div>
          </div>

          {/* ── Datas importantes ────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Datas importantes</label>
            <div className="edit-list">
              {/* Datas existentes (somente leitura no modal) */}
              {existingDates.map((d, i) => (
                <div className="date-edit-row" key={i}>
                  <span className="edit-chip" style={{ flex: 1, justifyContent: 'space-between', opacity: 0.7 }}>
                    <span>
                      <b style={{ fontWeight: 600 }}>{d.label}</b>
                      {' · '}{fmtDayMonth(d.date)}
                      {d.recurring ? ' · anual' : ''}
                    </span>
                  </span>
                </div>
              ))}
              {/* Datas novas (com botão de remover) */}
              {newDates.map((d, i) => (
                <div className="date-edit-row" key={'new-' + i}>
                  <span className="edit-chip" style={{ flex: 1, justifyContent: 'space-between' }}>
                    <span>
                      <b style={{ fontWeight: 600 }}>{d.label}</b>
                      {' · '}{fmtDayMonth(d.date)}
                      {d.recurring ? ' · anual' : ''}
                    </span>
                    <button onClick={() => removeNewDate(i)}><Icon name="x" /></button>
                  </span>
                </div>
              ))}
              {/* Linha de adicionar nova data */}
              <div className="date-edit-row">
                <input
                  className="text-field de-label"
                  placeholder="Rótulo (ex.: Aniversário)"
                  value={dateDraft.label}
                  onChange={(e) => setDateDraft({ ...dateDraft, label: e.target.value })}
                />
                <input
                  className="text-field de-date"
                  placeholder="MM-DD ou AAAA-MM-DD"
                  value={dateDraft.date}
                  onChange={(e) => setDateDraft({ ...dateDraft, date: e.target.value })}
                />
                {/* Toggle de recorrência anual */}
                <span
                  className="recurr-toggle"
                  onClick={() => setDateDraft({ ...dateDraft, recurring: !dateDraft.recurring })}
                >
                  <span className={'recurr-box' + (dateDraft.recurring ? ' on' : '')}>
                    {dateDraft.recurring && <Icon name="check" />}
                  </span>
                  anual
                </span>
                <button className="mini-add" onClick={addDate}><Icon name="plus" /></button>
              </div>
            </div>
          </div>

          {/* ── Notas livres ─────────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Notas</label>
            <textarea
              className="text-field"
              placeholder="Qualquer coisa que valha lembrar…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Mensagem de erro (aparece abaixo do formulário se houver erro) */}
          {error && (
            <div className="modal-error">{error}</div>
          )}

          {/* ── Rodapé: excluir + cancelar + salvar ─────────────────── */}
          <div className="modal-foot">
            {/* Botão de excluir — apenas em modo edição (soft delete no backend) */}
            {!isNew && (
              <button
                className="danger-link"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Excluindo…' : 'Excluir pessoa'}
              </button>
            )}
            <span className="grow" />
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              disabled={!canSave}
              style={!canSave ? { opacity: 0.45 } : undefined}
              onClick={submit}
            >
              <Icon name="check" />
              {saving ? 'Salvando…' : isNew ? 'Criar pessoa' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
