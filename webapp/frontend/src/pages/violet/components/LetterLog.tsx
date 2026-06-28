// Seção de Cartas da tela Escrever.
//
// Renderiza, para um dia (page), uma área onde o usuário escreve cartas — para
// alguém, algo ou qualquer coisa. Diferente do Registro Emocional (estruturado
// pela TCC), a carta é um texto expressivo livre. Cada carta tem:
//   destinatário (texto livre) + título (opcional) + corpo + status.
//
// Status:
//   'draft'  → rascunho: pode ser editado livremente.
//   'sealed' → lacrada: vira registro imutável (não pode mais ser editada).
//
// Uma carta pode ser vinculada (opcionalmente) a pessoas cadastradas na Komi,
// reutilizando o componente PersonPicker (smart-match 0/1/N) de lá.

import { useEffect, useRef, useState } from 'react'
import { violetApi } from '../../../lib/api'
import type { Letter, LetterPerson } from '../types'
import { Icon } from '../ui/Icon'
// komiApi: busca de pessoas (smart-match) para vincular a carta a alguém.
// Importamos só o objeto de API — a UI de busca abaixo é própria (tematizada com
// os tokens do Violet), evitando depender do CSS do shell da Komi.
import { komiApi } from '../../komi/komiApi'

// Props da seção: precisa apenas do id da página (dia) onde as cartas ficam.
interface LetterSectionProps {
  pageId: number | null
}

// Formato local do formulário enquanto o usuário escreve/edita uma carta.
interface FormState {
  id: number | null          // id da carta em edição; null = criando uma nova
  recipient: string          // "para quem/o quê" (texto livre)
  title: string              // título opcional
  body: string               // corpo da carta
  people: LetterPerson[]     // pessoas (Komi) vinculadas — guardamos id+nome p/ os chips
}

// Estado inicial de um formulário vazio (nova carta).
const EMPTY_FORM: FormState = {
  id: null,
  recipient: '',
  title: '',
  body: '',
  people: [],
}

