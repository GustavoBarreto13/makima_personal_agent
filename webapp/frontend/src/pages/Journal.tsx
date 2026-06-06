// Página de diário pessoal — editor de bullets diário com heatmap anual,
// agrupamento de @menções e #tags, busca e filtragem por pessoa/tag.
// Usa a fonte Lora (serif) para dar sensação de caderno/diário ao texto.

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'  // Hooks do React
import { api } from '../lib/api'  // Wrapper de fetch autenticado com cookie de sessão

// ── Tipos de dados (mapeiam as respostas do backend) ──────────────────────────────────────────

// Representa um bullet (linha do diário) no estado local da página.
// localKey é uma chave gerada localmente para identificar o bullet no React antes de ter um id do banco.
interface Bullet {
  id: number | null    // ID no banco de dados (null enquanto ainda não foi salvo)
  content: string      // Texto do bullet
  position: number     // Posição de ordenação (número inteiro esparso)
  localKey: string     // Chave local única para o React (não vai ao backend)
}

// Resposta do endpoint GET /api/journal/page?date=...
interface PageResponse {
  page: {
    id: number        // ID da página no banco
    date: string      // Data no formato YYYY-MM-DD
    type_id: number   // Tipo da página (ex: 1 = diário diário)
  }
  bullets: Array<{
    id: number        // ID do bullet no banco
    content: string   // Texto do bullet
    position: number  // Posição de ordenação
  }>
}

// Resposta do endpoint GET /api/journal/heatmap?year=...
// Chave: data YYYY-MM-DD, valor: número de bullets naquele dia
type HeatmapResponse = Record<string, number>

// Item de menção (pessoa ou tag) retornado pelo endpoint GET /api/journal/mentions
interface MentionItem {
  value: string  // Texto da menção, sem @ ou #
  count: number  // Número de vezes que aparece nos bullets
}

// Grupo de resultados de filtro/busca, agrupados por data
interface FilterGroup {
  date: string  // Data do grupo no formato YYYY-MM-DD
  bullets: Array<{
    id: number      // ID do bullet no banco
    content: string // Texto do bullet
  }>
}

// Resposta do endpoint POST /api/journal/bullets (criação ou atualização)
interface UpsertResponse {
  status: string  // 'ok' quando bem-sucedido
  bullet: {
    id: number        // ID do bullet criado/atualizado
    content: string   // Texto confirmado pelo banco
    position: number  // Posição confirmada pelo banco
  }
}

// ── Tipo de modo da página ────────────────────────────────────────────────────────────────────

// A página pode estar em três modos:
// - 'day':    exibe os bullets de uma data específica (modo de edição)
// - 'filter': exibe todos os bullets que contêm uma @pessoa ou #tag específica
// - 'search': exibe resultados de busca textual livre
type Mode =
  | { type: 'day'; date: string }
  | { type: 'filter'; kind: 'person' | 'tag'; value: string }
  | { type: 'search'; query: string }

// ── Frases de sugestão para o primeiro bullet vazio ───────────────────────────────────────────

// Quando a página do dia está vazia, exibimos uma dessas frases como placeholder
// para incentivar o usuário a começar a escrever.
const PROMPTS = [
  'Como foi seu dia?',
  'O que você aprendeu hoje?',
  'Com quem você interagiu hoje?',
  'O que está na sua cabeça agora?',
]

// ── Funções auxiliares puras (não dependem de estado React) ───────────────────────────────────

/**
 * Retorna a data de hoje no formato YYYY-MM-DD.
 *
 * Returns:
 *   String no formato ISO date, ex: "2026-06-06"
 */
function todayISO(): string {
  // toISOString() retorna "2026-06-06T12:00:00.000Z"; pegamos apenas a parte da data
  return new Date().toISOString().split('T')[0]
}

/**
 * Formata uma data ISO para o formato longo em português.
 * Exemplo: "2026-06-06" → "Sexta-feira, 6 de junho de 2026"
 *
 * Args:
 *   iso - Data no formato YYYY-MM-DD
 *
 * Returns:
 *   String formatada em português com dia da semana, dia, mês e ano.
 */
