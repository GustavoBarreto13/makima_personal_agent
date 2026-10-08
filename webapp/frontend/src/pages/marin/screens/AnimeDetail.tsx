// Detalhe do anime (#anime/<id>): ficha, sessões, caderno e episódios, com as ações do anime no cabeçalho.

import { useState } from 'react'
import { fmtDate } from '../../../design/core/format'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import {
  Button, Chip, DetailPage, EmptyState, ErrorState, Field, Icon, IconButton, InfoRow, LoadingState, Menu, Page, ProgressBar, RateInput, SectionHeader,
  Select, Stars, StatusChip, Tag, TagInput, Textarea, hueFromName, type MenuItem,
} from '../../../design'
import { AddToListModal } from '../components/AddToListModal'
import { useMarin } from '../context'
import { epLabel, nextEpisode } from '../lib/log'
import { malLabel } from '../lib/score'
import { deleteSession } from '../lib/sessions'
import { STATUS, STATUS_ORDER } from '../lib/status'
import { useLoad } from '../lib/useLoad'
import { marinApi } from '../marinApi'
import type { Anime, AnimeStatus, Episode } from '../types'

const FORMAT_LABEL: Record<string, string> = { tv: 'TV', movie: 'Filme', ova: 'OVA', special: 'Especial', ona: 'ONA' }

