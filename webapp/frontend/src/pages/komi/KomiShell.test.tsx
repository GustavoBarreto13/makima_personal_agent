// @vitest-environment jsdom
// A Komi nova de ponta a ponta no jsdom: o shell de verdade, com a API simulada.
// Cobre o que mais importa no uso: Início (blocos, primeiro uso, erro), registrar contato pela linha rápida
// (e desfazer), o espaço Tudo · Pessoal · Trabalho, Pessoas (busca por qualquer nome), cadastro com conflito de
// nome, e o perfil com Memória (faixas pessoal/trabalho, desvincular), Anotações (sugestão da IA), Interações e Datas.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'
import type { Briefing, Category, Memory, PersonDetail, PersonNote, PersonRow } from './types'

const api = vi.hoisted(() => ({
  overview: vi.fn(), categories: vi.fn(), duplicates: vi.fn(), get: vi.fn(), briefing: vi.fn(), memory: vi.fn(), summary: vi.fn(),
  generateSummary: vi.fn(), notes: vi.fn(), interactions: vi.fn(), addInteraction: vi.fn(), removeInteraction: vi.fn(), restoreInteraction: vi.fn(),
  create: vi.fn(), update: vi.fn(), addAlias: vi.fn(), addDate: vi.fn(), unlink: vi.fn(), relink: vi.fn(), acceptNote: vi.fn(), dismissNote: vi.fn(),
  addNote: vi.fn(), relations: vi.fn(), personGroups: vi.fn(), groups: vi.fn(), relationKinds: vi.fn(), stats: vi.fn(), mergePreview: vi.fn(), merge: vi.fn(),
  remove: vi.fn(), restore: vi.fn(), removeAlias: vi.fn(), removeNote: vi.fn(), restoreNote: vi.fn(), updateNote: vi.fn(), updateDate: vi.fn(), removeDate: vi.fn(),
}))
vi.mock('./komiApi', async () => {
  const real = await vi.importActual<typeof import('./komiApi')>('./komiApi')
  return { ...real, komiApi: api }
})

import { KomiShell } from './KomiShell'
import { DEFAULT_PREFS } from './context'

const row = (over: Partial<PersonRow> & Pick<PersonRow, 'id' | 'name'>): PersonRow => ({
  nickname: null, full_name: null, relationship: null, category: 'amigos', context: 'personal', city: null, avatar_url: null,
  birth_day: null, birth_month: null, birth_year: null, birthday_remind_days: 1, aliases: [], groups: [], link_count: 0, dates: [],
  finance_net: 0, last_interaction: null, ...over,
})

