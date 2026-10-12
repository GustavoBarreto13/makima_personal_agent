// @vitest-environment jsdom
// A Violet nova de ponta a ponta no jsdom: o shell de verdade, com a API simulada (spec 076).
// Cobre o que mais importa: abrir um dia não cria página; escrever um momento cria (e salva); @ sugere a Komi e
// grava o token com o id; / cita um filme da Akane; a fonte do dia muda na hora; Arquivo, Cartas e erro.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'
import { todayISO } from '../../design/core/format'

const api = vi.hoisted(() => ({
  page: vi.fn(), ensurePage: vi.fn(), setFont: vi.fn(), setDream: vi.fn(), upsertBullet: vi.fn(), deleteBullet: vi.fn(), setFavorite: vi.fn(),
  entries: vi.fn(), emotionLogs: vi.fn(), letters: vi.fn(), allLetters: vi.fn(), getCounsel: vi.fn(), refProviders: vi.fn(), refSearch: vi.fn(),
  suggestPeople: vi.fn(), listEmotions: vi.fn(),
}))
vi.mock('./violetApi', () => ({ violetApi: api, qs: () => '' }))
vi.mock('../kaguya/api', () => ({ kaguyaApi: { createTask: vi.fn() } }))
vi.mock('../komi/komiApi', () => ({ komiApi: { create: vi.fn() } }))

import { VioletShell } from './VioletShell'

const TODAY = todayISO()
const EMPTY_PAGE = { page: { id: null, date: TODAY, type_id: 1, dream: null, font: null, num: 4, created_at: null, updated_at: null }, bullets: [] }
const PAGE = { ...EMPTY_PAGE, page: { ...EMPTY_PAGE.page, id: 9 } }

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.page.mockResolvedValue(EMPTY_PAGE)
  api.ensurePage.mockResolvedValue(PAGE)
  api.upsertBullet.mockImplementation(async (b: { position: number; content: string; kind: string; page_id: number }) =>
    ({ status: 'ok', bullet: { id: 100 + b.position, page_id: b.page_id, kind: b.kind, content: b.content, position: b.position, created_at: null, favorite: false } }))
  api.setFont.mockResolvedValue({ status: 'ok', page_id: 9, font: 'cursiva' })
  api.getCounsel.mockResolvedValue({ counsel: null })
  api.emotionLogs.mockResolvedValue([])
  api.letters.mockResolvedValue([])
  api.allLetters.mockResolvedValue([])
  api.entries.mockResolvedValue([])
  api.listEmotions.mockResolvedValue([])
  api.refProviders.mockResolvedValue([{ key: 'akane', aliases: ['akane', 'filme'], label: 'Akane', hint: 'filmes' }])
  api.refSearch.mockResolvedValue({ status: 'ok', agent: 'akane', results: [
    { agent: 'akane', entity_type: 'movie', entity_id: 'm1', label: 'Matrix', sublabel: '1999', cover_url: null, deep_link: '/movies#filme/m1', token: '[Matrix](akane:movie:m1)' },
  ] })
  api.suggestPeople.mockResolvedValue({ status: 'ok', people: [{ id: 'p1', name: 'Fulana', relationship: 'amiga', avatar_url: null, alias: null }] })
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200) })

const open = async (hash = '') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><VioletShell /></MemoryRouter>)
  return user
}

