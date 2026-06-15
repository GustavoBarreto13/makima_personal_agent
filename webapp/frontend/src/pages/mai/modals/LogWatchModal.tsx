// LogWatchModal — modal para registrar uma sessão de episódios.
// Campos: série alvo (catálogo local OU busca TMDB + adição inline),
//         data, temporada, ep_start, ep_end, nota, review.
//
// FLUXO NOVO (série ainda não no catálogo):
//  1. Usuário digita o título → seção "No seu catálogo" mostra matches locais
//  2. Se não estiver no catálogo → seção "Adicionar do TMDB" mostra resultados do TMDB
//  3. Usuário clica num resultado TMDB → série fica "pendente" (badge visual)
//  4. Ao submeter: add_series() primeiro → captura o series_id → log_watch()
//  add_series é idempotente por tmdb_id, então sem risco de duplicar.

import { useState, useEffect, useRef, type FormEvent } from 'react'
import type { Series } from '../types'
import { maiApi, type TMDBSearchResult } from '../maiApi'
import { RateInput } from '../components/Stars'
import { IconX, IconTv, IconSearch } from '../components/MaiIcons'

// ── Tipos locais ───────────────────────────────────────────────────────────

/** Props do modal. */
interface Props {
  /** Se passado, pré-seleciona a série e pula a busca por completo. */
  prefilledSeriesId?: string | null
  prefilledTitle?: string | null
  onClose: () => void
  onSuccess: (msg: string) => void
}

/**
 * Série do TMDB selecionada mas ainda não adicionada ao catálogo.
 * Fica pendente até o submit, quando é criada inline automaticamente.
 */
interface PendingTmdb {
  tmdb_id: number
  title: string
}

// ── Componente principal ───────────────────────────────────────────────────