function formatDatePT(iso: string): string {
  // Adicionamos T12:00:00 para evitar problemas de fuso horário:
  // sem isso, new Date("2026-06-06") interpreta como meia-noite UTC e pode exibir o dia anterior
  // dependendo do fuso horário local do usuário.
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Calcula quantos dias consecutivos o usuário escreveu no diário,
 * contando para trás a partir de hoje.
 *
 * Args:
 *   hm - Mapa de data → número de bullets (heatmap)
 *
 * Returns:
 *   Número de dias seguidos com pelo menos 1 bullet.
 *
 * Example:
 *   >>> calcStreak({ "2026-06-06": 3, "2026-06-05": 2 })
 *   2
 */
function calcStreak(hm: Record<string, number>): number {
  let streak = 0
  const today = new Date()

  // Percorre os últimos 365 dias para trás a partir de hoje
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]

    if (hm[key] && hm[key] > 0) {
      // Dia com bullets: incrementa o streak
      streak++
    } else if (i > 0) {
      // Dia sem bullets (exceto hoje, que ainda pode estar sendo escrito): para de contar
      break
    }
  }

  return streak
}

/**
 * Destaca @menções (em violeta) e #tags (em verde) no texto de um bullet.
 * Retorna um array de elementos React com spans coloridos para as menções/tags.
 *
 * Args:
 *   text - Texto bruto do bullet, ex: "Falei com @João sobre #trabalho"
 *
 * Returns:
 *   Array de elementos React com spans coloridos.
 */