describe('Escrever', () => {
  it('abrir o dia não cria página; escrever cria e salva o momento', async () => {
    const user = await open()
    await screen.findByPlaceholderText(/Como foi o seu dia/)
    expect(api.ensurePage).not.toHaveBeenCalled()
    await user.click(screen.getByRole('textbox', { name: 'Novo momento' }))
    await user.type(screen.getByRole('textbox', { name: 'Momento' }), 'Dia calmo{Enter}')
    await waitFor(() => expect(api.upsertBullet).toHaveBeenCalledWith(expect.objectContaining({ page_id: 9, content: 'Dia calmo', kind: 'bullet' })))
    expect(api.ensurePage).toHaveBeenCalledTimes(1)
  })

  it('@ sugere a Komi e grava o token com o id', async () => {
    const user = await open()
    await screen.findByPlaceholderText(/Como foi o seu dia/)
    await user.click(screen.getByRole('textbox', { name: 'Novo momento' }))
    await user.type(screen.getByRole('textbox', { name: 'Momento' }), 'jantar com @Ful')
    await user.click(await screen.findByRole('option', { name: /Fulana/ }))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(api.upsertBullet).toHaveBeenCalledWith(expect.objectContaining({ content: 'jantar com @[Fulana](komi:p1)' })))
  })

  it('/akane cita um filme da Akane', async () => {
    const user = await open()
    await screen.findByPlaceholderText(/Como foi o seu dia/)
    await user.click(screen.getByRole('textbox', { name: 'Novo momento' }))
    await user.type(screen.getByRole('textbox', { name: 'Momento' }), 'vi /akane Mat')
    await user.click(await screen.findByRole('option', { name: /Matrix/ }))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(api.upsertBullet).toHaveBeenCalledWith(expect.objectContaining({ content: 'vi [Matrix](akane:movie:m1)' })))
  })

  it('escreve no próprio bullet: a última linha já é um campo e não há barra de escrita', async () => {
    const user = await open()
    const tail = await screen.findByRole('textbox', { name: 'Novo momento' })
    await user.click(tail)
    const editor = screen.getByRole('textbox', { name: 'Momento' })
    expect(editor).toBe(tail)
    expect(document.activeElement).toBe(editor)
    expect(document.querySelector('.vl-writebar')).toBeNull()
  })

  it('tocar no texto de um momento edita ali mesmo', async () => {
    api.page.mockResolvedValueOnce({ page: { id: 9, date: TODAY, dream: null, font: null, num: 1 }, bullets: [
      { id: 5, page_id: 9, position: 1000, content: 'Café com calma', kind: 'bullet', favorite: false, created_at: `${TODAY}T10:00:00-03:00`, tutor: null },
    ] })
    const user = await open()
    await user.click(await screen.findByText('Café com calma'))
    const editor = screen.getByRole('textbox', { name: 'Momento' }) as HTMLTextAreaElement
    expect(editor.value).toBe('Café com calma')
    expect(document.activeElement).toBe(editor)
    await user.type(editor, '!{Escape}')
    await waitFor(() => expect(api.upsertBullet).toHaveBeenCalledWith(expect.objectContaining({ position: 1000, content: 'Café com calma!' })))
  })

  it('a fonte do dia muda na hora', async () => {
    const user = await open()
    await screen.findByPlaceholderText(/Como foi o seu dia/)
    await user.click(screen.getAllByRole('button', { name: /Normal/ })[0])
    await user.click(screen.getByRole('menuitem', { name: /Cursiva/ }))
    await waitFor(() => expect(api.setFont).toHaveBeenCalledWith(TODAY, 'cursiva'))
    expect(document.querySelector('.vl-write.vl-font-cursiva')).not.toBeNull()
  })

  it('erro ao carregar o dia mostra tentar de novo', async () => {
    api.page.mockRejectedValueOnce(new Error('rede'))
    await open()
    expect(await screen.findByText('Não foi possível carregar')).toBeTruthy()
  })
})

describe('Arquivo e Cartas', () => {
  it('Arquivo mostra os dias com conteúdo', async () => {
    api.entries.mockResolvedValue([{ date: '2026-10-01', num: 3, font: 'roteiro', excerpt: 'Fui ao [Cinema](akane:movie:m1)', excerpt_kind: 'bullet', bullet_count: 2, word_count: 12, emotion_count: 1, letter_count: 0, has_highlight: true, has_dream: false, has_favorite: false, has_counsel: false }])
    await open('#arquivo')
    expect(await screen.findByRole('button', { name: /Cinema/ })).toBeTruthy()
    expect(screen.getByText(/#3/)).toBeTruthy()
  })

  it('Cartas vazias convidam a escrever a primeira', async () => {
    await open('#cartas')
    expect(await screen.findByText('Nenhuma carta ainda')).toBeTruthy()
  })
})