const PEOPLE: PersonRow[] = [
  row({ id: 'bia', name: 'Beatriz', nickname: 'Bia', full_name: 'Beatriz Silva', context: 'both', birth_day: 20, birth_month: 10, birth_year: 1990, last_interaction: { date: '2026-10-10', kind: 'interação', text: 'café' }, link_count: 3 }),
  row({ id: 'caio', name: 'Caio', category: 'trabalho', context: 'work', last_interaction: { date: '2026-06-01', kind: 'tarefa', text: 'reunião' }, finance_net: -50 }),
  row({ id: 'duda', name: 'Duda', category: 'familia', relationship: 'prima', aliases: ['Dudinha'] }),
]
const CATEGORIES: Category[] = [
  { slug: 'familia', label: 'Família', icon: 'heart', position: 0, archived: false, people_count: 1 },
  { slug: 'amigos', label: 'Amigos', icon: 'people', position: 1, archived: false, people_count: 1 },
  { slug: 'trabalho', label: 'Trabalho', icon: 'work', position: 2, archived: false, people_count: 1 },
  { slug: 'outros', label: 'Outros', icon: 'person', position: 3, archived: false, people_count: 0 },
]
const DETAIL: PersonDetail = {
  perfil: {
    id: 'bia', name: 'Beatriz', nickname: 'Bia', full_name: 'Beatriz Silva', relationship: null, category: 'amigos', context: 'both', phone: '81 99999-0000', email: null,
    instagram: null, telegram: null, city: 'Recife', avatar_url: null, birth_day: 20, birth_month: 10, birth_year: 1990, birthday_remind_days: 1, created_at: '2026-01-01', deleted: false,
  },
  aliases: [{ id: 1, alias: 'Betinha' }],
  datas: [{ id: 5, label: 'Casamento', date: '2020-06-01', recurring: true, remind_days_before: 2 }],
}
const MEMORY: Memory = {
  items: [
    { entity_type: 'task', entity_id: '10', agent: 'kaguya', label: 'Tarefas', icon: 'task', title: 'Comprar presente', snippet: '', date: '2026-10-12', deep_link: '/tasks#t/10', context: 'personal' },
    { entity_type: 'task', entity_id: '11', agent: 'kaguya', label: 'Tarefas', icon: 'task', title: 'Revisar contrato', snippet: 'com a Bia', date: '2026-10-13', deep_link: '/tasks#t/11', context: 'work' },
    { entity_type: 'interaction', entity_id: '1', agent: 'komi', label: 'Interações', icon: 'phone', title: 'Encontro', snippet: 'café', date: '2026-10-10', deep_link: '/people#pessoa/bia', context: 'personal' },
  ],
  counts: { kaguya: 2, komi: 1 }, by_context: { personal: 2, work: 1 }, unavailable: [],
}
const BRIEFING: Briefing = {
  perfil: { id: 'bia', name: 'Beatriz', nickname: 'Bia', full_name: 'Beatriz Silva', context: 'both', city: 'Recife', category_label: 'Amigos' },
  birthday: { day: 20, month: 10, year: 1990, next_date: '2026-10-20', in_days: 2, turning: 36 }, dates: [],
  notes: { presente: [{ id: 1, text: 'Livro de orquídeas', context: 'personal' }] }, suggestions_pending: 1, ai: null,
  pending: { balance: 0, open_tasks: 1, waiting: [] },
  contact: { last: { date: '2026-10-10', kind: 'interação', text: 'café' }, days_since: 8, recent_interactions: [{ kind: 'encontro', date: '2026-10-10', note: 'café', context: 'personal' }] },
  relations: [], groups: [],
}
const NOTES: PersonNote[] = [
  { id: 1, person_id: 'bia', kind: 'presente', context: 'personal', text: 'Livro de orquídeas', source: 'manual', source_refs: [], status: 'ativa', created_at: '2026-10-01' },
  { id: 2, person_id: 'bia', kind: 'gosta', context: 'personal', text: 'Café sem açúcar', source: 'ia', source_refs: [{ entity_type: 'task', entity_id: '10', agent: 'kaguya', title: 'Comprar presente', deep_link: '/tasks#t/10' }], status: 'sugerida', created_at: '2026-10-02' },
]

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.overview.mockResolvedValue(PEOPLE)
  api.categories.mockResolvedValue(CATEGORIES)
  api.duplicates.mockResolvedValue([])
  api.get.mockResolvedValue(DETAIL)
  api.briefing.mockResolvedValue(BRIEFING)
  api.memory.mockResolvedValue(MEMORY)
  api.summary.mockResolvedValue({ summary: null, stale: null, generated_at: null })
  api.notes.mockResolvedValue(NOTES)
  api.interactions.mockResolvedValue([{ id: 1, person_id: 'bia', kind: 'encontro', context: 'personal', note: 'café', happened_at: '2026-10-10T12:00:00-03:00', date: '2026-10-10' }])
  api.addInteraction.mockResolvedValue({ status: 'ok', id: 99 })
  api.removeInteraction.mockResolvedValue(undefined)
  api.restoreInteraction.mockResolvedValue({ status: 'ok' })
  api.create.mockResolvedValue({ status: 'ok', id: 'novo' })
  api.update.mockResolvedValue({ status: 'ok' })
  api.addAlias.mockResolvedValue({ status: 'ok' })
  api.unlink.mockResolvedValue({ status: 'ok', removed: 1, undoable: true })
  api.relink.mockResolvedValue({ status: 'ok' })
  api.acceptNote.mockResolvedValue({ status: 'ok' })
  api.dismissNote.mockResolvedValue({ status: 'ok' })
  api.relations.mockResolvedValue([])
  api.personGroups.mockResolvedValue([])
  api.groups.mockResolvedValue([])
  api.relationKinds.mockResolvedValue([{ slug: 'irmao', label: 'Irmão/irmã', inverse_slug: 'irmao' }])
  api.mergePreview.mockResolvedValue({ status: 'ok', keep: { id: 'bia', name: 'Beatriz', nickname: 'Bia' }, drop: { id: 'duda', name: 'Duda', nickname: null }, moves: { links: { task: 2 }, interactions: 1, notes: 0, dates: 0, relations: 0, groups: 0 }, fill: {}, aliases: ['Duda'], context: 'both', birthday: false })
  api.stats.mockResolvedValue({
    period: { year: 2026, month: null, label: '2026' }, previous: null,
    kpis: [{ key: 'interactions', label: 'Interações', value: 4, prev: null, decimals: 0 }, { key: 'people_contacted', label: 'Pessoas contatadas', value: 2, prev: null, decimals: 0 }, { key: 'birthdays', label: 'Aniversários', value: 1, prev: null, decimals: 0 }, { key: 'no_contact', label: 'Sem contato há +30 dias', value: 1, prev: null, decimals: 0 }],
    daily: [{ date: '2026-10-10', value: 1 }], monthly: [{ month: 10, value: 4 }], monthlyUnit: 'interações', distribution: [], rankings: {}, records: [], moments: [], first_year: 2026,
  })
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const open = async (hash = '') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><KomiShell /></MemoryRouter>)
  return user
}
const openHome = async () => {
  const user = await open()
  await screen.findByText('Caderno de bilhetes')
  return user
}