function renderHighlighted(text: string): React.ReactNode {
  // Divide o texto nos padrões @palavra e #palavra para colorir separadamente
  const parts = text.split(/(@\w+|#\w+)/g)

  return parts.map((part, i) => {
    // Chave composta por índice + primeiros 8 caracteres da parte para ser mais estável
    // que usar apenas o índice (evita problemas quando partes mudam de ordem)
    const key = `${i}-${part.slice(0, 8)}`
    if (part.startsWith('@')) {
      // @menções aparecem em violeta para destacar pessoas
      return <span key={key} className="text-violet-400">{part}</span>
    }
    if (part.startsWith('#')) {
      // #tags aparecem em verde para destacar tópicos
      return <span key={key} className="text-green-400">{part}</span>
    }
    // Texto comum sem formatação especial
    return <span key={key}>{part}</span>
  })
}

/**
 * Calcula a posição inicial para o índice dado.
 * Usamos espaçamento de 1000 entre posições para permitir inserções no meio sem reindexar.
 *
 * Args:
 *   index - Posição na lista (0, 1, 2, ...)
 *
 * Returns:
 *   Número de posição esparso (0, 1000, 2000, ...)
 */
function getInitialPosition(index: number): number {
  return index * 1000
}

/**
 * Calcula a posição intermediária entre dois bullets adjacentes.
 * Usada ao inserir um bullet entre dois existentes.
 *
 * Args:
 *   prev - Posição do bullet anterior
 *   next - Posição do bullet seguinte
 *
 * Returns:
 *   Número inteiro no meio do intervalo.
 */
function getMidPosition(prev: number, next: number): number {
  return Math.floor((prev + next) / 2)
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de diário pessoal com editor de bullets, heatmap anual e barra lateral de menções.
 *
 * Layout: sidebar esquerda (heatmap + menções + busca) | área principal (bullets do dia)
 * Modos: 'day' (edição), 'filter' (filtro por @pessoa ou #tag), 'search' (busca textual)
 *
 * Returns:
 *   JSX com layout completo de duas colunas, ocupando toda a área disponível.
 */
export default function Journal() {
  // ── Estado principal da página ──

  // Modo atual: 'day' (padrão), 'filter' ou 'search'
  const [mode, setMode] = useState<Mode>({ type: 'day', date: todayISO() })

  // ID da página de diário no banco (null enquanto carregando ou não encontrado)
  const [pageId, setPageId] = useState<number | null>(null)

  // Lista de bullets da página atual (em modo 'day')
  const [bullets, setBullets] = useState<Bullet[]>([])

  // Status do salvamento automático: 'idle' = sem mudanças, 'saving' = enviando, 'saved' = confirmado
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Índice do bullet que está sendo editado agora (null = nenhum em foco)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  // ── Estado da sidebar ──

  // Mapa de data → número de bullets para construir o heatmap anual
  const [heatmap, setHeatmap] = useState<Record<string, number>>({})

  // Número de dias consecutivos com pelo menos 1 bullet
  const [streak, setStreak] = useState(0)

  // Lista de @pessoas mencionadas nos bullets (ordenadas por frequência)
  const [people, setPeople] = useState<MentionItem[]>([])

  // Lista de #tags usadas nos bullets (ordenadas por frequência)
  const [tags, setTags] = useState<MentionItem[]>([])

  // ── Estado de filtro/busca ──

  // Grupos de bullets agrupados por data, retornados em modo filter/search
  const [filterResults, setFilterResults] = useState<FilterGroup[]>([])

  // Texto digitado no campo de busca da sidebar
  const [searchQuery, setSearchQuery] = useState('')

  // Indica se a lista de bullets do dia está sendo carregada
  const [loading, setLoading] = useState(true)

  // ── Refs ──

  // Timer de debounce para o salvamento automático.
  // Usando ref (não state) para não causar re-render ao atualizar o timer.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ref para pageId — necessário para evitar closure velha no timer de autosave.
  // O setTimeout captura variáveis pelo valor no momento em que foi criado; como pageId
  // pode mudar depois que o timer foi agendado, usamos uma ref que sempre reflete o valor atual.
  const pageIdRef = useRef<number | null>(null)

  // ── Valores derivados e memos ──

  // Frase de prompt selecionada aleatoriamente na montagem do componente.
  // useMemo com array vazio garante que a frase não mude durante a sessão.
  const randomPrompt = useMemo(
    () => PROMPTS[Math.floor(Math.random() * PROMPTS.length)],
    []
  )

  // Extrai a data atual se estiver em modo 'day', ou string vazia.
  // Usado como dependência do useEffect que carrega os bullets do dia.
  const currentDate = mode.type === 'day' ? mode.date : ''

  // Calcula o grid do heatmap apenas quando os dados do heatmap mudam.
  // Sem useMemo, buildHeatmapGrid() seria chamada a cada render, iterando
  // 364 células desnecessariamente enquanto o usuário digita bullets.
  const heatmapGrid = useMemo(() => buildHeatmapGrid(), [heatmap]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Funções auxiliares ──

  /**
   * Recarrega o heatmap e as listas de menções/tags da sidebar.
   * Chamada após salvar bullets para manter os contadores atualizados.
   */
  const refreshSidebar = useCallback(() => {
    const year = new Date().getFullYear()
    Promise.all([
      api.get<HeatmapResponse>(`/api/journal/heatmap?year=${year}`),
      api.get<MentionItem[]>('/api/journal/mentions?kind=person'),
      api.get<MentionItem[]>('/api/journal/mentions?kind=tag'),
    ]).then(([hm, p, t]) => {
      // Atualiza o heatmap e recalcula o streak
      setHeatmap(hm)
      setStreak(calcStreak(hm))
      setPeople(p)
      setTags(t)
    }).catch(console.error)
  }, [])

  /**
   * Salva um único bullet no backend via POST /api/journal/bullets.
   * Atualiza o ID local do bullet após a primeira gravação.
   * Também atualiza a sidebar para refletir novas @menções e #tags.
   *
   * Args:
   *   bullet - O bullet a ser salvo (com localKey para identificação local)
   *   pid    - ID da página de diário à qual este bullet pertence
   */
  const saveBullet = useCallback(async (bullet: Bullet, pid: number) => {
    // Não envia para o backend se o bullet está vazio e ainda não tem ID
    // (evita gravar linhas em branco que o usuário não confirmou)
    if (bullet.content === '' && bullet.id === null) return

    setSaveStatus('saving')
    try {
      // Envia o conteúdo e posição do bullet para o backend
      const res = await api.post<UpsertResponse>('/api/journal/bullets', {
        page_id: pid,
        position: bullet.position,
        content: bullet.content,
      })

      // Atualiza o ID do bullet no estado local (importante para bullets recém-criados
      // que ainda não tinham ID — necessário para operações de deleção posteriores)
      setBullets(prev =>
        prev.map(b => b.localKey === bullet.localKey ? { ...b, id: res.bullet.id } : b)
      )
      setSaveStatus('saved')

      // Atualiza sidebar para refletir novas menções/tags que o usuário possa ter digitado
      refreshSidebar()
    } catch {
      // Em caso de erro, volta ao estado 'idle' sem travar a interface
      setSaveStatus('idle')
    }
  }, [refreshSidebar])

  // ── Efeito: carrega heatmap e sidebar na montagem do componente ──

  useEffect(() => {
    const year = new Date().getFullYear()
    Promise.all([
      api.get<HeatmapResponse>(`/api/journal/heatmap?year=${year}`),
      api.get<MentionItem[]>('/api/journal/mentions?kind=person'),
      api.get<MentionItem[]>('/api/journal/mentions?kind=tag'),
    ]).then(([hm, p, t]) => {
      setHeatmap(hm)
      setStreak(calcStreak(hm))
      setPeople(p)
      setTags(t)
    }).catch(console.error)
  }, []) // Executa apenas uma vez na montagem — os dados da sidebar não mudam frequentemente

  // ── Efeito: cancela o timer de autosave ao desmontar o componente ──

  // Cancela o timer de autosave pendente quando o componente desmonta,
  // evitando setState em componente desmontado (memory leak e warning do React)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // ── Efeito: carrega os bullets quando a data muda (modo 'day') ──

  useEffect(() => {
    // Não faz nada se não estiver em modo 'day' (currentDate será string vazia)
    if (!currentDate) return

    setLoading(true)
    api.get<PageResponse>(`/api/journal/page?date=${currentDate}`)
      .then(res => {
        // Salva o ID da página para associar novos bullets à ela.
        // Atualiza também a ref para que o timer de autosave leia sempre o valor correto.
        setPageId(res.page.id)
        pageIdRef.current = res.page.id

        // Se a página não tem bullets ainda, cria um bullet vazio inicial
        // para que o usuário já tenha uma linha para começar a digitar
        if (res.bullets.length === 0) {
          setBullets([{
            id: null,
            content: '',
            position: getInitialPosition(0),
            localKey: 'initial-0',
          }])
          // Foca automaticamente no primeiro bullet para começar a escrever
          setFocusedIndex(0)
        } else {
          // Mapeia os bullets do backend adicionando a localKey para o React
          setBullets(res.bullets.map(b => ({
            ...b,
            localKey: `${b.id}-${b.position}`,  // Chave única baseada no ID e posição
          })))
          // Não foca automaticamente quando há conteúdo existente
          setFocusedIndex(null)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [currentDate]) // Reexecuta sempre que o usuário navegar para outra data

  // ── Efeito: carrega resultados quando muda para modo filter ou search ──

  useEffect(() => {
    if (mode.type === 'filter') {
      // Busca todos os bullets que contêm a @pessoa ou #tag selecionada
      api.get<FilterGroup[]>(
        `/api/journal/filter?kind=${mode.kind}&value=${encodeURIComponent(mode.value)}`
      )
        .then(setFilterResults)
        .catch(console.error)
    } else if (mode.type === 'search' && mode.query.trim()) {
      // Busca por texto livre em todos os bullets
      api.get<FilterGroup[]>(
        `/api/journal/search?q=${encodeURIComponent(mode.query)}`
      )
        .then(setFilterResults)
        .catch(console.error)
    }
  }, [mode]) // Reexecuta toda vez que o modo muda (nova menção, nova busca, etc.)

  // ── Handlers do editor de bullets ──

  /**
   * Atualiza o conteúdo de um bullet quando o usuário digita.
   * Dispara o salvamento automático com debounce de 800ms.
   *
   * Args:
   *   index   - Índice do bullet na lista local
   *   content - Novo texto digitado pelo usuário
   */
  const handleBulletChange = (index: number, content: string) => {
    // Cria nova lista com o bullet atualizado (imutabilidade do React)
    const updated = bullets.map((b, i) => i === index ? { ...b, content } : b)
    setBullets(updated)

    // Cancela o timer anterior (se o usuário ainda está digitando)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    // Agenda o salvamento para 800ms após a última tecla pressionada.
    // Assim não salvamos a cada tecla, apenas quando o usuário para de digitar.
    // Usamos pageIdRef.current (não pageId diretamente) para garantir que o callback
    // leia o valor mais recente do pageId, evitando closure velha.
    saveTimerRef.current = setTimeout(() => {
      if (pageIdRef.current) saveBullet(updated[index], pageIdRef.current)
    }, 800)
  }

  /**
   * Cria um novo bullet vazio abaixo do bullet atual quando o usuário pressiona Enter.
   * Calcula a posição intermediária para manter a ordenação correta.
   *
   * Args:
   *   index - Índice do bullet atual (onde o Enter foi pressionado)
   */
  const handleBulletEnter = async (index: number) => {
    // Precisa do pageId para associar o novo bullet à página
    if (!pageId) return

    const prev = bullets[index]          // Bullet atual (onde o cursor está)
    const next = bullets[index + 1]      // Próximo bullet (pode ser undefined se for o último)

    // Calcula a posição do novo bullet:
    // - Se houver um próximo, insere no meio entre o atual e o próximo
    // - Se for o último, acrescenta 1000 após o atual
    const newPos = next
      ? getMidPosition(prev.position, next.position)
      : prev.position + 1000

    // Cria o bullet localmente com localKey temporária para o React
    const newBullet: Bullet = {
      id: null,
      content: '',
      position: newPos,
      localKey: `new-${Date.now()}`,
    }

    // Insere o novo bullet na lista entre o atual e o próximo
    const newBullets = [
      ...bullets.slice(0, index + 1),
      newBullet,
      ...bullets.slice(index + 1),
    ]
    setBullets(newBullets)

    // Move o foco para o novo bullet vazio criado
    setFocusedIndex(index + 1)

    // Salva imediatamente no backend para obter o ID (necessário para deleção posterior)
    setSaveStatus('saving')
    try {
      const res = await api.post<UpsertResponse>('/api/journal/bullets', {
        page_id: pageId,
        position: newPos,
        content: '',
      })

      // Atualiza o ID do bullet recém-criado usando a localKey como identificador
      setBullets(prev =>
        prev.map(b => b.localKey === newBullet.localKey ? { ...b, id: res.bullet.id } : b)
      )
      setSaveStatus('saved')
    } catch {
      setSaveStatus('idle')
    }
  }

  /**
   * Deleta o bullet atual quando o usuário pressiona Backspace em um bullet vazio.
   * Move o foco para o bullet anterior.
   *
   * Args:
   *   index - Índice do bullet vazio a ser deletado
   */
  const handleBulletBackspace = async (index: number) => {
    const bullet = bullets[index]

    // Só deleta se o bullet estiver vazio (Backspace com conteúdo é comportamento normal)
    if (bullet.content !== '') return

    // Mantém pelo menos uma linha no editor — não permite apagar o último bullet
    if (bullets.length === 1) return

    // Se o bullet já tem ID no banco, deleta via API
    if (bullet.id !== null) {
      try {
        await api.del(`/api/journal/bullets/${bullet.id}`)
      } catch {
        // Ignora erros de deleção — o bullet será removido da interface de qualquer forma
      }
    }

    // Remove o bullet da lista local
    const newBullets = bullets.filter((_, i) => i !== index)
    setBullets(newBullets)

    // Move o foco para o bullet anterior ao deletado
    setFocusedIndex(Math.max(0, index - 1))

    // Atualiza a sidebar pois uma menção pode ter sido removida
    refreshSidebar()
  }

  /**
   * Navega para o dia anterior ou próximo.
   *
   * Args:
   *   delta - +1 para avançar um dia, -1 para recuar um dia
   */
  const navigateDay = (delta: number) => {
    // Só navega quando estamos no modo 'day'
    if (mode.type !== 'day') return

    // Cria um objeto Date a partir da data atual (+ noon para evitar problemas de fuso)
    const d = new Date(mode.date + 'T12:00:00')
    d.setDate(d.getDate() + delta)

    // Atualiza o modo com a nova data (isso dispara o useEffect de carregamento)
    setMode({ type: 'day', date: d.toISOString().split('T')[0] })
  }

  // ── Renderização do heatmap ──

  /**
   * Constrói a grade do heatmap: 53 semanas × 7 dias.
   * Começa 364 dias atrás, alinhado à segunda-feira.
   *
   * Returns:
   *   Array de semanas, onde cada semana é um array de 7 dias com data e contagem.
   */
  function buildHeatmapGrid(): { date: string; count: number }[][] {
    const weeks: { date: string; count: number }[][] = []

    const today = new Date()

    // Ponto de início: 364 dias atrás
    const start = new Date(today)
    start.setDate(start.getDate() - 364)

    // Alinha ao início da semana (segunda-feira = dia 1).
    // getDay() retorna 0 para domingo, então tratamos domingo como 7.
    const dayOfWeek = start.getDay() || 7
    start.setDate(start.getDate() - (dayOfWeek - 1))

    // Percorre 52 semanas (52 * 7 = 364 dias — aproximadamente um ano)
    const cur = new Date(start)
    for (let w = 0; w < 52; w++) {
      const week = []
      for (let d = 0; d < 7; d++) {
        const iso = cur.toISOString().split('T')[0]
        // Associa a contagem do heatmap a esta data (0 se não houver entrada)
        week.push({ date: iso, count: heatmap[iso] || 0 })
        cur.setDate(cur.getDate() + 1)
      }
      weeks.push(week)
    }

    return weeks
  }

  /**
   * Retorna as classes Tailwind de cor para uma célula do heatmap conforme a contagem.
   *
   * Args:
   *   count - Número de bullets naquele dia
   *   date  - Data no formato YYYY-MM-DD (para destacar o dia de hoje)
   *
   * Returns:
   *   String de classes Tailwind para aplicar na célula.
   */
  function heatmapCellClass(count: number, date: string): string {
    // Cor base conforme a intensidade de uso
    const colorClass =
      count === 0 ? 'bg-gray-800' :
      count <= 2  ? 'bg-green-900' :
      count <= 5  ? 'bg-green-700' :
      count <= 9  ? 'bg-green-500' : 'bg-green-400'

    // Adiciona destaque visual para o dia de hoje
    const todayClass = date === todayISO()
      ? 'ring-1 ring-white ring-offset-1 ring-offset-gray-900'
      : ''

    return `w-3 h-3 rounded-sm cursor-pointer transition-opacity hover:opacity-80 ${colorClass} ${todayClass}`
  }

  // ── Renderização principal ──────────────────────────────────────────────────────────────────

  return (
    // Container raiz: duas colunas lado a lado, ocupando toda a altura disponível
    <div className="flex h-full -m-6">
      {/*
        Nota: usamos -m-6 para cancelar o padding p-6 que o Layout aplica ao <main>,
        permitindo que o Journal ocupe toda a área visual disponível.
      */}

      {/* ── Sidebar esquerda: heatmap + menções + busca ── */}
      <aside className="w-80 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">

        {/* Seção do heatmap anual */}
        <div className="p-4">
          {/* Grade de semanas × dias */}
          <div className="flex gap-0.5 overflow-x-auto">
            {heatmapGrid.map((week, wi) => (
              // Cada coluna representa uma semana (7 dias empilhados verticalmente)
              <div key={wi} className="flex flex-col gap-0.5">
                {week.map(cell => (
                  <div
                    key={cell.date}
                    title={`${cell.date}: ${cell.count} bullet${cell.count !== 1 ? 's' : ''}`}
                    onClick={() => setMode({ type: 'day', date: cell.date })}
                    className={heatmapCellClass(cell.count, cell.date)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Indicador de streak — só exibe se o usuário tem sequência ativa */}
          {streak > 0 && (
            <p className="mt-2 text-xs text-gray-400">
              🔥 {streak} {streak === 1 ? 'dia' : 'dias'} seguidos
            </p>
          )}
        </div>

        {/* Seção de @pessoas — lista as pessoas mencionadas com mais frequência */}
        {people.length > 0 && (
          <div className="px-4 pb-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pessoas</p>
            {people.map(p => (
              <button
                key={p.value}
                onClick={() => {
                  // Limpa a busca textual e entra no modo de filtro por pessoa
                  setSearchQuery('')
                  setMode({ type: 'filter', kind: 'person', value: p.value })
                }}
                className="flex justify-between w-full text-sm px-2 py-1 rounded hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
              >
                {/* Nome da pessoa destacado em violeta (mesmo padrão do editor) */}
                <span className="text-violet-400">@{p.value}</span>
                {/* Número de ocorrências para orientar o usuário */}
                <span className="text-gray-500 text-xs">{p.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Seção de #tags — lista as tags com mais frequência */}
        {tags.length > 0 && (
          <div className="px-4 pb-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Tags</p>
            {tags.map(t => (
              <button
                key={t.value}
                onClick={() => {
                  // Limpa a busca textual e entra no modo de filtro por tag
                  setSearchQuery('')
                  setMode({ type: 'filter', kind: 'tag', value: t.value })
                }}
                className="flex justify-between w-full text-sm px-2 py-1 rounded hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
              >
                {/* Nome da tag destacada em verde (mesmo padrão do editor) */}
                <span className="text-green-400">#{t.value}</span>
                {/* Número de ocorrências */}
                <span className="text-gray-500 text-xs">{t.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Campo de busca textual — fica no rodapé da sidebar */}
        <div className="px-4 pb-4 mt-auto">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar…"
              value={searchQuery}
              onChange={e => {
                const q = e.target.value
                setSearchQuery(q)
                // Só dispara a busca após o usuário digitar pelo menos 2 caracteres,
                // evitando chamadas desnecessárias à API a cada tecla
                if (q.trim().length >= 2) {
                  setMode({ type: 'search', query: q })
                } else if (q.trim() === '') {
                  // Se o campo for limpo, volta para o dia atual
                  setMode({ type: 'day', date: todayISO() })
                }
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-violet-500 transition-colors"
            />
          </div>
        </div>
      </aside>

      {/* ── Painel direito: editor de bullets ou resultados de filtro ── */}
      <main className="flex-1 overflow-y-auto relative bg-gray-950">
        {/* Indicador de salvamento — exibido no canto superior direito */}
        <div className="absolute top-4 right-4 text-xs text-gray-500 select-none">
          {saveStatus === 'saving' && 'Salvando…'}
          {saveStatus === 'saved' && 'Salvo'}
        </div>

        <div className="max-w-2xl mx-auto px-8 py-10">

          {/* ── Modo 'day': editor de bullets do dia ── */}
          {mode.type === 'day' && (
            <>
              {/* Cabeçalho: navegação de datas */}
              <div className="flex items-center gap-3 mb-8">
                {/* Botão para ir ao dia anterior */}
                <button
                  onClick={() => navigateDay(-1)}
                  className="text-gray-400 hover:text-white px-2 text-xl leading-none transition-colors"
                  aria-label="Dia anterior"
                >
                  ‹
                </button>

                {/* Data atual formatada em português com fonte Lora */}
                <h1
                  className="text-2xl font-medium text-white"
                  style={{ fontFamily: "'Lora', serif" }}
                >
                  {formatDatePT(mode.date)}
                </h1>

                {/* Botão para ir ao próximo dia */}
                <button
                  onClick={() => navigateDay(1)}
                  className="text-gray-400 hover:text-white px-2 text-xl leading-none transition-colors"
                  aria-label="Próximo dia"
                >
                  ›
                </button>

                {/* Botão "Hoje" — só aparece quando não estamos no dia atual */}
                {mode.date !== todayISO() && (
                  <button
                    onClick={() => setMode({ type: 'day', date: todayISO() })}
                    className="ml-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Hoje
                  </button>
                )}
              </div>

              {/* Spinner de carregamento dos bullets */}
              {loading && (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
                </div>
              )}

              {/* Editor de bullets — visível quando o carregamento terminou */}
              {!loading && (
                <div className="space-y-1">
                  {bullets.map((bullet, index) => (
                    // Container de cada linha do diário
                    <div key={bullet.localKey} className="flex items-start gap-2 group">

                      {/* Marcador de bullet — ponto cinza não selecionável */}
                      <span className="mt-1 text-gray-500 select-none text-lg leading-relaxed">•</span>

                      {/* Área de texto: input quando em foco, div com highlight quando não foca */}
                      {focusedIndex === index ? (
                        // INPUT ATIVO: campo de texto visível quando o bullet está sendo editado
                        <input
                          autoFocus
                          type="text"
                          value={bullet.content}
                          onChange={e => handleBulletChange(index, e.target.value)}
                          onBlur={() => setFocusedIndex(null)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()  // Evita submit ou quebra de linha indesejada
                              handleBulletEnter(index)
                            }
                            if (e.key === 'Backspace' && bullet.content === '') {
                              e.preventDefault()  // Evita navegação de página em alguns browsers
                              handleBulletBackspace(index)
                            }
                          }}
                          // Placeholder apenas no primeiro bullet vazio da página
                          placeholder={
                            index === 0 && bullets.length === 1 && bullet.content === ''
                              ? randomPrompt
                              : ''
                          }
                          className="flex-1 bg-transparent border-none outline-none text-gray-100 text-lg leading-relaxed"
                          style={{ fontFamily: "'Lora', serif" }}
                        />
                      ) : (
                        // VISUALIZAÇÃO: div clicável com @menções e #tags destacadas em cores
                        <div
                          onClick={() => setFocusedIndex(index)}
                          className="flex-1 text-gray-100 text-lg leading-relaxed cursor-text min-h-[1.75rem]"
                          style={{ fontFamily: "'Lora', serif" }}
                        >
                          {bullet.content
                            ? renderHighlighted(bullet.content)  // Texto com destaques de cor
                            : (
                              // Placeholder em cinza escuro quando o bullet está vazio
                              <span className="text-gray-600">
                                {index === 0 ? randomPrompt : ''}
                              </span>
                            )
                          }
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Dica para criar nova linha — aparece quando o último bullet está em foco */}
                  {focusedIndex === bullets.length - 1 && bullets.length > 0 && (
                    <p className="text-xs text-gray-600 ml-6 mt-1">
                      Enter para nova linha · Backspace em linha vazia para deletar
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Modo 'filter' ou 'search': resultados agrupados por data ── */}
          {(mode.type === 'filter' || mode.type === 'search') && (
            <>
              {/* Cabeçalho do modo de filtro/busca */}
              <div className="flex items-center gap-3 mb-8">
                {/* Botão para voltar ao dia de hoje */}
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setMode({ type: 'day', date: todayISO() })
                  }}
                  className="text-gray-400 hover:text-white text-sm transition-colors"
                >
                  ← Voltar
                </button>

                {/* Título do filtro ativo */}
                <h1
                  className="text-xl font-medium text-white"
                  style={{ fontFamily: "'Lora', serif" }}
                >
                  {mode.type === 'filter' && (
                    <>
                      {/* Destaca a menção/tag com a mesma cor usada no editor */}
                      {mode.kind === 'person'
                        ? <span className="text-violet-400">@{mode.value}</span>
                        : <span className="text-green-400">#{mode.value}</span>
                      }
                      {' '}— {filterResults.reduce((acc, g) => acc + g.bullets.length, 0)} menções
                    </>
                  )}
                  {mode.type === 'search' && (
                    <>Busca: "{mode.query}"</>
                  )}
                </h1>
              </div>

              {/* Estado vazio: busca sem resultados */}
              {filterResults.length === 0 && (
                <p className="text-gray-500 text-sm py-8 text-center">
                  Nenhum resultado encontrado.
                </p>
              )}

              {/* Grupos de bullets agrupados por data */}
              {filterResults.map(group => (
                <div key={group.date} className="mb-6">
                  {/* Data do grupo — clicável para ir ao dia completo */}
                  <button
                    onClick={() => {
                      setSearchQuery('')
                      setMode({ type: 'day', date: group.date })
                    }}
                    className="text-sm text-violet-400 hover:text-violet-300 mb-2 transition-colors"
                  >
                    {formatDatePT(group.date)}
                  </button>

                  {/* Bullets deste grupo */}
                  {group.bullets.map(b => (
                    <div key={b.id} className="flex items-start gap-2 mb-1">
                      <span className="text-gray-500 select-none">•</span>
                      <div
                        className="text-gray-200 text-base"
                        style={{ fontFamily: "'Lora', serif" }}
                      >
                        {/* Mantém o destaque de @menções e #tags nos resultados */}
                        {renderHighlighted(b.content)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

        </div>
      </main>
    </div>
  )
}
