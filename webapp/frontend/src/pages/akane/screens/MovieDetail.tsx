// Detalhe do filme (#filme/<id>): ficha, sessões, notas e Cofre, com as ações do filme no cabeçalho.

import { useState } from 'react'
import { fmtDate, fmtDuration } from '../../../design/core/format'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import {
  Button, Chip, DetailPage, EmptyState, ErrorState, Field, Icon, IconButton, InfoRow, Input, LoadingState, Menu, Modal, Page, SectionHeader, Select, Stars, StatusChip,
  Tag, Textarea, hueFromName, type MenuItem,
} from '../../../design'
import { akaneApi } from '../akaneApi'
import { AddToListModal } from '../components/AddToListModal'
import { CatalogEditor } from '../components/CatalogEditor'
import { MatchPicker } from '../components/MatchPicker'
import { SessionEditor } from '../components/SessionEditor'
import { useAkane } from '../context'
import { countryName, languageName } from '../lib/names'
import { deleteSession } from '../lib/sessions'
import { useLoad } from '../lib/useLoad'
import type { DiaryEntry, Movie, TmdbResult, VaultItem, VaultType } from '../types'

type Dialog = null | 'list' | 'edit' | 'match' | 'vault'

const VAULT_TYPES: { value: VaultType; label: string; icon: 'play' | 'link' | 'knowledge' | 'journal' }[] = [
  { value: 'video', label: 'Vídeo', icon: 'play' },
  { value: 'article', label: 'Artigo', icon: 'link' },
  { value: 'essay', label: 'Ensaio', icon: 'knowledge' },
  { value: 'review', label: 'Crítica', icon: 'journal' },
]

/** O filme já está no catálogo: o formulário de logar só precisa do que identifica. */
const asResult = (m: Movie): TmdbResult => ({ tmdb_id: m.tmdb_id ?? 0, title: m.title, year: m.year, poster_url: m.poster_url, director: m.director, local_id: m.id, in_catalog: true })

