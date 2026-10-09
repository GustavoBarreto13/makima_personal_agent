// Biblioteca viva do padrão: tokens, componentes e estados. É a referência visual para toda tela nova.

import { useState, type ReactNode } from 'react'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import {
  Avatar, Button, Chip, DataTable, DatePicker, EmptyState, ErrorState, Field, Icon, ICONS, Input, ListRow, LoadingState, Modal, MoneyInput, NumberInput, Page,
  ListPicker, PersonPicker, ProgressBar, ProgressRing, RateInput, SegmentedControl, Select, SettingRow, Sheet, StatusChip, Stars, Tag, TagInput, TimePicker, Toggle, IconButton,
  type IconName, type PersonOption,
} from '../../../design'
import { TYPE_META, type Workout } from '../demoData'

const SWATCHES: [string, string][] = [
  ['Papel', 'paper'], ['Cartão', 'card'], ['Névoa', 'mist'], ['Linha', 'line'], ['Tinta', 'ink-1'], ['Acento', 'accent'], ['Acento suave', 'accent-tint'],
  ['Sucesso', 'success'], ['Alerta', 'warn'], ['Perigo', 'danger'], ['Info', 'info'], ['Estrela', 'star'],
]

const PEOPLE: PersonOption[] = [
  { id: '1', name: 'Ana Souza', hint: 'Amiga' }, { id: '2', name: 'Ana Beatriz Lima', hint: 'Trabalho' }, { id: '3', name: 'Carlos Mendes', hint: 'Família' }, { id: '4', name: 'Lia Cardoso' },
]

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ds-panel ds-card"><h3>{title}</h3>{children}</section>
}

type DemoState = 'load' | 'empty' | 'error' | 'data'