export function AnimeDetail({ id }: { id: string }) {
  const marin = useMarin()
  const { state, retry } = useLoad(() => marinApi.detail(id), [id, marin.rev])
  const [tab, setTab] = useState('geral')
  const [menu, setMenu] = useState(false)
  const [listDialog, setListDialog] = useState(false)
  const [notes, setNotes] = useState<string | null>(null)

  const back = () => marin.goto('catalog')
  if (state.status === 'loading') return <Page><LoadingState variant="card" count={2} /></Page>
  if (state.status === 'error') {
    return <Page><ErrorState title="Não foi possível abrir o anime" hint="Ele pode ter sido removido, ou a conexão falhou." onRetry={retry} /><Button icon="left" onClick={back}>Voltar para o Catálogo</Button></Page>
  }

  const { anime, next, logs } = state.data
  const upNext = nextEpisode(anime)

  // Executa uma mudança, recarrega e avisa; qualquer falha vira um aviso amigável.
  const act = async (run: () => Promise<unknown>, done: string) => {
    try { await run(); marin.reload(); toast(done, { tone: 'success' }) } catch { toast('Não foi possível concluir. Tente de novo.', { tone: 'error' }) }
  }
  const toggleLike = () => act(() => marinApi.like(anime.id, !anime.liked), anime.liked ? 'Curtida removida' : 'Curtido')

  const changeStatus = async (status: AnimeStatus) => {
    if (status === anime.status) return
    const before = anime.status
    try {
      await marinApi.updateStatus(anime.id, status)
      marin.reload()
      toast(`${anime.title}: ${STATUS[status].label.toLowerCase()}`, { tone: 'success', undo: () => { void marinApi.updateStatus(anime.id, before).then(marin.reload) } })
    } catch { toast('Não foi possível mudar o estado.', { tone: 'error' }) }
  }

  const rate = async (stars: number) => {
    const before = anime.rating
    try {
      await marinApi.rate(anime.id, stars || null)
      marin.reload()
      toast(stars ? `Nota ${malLabel(stars)}` : 'Nota removida', { tone: 'success', undo: () => { void marinApi.rate(anime.id, before).then(marin.reload) } })
    } catch { toast('Não foi possível salvar a nota.', { tone: 'error' }) }
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Remover “${anime.title}”?`,
      body: 'O anime sai do catálogo, das listas e da sua lista no MyAnimeList. O histórico de sessões é preservado. Você poderá desfazer logo depois.',
      confirmLabel: 'Remover',
      danger: true,
    })
    if (!ok) return
    try {
      await marinApi.deleteAnime(anime.id)
      marin.reload()
      back()
      toast('Anime removido', { undo: () => { void marinApi.restoreAnime(anime.id).then(marin.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
    } catch { toast('Não foi possível remover o anime.', { tone: 'error' }) }
  }

  // Etiquetas: o TagInput devolve a lista nova; aqui vira "adicionar" e "remover" para o servidor.
  const changeTags = async (list: string[]) => {
    const added = list.filter((t) => !anime.tags.includes(t))
    const removed = anime.tags.filter((t) => !list.includes(t))
    try {
      for (const t of added) await marinApi.addTag(anime.id, t)
      for (const t of removed) await marinApi.removeTag(anime.id, t)
      marin.reload()
    } catch { toast('Não foi possível salvar as etiquetas.', { tone: 'error' }) }
  }

  const items: MenuItem[] = [
    { id: 'refresh', label: anime.malId ? 'Atualizar dados (MyAnimeList)' : 'Atualizar dados (precisa de um anime do MyAnimeList)', disabled: !anime.malId, onSelect: () => { void act(() => marinApi.refreshMetadata(anime.id), 'Dados atualizados') } },
    { id: 'delete', label: 'Remover do catálogo', onSelect: () => { void remove() } },
  ]

  const facts = [
    anime.studio ? { title: 'Estúdio', value: anime.studio } : null,
    anime.season ? { title: 'Temporada', value: anime.season } : null,
    anime.mediaType ? { title: 'Formato', value: FORMAT_LABEL[anime.mediaType] } : null,
    { title: 'Episódios', value: anime.total ? String(anime.total) : 'em exibição' },
    { title: 'Progresso', value: anime.total ? `${anime.watched}/${anime.total}` : String(anime.watched) },
    { title: 'Sessões', value: String(logs.length) },
    anime.started ? { title: 'Começou em', value: fmtDate(anime.started) } : null,
    anime.finished ? { title: 'Terminou em', value: fmtDate(anime.finished) } : null,
    anime.abandoned ? { title: 'Abandonado em', value: fmtDate(anime.abandoned) } : null,
  ].filter((x): x is { title: string; value: string } => !!x)

  const savedNotes = anime.notes
  const draftNotes = notes ?? savedNotes
  const tone = STATUS[anime.status].tone

  return (
    <Page>
      <DetailPage
        backLabel="Catálogo"
        onBack={back}
        title={anime.title}
        subtitle={[anime.titleJapanese, anime.studio, anime.season].filter(Boolean).join(' · ')}
        chips={<>{tone ? <StatusChip status={tone} label={STATUS[anime.status].label} /> : <Tag pr>{STATUS[anime.status].label}</Tag>}{anime.genres.slice(0, 3).map((g) => <Tag key={g}>{g}</Tag>)}</>}
        image={anime.poster}
        icon="anime"
        hue={hueFromName(anime.title)}
        tab={tab}
        onTab={setTab}
        actions={
          <>
            <span className="mr-actions-main">
              <Button variant="primary" icon="episode" onClick={() => marin.openLog({ animeId: anime.id, episode: upNext ?? undefined })}>{upNext ? `Logar ep ${upNext}` : 'Logar sessão'}</Button>
              <Chip on={anime.liked} icon="heart" aria-pressed={anime.liked} onClick={() => void toggleLike()}>Curti</Chip>
              <Button icon="list" onClick={() => setListDialog(true)}>Adicionar à lista</Button>
              <span className="mr-menu">
                <IconButton icon="more" label="Mais ações do anime" onClick={() => setMenu((v) => !v)} />
                {menu && <Menu label="Ações do anime" items={items} onClose={() => setMenu(false)} />}
              </span>
            </span>
            <span className="mr-actions-sub">
            <Select className="mr-select" aria-label="Estado do anime" value={anime.status} onChange={(e) => void changeStatus(e.target.value as AnimeStatus)}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </Select>
              <span className="mr-rate">
                <RateInput value={anime.rating ?? 0} onChange={(v) => void rate(v)} />
                {malLabel(anime.rating) && <span className="ds-mono" title="Nota no MyAnimeList">{malLabel(anime.rating)}</span>}
              </span>
            </span>
          </>
        }
        tabs={[
          {
            id: 'geral', label: 'Visão geral',
            content: (
              <>
                {anime.banner && <img className="mr-banner" src={anime.banner} alt="" loading="lazy" decoding="async" />}
                <section className="ds-card mr-pad">
                  <p>{anime.overview || 'Sem sinopse. Use “Atualizar dados” no menu para buscá-la.'}</p>
                  {anime.progress !== null && (
                    <div className="mr-prog">
                      <ProgressBar value={anime.progress * 100} label={`${Math.round(anime.progress * 100)}% assistido`} />
                      <span className="ds-mono">{anime.watched}/{anime.total} episódios · {Math.round(anime.progress * 100)}%</span>
                    </div>
                  )}
                  {next && anime.status !== 'completo' && <p className="mr-next ds-hint">Próximo: <b>Ep {next.number}{next.title ? ` · ${next.title}` : ''}</b>{next.aired ? ` · ${fmtDate(next.aired)}` : ''}</p>}
                </section>
                <div className="mr-split">
                  <section aria-labelledby="mr-sessoes">
                    <SectionHeader title="Sessões" id="mr-sessoes" mono={logs.length ? String(logs.length) : undefined} />
                    {logs.length === 0
                      ? <EmptyState icon="anime" title="Nenhuma sessão ainda" hint="Registre os episódios que você assistiu: data, nota e anotação." action={<Button variant="primary" icon="episode" onClick={() => marin.openLog({ animeId: anime.id, episode: upNext ?? undefined })}>Logar episódio</Button>} />
                      : (
                        <div className="ds-list">
                          {logs.map((s) => (
                            <div key={s.id} className="ds-lrow mr-session mr-srow">
                              <span className="ds-lead"><Icon name="episode" size={18} /></span>
                              <span className="ds-t">
                                <b>{fmtDate(s.date)}</b>
                                <span>{epLabel(s.epStart, s.epEnd, s.count)}{s.count > 1 && s.epStart !== null ? ` · ${s.count} eps` : ''}</span>
                                {s.notes && <span className="mr-srev">{s.notes}</span>}
                              </span>
                              <span className="mr-sact">
                                {s.rating ? <Stars value={s.rating} /> : null}
                                <IconButton icon="delete" label={`Excluir sessão de ${fmtDate(s.date)}`} size={16} onClick={() => void deleteSession(s, marin.reload)} />
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                  </section>
                  <section aria-labelledby="mr-caderno">
                    <SectionHeader title="Caderno da Marin" id="mr-caderno" />
                    <div className="ds-stack">
                      <Field label="Anotações sobre o anime" hint="Soltas, só suas. A anotação de cada sessão fica em Sessões.">
                        {(a) => <Textarea {...a} rows={6} value={draftNotes} onChange={(e) => setNotes(e.target.value)} />}
                      </Field>
                      <div className="ds-inline">
                        <Button variant="primary" icon="check" disabled={draftNotes === savedNotes} onClick={() => { void act(() => marinApi.setNotes(anime.id, draftNotes), 'Anotações salvas').then(() => setNotes(null)) }}>Salvar anotações</Button>
                        {draftNotes !== savedNotes && <Button variant="ghost" onClick={() => setNotes(null)}>Descartar</Button>}
                      </div>
                    </div>
                  </section>
                </div>
                <div className="ds-list">{facts.map((f) => <InfoRow key={f.title} title={f.title} value={f.value} />)}</div>
                {anime.genres.length > 0 && <div className="ds-inline">{anime.genres.map((g) => <Tag key={g}>{g}</Tag>)}</div>}
                <Field label="Etiquetas" hint="Enter para adicionar. Servem para achar o anime depois em Etiquetas.">
                  {(a) => <TagInput id={a.id} value={anime.tags} onChange={(list) => void changeTags(list)} />}
                </Field>
              </>
            ),
          },
          {
            id: 'episodios', label: `Episódios${state.data.episodesTotal ? ` (${state.data.episodesTotal})` : ''}`,
            content: <EpisodeList anime={anime} firstPage={state.data.episodes} total={state.data.episodesTotal} />,
          },
        ]}
      />
      {listDialog && <AddToListModal animeId={anime.id} title={anime.title} onClose={() => setListDialog(false)} />}
    </Page>
  )
}

/** Lista de episódios, 12 por vez ("Carregar mais"); cada episódio não visto tem o atalho de logar. */
function EpisodeList({ anime, firstPage, total }: { anime: Anime; firstPage: Episode[]; total: number }) {
  const marin = useMarin()
  const [extra, setExtra] = useState<Episode[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  // Episódios vistos depois do carregamento (o servidor devolve a 1ª página sempre atualizada).
  const shown = [...firstPage, ...extra]

  const more = async () => {
    setLoading(true)
    try {
      const r = await marinApi.episodes(anime.id, page + 1)
      setExtra((cur) => [...cur, ...r.episodes])
      setPage((p) => p + 1)
    } catch { toast('Não foi possível carregar mais episódios.', { tone: 'error' }) }
    setLoading(false)
  }

  if (total === 0 && shown.length === 0) {
    return <EmptyState icon="episode" title="Sem lista de episódios" hint="Use “Atualizar dados” no menu do anime para buscar os episódios no MyAnimeList." />
  }
  return (
    <div className="ds-stack">
      <div className="ds-list" role="list" aria-label="Episódios">
        {shown.map((e) => (
          <div key={e.id} role="listitem" className="ds-lrow mr-ep">
            <span className="ds-lead"><Icon name={e.watched ? 'check' : 'clock'} size={18} label={e.watched ? 'Assistido' : 'Não assistido'} /></span>
            <span className="ds-t">
              <b>Ep {e.number}{e.title ? ` · ${e.title}` : ''}</b>
              {/* A data já é o dia exato (sem fuso): o shell antigo mostrava um dia a menos. */}
              <span>{e.aired ? fmtDate(e.aired) : e.scheduled ? 'Agendado' : 'Sem data'}{e.watched && e.watchedDate ? ` · visto em ${fmtDate(e.watchedDate)}` : ''}</span>
            </span>
            {!e.watched && <Button size="sm" icon="check" onClick={() => marin.openLog({ animeId: anime.id, episode: e.number })}>Logar</Button>}
          </div>
        ))}
      </div>
      {shown.length < total && <div><Button disabled={loading} onClick={() => void more()}>{loading ? 'Carregando…' : 'Carregar mais'}</Button></div>}
    </div>
  )
}