// Formata o horário (HH:MM) de um timestamp ISO para exibir no cartão.
// Usa o Date local do navegador (UTC-3) — não desloca o dia como toISOString().
function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function LetterSection({ pageId }: LetterSectionProps) {
  // Lista de cartas do dia
  const [letters, setLetters] = useState<Letter[]>([])
  // Formulário ativo (null = nenhum formulário aberto, só a lista + botão)
  const [form, setForm] = useState<FormState | null>(null)
  // Sinaliza tentativa de salvar com campos obrigatórios vazios (destaca os campos)
  const [showErrors, setShowErrors] = useState(false)

  // (Re)carrega as cartas sempre que a página (dia) muda.
  useEffect(() => {
    if (pageId == null) { setLetters([]); return }
    violetApi.letters(pageId).then(setLetters).catch(() => {})
    // Fecha qualquer formulário aberto ao trocar de dia
    setForm(null)
    setShowErrors(false)
  }, [pageId])

  // Recarrega a lista de cartas do dia atual a partir do backend.
  async function reloadLetters() {
    if (pageId == null) return
    const fresh = await violetApi.letters(pageId).catch(() => null)
    if (fresh) setLetters(fresh)
  }

  // Abre o formulário em branco para escrever uma nova carta.
  function startCreate() {
    setForm({ ...EMPTY_FORM, people: [] })
    setShowErrors(false)
  }

  // Abre o formulário preenchido com os dados de uma carta existente (edição).
  // Só rascunhos podem ser editados — o backend rejeita editar carta lacrada.
  function startEdit(letter: Letter) {
    setForm({
      id: letter.id,
      recipient: letter.recipient,
      title: letter.title ?? '',
      body: letter.body,
      people: [...letter.people],
    })
    setShowErrors(false)
  }

  // Fecha o formulário sem salvar.
  function cancelForm() {
    setForm(null)
    setShowErrors(false)
  }

  // Adiciona uma pessoa selecionada no PersonPicker à lista de vínculos (sem duplicar).
  function addPerson(id: string, name: string) {
    if (!form) return
    if (form.people.some(p => p.id === id)) return  // já vinculada — ignora
    setForm({ ...form, people: [...form.people, { id, name }] })
  }

  // Remove uma pessoa da lista de vínculos.
  function removePerson(id: string) {
    if (!form) return
    setForm({ ...form, people: form.people.filter(p => p.id !== id) })
  }

  // Valida os campos obrigatórios (destinatário e corpo não vazios).
  function isValid(f: FormState): boolean {
    return f.recipient.trim().length > 0 && f.body.trim().length > 0
  }

  // Monta o corpo da requisição a partir do formulário.
  function buildBody(f: FormState) {
    return {
      recipient: f.recipient.trim(),
      body: f.body.trim(),
      title: f.title.trim() || null,
      person_ids: f.people.map(p => p.id),
    }
  }

  // Salva a carta como rascunho (cria ou atualiza, conforme form.id).
  async function saveDraft() {
    if (!form || pageId == null) return
    if (!isValid(form)) { setShowErrors(true); return }

    const body = buildBody(form)
    if (form.id == null) {
      // Criando uma nova carta em rascunho — inclui o page_id e status 'draft'
      await violetApi.createLetter({ page_id: pageId, status: 'draft', ...body }).catch(() => {})
    } else {
      // Editando um rascunho existente
      await violetApi.updateLetter(form.id, body).catch(() => {})
    }

    await reloadLetters()
    cancelForm()
  }

  // Lacra a carta (cria/atualiza e fecha). Pede confirmação — é irreversível.
  async function sealForm() {
    if (!form || pageId == null) return
    if (!isValid(form)) { setShowErrors(true); return }
    // Lacrar é definitivo: a carta vira registro imutável
    if (!window.confirm('Lacrar fecha a carta para sempre — não dá mais para editar. Continuar?')) return

    const body = buildBody(form)
    if (form.id == null) {
      // Carta nova já nasce lacrada (status 'sealed')
      await violetApi.createLetter({ page_id: pageId, status: 'sealed', ...body }).catch(() => {})
    } else {
      // Rascunho existente: salva as últimas edições e depois lacra
      await violetApi.updateLetter(form.id, body).catch(() => {})
      await violetApi.sealLetter(form.id).catch(() => {})
    }

    await reloadLetters()
    cancelForm()
  }

  // Lacra uma carta diretamente a partir do cartão (sem abrir o formulário).
  async function sealCard(letter: Letter) {
    if (!window.confirm('Lacrar fecha a carta para sempre — não dá mais para editar. Continuar?')) return
    await violetApi.sealLetter(letter.id).catch(() => {})
    await reloadLetters()
  }

  // Exclui uma carta. Cartas lacradas pedem confirmação (são "rasgadas" de vez).
  async function removeLetter(letter: Letter) {
    if (letter.status === 'sealed') {
      if (!window.confirm('Excluir esta carta lacrada? A ação é permanente.')) return
    }
    await violetApi.deleteLetter(letter.id).catch(() => {})
    await reloadLetters()
  }

  return (
    <div className="lt-section">
      {/* Cabeçalho da seção — ícone de envelope + título */}
      <div className="lt-head">
        <span className="lt-head-icon"><Icon name="envelope" size={15} /></span>
        <span className="lt-head-title">Cartas</span>
      </div>

      {/* Lista de cartas do dia */}
      {letters.map(letter => (
        <LetterCard
          key={letter.id}
          letter={letter}
          onEdit={() => startEdit(letter)}
          onSeal={() => sealCard(letter)}
          onDelete={() => removeLetter(letter)}
        />
      ))}

      {/* Formulário (criar/editar) ou botão de "escrever carta" */}
      {form ? (
        <div className="lt-form">
          {/* 1. Destinatário (obrigatório) */}
          <label className={`lt-field-label ${showErrors && !form.recipient.trim() ? 'lt-required' : ''}`}>
            Para quem / o quê
            {showErrors && !form.recipient.trim() && (
              <span className="lt-required-hint"> — diga para quem é a carta</span>
            )}
          </label>
          <input
            className={`lt-input ${showErrors && !form.recipient.trim() ? 'lt-invalid' : ''}`}
            placeholder="Minha mãe, eu do futuro, o mar, ninguém..."
            value={form.recipient}
            onChange={e => setForm({ ...form, recipient: e.target.value })}
          />

          {/* 2. Vincular pessoa (opcional) — busca de pessoas da Komi */}
          <label className="lt-field-label">Vincular pessoa (opcional)</label>
          <PersonSearch onSelect={addPerson} />
          {/* Chips das pessoas já vinculadas, com × para remover */}
          {form.people.length > 0 && (
            <div className="lt-people">
              {form.people.map(p => (
                <span key={p.id} className="lt-person-chip removable">
                  <span className="lt-at">@</span>{p.name}
                  <button
                    type="button"
                    className="lt-chip-x"
                    onClick={() => removePerson(p.id)}
                    aria-label={`Remover ${p.name}`}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {/* 3. Título (opcional) */}
          <label className="lt-field-label">Título (opcional)</label>
          <input
            className="lt-input"
            placeholder="Um título para a carta..."
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />

          {/* 4. Corpo (obrigatório) */}
          <label className={`lt-field-label ${showErrors && !form.body.trim() ? 'lt-required' : ''}`}>
            Carta
            {showErrors && !form.body.trim() && (
              <span className="lt-required-hint"> — escreva a carta</span>
            )}
          </label>
          <textarea
            className={`lt-textarea ${showErrors && !form.body.trim() ? 'lt-invalid' : ''}`}
            placeholder="Querido(a)..."
            value={form.body}
            onChange={e => setForm({ ...form, body: e.target.value })}
            rows={6}
          />

          {/* Ações do formulário */}
          <div className="lt-form-actions">
            <button type="button" className="lt-save" onClick={saveDraft}>Salvar rascunho</button>
            <button type="button" className="lt-seal" onClick={sealForm}>Lacrar</button>
            <button type="button" className="lt-cancel" onClick={cancelForm}>Cancelar</button>
          </div>
        </div>
      ) : (
        // Estado fechado: convite a escrever (estilo do prompt de sonho)
        pageId != null && (
          <button type="button" className="lt-add-trigger" onClick={startCreate}>
            <Icon name="envelope" size={14} />
            <span>{letters.length === 0 ? 'Escrever uma carta' : 'Escrever outra carta'}</span>
          </button>
        )
      )}
    </div>
  )
}

// ── Cartão de uma carta salva ─────────────────────────────────────────────────

interface LetterCardProps {
  letter: Letter
  onEdit: () => void
  onSeal: () => void
  onDelete: () => void
}

function LetterCard({ letter, onEdit, onSeal, onDelete }: LetterCardProps) {
  // Controla se o corpo da carta está expandido (texto longo não domina a página).
  const [open, setOpen] = useState(false)

  const isSealed = letter.status === 'sealed'

  return (
    <div className={`lt-card ${isSealed ? 'sealed' : ''}`}>
      {/* Linha principal: destinatário + título + selo + horário + ações */}
      <div className="lt-card-top">
        <span className="lt-to-label">para</span>
        <span className="lt-recipient">{letter.recipient}</span>
        {letter.title && <span className="lt-title">— {letter.title}</span>}
        {isSealed && <span className="lt-sealed-badge">lacrada</span>}
        <span className="lt-time">{fmtTime(letter.created_at)}</span>
        <span className="lt-card-actions">
          {/* Rascunho: pode editar e lacrar. Lacrada: só excluir. */}
          {!isSealed && <button type="button" className="lt-link" onClick={onEdit}>editar</button>}
          {!isSealed && <button type="button" className="lt-link" onClick={onSeal}>lacrar</button>}
          <button type="button" className="lt-link lt-danger" onClick={onDelete}>excluir</button>
        </span>
      </div>

      {/* Pessoas vinculadas (somente leitura no cartão) */}
      {letter.people.length > 0 && (
        <div className="lt-people">
          {letter.people.map(p => (
            <span key={p.id} className="lt-person-chip">
              <span className="lt-at">@</span>{p.name}
            </span>
          ))}
        </div>
      )}

      {/* Corpo expansível da carta */}
      <button type="button" className="lt-toggle" onClick={() => setOpen(o => !o)}>
        {open ? 'ocultar carta' : 'ler carta'}
      </button>
      {open && <div className="lt-body">{letter.body}</div>}
    </div>
  )
}

// ── Busca de pessoas (Komi) para vincular à carta ─────────────────────────────

// Resultado de busca da Komi: id + nome + relacionamento (para desambiguar).
interface PersonMatch {
  id: string
  name: string
  relationship: string
}

interface PersonSearchProps {
  // Chamado quando o usuário escolhe uma pessoa na lista de resultados.
  onSelect: (id: string, name: string) => void
}

// Combobox simples e tematizado (tokens .lt-*) que busca pessoas via komiApi com
// debounce. Substitui o PersonPicker da Komi (cujo CSS .pp-* não existe e ficava
// sem estilo dentro do shell do Violet — o ícone de lupa estourava de tamanho).
function PersonSearch({ onSelect }: PersonSearchProps) {
  const [query, setQuery] = useState('')               // texto digitado
  const [results, setResults] = useState<PersonMatch[]>([])  // resultados da busca
  const [loading, setLoading] = useState(false)        // busca em andamento
  // Ref do timer de debounce — evita disparar uma busca a cada tecla
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce: só busca 300ms depois que o usuário para de digitar.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    // Campo vazio: limpa os resultados e não busca
    if (!q) { setResults([]); return }

    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await komiApi.search(q)
        setResults(data.matches || [])
      } catch {
        // Erro de rede/API — silencioso (padrão do Violet); só não mostra resultados
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    // Limpa o timer ao desmontar ou quando query muda novamente
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  // Escolhe uma pessoa: notifica o pai e limpa o campo/resultados.
  function pick(p: PersonMatch) {
    onSelect(p.id, p.name)
    setQuery('')
    setResults([])
  }

  // Só mostramos o dropdown quando há algo relevante (resultados, carregando, ou
  // uma busca com 2+ caracteres que não achou nada).
  const showDropdown = loading || results.length > 0 || query.trim().length > 1

  return (
    <div className="lt-pp">
      <input
        className="lt-input"
        placeholder="Buscar pessoa cadastrada…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        // Esc limpa o campo
        onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); setResults([]) } }}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="lt-pp-dropdown">
          {loading && <div className="lt-pp-empty">buscando…</div>}
          {!loading && results.map(p => (
            <button type="button" key={p.id} className="lt-pp-item" onClick={() => pick(p)}>
              <span className="lt-pp-name">{p.name}</span>
              {p.relationship && <span className="lt-pp-rel">{p.relationship}</span>}
            </button>
          ))}
          {!loading && results.length === 0 && query.trim().length > 1 && (
            <div className="lt-pp-empty">Nenhuma pessoa encontrada</div>
          )}
        </div>
      )}
    </div>
  )
}
