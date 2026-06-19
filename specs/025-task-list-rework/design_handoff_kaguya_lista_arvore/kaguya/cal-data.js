/* ─────────────────────────────────────────────────────────────────────────
   Kaguya · Calendário — fonte de dados dos CALENDÁRIOS conectados
   "Bases" da suíte Makima + integrações externas (cada uma um calendário
   togglável, com cor própria). Eventos da semana 24 (7–13 jun 2026), espelho
   do que /api/calendars/* e os conectores (Google, anime, futebol) devolveriam.
   Plain JS — carregado antes do Babel; tudo exposto em window.
   ───────────────────────────────────────────────────────────────────────── */

/* ── Contas (agrupam calendários, como no Notion Calendar) ──────────────── */
const CAL_ACCOUNTS = [
  { id: 'makima', name: 'Makima · suíte', sub: 'bases do app' },
  { id: 'google', name: 'gustavo@gmail.com', sub: 'Google Agenda' },
];

/* ── Calendários: bases internas + integrações ──────────────────────────── */
/* color = oklch sólido; o CSS deriva tints com color-mix. icon = glifo curto. */
const CALENDARS = [
  /* bases da suíte Makima */
  { id: 'kaguya',  account: 'makima', kind: 'base', name: 'Kaguya · Tarefas',  color: 'oklch(0.56 0.13 252)', avatar: 'K', visible: true,  primary: true },
  { id: 'nami',    account: 'makima', kind: 'base', name: 'Nami · Finanças',   color: 'oklch(0.70 0.17 52)',  avatar: 'N', visible: true },
  { id: 'frieren', account: 'makima', kind: 'base', name: 'Frieren · Livros',  color: 'oklch(0.72 0.10 184)', avatar: 'F', visible: true },
  { id: 'akane',   account: 'makima', kind: 'base', name: 'Akane · Filmes',    color: 'oklch(0.60 0.20 18)',  avatar: 'A', visible: true },
  { id: 'violet',  account: 'makima', kind: 'base', name: 'Violet · Diário',   color: 'oklch(0.58 0.16 300)', avatar: 'V', visible: true },
  /* integrações externas */
  { id: 'animes',   account: 'google', kind: 'integration', name: 'Animes',           color: 'oklch(0.64 0.18 350)', avatar: '▶', visible: true },
  { id: 'futebol',  account: 'google', kind: 'integration', name: 'Palmeiras / Copa',  color: 'oklch(0.60 0.15 150)', avatar: '⚽', visible: true },
  { id: 'feriados', account: 'google', kind: 'integration', name: 'Feriados no Brasil',color: 'oklch(0.72 0.135 80)', avatar: '★', visible: true },
  { id: 'gcal',     account: 'google', kind: 'integration', name: 'Agenda pessoal',    color: 'oklch(0.58 0.13 250)', avatar: 'G', visible: true },
];
const calById = (id) => CALENDARS.find(c => c.id === id) || CALENDARS[0];

/* ── Dias da semana de referência (semana 24) ───────────────────────────── */
const WK = {
  dom: '2026-06-07', seg: '2026-06-08', ter: '2026-06-09', qua: '2026-06-10',
  qui: '2026-06-11', sex: '2026-06-12', sab: '2026-06-13',
};

let _eid = 0; const eid = () => 'ce' + (++_eid);
function ev(cal, day, start, end, title, extra) {
  return Object.assign({ id: eid(), cal, day, start, end, title, allDay: false, color: null, loc: null }, extra || {});
}
function allday(cal, day, title, extra) {
  return Object.assign({ id: eid(), cal, day, start: null, end: null, title, allDay: true, color: null }, extra || {});
}