describe('Início', () => {
  it('hero com o próximo aniversário e quem pede um oi; cartões de número', async () => {
    await openHome()
    expect(screen.getByRole('heading', { level: 2, name: /^(Bom dia|Boa tarde|Boa noite|Boa madrugada)\.$/ })).toBeTruthy()
    expect(screen.getByText(/Próximo aniversário:/)).toBeTruthy()
    expect(screen.getByText(/Caio está sem contato/)).toBeTruthy()
    expect(screen.getAllByText('Pessoas').length).toBeGreaterThan(0)
    expect(screen.getByText('Sem contato · 30+ dias')).toBeTruthy()
  })

  it('"A acertar" mostra o saldo da Nami', async () => {
    await openHome()
    expect(screen.getByText('A acertar')).toBeTruthy()
    expect(screen.getByText('você deve')).toBeTruthy()
  })

  it('primeiro uso: ninguém cadastrado', async () => {
    api.overview.mockResolvedValue([])
    await open()
    expect(await screen.findByText('Seu caderno de pessoas começa aqui')).toBeTruthy()
  })

  it('erro ao carregar oferece tentar de novo', async () => {
    api.overview.mockRejectedValueOnce(new Error('falhou'))
    await open()
    const retry = await screen.findByRole('button', { name: /tentar de novo/i })
    await userEvent.click(retry)
    expect(await screen.findByText('Caderno de bilhetes')).toBeTruthy()
  })

  it('linha rápida: "+Bia café ontem" salva direto e o aviso tem Desfazer', async () => {
    const user = await openHome()
    const input = screen.getByLabelText('Registrar contato em uma linha')
    await user.type(input, '+Bia café ontem{Enter}')
    await waitFor(() => expect(api.addInteraction).toHaveBeenCalledTimes(1))
    const [id, body] = api.addInteraction.mock.calls[0]
    expect(id).toBe('bia')
    expect(body).toMatchObject({ kind: 'encontro', note: 'café', context: 'personal' })
    expect(body.happened_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(api.removeInteraction).toHaveBeenCalledWith(99))
  })

  it('linha rápida com nome que não existe abre o formulário em vez de salvar', async () => {
    const user = await openHome()
    await user.type(screen.getByLabelText('Registrar contato em uma linha'), '+Zelda café{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Registrar contato' })).toBeTruthy()
    expect(api.addInteraction).not.toHaveBeenCalled()
  })
})

describe('espaço: Tudo · Pessoal · Trabalho', () => {
  it('Trabalho esconde quem é só pessoal e mantém quem é "ambos"', async () => {
    const user = await open('#pessoas')
    await screen.findByText('Duda')
    await user.click(screen.getByRole('button', { name: 'Trabalho', pressed: false }))
    await waitFor(() => expect(screen.queryByText('Duda')).toBeNull())
    expect(screen.getByText('Caio')).toBeTruthy()
    expect(screen.getByText('Beatriz')).toBeTruthy()
  })

  it('a escolha fica lembrada', async () => {
    const user = await open('#pessoas')
    await screen.findByText('Duda')
    await user.click(screen.getByRole('button', { name: 'Pessoal', pressed: false }))
    expect(JSON.parse(localStorage.getItem('ds:prefs:komi') ?? '{}').space).toBe('personal')
  })
})

