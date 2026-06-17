/* ─────────────────────────────────────────────────────────────────────────
   Komi · Pessoas — dados
   Identidade canônica (people) + vínculos polimórficos por domínio
   (finanças/Nami, tarefas/Kaguya, diário/Violet, livros/Frieren).
   Persistência em localStorage — criar/editar/excluir sobrevive ao refresh.
   ───────────────────────────────────────────────────────────────────────── */

const TODAY = '2026-06-15';
const STORE_KEY = 'komi.pessoas.v1';

/* categorias de relacionamento → cor + tinta (escopadas no shell) */
const REL_CATS = {
  familia: { label: 'Família',  color: 'var(--garnet)', tint: 'var(--garnet-t)' },
  amigos:  { label: 'Amigos',   color: 'var(--km)',     tint: 'var(--km-tint)' },
  trabalho:{ label: 'Trabalho', color: 'var(--book)',   tint: 'var(--book-t)' },
  outros:  { label: 'Outros',   color: 'var(--ink-3)',  tint: 'var(--line-2)' },
};

/* normalização (minúsculo + sem acento) — espelha o `normalizado` do schema */
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/* paleta determinística para o avatar de iniciais (a partir do nome) */
const AV_PALETTE = [
  'oklch(0.55 0.13 277)', 'oklch(0.56 0.15 19)',  'oklch(0.58 0.12 184)',
  'oklch(0.58 0.13 158)', 'oklch(0.60 0.14 57)',  'oklch(0.56 0.15 340)',
  'oklch(0.55 0.13 253)', 'oklch(0.56 0.13 300)',
];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length];
}
function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* dias até a próxima ocorrência de uma data (recorrente = aniversário) */
function daysUntil(dateStr, recurring) {
  // dateStr "MM-DD" (recorrente) ou "YYYY-MM-DD"
  const t = new Date(TODAY + 'T00:00:00');
  let target;
  if (recurring) {
    const [mm, dd] = dateStr.split('-').slice(-2);
    target = new Date(t.getFullYear(), +mm - 1, +dd);
    if (target < t) target = new Date(t.getFullYear() + 1, +mm - 1, +dd);
  } else {
    target = new Date(dateStr + 'T00:00:00');
  }
  return Math.round((target - t) / 86400000);
}
function fmtDayMonth(dateStr) {
  const [mm, dd] = dateStr.split('-').slice(-2);
  const M = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${dd} ${M[+mm - 1]}`;
}
function brl(v) {
  return (v < 0 ? '−' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Seed: pessoas com vínculos cross-agent ───────────────────────────────── */
const SEED = [
  {
    id: 'p-ana-silva', name: 'Ana Silva', relationship: 'amiga', category: 'amigos',
    phone: '+55 11 99812-3344', email: 'ana.silva@gmail.com', instagram: '@anasilva',
    telegram: '@aninha', city: 'São Paulo', avatar: null,
    notes: 'Quer ir a Portugal em agosto e me convidou. Calcular o financeiro antes de confirmar.',
    aliases: ['Aninha', 'Ana'],
    dates: [
      { label: 'Aniversário', date: '03-12', recurring: true },
      { label: 'Viagem Portugal', date: '2026-08-05', recurring: false },
    ],
    links: {
      finances: { net: 230, txns: [
        { date: '2026-06-09', desc: 'Jantar japonês (dividido)', amount: -54, method: 'Pix' },
        { date: '2026-05-28', desc: 'Emprestei para o Uber', amount: 230, method: 'Pix' },
        { date: '2026-05-12', desc: 'Presente conjunto p/ Mari', amount: -45, method: 'Crédito' },
      ] },
      tasks: { items: [
        { title: 'Confirmar datas da viagem com a Ana', done: false, due: '2026-06-20', prio: 3 },
        { title: 'Devolver o livro da Ana', done: false, due: '2026-06-18', prio: 2 },
        { title: 'Comprar passagem (cotação)', done: true, due: '2026-06-05', prio: 2 },
      ] },
      journal: { mentions: [
        { date: '2026-06-07', time: '16:05', text: 'Ligação com @Ana — ela quer ir a Portugal em agosto e me convidou.' },
        { date: '2026-06-02', time: '12:48', text: 'Café com a @Ana, falamos do projeto novo dela. Animada.' },
        { date: '2026-05-21', time: '20:30', text: 'Cinema com @Ana e @Bruno — filme bom, conversa melhor.' },
      ] },
      books: [
        { title: 'O Conto da Aia', author: 'Margaret Atwood', status: 'emprestado' },
        { title: 'Mil Pássaros', author: 'Yasunari Kawabata', status: 'indicado' },
      ],
    },
  },
  {
    id: 'p-pedro', name: 'Pedro Almeida', relationship: 'amigo', category: 'amigos',
    phone: '+55 11 99654-1020', email: 'pedro.almeida@gmail.com', instagram: '@pedroalm',
    telegram: '', city: 'São Paulo', avatar: null,
    notes: 'Tocando um projeto de saúde com o Rafael. Janela real de mercado.',
    aliases: ['Pe'],
    dates: [{ label: 'Aniversário', date: '09-23', recurring: true }],
    links: {
      finances: { net: -120, txns: [
        { date: '2026-06-10', desc: 'Devo da aposta da copa', amount: -120, method: 'Pix' },
      ] },
      tasks: { items: [
        { title: 'Revisar o pitch de saúde do Pedro', done: false, due: '2026-06-22', prio: 2 },
        { title: 'Apresentar Pedro ao investidor', done: true, due: '2026-06-01', prio: 3 },
      ] },
      journal: { mentions: [
        { date: '2026-06-07', time: '12:48', text: 'Almoço com @Pedro e @Rafael. Falamos sobre o projeto deles de #saúde.' },
        { date: '2026-05-30', time: '19:10', text: '@Pedro mandou o protótipo. Ficou melhor do que eu esperava.' },
      ] },
      books: [{ title: 'A Startup Enxuta', author: 'Eric Ries', status: 'indicado' }],
    },
  },
  {
    id: 'p-bruno', name: 'Bruno Costa', relationship: 'amigo', category: 'amigos',
    phone: '+55 21 98877-6655', email: '', instagram: '@brunocosta',
    telegram: '@bru', city: 'Rio de Janeiro', avatar: null,
    notes: 'Divide as contas de viagem certinho. Confiável.',
    aliases: [],
    dates: [{ label: 'Aniversário', date: '06-29', recurring: true }],
    links: {
      finances: { net: -27, txns: [
        { date: '2026-06-09', desc: 'Jantar japonês (dividido)', amount: -27, method: 'Pix' },
      ] },
      tasks: { items: [
        { title: 'Combinar churrasco com o Bruno', done: false, due: '2026-06-28', prio: 1 },
      ] },
      journal: { mentions: [
        { date: '2026-05-21', time: '20:30', text: 'Cinema com @Ana e @Bruno — filme bom, conversa melhor.' },
      ] },
      books: [],
    },
  },
  {
    id: 'p-mari', name: 'Mariana Reis', relationship: 'irmã', category: 'familia',
    phone: '+55 11 99100-2030', email: 'mari.reis@gmail.com', instagram: '@marireis',
    telegram: '', city: 'Campinas', avatar: null,
    notes: 'Faz aniversário no fim do mês — combinar o presente com a Ana.',
    aliases: ['Mari'],
    dates: [{ label: 'Aniversário', date: '06-26', recurring: true }],
    links: {
      finances: { net: 0, txns: [] },
      tasks: { items: [
        { title: 'Comprar presente da Mari', done: false, due: '2026-06-24', prio: 3 },
      ] },
      journal: { mentions: [
        { date: '2026-06-04', time: '21:00', text: 'Liguei pra @Mari, conversa longa. Ela está bem.' },
      ] },
      books: [],
    },
  },
  {
    id: 'p-rafael', name: 'Rafael Tavares', relationship: 'amigo', category: 'amigos',
    phone: '', email: 'rafa.tavares@gmail.com', instagram: '',
    telegram: '@rafa', city: 'São Paulo', avatar: null,
    notes: 'Sócio do Pedro no projeto de saúde.',
    aliases: ['Rafa'],
    dates: [],
    links: {
      finances: { net: 0, txns: [] },
      tasks: { items: [] },
      journal: { mentions: [
        { date: '2026-06-07', time: '12:48', text: 'Almoço com @Pedro e @Rafael. Falamos sobre o projeto deles de #saúde.' },
      ] },
      books: [],
    },
  },
  {
    id: 'p-lucas', name: 'Lucas Mendes', relationship: 'colega', category: 'trabalho',
    phone: '', email: 'lucas.mendes@empresa.com', instagram: '',
    telegram: '', city: 'São Paulo', avatar: null,
    notes: '',
    aliases: [],
    dates: [{ label: 'Aniversário', date: '11-04', recurring: true }],
    links: {
      finances: { net: 0, txns: [] },
      tasks: { items: [
        { title: 'Passar o handoff do projeto pro Lucas', done: true, due: '2026-06-03', prio: 2 },
      ] },
      journal: { mentions: [] },
      books: [],
    },
  },
  {
    id: 'p-ana-costa', name: 'Ana Costa', relationship: 'colega', category: 'trabalho',
    phone: '', email: 'ana.costa@empresa.com', instagram: '',
    telegram: '', city: 'São Paulo', avatar: null,
    notes: 'Outra Ana — não confundir com a Ana Silva. (Komi: smart match pede confirmação.)',
    aliases: [],
    dates: [],
    links: {
      finances: { net: 0, txns: [] },
      tasks: { items: [] },
      journal: { mentions: [] },
      books: [],
    },
  },
  {
    id: 'p-helena', name: 'Helena', relationship: 'mãe', category: 'familia',
    phone: '+55 11 99777-8899', email: '', instagram: '',
    telegram: '', city: 'Campinas', avatar: null,
    notes: '',
    aliases: ['Mãe'],
    dates: [
      { label: 'Aniversário', date: '02-18', recurring: true },
      { label: 'Dia das Mães', date: '05-10', recurring: true },
    ],
    links: {
      finances: { net: -300, txns: [
        { date: '2026-06-08', desc: 'Mesada / ajuda', amount: -300, method: 'Transferência' },
      ] },
      tasks: { items: [
        { title: 'Ligar pra Helena no domingo', done: false, due: '2026-06-21', prio: 2 },
      ] },
      journal: { mentions: [
        { date: '2026-06-04', time: '21:30', text: 'Falei com a @Helena depois da @Mari. Tudo tranquilo por lá.' },
      ] },
      books: [],
    },
  },
];

/* ── Persistência ─────────────────────────────────────────────────────────── */
function loadPeople() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) { /* ignore */ }
  return SEED.map(p => ({ ...p }));
}
function savePeople(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

/* ── Derivados (resumo / contagens) ──────────────────────────────────────── */
function emptyLinks() {
  return { finances: { net: 0, txns: [] }, tasks: { items: [] }, journal: { mentions: [] }, books: [] };
}
function linkCounts(p) {
  const L = p.links || emptyLinks();
  return {
    fin: (L.finances?.txns || []).length,
    task: (L.tasks?.items || []).length,
    diary: (L.journal?.mentions || []).length,
    book: (L.books || []).length,
  };
}
function totalLinks(p) {
  const c = linkCounts(p);
  return c.fin + c.task + c.diary + c.book;
}

/* última interação registrada (max entre menções de diário, transações e
   tarefas concluídas) — alimenta as sugestões de "reconectar" */
function lastInteraction(p) {
  const L = p.links || emptyLinks();
  const dates = [];
  (L.journal?.mentions || []).forEach(m => dates.push({ date: m.date, kind: 'diário', text: m.text }));
  (L.finances?.txns || []).forEach(t => dates.push({ date: t.date, kind: 'finanças', text: t.desc }));
  (L.tasks?.items || []).filter(t => t.done).forEach(t => dates.push({ date: t.due, kind: 'tarefa', text: t.title }));
  if (!dates.length) return null;
  dates.sort((a, b) => a.date < b.date ? 1 : -1);   // YYYY-MM-DD ordena lexicograficamente
  return dates[0];
}
function daysSince(iso) {
  if (!iso) return null;
  return Math.round((new Date(TODAY + 'T00:00:00') - new Date(iso + 'T00:00:00')) / 86400000);
}
function humanGap(days) {
  if (days == null) return 'sem registro';
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 14) return `há ${days} dias`;
  if (days < 30) return `há ${Math.round(days / 7)} semanas`;
  if (days < 60) return 'há 1 mês';
  if (days < 365) return `há ${Math.round(days / 30)} meses`;
  return 'há mais de um ano';
}

Object.assign(window, {
  TODAY, REL_CATS, normalize, avatarColor, initials, daysUntil, fmtDayMonth, brl,
  loadPeople, savePeople, emptyLinks, linkCounts, totalLinks, SEED,
  lastInteraction, daysSince, humanGap,
});