/** LogWatchModal — modal de registro de sessão de episódios. */
export function LogWatchModal({ prefilledSeriesId, prefilledTitle, onClose, onSuccess }: Props) {

  // ── Estados do formulário ────────────────────────────────────────────────
  // Cada campo tem seu próprio estado para controle independente
  const [seriesId,    setSeriesId]    = useState(prefilledSeriesId ?? '')  // ID interno do catálogo
  const [seriesTitle, setSeriesTitle] = useState(prefilledTitle ?? '')     // Título exibido no chip
  const [date,        setDate]        = useState(new Date().toISOString().slice(0, 10)) // Data de hoje
  const [season,      setSeason]      = useState<string>('')               // Número da temporada
  const [epStart,     setEpStart]     = useState<string>('')               // Episódio inicial
  const [epEnd,       setEpEnd]       = useState<string>('')               // Episódio final
  const [rating,      setRating]      = useState<number | null>(null)      // Nota 0.5–5.0
  const [review,      setReview]      = useState('')                        // Impressões livres
  const [saving,      setSaving]      = useState(false)                    // Submissão em andamento
  const [error,       setError]       = useState<string | null>(null)      // Mensagem de erro

  // ── Estado da seleção TMDB pendente ─────────────────────────────────────
  // Quando o usuário escolhe uma série do TMDB (fora do catálogo),
  // armazenamos tmdb_id + title aqui. O series_id real só vem após o submit.
  const [pendingTmdb, setPendingTmdb] = useState<PendingTmdb | null>(null)

  // ── Estados de busca híbrida ─────────────────────────────────────────────
  const [searchQ,       setSearchQ]       = useState('')            // Texto digitado
  const [catalog,       setCatalog]       = useState<Series[]>([])  // Catálogo completo (carregado 1x)
  const [tmdbResults,   setTmdbResults]   = useState<TMDBSearchResult[]>([]) // Resultados TMDB
  const [searchingTmdb, setSearchingTmdb] = useState(false)         // Indicador de loading TMDB

  // Ref para o timer do debounce (evita disparar uma requisição a cada tecla)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Carrega o catálogo uma única vez no mount ────────────────────────────
  // Só carrega se não há série pré-selecionada (pré-seleção não precisa de busca).
  // Filtrar client-side é muito mais rápido do que chamar a API a cada tecla.
  useEffect(() => {
    if (prefilledSeriesId) return  // pré-selecionada → busca desnecessária
    maiApi.list()
      .then(res => setCatalog((res as any).series as Series[]))
      .catch(() => {})  // falha silenciosa — catálogo vazio é pior caso tolerável
  }, [prefilledSeriesId])

  // ── Busca no TMDB com debounce de 500ms ─────────────────────────────────
  // Só ativa quando: query >= 2 chars, sem pré-seleção, sem série já escolhida
  useEffect(() => {
    // Não busca se há série já selecionada (catálogo ou TMDB pendente)
    if (prefilledSeriesId || seriesId || pendingTmdb) return

    if (searchQ.trim().length < 2) {
      setTmdbResults([])  // limpa resultados TMDB se query curta
      return
    }

    // Cancela o timer anterior antes de criar um novo (debounce)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      setSearchingTmdb(true)
      maiApi.search(searchQ)
        .then(res => {
          const all = (res as any).results as TMDBSearchResult[]
          // Filtra: só exibe séries que ainda NÃO estão no catálogo.
          // As que já estão aparecem na seção "No seu catálogo" (filtro local acima).
          // Isso evita duplicidade nas duas seções.
          setTmdbResults(all.filter(r => !r.in_catalog))
        })
        .catch(() => setTmdbResults([]))
        .finally(() => setSearchingTmdb(false))
    }, 500)

    // Limpa o timer se o componente desmontar ou a query mudar antes do disparo
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQ, prefilledSeriesId, seriesId, pendingTmdb])

  // ── Filtro client-side do catálogo local ────────────────────────────────
  // Compara título e título original; limite de 5 resultados para não poluir.
  const catalogMatches = searchQ.trim().length >= 2
    ? catalog
        // Filtra por título ou título original, comparando sem case sensitivity
        .filter((s: Series) =>
          !s.deleted &&
          (s.title.toLowerCase().includes(searchQ.toLowerCase()) ||
           (s.title_original ?? '').toLowerCase().includes(searchQ.toLowerCase()))
        )
        .slice(0, 5)
    : []

  // ── Seleção de série do catálogo local ──────────────────────────────────
  function selectCatalog(s: Series) {
    setSeriesId(s.id)         // ID real no banco → pode logar diretamente
    setSeriesTitle(s.title)
    setPendingTmdb(null)      // garante que não há TMDB pendente conflitando
    setTmdbResults([])
    setSearchQ('')
  }

  // ── Seleção de série do TMDB (ainda não no catálogo) ────────────────────
  function selectTmdb(r: TMDBSearchResult) {
    setSeriesId('')           // sem ID ainda — será gerado no submit
    setSeriesTitle(r.title)
    setPendingTmdb({ tmdb_id: r.tmdb_id, title: r.title })
    setTmdbResults([])
    setSearchQ('')
  }

  // ── Limpa a seleção atual e volta para a busca ───────────────────────────
  function clearSelection() {
    setSeriesId('')
    setSeriesTitle('')
    setPendingTmdb(null)
  }

  // ── Derivados de estado para controle do render ──────────────────────────
  // Determina se há busca ativa e o resultado das duas seções combinado
  const searchActive = searchQ.trim().length >= 2
  const noResults    = searchActive && !searchingTmdb
                    && catalogMatches.length === 0
                    && tmdbResults.length === 0
  const showResults  = searchActive
                    && (catalogMatches.length > 0 || tmdbResults.length > 0 || searchingTmdb)

  // ── Submit: [opcionalmente] adicionar ao catálogo → logar sessão ─────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // Valida: precisa de série selecionada — do catálogo OU do TMDB
    if (!seriesId && !pendingTmdb) {
      setError('Selecione uma série')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Resolve o ID a ser usado no log
      let idParaLogar = seriesId

      // Se a série veio do TMDB e ainda não está no catálogo:
      // adiciona primeiro para obter o series_id, depois loga
      if (pendingTmdb && !seriesId) {
        const addRes = await maiApi.add({
          tmdb_id: pendingTmdb.tmdb_id,
          title:   pendingTmdb.title,
          // "assistindo" é o status natural de quem está registrando uma sessão agora.
          // add_series é idempotente por tmdb_id: se já existe, retorna o ID existente.
          status:  'assistindo',
        })
        // O backend retorna { status: 'ok', series_id: '...', ... }
        idParaLogar = (addRes as any).series_id as string
      }

      // Registra a sessão com o ID resolvido (novo ou existente)
      await maiApi.logWatch(idParaLogar, {
        watched_date:  date,
        season_number: season  ? parseInt(season)  : undefined,
        ep_start:      epStart ? parseInt(epStart) : undefined,
        ep_end:        epEnd   ? parseInt(epEnd)   : undefined,
        rating:        rating ?? undefined,
        review:        review || undefined,
      })

      // Monta a label de feedback (ex: "T1 E1–3 de 'Série' registrada!")
      const epsLabel = epStart
        ? `T${season} E${epStart}${epEnd && epEnd !== epStart ? `–${epEnd}` : ''}`
        : 'sessão'
      onSuccess(`${epsLabel} de "${seriesTitle}" registrada! 📺`)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar sessão')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">📺 Registrar sessão</div>
          <button className="modal-x" onClick={onClose}><IconX /></button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>

          {/* ── Campo: Série alvo ─────────────────────────────────────────── */}
          {prefilledSeriesId ? (
            /* Série pré-selecionada (aberto via Hero / botão na tela de detalhe):
               mostra chip fixo sem campo de busca */
            <div className="modal-field">
              <label className="modal-label">Série</label>
              <div className="log-target">
                <div className="lt-meta">
                  <div className="lt-title">{seriesTitle}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="modal-field">
              <label className="modal-label">Série</label>

              {/* Série já selecionada (catálogo ou TMDB pendente) → chip com botão limpar */}
              {(seriesId || pendingTmdb) ? (
                /* Clicar no chip limpa a seleção e volta para a busca */
                <div
                  className="log-target"
                  onClick={clearSelection}
                  style={{ cursor: 'pointer' }}
                  title="Clique para trocar de série"
                >
                  <div className="lt-meta">
                    <div className="lt-title">{seriesTitle}</div>
                    {/* Badge informativo: aparece só quando a série vem do TMDB
                        e ainda não existe no catálogo — será criada no submit */}
                    {pendingTmdb && !seriesId && (
                      <div className="lt-badge">será adicionada ao catálogo</div>
                    )}
                  </div>
                  <div className="lt-check"><IconX /></div>
                </div>
              ) : (
                /* Nenhuma série selecionada → campo de busca + lista de resultados */
                <div>
                  {/* Barra de busca com ícone de lupa e spinner de loading */}
                  <div className="series-search-bar">
                    <IconSearch style={{ opacity: 0.5, flexShrink: 0, width: 16, height: 16 }} />
                    <input
                      placeholder="Buscar série (catálogo ou TMDB)…"
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      autoFocus
                    />
                    {/* Spinner aparece durante a requisição ao TMDB */}
                    {searchingTmdb && <div className="fs-spin" />}
                  </div>

                  {/* Estado vazio: digitou ≥2 chars mas nenhuma seção tem resultado */}
                  {noResults && (
                    <div className="fs-empty">
                      Nenhuma série encontrada — tente outro título.
                    </div>
                  )}

                  {/* Lista de resultados dividida em duas seções */}
                  {showResults && (
                    <div className="series-search-results">

                      {/* ── Seção 1: resultados do catálogo local ─────────── */}
                      {/* Filtrado client-side — instantâneo, sem chamada de API */}
                      {catalogMatches.length > 0 && (
                        <>
                          <div className="ss-section-label">No seu catálogo</div>
                          {catalogMatches.map((s: Series) => (
                            <div
                              key={s.id}
                              className="fs-result"
                              onClick={() => selectCatalog(s)}
                            >
                              <div className="fs-meta">
                                <div className="fs-title">{s.title}</div>
                                {/* Título original (quando diferente do principal) */}
                                {s.title_original && s.title_original !== s.title && (
                                  <div className="fs-orig">{s.title_original}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* ── Seção 2: resultados do TMDB (novos) ──────────── */}
                      {/* Só mostra séries que ainda NÃO estão no catálogo.
                          Selecionar cria a série inline no submit. */}
                      {tmdbResults.length > 0 && (
                        <>
                          <div className="ss-section-label">Adicionar do TMDB</div>
                          {tmdbResults.map((r: TMDBSearchResult) => (
                            <div
                              key={r.tmdb_id}
                              className="fs-result"
                              onClick={() => selectTmdb(r)}
                            >
                              {/* Thumbnail do pôster (TMDB CDN) */}
                              <div className="fs-poster-thumb">
                                {r.poster_url ? (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w92${r.poster_url}`}
                                    alt=""
                                    style={{
                                      width: '100%', height: '100%',
                                      objectFit: 'cover', borderRadius: 4,
                                    }}
                                  />
                                ) : (
                                  /* Fallback quando sem pôster: ícone de TV centralizado */
                                  <div className="fs-poster-fallback">
                                    <IconTv />
                                  </div>
                                )}
                              </div>

                              <div className="fs-meta">
                                <div className="fs-title">{r.title}</div>
                                {/* Título original em itálico quando diferente */}
                                {r.title_original && r.title_original !== r.title && (
                                  <div className="fs-orig">{r.title_original}</div>
                                )}
                                {/* Ano de estreia + rede/streaming */}
                                <div className="fs-year">
                                  {r.first_air_date
                                    ? new Date(r.first_air_date + 'T00:00:00').getFullYear()
                                    : '—'}
                                  {r.network && ` · ${r.network}`}
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Campo: Data da sessão ────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Data da sessão</label>
            <input
              type="date"
              className="date-input"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          {/* ── Campo: Episódios (temporada + intervalo) ─────────────────── */}
          <div className="modal-field">
            <label className="modal-label">
              Episódios <span className="ml-hint">(opcional)</span>
            </label>
            <div className="ep-range">
              {/* Número da temporada */}
              <div>
                <input
                  type="number"
                  className="num-input"
                  placeholder="Temporada"
                  min={1}
                  value={season}
                  onChange={e => setSeason(e.target.value)}
                />
                <div className="field-cap">Temporada</div>
              </div>
              {/* Episódio inicial da sessão */}
              <div>
                <input
                  type="number"
                  className="num-input"
                  placeholder="Ep inicial"
                  min={1}
                  value={epStart}
                  onChange={e => setEpStart(e.target.value)}
                />
                <div className="field-cap">Ep inicial</div>
              </div>
              {/* Episódio final (pode ser igual ao inicial para sessão de 1 ep) */}
              <div>
                <input
                  type="number"
                  className="num-input"
                  placeholder="Ep final"
                  min={1}
                  value={epEnd}
                  onChange={e => setEpEnd(e.target.value)}
                />
                <div className="field-cap">Ep final</div>
              </div>
            </div>
          </div>

          {/* ── Campo: Avaliação da sessão ───────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Avaliação</label>
            {/* RateInput: estrelas interativas 0.5–5.0 (meia estrela via clip-path) */}
            <RateInput value={rating} onChange={setRating} />
          </div>

          {/* ── Campo: Impressões livres ─────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">
              Impressões <span className="ml-hint">(opcional)</span>
            </label>
            <textarea
              className="note-input"
              placeholder="O que achou desta sessão…"
              value={review}
              onChange={e => setReview(e.target.value)}
            />
          </div>

          {/* Mensagem de erro (validação ou falha de API) */}
          {error && (
            <div style={{ color: 'var(--st-abandonada)', fontSize: 13, marginTop: 8 }}>
              ❌ {error}
            </div>
          )}

          {/* ── Rodapé com botões ────────────────────────────────────────── */}
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <div className="grow" />
            {/* Texto do botão muda para refletir que pode haver duas operações */}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? (pendingTmdb ? 'Adicionando e registrando…' : 'Salvando…')
                : '📺 Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