/* ── Eventos da semana ──────────────────────────────────────────────────── */
const CAL_EVENTS = [
  /* ░░ Kaguya · Tarefas — eventos + tarefas com horário (time-block) ░░ */
  ev('kaguya', WK.qua, '09:00', '09:30', 'Daily do time', { kind: 'event' }),
  ev('kaguya', WK.qui, '09:00', '09:30', 'Daily do time', { kind: 'event' }),
  ev('kaguya', WK.qui, '10:00', '11:00', '1:1 com a líder', { kind: 'event' }),
  ev('kaguya', WK.qui, '14:00', '15:30', 'Revisar pipeline de ETL', { kind: 'task' }),
  ev('kaguya', WK.qui, '15:30', '16:30', 'Review de produto', { kind: 'event' }),
  ev('kaguya', WK.ter, '07:00', '07:50', 'Treino de força — pernas', { kind: 'task' }),
  ev('kaguya', WK.qua, '11:00', '12:00', 'Planning', { kind: 'event' }),
  ev('kaguya', WK.sex, '16:00', '16:45', 'Consulta — dermatologista', { kind: 'task' }),
  allday('kaguya', WK.sab, 'Confirmar presença no aniversário', { kind: 'task' }),

  /* ░░ Nami · Finanças — vencimentos (all-day, como no print) ░░ */
  allday('nami', WK.dom, 'Pagar Garagem'),
  allday('nami', WK.dom, 'Pagar Cartão Itaú'),
  allday('nami', WK.dom, 'Pagar Cartão Porto'),
  allday('nami', WK.dom, 'Pagar cartão Nubank'),
  allday('nami', WK.qua, 'Fechar orçamento do mês'),
  ev('nami', WK.qui, '17:00', '17:30', 'Atualizar planilha de gastos'),

  /* ░░ Frieren · Livros — metas e lançamentos ░░ */
  allday('frieren', WK.seg, 'Lançamento: Tongari Boushi #11'),
  ev('frieren', WK.ter, '22:00', '23:00', 'Ler 20 páginas', { loc: 'Quarto' }),
  ev('frieren', WK.qui, '22:00', '23:00', 'Ler 20 páginas'),
  allday('frieren', WK.sab, 'Meta semanal: 140 páginas'),

  /* ░░ Akane · Filmes — estreias e sessões ░░ */
  allday('akane', WK.qui, 'Estreia: Youkoso Jitsuryoku'),
  ev('akane', WK.sex, '20:30', '23:00', 'Sessão: Cinco Centímetros', { loc: 'Cinemark' }),
  ev('akane', WK.sab, '21:00', '23:15', 'Maratona Studio Ghibli', { loc: 'Casa' }),

  /* ░░ Violet · Diário — entradas ░░ */
  ev('violet', WK.dom, '21:30', '22:00', 'Entrada do diário'),
  ev('violet', WK.qua, '21:30', '22:00', 'Entrada do diário'),
  ev('violet', WK.sex, '21:30', '22:00', 'Reflexão da semana'),

  /* ░░ Integração · Animes — próximos episódios ░░ */
  allday('animes', WK.seg, '#11 Tongari Boushi no Atelier'),
  allday('animes', WK.qua, '#10 Re:Zero kara Hajimeru'),
  allday('animes', WK.qui, '#14 Youkoso Jitsuryoku'),
  allday('animes', WK.sex, '#11 Kamiina Botan'),
  ev('animes', WK.sex, '12:30', '13:00', '#11 Otonari no Tenshi-sama'),

  /* ░░ Integração · Futebol — Palmeiras + Copa ░░ */
  ev('futebol', WK.qua, '16:00', '17:45', 'México 0 × 1 África do Sul', { loc: 'Copa' }),
  ev('futebol', WK.qui, '16:00', '17:45', 'Canadá 1 × 1 Bósnia', { loc: 'Copa' }),
  ev('futebol', WK.sab, '16:00', '17:45', 'Catar 0 × 2 Suíça', { loc: 'Copa' }),
  ev('futebol', WK.sab, '19:00', '20:45', 'Brasil 2 × 1 Marrocos', { loc: 'Copa' }),

  /* ░░ Integração · Feriados ░░ */
  allday('feriados', WK.sex, 'Dia dos Namorados'),

  /* ░░ Integração · Google Agenda pessoal ░░ */
  ev('gcal', WK.dom, '10:00', '11:00', 'F1: GP de Mônaco', { loc: 'Band' }),
  ev('gcal', WK.seg, '15:00', '16:00', 'Alinhamento Semanal — BI'),
  ev('gcal', WK.seg, '11:00', '11:30', 'Daily - BI Netshoes'),
  ev('gcal', WK.ter, '11:00', '11:30', 'Daily - BI Netshoes'),
  ev('gcal', WK.qua, '11:00', '11:30', 'Daily - BI Netshoes'),
  ev('gcal', WK.qui, '11:00', '11:30', 'Daily - BI Netshoes'),
  ev('gcal', WK.sex, '15:00', '15:30', 'Daily - BI Netshoes'),
  ev('gcal', WK.sex, '10:00', '10:50', '[NetShoes] Momento Semanal'),
  ev('gcal', WK.seg, '18:00', '19:00', 'one one Gustavo'),
  allday('gcal', WK.sab, 'DR Cozinhar'),
  allday('gcal', WK.sab, 'RDrive para o Google Drive'),
];

/* ── Tarefas sem horário desta semana (bandeja de time-blocking) ────────── */
/* Deriva de TASKS (data.js) com due nesta semana e sem startAt agendado. */
function unscheduledForWeek(weekIsos) {
  if (typeof TASKS === 'undefined') return [];
  const set = new Set(weekIsos);
  return TASKS.filter(t => !t.done && t.due && set.has(t.due) && !t.startAt && !t.time)
    .map(t => ({ id: 'u-' + t.id, taskId: t.id, title: t.title, est: t.est || 30, due: t.due, prio: t.prio }));
}

/* ── Paleta de cores para recolorir calendários/eventos (estilo Notion) ─── */
const CAL_SWATCHES = [
  'oklch(0.56 0.13 252)', 'oklch(0.58 0.13 250)', 'oklch(0.58 0.16 300)',
  'oklch(0.64 0.18 350)', 'oklch(0.60 0.20 18)',  'oklch(0.70 0.17 52)',
  'oklch(0.72 0.135 80)', 'oklch(0.60 0.15 150)', 'oklch(0.72 0.10 184)',
  'oklch(0.62 0.05 280)',
];

/* ── Helpers de tempo do calendário ─────────────────────────────────────── */
const CAL_DAY_START = 0;     // 00h
const CAL_DAY_END = 24;      // 24h
function snapMin(min, step = 15) { return Math.max(0, Math.min(24 * 60, Math.round(min / step) * step)); }
function evDurMin(e) { return (timeToMin(e.end) - timeToMin(e.start)); }
function fmtRange(e) { return `${fmtTime(e.start)}–${fmtTime(e.end)}`; }

Object.assign(window, {
  CAL_ACCOUNTS, CALENDARS, calById, WK, CAL_EVENTS, CAL_SWATCHES,
  unscheduledForWeek, CAL_DAY_START, CAL_DAY_END, snapMin, evDurMin, fmtRange,
  ev, allday,
});