export function ComponentsView({ workouts, onNew }: { workouts: Workout[]; onNew: () => void }) {
  const [state, setState] = useState<DemoState>('data')
  const [rate, setRate] = useState(3.5)
  const [title, setTitle] = useState('')
  const [money, setMoney] = useState<number | null>(87.5)
  const [tags, setTags] = useState<string[]>(['peito'])
  const [date, setDate] = useState('2026-10-02')
  const [time, setTime] = useState('18:00')
  const [people, setPeople] = useState<PersonOption[]>([])
  const [listId, setListId] = useState<string | null>('inbox')
  const [toggle, setToggle] = useState(true)
  const [seg, setSeg] = useState<'week' | 'month' | 'year'>('week')
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [pop, setPop] = useState(false)
  const bad = title.length > 0 && title.trim().length < 3

  const stateBody = state === 'load' ? <LoadingState count={3} />
    : state === 'empty' ? <EmptyState icon="workout" title="Nenhum treino ainda" hint="Registre o primeiro pela captura rápida ou pelo botão abaixo." action={<Button variant="primary" icon="add" onClick={onNew}>Registrar treino</Button>} />
    : state === 'error' ? <ErrorState onRetry={() => { setState('load'); setTimeout(() => setState('data'), 900) }} />
    : <div className="ds-list">{workouts.filter((w) => w.status === 'done').slice(0, 3).map((w) => <ListRow key={w.id} title={w.title} meta={w.place} icon={TYPE_META[w.type].icon} hue={TYPE_META[w.type].hue} rating={w.rating} />)}</div>

  return (
    <Page>
      <Block title="Fundamentos: cores, raios, sombras, vidro">
        <div className="dp-sw">
          {SWATCHES.map(([n, v]) => <div key={v} className="dp-swc"><i style={{ background: `var(--ds-${v})` }} />{n}<code className="ds-mono" style={{ textTransform: 'none' }}>--ds-{v}</code></div>)}
        </div>
        <div className="dp-srow">
          {(['xs', 'sm', 'md', 'lg'] as const).map((r) => <div key={r} className="ds-card" style={{ width: 84, height: 54, display: 'grid', placeItems: 'center', borderRadius: `var(--ds-r-${r})` }}><span className="ds-mono">{r}</span></div>)}
          <div className="ds-glass" style={{ padding: '14px 18px', borderRadius: 'var(--ds-r-md)' }}><span className="ds-mono">vidro</span></div>
          <div className="ds-card" style={{ padding: '14px 18px', boxShadow: 'var(--ds-shadow-lg)' }}><span className="ds-mono">sombra lg</span></div>
        </div>
        <div>
          <span className="ds-mono">Hanken Grotesk 800 · títulos</span>
          <h2 style={{ fontFamily: 'var(--ds-font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-.025em' }}>Seu ano em treino</h2>
          <p>DM Sans no corpo do texto, com <span className="ds-mono">DM Mono</span> nos rótulos e metadados.</p>
        </div>
      </Block>

      <Block title="Botões">
        <div className="dp-row">
          <Button variant="primary">Registrar treino</Button><Button>Secundário</Button><Button variant="ghost">Discreto</Button><Button variant="danger">Excluir</Button>
          <Button disabled>Desabilitado</Button><Button size="sm">Pequeno</Button><IconButton primary icon="add" label="Adicionar" /><IconButton icon="more" label="Mais ações" />
        </div>
        <p className="ds-hint">Uma ação primária por contexto. Ação destrutiva nunca é primária.</p>
      </Block>

      <Block title="Chips, status e segmentos">
        <div className="dp-row">
          <Chip>Neutro</Chip><Chip on>Selecionado</Chip><StatusChip status="done" /><StatusChip status="planned" /><StatusChip status="paused" /><StatusChip status="dropped" /><Tag>#peito</Tag><Tag pr>PR</Tag>
        </div>
        <div className="dp-row">
          <SegmentedControl label="Período" value={seg} onChange={setSeg} options={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }, { value: 'year', label: 'Ano' }]} />
          <Toggle label="Exemplo de interruptor" checked={toggle} onChange={setToggle} />
          <ProgressBar value={65} label="Meta" /><ProgressRing value={0.65} />
          <Avatar name="Hayate Yuki" /><Avatar name="Ana Souza" /><Avatar name="Lia Cardoso" />
        </div>
      </Block>

      <Block title="Avaliação: 0 a 5 estrelas, com meia estrela">
        <div className="dp-row"><span className="ds-lbl-f">Edite:</span><RateInput value={rate} onChange={setRate} /></div>
        <div className="dp-srow">
          {[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v) => <div key={v} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><Stars value={v} /><span className="ds-mono">{v.toFixed(1)}</span></div>)}
        </div>
        <p className="ds-hint">Clique na metade esquerda ou direita da estrela. Teclado: setas movem de 0,5 em 0,5, Home zera, End vai a 5, números de 1 a 5.</p>
      </Block>

      <Block title="Formulário">
        <div className="ds-cols2">
          <Field label="Título" error={bad ? 'Use pelo menos 3 letras.' : null} hint="Obrigatório. Mínimo de 3 letras.">{(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Pernas pesadas" />}</Field>
          <Field label="Local">{(a) => <Select {...a}><option>Smart Fit Paulista</option><option>Em casa</option></Select>}</Field>
          <Field label="Valor">{(a) => <MoneyInput {...a} value={money} onChange={setMoney} />}</Field>
          <Field label="Repetições">{(a) => <NumberInput {...a} defaultValue={8} min={1} max={50} />}</Field>
          <Field label="Data (sem input nativo)">{(a) => <DatePicker {...a} value={date} onChange={setDate} />}</Field>
          <Field label="Hora (slots de 15 min)">{(a) => <TimePicker id={a.id} value={time} onChange={setTime} />}</Field>
          <Field label="Etiquetas">{(a) => <TagInput id={a.id} value={tags} onChange={setTags} />}</Field>
          <Field label="Lista (busca, grupos, ícone e cor)">
            {(a) => <ListPicker id={a.id} value={listId} onChange={setListId} options={[
              { id: 'inbox', label: 'Inbox' },
              { id: 'casa', label: 'Casa', group: 'Pessoal', glyph: 'C' },
              { id: 'reuniao', label: 'Reuniões', group: 'Trabalho', color: 'var(--ds-accent)' },
            ]} />}
          </Field>
          <Field label="Pessoas (smart-match da Komi)" hint="Digite “Ana”: 2 resultados, escolha uma. Digite “Zeca”: oferece cadastrar.">
            {(a) => (
              <PersonPicker id={a.id} value={people} onChange={setPeople} search={(q) => PEOPLE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))} onCreate={(name) => ({ id: `n-${name}`, name })} />
            )}
          </Field>
        </div>
        <SettingRow title="Destacar recordes" help="Mostra o selo PR nos cartões."><Toggle label="Destacar recordes" checked={toggle} onChange={setToggle} /></SettingRow>
      </Block>

      <Block title="Feedback e camadas">
        <div className="dp-row">
          <Button onClick={() => toast('Alterações salvas', { tone: 'success' })}>Aviso de sucesso</Button>
          <Button onClick={() => toast('Treino excluído', { undo: () => toast('Treino restaurado') })}>Aviso com desfazer</Button>
          <Button onClick={() => toast('Não foi possível salvar. Verifique a conexão e tente de novo.', { tone: 'error' })}>Aviso de erro</Button>
          <Button onClick={() => setModal(true)}>Abrir modal</Button>
          <Button onClick={() => setSheet(true)}>Painel lateral</Button>
          <Button variant="danger" onClick={async () => { if (await confirm({ title: 'Excluir todos os treinos?', body: 'Esta ação não pode ser desfeita. O foco começa em Cancelar de propósito.', confirmLabel: 'Excluir tudo', danger: true })) toast('Exemplo: nada foi excluído') }}>Confirmação perigosa</Button>
          <Button className={pop ? 'ds-pop' : undefined} onClick={() => { setPop(false); requestAnimationFrame(() => setPop(true)) }}>Animação check-pop</Button>
        </div>
        <p className="ds-hint">Ctrl+Z desfaz a última ação do aviso. Ctrl+Enter salva um formulário aberto. Esc fecha.</p>
      </Block>

      <Block title="Os 4 estados de toda tela">
        <SegmentedControl label="Estado da tela" value={state} onChange={setState} options={[{ value: 'load', label: 'Carregando' }, { value: 'empty', label: 'Vazio' }, { value: 'error', label: 'Erro' }, { value: 'data', label: 'Com dados' }]} />
        {stateBody}
      </Block>

      <Block title="Tabela que vira lista de cartões no celular">
        <DataTable
          caption="Últimos treinos"
          rows={workouts.filter((w) => w.status === 'done').slice(0, 4)}
          rowKey={(w) => w.id}
          columns={[
            { id: 't', header: 'Treino', render: (w) => <b>{w.title}</b> },
            { id: 'ty', header: 'Tipo', render: (w) => w.type },
            { id: 'p', header: 'Local', render: (w) => w.place },
            { id: 'r', header: 'Nota', render: (w) => <Stars value={w.rating} />, align: 'right' },
          ]}
        />
      </Block>

      <Block title={`Ícones: um vocabulário só (${Object.keys(ICONS).length})`}>
        <div className="dp-icons">
          {(Object.keys(ICONS) as IconName[]).map((n) => <div key={n} className="dp-ic"><Icon name={n} size="lg" /><span className="ds-mono" style={{ textTransform: 'none' }}>{n}</span></div>)}
        </div>
        <p className="ds-hint">Emoji só como conteúdo escolhido pelo usuário, nunca como ícone de interface.</p>
      </Block>

      {modal && (
        <Modal title="Exemplo de modal" onClose={() => setModal(false)} footer={<><Button onClick={() => setModal(false)}>Cancelar</Button><Button variant="primary" onClick={() => { setModal(false); toast('Salvo') }}>Salvar</Button></>}>
          <p>No celular, este modal vira um painel que sobe de baixo. Esc ou clicar fora fecha; com alterações pendentes, pede confirmação.</p>
        </Modal>
      )}
      {sheet && <Sheet title="Exemplo de painel" onClose={() => setSheet(false)}><p>Painel lateral de vidro. Usado pelos filtros e pelas preferências.</p></Sheet>}
    </Page>
  )
}