export function MovieDetail({ id }: { id: string }) {
  const akane = useAkane()
  const { state, retry } = useLoad(() => akaneApi.detail(id), [id, akane.rev])
  const [tab, setTab] = useState('geral')
  const [menu, setMenu] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [editing, setEditing] = useState<DiaryEntry | null>(null)
  const [notes, setNotes] = useState<string | null>(null)

  const back = () => akane.goto('films')
  if (state.status === 'loading') return <Page><LoadingState variant="card" count={2} /></Page>
  if (state.status === 'error') {
    return <Page><ErrorState title="Não foi possível abrir o filme" hint="Ele pode ter sido excluído, ou a conexão falhou." onRetry={retry} /><Button icon="left" onClick={back}>Voltar para Filmes</Button></Page>
  }

  const { movie, people, vault } = state.data
  // O detalhe devolve as sessões sem id/título do filme; completa para reaproveitar o editor e o excluir.
  const diary: DiaryEntry[] = state.data.diary.map((e) => ({ ...e, movie_id: movie.id, movie_title: movie.title, poster_url: movie.poster_url, poster_palette: movie.poster_palette }))
  const watched = movie.status === 'watched'

  const act = async (run: () => Promise<unknown>, done: string) => {
    try { await run(); akane.reload(); toast(done, { tone: 'success' }) } catch { toast('Não foi possível concluir. Tente de novo.', { tone: 'error' }) }
  }
  const toggleLike = () => act(() => akaneApi.like(movie.id, !movie.liked), movie.liked ? 'Curtida removida' : 'Curtido')
  const toggleStatus = async () => {
    const next = watched ? 'watchlist' : 'watched'
    try {
      await akaneApi.updateStatus(movie.id, next)
      akane.reload()
      toast(next === 'watchlist' ? 'Voltou para o Quero ver' : 'Marcado como visto', { tone: 'success', undo: () => { void akaneApi.updateStatus(movie.id, movie.status).then(akane.reload) } })
    } catch { toast('Não foi possível mudar a situação.', { tone: 'error' }) }
  }
  const remove = async () => {
    const ok = await confirm({
      title: `Excluir “${movie.title}”?`,
      body: 'O filme sai do catálogo, das listas e das estatísticas. Não dá para desfazer por aqui.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    try { await akaneApi.delete(movie.id); akane.reload(); toast('Filme excluído'); back() } catch { toast('Não foi possível excluir o filme.', { tone: 'error' }) }
  }

  const items: MenuItem[] = [
    { id: 'edit', label: 'Editar dados', onSelect: () => setDialog('edit') },
    { id: 'refresh', label: 'Atualizar dados do TMDB', onSelect: () => { void act(() => akaneApi.refreshMetadata(movie.id), 'Dados atualizados pelo TMDB') } },
    { id: 'match', label: 'Trocar filme (outro título do TMDB)', onSelect: () => setDialog('match') },
    { id: 'delete', label: 'Excluir filme', onSelect: () => { void remove() } },
  ]

  const facts = [
    movie.director.length ? { title: 'Direção', value: movie.director.join(', ') } : null,
    movie.runtime ? { title: 'Duração', value: fmtDuration(movie.runtime) } : null,
    movie.original_language ? { title: 'Idioma original', value: languageName(movie.original_language) } : null,
    movie.countries?.length ? { title: 'Países', value: movie.countries.map(countryName).join(', ') } : null,
  ].filter((x): x is { title: string; value: string } => !!x)

  const savedNotes = movie.notes ?? ''
  const draftNotes = notes ?? savedNotes

  return (
    <Page>
      <DetailPage
        backLabel="Filmes"
        onBack={back}
        title={movie.title}
        subtitle={[movie.year, movie.director.join(', ') || null, movie.runtime ? fmtDuration(movie.runtime) : null].filter(Boolean).join(' · ')}
        chips={<><StatusChip status={watched ? 'done' : 'planned'} label={watched ? 'Visto' : 'Quero ver'} />{movie.genres.slice(0, 3).map((g) => <Tag key={g}>{g}</Tag>)}</>}
        rating={watched ? movie.rating : undefined}
        image={movie.poster_url}
        icon="movie"
        hue={hueFromName(movie.title)}
        tab={tab}
        onTab={setTab}
        actions={
          <>
            <Button variant="primary" icon="add" onClick={() => akane.openLog({ film: asResult(movie) })}>Logar sessão</Button>
            <Chip on={movie.liked} icon="heart" aria-pressed={movie.liked} onClick={() => void toggleLike()}>Curti</Chip>
            <Button icon={watched ? 'watchlist' : 'check'} onClick={() => void toggleStatus()}>{watched ? 'Voltar ao Quero ver' : 'Marcar como visto'}</Button>
            <Button icon="list" onClick={() => setDialog('list')}>Adicionar à lista</Button>
            <span className="ax-menu">
              <IconButton icon="more" label="Mais ações do filme" onClick={() => setMenu((v) => !v)} />
              {menu && <Menu label="Ações do filme" items={items} onClose={() => setMenu(false)} />}
            </span>
          </>
        }
        tabs={[
          {
            id: 'geral', label: 'Visão geral',
            content: (
              <>
                <section className="ds-card ax-pad"><p>{movie.overview || 'Sem sinopse. Use “Atualizar dados do TMDB” ou “Editar dados”.'}</p></section>
                <div className="ax-split">
                  <section aria-labelledby="ax-sessoes">
                    <SectionHeader title="Sessões" id="ax-sessoes" mono={diary.length ? String(diary.length) : undefined} />
                    {diary.length === 0
                      ? <EmptyState icon="movie" title="Nenhuma sessão ainda" hint="Registre quando você assistiu: data, nota, onde e com quem." action={<Button variant="primary" icon="add" onClick={() => akane.openLog({ film: asResult(movie) })}>Logar sessão</Button>} />
                      : (
                        <div className="ds-list">
                          {diary.map((e) => (
                            <div key={e.id} className="ds-lrow ax-session ax-srow">
                              <span className="ds-lead"><Icon name={e.rewatch ? 'rewatch' : e.watch_location?.kind === 'cinema' ? 'cinema' : 'movie'} size={18} /></span>
                              <span className="ds-t">
                                <b>{fmtDate(e.watched_date)}</b>
                                <span>{[e.watch_location?.name, e.companions.length ? `com ${e.companions.map((p) => p.name).join(', ')}` : null, e.rewatch ? 'revisão' : null].filter(Boolean).join(' · ') || 'Sem detalhes'}</span>
                                {e.review && <span className="ax-srev">{e.review}</span>}
                              </span>
                              <span className="ax-sact">
                                {e.rating ? <Stars value={e.rating} /> : null}
                                <IconButton icon="edit" label={`Editar sessão de ${fmtDate(e.watched_date)}`} size={16} onClick={() => setEditing(e)} />
                                <IconButton icon="delete" label={`Excluir sessão de ${fmtDate(e.watched_date)}`} size={16} onClick={() => void deleteSession(e, movie.title, akane.reload)} />
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                  </section>
                  <section aria-labelledby="ax-notas">
                    <SectionHeader title="Notas" id="ax-notas" />
                    <div className="ds-stack">
                      <Field label="Anotações sobre o filme" hint="Soltas, só suas. A resenha de cada sessão fica em Sessões.">
                        {(a) => <Textarea {...a} rows={6} value={draftNotes} onChange={(e) => setNotes(e.target.value)} />}
                      </Field>
                      <div><Button variant="primary" icon="check" disabled={draftNotes === savedNotes} onClick={() => { void act(() => akaneApi.setNotes(movie.id, draftNotes), 'Anotações salvas').then(() => setNotes(null)) }}>Salvar anotações</Button></div>
                    </div>
                  </section>
                </div>
                {facts.length > 0 && <div className="ds-list">{facts.map((f) => <InfoRow key={f.title} title={f.title} value={f.value} />)}</div>}
                {movie.tags.length > 0 && <div className="ds-inline">{movie.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>}
                {people.length > 0 && (
                  <div className="ds-list" aria-label="Elenco e equipe">
                    {people.slice(0, 12).map((p) => <InfoRow key={p.id} title={p.name} detail={p.role ?? undefined} />)}
                  </div>
                )}
              </>
            ),
          },
          {
            id: 'cofre', label: `Cofre${vault.length ? ` (${vault.length})` : ''}`,
            content: (
              <div className="ds-stack">
                <div><Button icon="add" onClick={() => setDialog('vault')}>Guardar conteúdo</Button></div>
                {vault.length === 0
                  ? <EmptyState icon="library" title="O Cofre está vazio" hint="Guarde vídeos-ensaio, artigos e críticas sobre este filme." />
                  : <div className="ds-list">{vault.map((v) => <VaultRow key={v.id} item={v} movieId={movie.id} />)}</div>}
              </div>
            ),
          },
        ]}
      />
      {dialog === 'list' && <AddToListModal movieId={movie.id} title={movie.title} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && <CatalogEditor movie={movie} onClose={() => setDialog(null)} />}
      {dialog === 'match' && <MatchPicker movie={movie} onClose={() => setDialog(null)} />}
      {dialog === 'vault' && <VaultModal movieId={movie.id} onClose={() => setDialog(null)} />}
      {editing && <SessionEditor key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}

function VaultRow({ item, movieId }: { item: VaultItem; movieId: string }) {
  const akane = useAkane()
  const kind = VAULT_TYPES.find((t) => t.value === item.type)
  const remove = async () => {
    const ok = await confirm({ title: 'Remover do Cofre?', body: `“${item.title}” sai do Cofre deste filme. Você poderá desfazer logo depois.`, confirmLabel: 'Remover', danger: true })
    if (!ok) return
    try {
      await akaneApi.deleteVault(item.id)
      akane.reload()
      toast('Removido do Cofre', { undo: () => { void akaneApi.addVault(movieId, { type: item.type, title: item.title, url: item.url ?? undefined, source: item.source ?? undefined }).then(akane.reload) } })
    } catch { toast('Não foi possível remover.', { tone: 'error' }) }
  }
  return (
    <div className="ds-lrow">
      <span className="ds-lead"><Icon name={kind?.icon ?? 'link'} size={18} /></span>
      <span className="ds-t">
        <b>{item.url ? <a href={item.url} target="_blank" rel="noreferrer noopener">{item.title}</a> : item.title}</b>
        <span>{[kind?.label, item.source].filter(Boolean).join(' · ')}</span>
      </span>
      <IconButton icon="delete" label={`Remover ${item.title} do Cofre`} size={16} onClick={() => void remove()} />
    </div>
  )
}

function VaultModal({ movieId, onClose }: { movieId: string; onClose: () => void }) {
  const akane = useAkane()
  const [type, setType] = useState<VaultType>('video')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Dê um título ao conteúdo.'
    if (url.trim() && !/^https?:\/\/\S+$/i.test(url.trim())) e.url = 'O link precisa começar com http:// ou https://.'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    let source: string | undefined
    try { source = url.trim() ? new URL(url.trim()).hostname.replace(/^www\./, '') : undefined } catch { source = undefined }
    try {
      await akaneApi.addVault(movieId, { type, title: title.trim(), ...(url.trim() ? { url: url.trim() } : {}), ...(source ? { source } : {}) })
      akane.reload()
      toast('Guardado no Cofre', { tone: 'success' })
      onClose()
    } catch { setErrors({ form: 'Não foi possível guardar. Tente de novo.' }); setSaving(false) }
  }

  return (
    <Modal
      title="Guardar no Cofre"
      size="sm"
      dirty={!!title || !!url}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void save()}>Guardar</Button></>}
    >
      <div className="ds-stack">
        <Field label="Tipo">{(a) => <Select {...a} value={type} onChange={(e) => setType(e.target.value as VaultType)}>{VAULT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>}</Field>
        <Field label="Título" error={errors.title}>{(a) => <Input {...a} value={title} placeholder="Ex.: Análise da cena do espelho" onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Link (opcional)" error={errors.url}>{(a) => <Input {...a} value={url} placeholder="https://…" inputMode="url" onChange={(e) => setUrl(e.target.value)} />}</Field>
        {errors.form && <p className="ds-errmsg" role="alert">{errors.form}</p>}
      </div>
    </Modal>
  )
}
