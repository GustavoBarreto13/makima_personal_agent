/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Tarefas — dados mock + parser pt-BR + helpers
   Single-user, contexto de vida pessoal. PostgreSQL é o source of truth real;
   aqui são arrays em memória que imitam o que /api/tasks/* devolveria.
   ───────────────────────────────────────────────────────────────────────── */

const TODAY = '2026-06-11';                 // quinta-feira
const NOW_MIN = 11 * 60 + 25;               // "agora" = 11:25 (marcador da timeline)

/* ── Helpers de data (pt-BR) ────────────────────────────────────────────── */
const DIAS_ABBR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function d2iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function iso2d(iso) { return new Date(iso + 'T00:00:00'); }
function isoAdd(iso, days) { const d = iso2d(iso); d.setDate(d.getDate() + days); return d2iso(d); }
function daysBetween(a, b) { return Math.round((iso2d(b) - iso2d(a)) / 86400000); }

function dueLabel(iso) {
  if (!iso) return null;
  const diff = daysBetween(TODAY, iso);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  const d = iso2d(iso);
  if (diff < 0 && diff > -7) return `${-diff} dias atrás`;
  if (diff > 1 && diff < 7) return DIAS_FULL[d.getDay()];
  return `${d.getDate()} ${MESES_ABBR[d.getMonth()]}`;
}
function dueClass(iso, done) {
  if (!iso || done) return '';
  const diff = daysBetween(TODAY, iso);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 2) return 'soon';
  return '';
}
function fmtTime(t) { return t ? t.replace(':', 'h').replace(/h00$/, 'h') : null; }
function minToTime(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function timeToMin(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fmtEst(min) { if (!min) return null; if (min < 60) return `${min}min`; const h = min / 60; return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`; }
function greet() { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }

/* ── Tipos de tarefa ────────────────────────────────────────────────────── */
const TYPES = {
  task:     { name: 'Tarefa', icon: 'check', color: 'var(--kg)' },
  event:    { name: 'Evento', icon: 'calendar', color: 'var(--p-low)' },
  birthday: { name: 'Aniversário', icon: 'cake', color: 'oklch(0.64 0.15 18)' },
};

/* ── Prioridade ─────────────────────────────────────────────────────────── */
const PRIO = {
  0: { name: 'Sem prioridade', color: null, tint: null, key: null },
  1: { name: 'Baixa', color: 'var(--p-low)', tint: 'var(--p-low-t)', key: 'baixa' },
  2: { name: 'Média', color: 'var(--p-med)', tint: 'var(--p-med-t)', key: 'media' },
  3: { name: 'Alta', color: 'var(--p-high)', tint: 'var(--p-high-t)', key: 'alta' },
};

/* ── Grupos + projetos ──────────────────────────────────────────────────── */
const GROUPS = [
  { id: 'pessoal', name: 'Pessoal' },
  { id: 'crescimento', name: 'Crescimento' },
  { id: 'pratico', name: 'Vida prática' },
];
const PROJECTS = [
  { id: 'inbox', name: 'Inbox', color: 'oklch(0.62 0.02 350)', icon: 'inbox', group: null },
  { id: 'casa', name: 'Casa', color: 'oklch(0.62 0.13 250)', icon: 'home', group: 'pessoal' },
  { id: 'social', name: 'Social', color: 'oklch(0.64 0.15 18)', icon: 'users', group: 'pessoal' },
  { id: 'saude', name: 'Saúde', color: 'oklch(0.63 0.13 150)', icon: 'heart', group: 'pessoal' },
  { id: 'estudos', name: 'Estudos', color: 'oklch(0.60 0.14 292)', icon: 'grad', group: 'crescimento' },
  { id: 'leitura', name: 'Conhecimento', color: 'oklch(0.64 0.12 64)', icon: 'book', group: 'crescimento' },
  { id: 'arte', name: 'Arte & hobbies', color: 'oklch(0.62 0.15 330)', icon: 'brush', group: 'crescimento' },
  { id: 'financas', name: 'Finanças', color: 'oklch(0.60 0.10 196)', icon: 'wallet', group: 'pratico' },
];
const projById = (id) => PROJECTS.find(p => p.id === id) || PROJECTS[0];

/* ── Colunas do Kanban (board pessoal, transversal aos projetos) ────────── */
const COLUMNS = [
  { id: 'todo', name: 'Backlog', color: 'var(--p-low)' },
  { id: 'week', name: 'Esta semana', color: 'var(--p-med)' },
  { id: 'doing', name: 'Fazendo', color: 'var(--kg)' },
  { id: 'done', name: 'Concluído', color: 'var(--done)', isDone: true },
];

/* ── Tags reutilizáveis ─────────────────────────────────────────────────── */
const TAGS = {
  foco:        { color: 'oklch(0.60 0.17 350)' },
  '5min':      { color: 'oklch(0.62 0.13 150)' },
  'alta-energia': { color: 'oklch(0.66 0.16 30)' },
  recados:     { color: 'oklch(0.62 0.13 250)' },
  profundo:    { color: 'oklch(0.60 0.14 292)' },
  compras:     { color: 'oklch(0.64 0.12 64)' },
  ligar:       { color: 'oklch(0.60 0.10 196)' },
};
const TAG_NAMES = Object.keys(TAGS);

/* ── Tarefas ────────────────────────────────────────────────────────────── */
let _id = 0; const tid = () => 't' + (++_id);
function mk(o) {
  return Object.assign({
    id: tid(), title: '', project: 'inbox', col: 'todo', prio: 0, due: null, time: null,
    type: 'task', tags: [], subtasks: [], notes: '', est: null, startAt: null, today: false,
    done: false, recur: null, pos: _id * 1000,
    parent: null,            // id da tarefa-mãe (subtarefa = tarefa normal + parent)
    assignees: [],           // ids de pessoas da Komi
  }, o);
}

/* ── Pessoas (espelho do diretório Komi — para marcar responsáveis) ──────── */
const PEOPLE = [
  { id: 'p-ana-silva', name: 'Ana Silva' },
  { id: 'p-pedro',     name: 'Pedro Almeida' },
  { id: 'p-bruno',     name: 'Bruno Costa' },
  { id: 'p-mari',      name: 'Mariana Reis' },
  { id: 'p-rafael',    name: 'Rafael Tavares' },
  { id: 'p-lucas',     name: 'Lucas Mendes' },
  { id: 'p-ana-costa', name: 'Ana Costa' },
  { id: 'p-helena',    name: 'Helena' },
];
const personById = (id) => PEOPLE.find(p => p.id === id) || null;
const AV_PALETTE = ['oklch(0.55 0.13 277)', 'oklch(0.56 0.15 19)', 'oklch(0.58 0.12 184)', 'oklch(0.60 0.13 138)', 'oklch(0.62 0.14 64)', 'oklch(0.55 0.13 253)', 'oklch(0.56 0.13 300)', 'oklch(0.58 0.14 330)'];
function avatarColor(name) { let h = 0; for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return AV_PALETTE[h % AV_PALETTE.length]; }
function initials(name) { const p = (name || '').trim().split(/\s+/); return ((p[0] || '')[0] || '').toUpperCase() + (p.length > 1 ? (p[p.length - 1][0] || '').toUpperCase() : ''); }

const TASKS = [
  mk({ title: 'Revisar o pipeline de ETL antes do deploy', project: 'estudos', col: 'doing', prio: 3, due: TODAY, time: '14:00', tags: ['foco', 'profundo'], est: 90, today: true, assignees: ['p-lucas', 'p-ana-costa'],
       subtasks: [
         { id: 's1', title: 'Conferir schema das tabelas novas', done: true, prio: 2, notes: '' },
         { id: 's2', title: 'Rodar testes de carga', done: false, prio: 3, notes: 'Usar o dataset de 10M de linhas; medir o p95.', assignees: ['p-lucas'],
           subtasks: [
             { id: 's2a', title: 'Preparar dataset de 10M de linhas', done: true, prio: 2, notes: '' },
             { id: 's2b', title: 'Medir p95 e comparar com a baseline', done: false, prio: 3, notes: 'Meta: abaixo de 180ms.' },
           ] },
         { id: 's3', title: 'Validar com o time no Slack', done: false, prio: 1, notes: '', assignees: ['p-ana-costa'] },
       ] }),
  mk({ title: 'Responder e-mails da semana', project: 'inbox', col: 'week', prio: 1, due: TODAY, tags: ['recados', '5min'], est: 20, today: true }),
  mk({ title: 'Marcar consulta com o dentista', project: 'saude', col: 'todo', prio: 2, due: isoAdd(TODAY, -2), tags: ['ligar'], est: 10, today: true }),
  mk({ title: 'Pagar a fatura do cartão', project: 'financas', col: 'week', prio: 3, due: isoAdd(TODAY, -1), time: null, tags: [], est: 15, recur: { mode: 'fixed', rule: 'todo dia 10', label: 'todo dia 10' }, today: true }),
  mk({ title: 'Esboçar 3 thumbnails pro próximo desenho', project: 'arte', col: 'doing', prio: 1, due: TODAY, tags: ['alta-energia'], est: 45, today: true }),
  mk({ title: 'Estudar capítulo 7 — janelas de tempo', project: 'leitura', col: 'week', prio: 2, due: isoAdd(TODAY, 1), tags: ['profundo'], est: 60,
       subtasks: [{ id: 's4', title: 'Ler o capítulo', done: false, prio: 2, notes: '' }, { id: 's5', title: 'Resumir em fichas (Anki)', done: false, prio: 1, notes: '' }] }),
  mk({ title: 'Ligar pra vó no fim de semana', project: 'social', col: 'todo', prio: 2, due: isoAdd(TODAY, 2), tags: ['ligar'], est: 30, assignees: ['p-helena'] }),
  mk({ title: 'Comprar ração e areia do gato', project: 'casa', col: 'todo', prio: 1, due: isoAdd(TODAY, 1), tags: ['compras', 'recados'], est: 20 }),
  mk({ title: 'Regar as plantas', project: 'casa', col: 'todo', prio: 0, due: TODAY, tags: ['5min'], est: 5, recur: { mode: 'after_completion', rule: 'a cada 3 dias', label: 'a cada 3 dias após concluir' } }),
  mk({ title: 'Treino de força — pernas', project: 'saude', col: 'week', prio: 2, due: isoAdd(TODAY, 1), time: '07:00', tags: ['alta-energia'], est: 50 }),
  mk({ title: 'Organizar referências do moodboard', project: 'arte', col: 'todo', prio: 0, due: null, tags: [], est: 40 }),
  mk({ title: 'Fechar orçamento do mês', project: 'financas', col: 'todo', prio: 2, due: isoAdd(TODAY, 4), tags: ['profundo'], est: 45, recur: { mode: 'fixed', rule: 'todo mês', label: 'todo dia 1' } }),
  mk({ title: 'Confirmar presença no aniversário da Lia', project: 'social', col: 'week', prio: 1, due: isoAdd(TODAY, 3), tags: ['recados', '5min'], est: 5, assignees: ['p-ana-silva', 'p-mari'] }),
  mk({ title: 'Refatorar o módulo de autenticação', project: 'estudos', col: 'todo', prio: 2, due: isoAdd(TODAY, 5), tags: ['foco', 'profundo'], est: 120 }),
  mk({ title: 'Trocar a lâmpada do corredor', project: 'casa', col: 'todo', prio: 0, due: null, tags: ['5min'], est: 10 }),
  mk({ title: 'Anotar ideias do livro novo', project: 'leitura', col: 'todo', prio: 0, due: null, tags: [], est: 15 }),
  mk({ title: 'Agendar exame de sangue', project: 'saude', col: 'todo', prio: 2, due: isoAdd(TODAY, 6), tags: ['ligar'], est: 10 }),
  mk({ title: 'Backup das fotos da viagem', project: 'casa', col: 'week', prio: 1, due: isoAdd(TODAY, 2), tags: [], est: 30 }),
  mk({ title: 'Praticar 30 min de violão', project: 'arte', col: 'doing', prio: 1, due: TODAY, tags: ['alta-energia'], est: 30 }),
  mk({ title: 'Revisar metas do trimestre', project: 'estudos', col: 'week', prio: 3, due: isoAdd(TODAY, 1), tags: ['profundo'], est: 60 }),
  /* tipos: evento / aniversário */
  mk({ title: 'Aniversário da Lia', type: 'birthday', project: 'social', col: 'todo', prio: 1, due: isoAdd(TODAY, 2), tags: [], recur: { mode: 'fixed', rule: 'anual', label: 'todo ano' } }),
  mk({ title: 'Reunião do condomínio', type: 'event', project: 'casa', col: 'week', prio: 2, due: isoAdd(TODAY, 3), time: '19:00', est: 60, tags: ['recados'] }),
  mk({ title: 'Consulta — dermatologista', type: 'event', project: 'saude', col: 'todo', prio: 2, due: isoAdd(TODAY, 5), time: '10:30', est: 45 }),
  /* concluídas (histórico) */
  mk({ title: 'Enviar relatório semanal', project: 'estudos', col: 'done', prio: 2, due: isoAdd(TODAY, -1), done: true, est: 30 }),
  mk({ title: 'Lavar a louça', project: 'casa', col: 'done', prio: 0, due: isoAdd(TODAY, -1), done: true, est: 15 }),
  mk({ title: 'Meditar 10 minutos', project: 'saude', col: 'done', prio: 1, due: TODAY, done: true, est: 10 }),
  mk({ title: 'Atualizar planilha de gastos', project: 'financas', col: 'done', prio: 1, due: isoAdd(TODAY, -1), done: true, est: 20 }),
];

/* ── Migração: subtarefas embutidas → tarefas reais com `parent` ────────────
   O source-of-truth passa a ser uma árvore plana: toda subtarefa é uma tarefa
   normal que aponta para a mãe. Roda uma vez ao carregar os dados mock. */
function flattenSubtasks(subs, parentTask, depthBase) {
  (subs || []).forEach((s, i) => {
    const child = mk({
      title: s.title, done: !!s.done, prio: s.prio || 0, notes: s.notes || '',
      assignees: s.assignees || [], tags: s.tags || [], due: s.due || null,
      project: parentTask.project, col: s.done ? 'done' : parentTask.col,
      parent: parentTask.id, type: 'task', pos: parentTask.pos + (i + 1) * 10,
    });
    TASKS.push(child);
    if (s.subtasks && s.subtasks.length) flattenSubtasks(s.subtasks, child, depthBase + 1);
  });
}
TASKS.slice().forEach(t => {
  if (t.subtasks && t.subtasks.length) flattenSubtasks(t.subtasks, t, 1);
  t.subtasks = [];   // a mãe não guarda mais filhos embutidos
});

/* ── Helpers de árvore (estrutura global de subtarefas) ─────────────────── */
function childrenOf(id) { return TASKS.filter(t => t.parent === id); }
function rootTasks(list) { return (list || TASKS).filter(t => !t.parent); }
function descendantsOf(id) { const out = []; const walk = (pid) => childrenOf(pid).forEach(c => { out.push(c); walk(c.id); }); walk(id); return out; }
function taskDepth(t) { let d = 0, cur = t; while (cur && cur.parent) { cur = TASKS.find(x => x.id === cur.parent); d++; if (d > 12) break; } return d; }
function parentOf(t) { return t && t.parent ? TASKS.find(x => x.id === t.parent) : null; }
/* progresso direto (para o anel do Kanban e o contador da árvore) */
function subProgress(id) { const kids = childrenOf(id); return { done: kids.filter(k => k.done).length, total: kids.length }; }
/* evita ciclos ao re-parentear */
function isDescendant(maybeChildId, ancestorId) { if (maybeChildId === ancestorId) return true; return descendantsOf(ancestorId).some(d => d.id === maybeChildId); }

/* ── Smart lists (filtros salvos) ───────────────────────────────────────── */
const FILTERS = [
  { id: 'f-today', name: 'Hoje + Vencidas', icon: 'sun', test: (t) => !t.done && t.due && daysBetween(TODAY, t.due) <= 0 },
  { id: 'f-week', name: 'Esta semana', icon: 'calendar', test: (t) => !t.done && t.due && daysBetween(TODAY, t.due) >= 0 && daysBetween(TODAY, t.due) <= 7 },
  { id: 'f-energy', name: 'Alta energia', icon: 'zap', test: (t) => !t.done && t.tags.includes('alta-energia') },
  { id: 'f-5min', name: '5 minutos', icon: 'timer', test: (t) => !t.done && (t.tags.includes('5min') || (t.est && t.est <= 10)) },
];

/* ── Eventos do Google Calendar (capacity / time-blocking) ──────────────── */
const EVENTS = [
  { id: 'e1', day: TODAY, start: '09:00', end: '09:30', title: 'Daily do time' },
  { id: 'e2', day: TODAY, start: '10:00', end: '11:00', title: '1:1 com a líder' },
  { id: 'e3', day: TODAY, start: '15:30', end: '16:30', title: 'Review de produto' },
  { id: 'e4', day: isoAdd(TODAY, 1), start: '11:00', end: '12:00', title: 'Planning' },
  { id: 'e5', day: isoAdd(TODAY, 1), start: '19:00', end: '20:00', title: 'Aula de violão' },
  { id: 'e6', day: isoAdd(TODAY, -1), start: '14:00', end: '15:00', title: 'Terapia' },
  { id: 'e7', day: isoAdd(TODAY, 2), start: '20:00', end: '23:00', title: 'Aniversário da Lia' },
  { id: 'e8', day: isoAdd(TODAY, 3), start: '08:00', end: '09:00', title: 'Corrida no parque' },
];

/* ── Hábitos (Loop: força que perdoa falhas) ────────────────────────────── */
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function buildLog(seed, adherence, measurable, daysBack) {
  const rng = mulberry(seed);
  const log = {};
  for (let i = daysBack; i >= 0; i--) {
    const iso = isoAdd(TODAY, -i);
    if (rng() < adherence) log[iso] = measurable ? Math.round(measurable * (0.6 + rng() * 0.8)) : 1;
  }
  return log;
}

const HABITS = [
  { id: 'h1', name: 'Meditar', icon: 'lotus', color: 'oklch(0.62 0.15 292)', freqNum: 7, freqDen: 7, unit: null, target: null, log: buildLog(101, 0.86, null, 200) },
  { id: 'h2', name: 'Ler 20 páginas', icon: 'book', color: 'oklch(0.64 0.12 64)', freqNum: 5, freqDen: 7, unit: 'pág', target: 20, log: buildLog(202, 0.72, 20, 200) },
  { id: 'h3', name: 'Treinar', icon: 'dumbbell', color: 'oklch(0.63 0.13 150)', freqNum: 3, freqDen: 7, unit: null, target: null, log: buildLog(303, 0.62, null, 200) },
  { id: 'h4', name: 'Desenhar', icon: 'brush', color: 'oklch(0.62 0.15 330)', freqNum: 4, freqDen: 7, unit: 'min', target: 30, log: buildLog(404, 0.55, 30, 200) },
  { id: 'h5', name: 'Beber 2L de água', icon: 'drop', color: 'oklch(0.60 0.10 196)', freqNum: 7, freqDen: 7, unit: 'L', target: 2, log: buildLog(505, 0.9, 2, 200) },
];

/* força do hábito — decaimento suave (meia-vida ~13d), normalizada pela meta */
function decaySeries(hit, days) {
  const mult = Math.pow(0.5, 1 / 13);
  let s = 0;
  for (let i = 0; i < days; i++) s = s * mult + (hit(i) ? (1 - mult) : 0);
  return s;
}
function habitStrength(h, days = 60) {
  const has = (i) => !!h.log[isoAdd(TODAY, -(days - 1 - i))];
  const actual = decaySeries(has, days);
  const freq = h.freqNum / h.freqDen;
  const ideal = decaySeries((i) => ((days - 1 - i) % h.freqDen) < h.freqNum, days);
  return Math.max(0, Math.min(1, actual / (ideal || 1)));
}
function habitStreak(h) {
  let n = 0;
  for (let i = 0; ; i++) { if (h.log[isoAdd(TODAY, -i)]) n++; else break; }
  return n;
}
function habitWeekDone(h) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (h.log[isoAdd(TODAY, -i)]) n++;
  return n;
}

/* ── Heatmap: agrupa um log em meses (reuso padrão Frieren) ──────────────── */
function logToMonths(log, monthsBack = 6) {
  const months = [];
  const start = iso2d(TODAY); start.setMonth(start.getMonth() - (monthsBack - 1)); start.setDate(1);
  const cur = new Date(start);
  while (cur <= iso2d(TODAY)) {
    const m = cur.getMonth(), y = cur.getFullYear();
    const days = [];
    const d = new Date(y, m, 1);
    while (d.getMonth() === m && d <= iso2d(TODAY)) { const iso = d2iso(d); days.push({ date: iso, v: log[iso] || 0 }); d.setDate(d.getDate() + 1); }
    months.push({ m, days });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

/* ─────────────────────────────────────────────────────────────────────────
   Parser determinístico pt-BR (estilo Todoist) — sem LLM.
   Devolve { title, due, time, tags, project, prio, recur, segments[] }
   segments = [{text, cls}] para o highlight ao vivo no quick-add.
   ───────────────────────────────────────────────────────────────────────── */
function nextWeekday(target) {
  const today = iso2d(TODAY).getDay();
  let diff = (target - today + 7) % 7;
  if (diff === 0) diff = 7;
  return isoAdd(TODAY, diff);
}
function parseTask(raw) {
  const res = { title: '', due: null, time: null, tags: [], project: null, prio: 0, recur: null, segments: [] };
  // varre token a token preservando posições para o highlight
  const re = /(\s+)|(#[\wÀ-ÿ-]+)|(@[\wÀ-ÿ-]+)|(![\wÀ-ÿ]+)|(\d{1,2})(?::|h)(\d{2})|(\d{1,2})h\b|(\d{1,2}):(\d{2})|([\wÀ-ÿ]+)/gi;
  const segs = [];
  let m, titleWords = [];
  const push = (text, cls) => segs.push({ text, cls });

  const lowerStr = raw.toLowerCase();
  // recorrência (multi-palavra) — detecta e marca antes do loop
  const recurPatterns = [
    { rx: /\btodo dia (\d{1,2})\b/, mk: (mm) => ({ mode: 'fixed', label: `todo dia ${mm[1]}`, rule: `todo dia ${mm[1]}` }) },
    { rx: /\btoda (segunda|terça|terca|quarta|quinta|sexta|s[áa]bado|domingo)\b/, mk: (mm) => ({ mode: 'fixed', label: `toda ${mm[1]}`, rule: `toda ${mm[1]}` }) },
    { rx: /\b(todo dia|diariamente|todos os dias)\b/, mk: () => ({ mode: 'fixed', label: 'todo dia', rule: 'diário' }) },
    { rx: /\ba cada (\d{1,2}) dias?\b/, mk: (mm) => ({ mode: 'after_completion', label: `a cada ${mm[1]} dias`, rule: `a cada ${mm[1]} dias` }) },
    { rx: /\btodo m[êe]s\b/, mk: () => ({ mode: 'fixed', label: 'todo mês', rule: 'mensal' }) },
  ];
  let recurSpan = null;
  for (const p of recurPatterns) { const mm = lowerStr.match(p.rx); if (mm) { res.recur = p.mk(mm); recurSpan = [mm.index, mm.index + mm[0].length]; break; } }

  const WD = { domingo: 0, segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, dom: 0 };

  let i = 0;
  while (i < raw.length) {
    // dentro de um trecho de recorrência? emite como data e pula
    if (recurSpan && i === recurSpan[0]) {
      push(raw.slice(recurSpan[0], recurSpan[1]), 'tok-date');
      i = recurSpan[1];
      continue;
    }
    re.lastIndex = i;
    m = re.exec(raw);
    if (!m || m.index !== i) { push(raw[i], null); i++; continue; }
    const tok = m[0];
    i = re.lastIndex;
    if (m[1]) { push(tok, null); continue; }                 // espaço
    if (m[2]) { const t = tok.slice(1).toLowerCase(); res.tags.push(t); push(tok, 'tok-tag'); continue; }   // #tag
    if (m[3]) {                                               // @projeto
      const name = tok.slice(1).toLowerCase();
      const proj = PROJECTS.find(p => p.id === name || p.name.toLowerCase().startsWith(name));
      if (proj) { res.project = proj.id; push(tok, 'tok-proj'); } else push(tok, null);
      continue;
    }
    if (m[4]) {                                              // !prioridade
      const key = tok.slice(1).toLowerCase();
      if (/^a/.test(key)) { res.prio = 3; push(tok, 'tok-prio-high'); }
      else if (/^m/.test(key)) { res.prio = 2; push(tok, 'tok-prio-med'); }
      else if (/^b/.test(key)) { res.prio = 1; push(tok, 'tok-prio-low'); }
      else push(tok, null);
      continue;
    }
    if (m[5] !== undefined && m[6] !== undefined) { res.time = `${m[5].padStart(2, '0')}:${m[6]}`; push(tok, 'tok-time'); continue; }  // 9h30 / 9:30 já coberto
    if (m[7] !== undefined) { res.time = `${m[7].padStart(2, '0')}:00`; push(tok, 'tok-time'); continue; }   // 17h
    if (m[8] !== undefined && m[9] !== undefined) { res.time = `${m[8].padStart(2, '0')}:${m[9]}`; push(tok, 'tok-time'); continue; }
    // palavra simples — pode ser data relativa
    const w = m[10].toLowerCase();
    if (recurSpan) { push(tok, null); titleWords.push(tok); continue; }   // já tratado como recorrência
    if (w === 'hoje') { res.due = TODAY; push(tok, 'tok-date'); }
    else if (w === 'amanhã' || w === 'amanha') { res.due = isoAdd(TODAY, 1); push(tok, 'tok-date'); }
    else if (w === 'hj') { res.due = TODAY; push(tok, 'tok-date'); }
    else if (WD[w] !== undefined) { res.due = nextWeekday(WD[w]); push(tok, 'tok-date'); }
    else if (w === 'dia') {
      // "dia 5" — olha próxima palavra numérica
      const after = raw.slice(i).match(/^(\s+)(\d{1,2})\b/);
      if (after) { const dd = parseInt(after[2]); const base = iso2d(TODAY); let cand = new Date(base.getFullYear(), base.getMonth(), dd); if (cand < base) cand = new Date(base.getFullYear(), base.getMonth() + 1, dd); res.due = d2iso(cand); push(tok + after[1] + after[2], 'tok-date'); i += after[0].length; }
      else { push(tok, null); titleWords.push(tok); }
    }
    else { push(tok, null); titleWords.push(tok); }
  }

  res.segments = segs;
  res.title = titleWords.join(' ').replace(/\s+/g, ' ').trim();
  if (!res.project) res.project = 'inbox';
  return res;
}

/* ── Derivações úteis ───────────────────────────────────────────────────── */
function openCount(projId) { return TASKS.filter(t => !t.done && t.project === projId).length; }
function tasksForToday() { return TASKS.filter(t => !t.done && t.today); }
function isUrgent(t) { return t.due && daysBetween(TODAY, t.due) <= 2; }     // Eisenhower: vence ≤2 dias
function isImportant(t) { return t.prio >= 2; }                              // prioridade ≥ média

Object.assign(window, {
  TODAY, NOW_MIN, DIAS_ABBR, DIAS_FULL, MESES_ABBR, MESES_FULL,
  d2iso, iso2d, isoAdd, daysBetween, dueLabel, dueClass, fmtTime, minToTime, timeToMin, fmtEst, greet,
  PRIO, TYPES, GROUPS, PROJECTS, projById, COLUMNS, TAGS, TAG_NAMES, TASKS, FILTERS, EVENTS, HABITS,
  PEOPLE, personById, avatarColor, initials,
  childrenOf, rootTasks, descendantsOf, taskDepth, parentOf, subProgress, isDescendant,
  habitStrength, habitStreak, habitWeekDone, logToMonths, buildLog,
  parseTask, nextWeekday, openCount, tasksForToday, isUrgent, isImportant, mk,
});