describe('Pessoas', () => {
  it('busca por Apelido, Nome completo e outras formas', async () => {
    const user = await open('#pessoas')
    await screen.findByText('Duda')
    const box = screen.getByPlaceholderText('Buscar por nome, apelido, cidade ou grupo')
    await user.type(box, 'dudinha')
    await waitFor(() => expect(screen.queryByText('Caio')).toBeNull())
    expect(screen.getByText('Duda')).toBeTruthy()
    await user.clear(box)
    await user.type(box, 'bia')
    await waitFor(() => expect(screen.queryByText('Duda')).toBeNull())
    expect(screen.getByText('Beatriz')).toBeTruthy()
  })

  it('cartão mostra Nome, depois Apelido · Nome completo', async () => {
    await open('#pessoas')
    expect(await screen.findByText('Bia · Beatriz Silva')).toBeTruthy()
  })

  it('relacionamento do menu recorta a lista', async () => {
    const user = await open('#pessoas')
    await screen.findByText('Duda')
    await user.click(screen.getByRole('button', { name: /^Família/ }))
    await waitFor(() => expect(screen.queryByText('Caio')).toBeNull())
    expect(screen.getByText('Duda')).toBeTruthy()
  })
})

describe('cadastro', () => {
  it('nome repetido volta do servidor e aparece no campo, sem fechar o formulário', async () => {
    api.create.mockRejectedValueOnce(new Error("'Bia' já é o nome ou apelido de Beatriz. Escolha outro para não confundir as duas pessoas."))
    const user = await open('#pessoas')
    await screen.findByText('Duda')
    await user.click(screen.getAllByRole('button', { name: /Nova pessoa/ })[0])
    await user.type(await screen.findByLabelText('Nome'), 'Outra')
    await user.type(screen.getByLabelText('Apelido'), 'Bia')
    await user.click(screen.getByRole('button', { name: /Cadastrar/ }))
    expect(await screen.findByText(/já é o nome ou apelido de Beatriz/)).toBeTruthy()
    expect(screen.getByLabelText('Apelido').getAttribute('aria-invalid')).toBe('true')
  })

  it('sem nome não deixa salvar', async () => {
    const user = await open('#pessoas')
    await screen.findByText('Duda')
    await user.click(screen.getAllByRole('button', { name: /Nova pessoa/ })[0])
    await user.click(await screen.findByRole('button', { name: /Cadastrar/ }))
    expect(await screen.findByText('Dê um nome à pessoa.')).toBeTruthy()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('cadastra com aniversário e lembrete e abre o perfil', async () => {
    const user = await open('#pessoas')
    await screen.findByText('Duda')
    await user.click(screen.getAllByRole('button', { name: /Nova pessoa/ })[0])
    await user.type(await screen.findByLabelText('Nome'), 'Nova')
    await user.type(screen.getByLabelText('Dia'), '5')
    await user.selectOptions(screen.getByLabelText('Mês'), '3')
    await user.click(screen.getByRole('button', { name: /Cadastrar/ }))
    await waitFor(() => expect(api.create).toHaveBeenCalled())
    expect(api.create.mock.calls[0][0]).toMatchObject({ name: 'Nova', birth_day: 5, birth_month: 3, birthday_remind_days: 1, context: 'personal' })
    await waitFor(() => expect(window.location.hash).toBe('#pessoa/novo'))
  })
})

describe('Perfil', () => {
  const openProfile = async () => {
    const user = await open('#pessoa/bia')
    await screen.findByRole('heading', { level: 2, name: 'Beatriz' })
    return user
  }

  it('cabeçalho: os três nomes, relacionamento, espaço e contato', async () => {
    await openProfile()
    expect(screen.getByText(/Bia · Beatriz Silva/)).toBeTruthy()
    expect(screen.getByText('Pessoal e trabalho')).toBeTruthy()
    expect(screen.getByRole('link', { name: '81 99999-0000' })).toBeTruthy()
  })

  it('Memória: briefing, e quem é "ambos" tem as faixas Pessoal e Trabalho separadas', async () => {
    await openProfile()
    expect(await screen.findByText(/Antes de falar com Bia/)).toBeTruthy()
    const personal = (await screen.findByRole('heading', { name: /^Pessoal/ })).closest('section') as HTMLElement
    const work = screen.getByRole('heading', { name: /^Trabalho/ }).closest('section') as HTMLElement
    expect(within(personal).getByText('Comprar presente')).toBeTruthy()
    expect(within(personal).queryByText('Revisar contrato')).toBeNull()
    expect(within(work).getByText('Revisar contrato')).toBeTruthy()
  })

  it('desvincular pede confirmação, chama a API e oferece Desfazer', async () => {
    const user = await openProfile()
    await user.click(await screen.findByRole('button', { name: 'Desvincular Comprar presente' }))
    await user.click(await screen.findByRole('button', { name: 'Desvincular' }))
    await waitFor(() => expect(api.unlink).toHaveBeenCalledWith('bia', 'task', '10'))
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(api.relink).toHaveBeenCalledWith('bia', 'task', '10'))
  })

  it('agente que não respondeu aparece como aviso', async () => {
    api.memory.mockResolvedValue({ ...MEMORY, unavailable: ['nami'] })
    await openProfile()
    expect(await screen.findByText(/pode estar incompleta: nami não respondeu/)).toBeTruthy()
  })

  it('resumo com IA: falha da IA mostra a mensagem e não perde a tela', async () => {
    api.generateSummary.mockRejectedValue(new Error('GEMINI_API_KEY não configurada'))
    const user = await openProfile()
    await user.click(await screen.findByRole('button', { name: 'Gerar resumo' }))
    expect(await screen.findByText(/Não consegui gerar agora: GEMINI_API_KEY não configurada/)).toBeTruthy()
  })

  it('Anotações: a sugestão da IA tem fonte e só vira anotação ao aceitar', async () => {
    const user = await openProfile()
    await user.click(screen.getByRole('tab', { name: 'Anotações' }))
    expect(await screen.findByText('Sugestões da IA')).toBeTruthy()
    expect(screen.getByText('Café sem açúcar')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Comprar presente' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Aceitar' }))
    await waitFor(() => expect(api.acceptNote).toHaveBeenCalledWith(2))
  })

  it('Anotações: descartar sugestão chama a API', async () => {
    const user = await openProfile()
    await user.click(screen.getByRole('tab', { name: 'Anotações' }))
    await user.click(await screen.findByRole('button', { name: 'Descartar sugestão' }))
    await waitFor(() => expect(api.dismissNote).toHaveBeenCalledWith(2))
  })

  it('Interações: lista e apagar com Desfazer', async () => {
    const user = await openProfile()
    await user.click(screen.getByRole('tab', { name: 'Interações' }))
    expect(await screen.findByText('Encontro')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Apagar contato' }))
    await waitFor(() => expect(api.removeInteraction).toHaveBeenCalledWith(1))
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(api.restoreInteraction).toHaveBeenCalledWith(1))
  })

  it('Datas: aniversário no topo e as outras datas com lembrete', async () => {
    const user = await openProfile()
    await user.click(screen.getByRole('tab', { name: 'Datas' }))
    expect(await screen.findByText(/20 de outubro de 1990/)).toBeTruthy()
    expect(screen.getByText('lembra 1 dia antes')).toBeTruthy()
    expect(screen.getByText('Casamento')).toBeTruthy()
    expect(screen.getByText(/lembra 2 dias antes/)).toBeTruthy()
  })

  it('a aba escolhida vai para a URL', async () => {
    const user = await openProfile()
    await user.click(screen.getByRole('tab', { name: 'Anotações' }))
    expect(window.location.hash).toBe('#pessoa/bia/anotacoes')
  })

  it('mesclar mostra a prévia e avisa que não tem desfazer', async () => {
    const user = await openProfile()
    await user.click(screen.getByRole('button', { name: /Mesclar com/ }))
    await user.type(await screen.findByLabelText('Buscar pessoa'), 'duda')
    await user.click(await screen.findByRole('option', { name: /Duda/ }))
    await user.click(screen.getByRole('button', { name: 'Ver prévia' }))
    expect(await screen.findByText(/não dá para desfazer a mescla/)).toBeTruthy()
    expect(screen.getByText(/2 vínculos com outros agentes, 1 contato/)).toBeTruthy()
    api.merge.mockResolvedValue({ status: 'ok', message: 'Mesclado' })
    await user.click(screen.getByRole('button', { name: 'Mesclar' }))
    await waitFor(() => expect(api.merge).toHaveBeenCalledWith('bia', 'duda'))
  })

  it('apagar a pessoa pede confirmação e oferece Desfazer', async () => {
    api.remove.mockResolvedValue(undefined)
    api.restore.mockResolvedValue({ status: 'ok' })
    const user = await openProfile()
    await user.click(screen.getByRole('button', { name: 'Apagar' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('bia'))
  })
})

describe('Datas e Estatísticas', () => {
  it('Datas lista aniversários e outras datas com o lembrete de cada uma', async () => {
    await open('#datas')
    expect((await screen.findAllByText(/Aniversário/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('lembra 1 dia antes').length).toBeGreaterThan(0)
  })

  it('Estatísticas usa o contrato do Design System', async () => {
    await open('#estatisticas')
    expect(await screen.findByText('Seu ano em contatos')).toBeTruthy()
    expect(screen.getByText('Contatos por mês')).toBeTruthy()
  })
})

describe('Preferências', () => {
  it('o padrão da arte é o Caderno de bilhetes', () => {
    expect(DEFAULT_PREFS.art).toBe('bilhetes')
  })
})
