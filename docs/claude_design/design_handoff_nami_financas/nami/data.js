/* ─────────────────────────────────────────────────────────────────────────
   Nami · Finanças — dados do mock (BRL, pt-BR)
   Contas, cartões, transações (jan–jun 2026), orçamentos, assinaturas e
   empréstimos. Transações geradas de forma determinística com pools de
   estabelecimentos reais para parecerem lançadas à mão.
   ───────────────────────────────────────────────────────────────────────── */

const TODAY = '2026-06-08';

/* ── Categorias ─────────────────────────────────────────────────────────── */
const CATEGORIES = [
  { id:'mercado',     name:'Mercado',     icon:'cart',    color:'oklch(0.66 0.15 55)',  kind:'out' },
  { id:'restaurante', name:'Restaurante', icon:'utensils',color:'oklch(0.62 0.17 25)',  kind:'out' },
  { id:'transporte',  name:'Transporte',  icon:'car',     color:'oklch(0.60 0.13 250)', kind:'out' },
  { id:'casa',        name:'Moradia',     icon:'home',    color:'oklch(0.58 0.10 285)', kind:'out' },
  { id:'saude',       name:'Saúde',       icon:'pulse',   color:'oklch(0.62 0.14 150)', kind:'out' },
  { id:'lazer',       name:'Lazer',       icon:'ticket',  color:'oklch(0.64 0.16 330)', kind:'out' },
  { id:'compras',     name:'Compras',     icon:'bag',     color:'oklch(0.66 0.14 80)',  kind:'out' },
  { id:'educacao',    name:'Educação',    icon:'book',    color:'oklch(0.58 0.12 200)', kind:'out' },
  { id:'viagem',      name:'Viagem',      icon:'plane',   color:'oklch(0.60 0.13 230)', kind:'out' },
  { id:'assinaturas', name:'Assinaturas', icon:'repeat',  color:'oklch(0.60 0.13 300)', kind:'out' },
  { id:'outros',      name:'Outros',      icon:'dots',    color:'oklch(0.62 0.02 60)',  kind:'out' },
  { id:'salario',     name:'Salário',     icon:'wallet',  color:'oklch(0.585 0.115 162)', kind:'in' },
  { id:'freela',      name:'Freelance',   icon:'laptop',  color:'oklch(0.58 0.11 175)', kind:'in' },
  { id:'investimento',name:'Investimentos',icon:'trend',  color:'oklch(0.60 0.12 145)', kind:'in' },
  { id:'reembolso',   name:'Reembolso',   icon:'refund',  color:'oklch(0.60 0.10 190)', kind:'in' },
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

/* ── Contas ─────────────────────────────────────────────────────────────── */
const ACCOUNTS = [
  { id:'nubank',  name:'Nubank',          kind:'Conta corrente', balance:7842.55,  color:'oklch(0.52 0.18 300)', short:'Nu' },
  { id:'itau',    name:'Itaú',            kind:'Conta corrente', balance:3120.18,  color:'oklch(0.62 0.17 50)',  short:'It' },
  { id:'caixa',   name:'Caixa',           kind:'Poupança',       balance:15600.00, color:'oklch(0.50 0.14 250)', short:'Cx' },
  { id:'xp',      name:'XP Investimentos',kind:'Investimentos',  balance:42380.90, color:'oklch(0.40 0.03 250)', short:'XP' },
  { id:'carteira',name:'Carteira',        kind:'Dinheiro',       balance:285.00,   color:'oklch(0.62 0.12 150)', short:'$' },
];
const ACC = Object.fromEntries(ACCOUNTS.map(a => [a.id, a]));

/* ── Cartões de crédito ─────────────────────────────────────────────────── */
const CARDS = [
  { id:'nu-card', name:'Nubank Ultravioleta', brand:'Mastercard', last4:'4471', limit:12000,
    closeDay:28, dueDay:5, grad:'linear-gradient(135deg, oklch(0.42 0.16 300), oklch(0.30 0.10 290))' },
  { id:'itau-card', name:'Itaú Click', brand:'Visa', last4:'8820', limit:8000,
    closeDay:2, dueDay:10, grad:'linear-gradient(135deg, oklch(0.62 0.17 48), oklch(0.50 0.15 35))' },
];
const CARD = Object.fromEntries(CARDS.map(c => [c.id, c]));

/* ── Orçamentos do mês (limites por categoria) ──────────────────────────── */
const BUDGETS = [
  { catId:'mercado',     limit:1200 },
  { catId:'restaurante', limit:800 },
  { catId:'transporte',  limit:500 },
  { catId:'lazer',       limit:450 },
  { catId:'compras',     limit:600 },
  { catId:'saude',       limit:400 },
];

/* ── Assinaturas ────────────────────────────────────────────────────────── */
const SUBSCRIPTIONS = [
  { id:'netflix', name:'Netflix',      amount:55.90,  cycle:'mensal', nextDay:15, catId:'lazer',       color:'oklch(0.52 0.20 22)',  short:'N' },
  { id:'spotify', name:'Spotify',      amount:21.90,  cycle:'mensal', nextDay:12, catId:'lazer',       color:'oklch(0.62 0.16 150)', short:'S' },
  { id:'icloud',  name:'iCloud+',      amount:12.90,  cycle:'mensal', nextDay:20, catId:'assinaturas', color:'oklch(0.55 0.02 250)', short:'☁' },
  { id:'prime',   name:'Amazon Prime', amount:19.90,  cycle:'mensal', nextDay:24, catId:'compras',     color:'oklch(0.58 0.14 240)', short:'a' },
  { id:'chatgpt', name:'ChatGPT Plus', amount:107.00, cycle:'mensal', nextDay:18, catId:'educacao',    color:'oklch(0.55 0.08 175)', short:'AI' },
  { id:'academia',name:'Smart Fit',    amount:109.90, cycle:'mensal', nextDay:8,  catId:'saude',       color:'oklch(0.66 0.16 60)',  short:'SF' },
  { id:'notion',  name:'Notion',       amount:42.00,  cycle:'mensal', nextDay:28, catId:'educacao',    color:'oklch(0.45 0.02 60)',  short:'N' },
];

/* ── Empréstimos (pessoa a pessoa) ──────────────────────────────────────── */
const LOANS = [
  { id:'pedro', dir:'lent', person:'Pedro', total:2000, installments:4, paid:1, nextDay:15,
    note:'Emprestei pra reforma do apê dele.' },
  { id:'ana', dir:'lent', person:'Ana', total:600, installments:1, paid:0, nextDay:22,
    note:'Adiantei a parte dela da viagem.' },
  { id:'rafael', dir:'borrowed', person:'Rafael', total:900, installments:3, paid:1, nextDay:18,
    note:'Ele cobriu meu rolê quando o cartão travou.' },
];

/* ── Financiamentos (parcelados / crédito) ──────────────────────────────── */
const FINANCINGS = [
  { id:'notebook', person:'MacBook Pro', lender:'Itaú', total:6400, installments:12, paid:5, nextDay:10, rate:'2,1% a.m.',
    note:'Notebook parcelado no cartão Itaú.' },
  { id:'credito', person:'Crédito pessoal', lender:'Nubank', total:10000, installments:24, paid:8, nextDay:5, rate:'3,4% a.m.',
    note:'Capital de giro pro freela.' },
];

/* ── Gerador determinístico de transações (jan 1 → jun 8 de 2026) ───────── */
const MERCHANTS = {
  mercado:    ['Pão de Açúcar','Carrefour','Hortifruti','Mercado Dia','Zona Sul','St Marche','Oba Hortifruti'],
  restaurante:['iFood','Outback','Madero','Padaria Bella','Sushi Loko','Coco Bambu','Spoleto','Cafeteria Suplicy'],
  transporte: ['Uber','99 Pop','Posto Shell','Metrô SP','Estacionamento','99 Moto','Posto Ipiranga'],
  saude:      ['Drogasil','Drogaria SP','Consulta · Dr. Lima','Laboratório Fleury','Farmácia Pague Menos'],
  lazer:      ['Cinemark','Steam','Bar do Zé','Ingresso · Show','PlayStation Store','Boteco','Teatro'],
  compras:    ['Amazon','Shein','Renner','Magazine Luiza','Apple Store','Centauro','Zara','Mercado Livre'],
  educacao:   ['Alura','Udemy','Livraria Cultura','Coursera'],
  viagem:     ['Latam','Airbnb','Booking','123 Milhas','Decolar'],
  outros:     ['Pix enviado','Saque 24h','Presente','Doação','Tarifa bancária'],
};
const ESSENTIALS = {
  casa: [
    { day:10, merchant:'Aluguel', amount:2200, acct:'nubank' },
    { day:12, merchant:'Enel · Energia', amount:184.30, acct:'nubank' },
    { day:14, merchant:'Vivo Fibra', amount:129.90, acct:'itau' },
    { day:18, merchant:'Condomínio', amount:680, acct:'nubank' },
    { day:16, merchant:'Comgás', amount:74.20, acct:'itau' },
  ],
};

function buildTransactions() {
  let s = 20260608;
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 0xffffffff; };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const around = (base, spread) => Math.round((base + (rng() - 0.5) * 2 * spread) * 100) / 100;

  const txs = [];
  let uid = 1;
  const add = (date, type, catId, merchant, amount, source) => {
    txs.push({ id:'t' + (uid++), date, type, catId, merchant, amount: Math.max(1, amount), source });
  };

  const start = new Date('2026-01-01T00:00:00');
  const today = new Date(TODAY + 'T00:00:00');
  const expenseCats = ['mercado','restaurante','transporte','saude','lazer','compras','educacao','viagem','outros'];
  const weights =     [ 0.26,     0.22,         0.18,        0.06,   0.10,   0.10,     0.03,      0.02,    0.03];

  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const iso = new Date(d).toISOString().slice(0, 10);
    const dom = d.getDate();
    const wd = d.getDay();
    const month = d.getMonth();

    // renda fixa — salário dia 5
    if (dom === 5) add(iso, 'in', 'salario', 'Salário · Mensal', 8500, 'nubank');
    // freelas esporádicos
    if (rng() < 0.06) add(iso, 'in', 'freela', pick(['Projeto freelance','Consultoria','Job design']), around(2200, 1100), 'nubank');
    // dividendos
    if (dom === 20) add(iso, 'in', 'investimento', 'Dividendos · XP', around(230, 140), 'xp');
    // reembolso ocasional
    if (rng() < 0.03) add(iso, 'in', 'reembolso', pick(['Reembolso · trabalho','Estorno']), around(160, 110), 'itau');

    // contas fixas de moradia
    ESSENTIALS.casa.forEach(e => { if (dom === e.day) add(iso, 'out', 'casa', e.merchant, e.amount, e.acct); });

    // assinaturas debitadas
    SUBSCRIPTIONS.forEach(sub => { if (sub.nextDay === dom) add(iso, 'out', 'assinaturas', sub.name, sub.amount, 'nu-card'); });

    // gastos do dia a dia (mais nos fins de semana)
    const base = (wd === 0 || wd === 6) ? 2.4 : 1.5;
    const n = Math.floor(rng() * base) + (rng() < 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      // sorteia categoria por peso
      let r = rng(), acc = 0, catId = 'mercado';
      for (let k = 0; k < expenseCats.length; k++) { acc += weights[k]; if (r <= acc) { catId = expenseCats[k]; break; } }
      const merchant = pick(MERCHANTS[catId] || ['Diversos']);
      const ranges = {
        mercado:[120,90], restaurante:[55,40], transporte:[28,22], saude:[90,70],
        lazer:[70,55], compras:[180,150], educacao:[60,40], viagem:[480,360], outros:[80,70],
      };
      const [b, sp] = ranges[catId] || [60, 40];
      const amount = around(b, sp);
      // fonte: ~60% cartão de crédito, resto débito/conta
      const source = rng() < 0.6 ? (rng() < 0.7 ? 'nu-card' : 'itau-card') : (rng() < 0.7 ? 'nubank' : (rng() < 0.5 ? 'itau' : 'carteira'));
      add(iso, 'out', catId, merchant, amount, source);
    }
  }
  // mais recente primeiro
  return txs.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
const TRANSACTIONS = buildTransactions();

/* ── Meses disponíveis ──────────────────────────────────────────────────── */
const MONTH_NAMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MONTH_ABBR  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHS = (() => {
  const set = new Set(TRANSACTIONS.map(t => t.date.slice(0, 7)));
  return [...set].sort();
})();

/* ── helpers ────────────────────────────────────────────────────────────── */
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} de ${y}`;
}
function txInMonth(key) { return TRANSACTIONS.filter(t => t.date.startsWith(key)); }
function sourceName(id) { return ACC[id]?.name || CARD[id]?.name || id; }
function sourceIsCard(id) { return !!CARD[id]; }

/* fmt BRL sem símbolo: 1.234,56 */
function fmtBRL(v, opts = {}) {
  const n = Math.abs(Number(v) || 0);
  const s = n.toLocaleString('pt-BR', { minimumFractionDigits: opts.cents === false ? 0 : 2, maximumFractionDigits: opts.cents === false ? 0 : 2 });
  return s;
}
/* fmt compacto: 8,5k */
function fmtK(v) {
  const n = Math.abs(Number(v) || 0);
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return Math.round(n).toString();
}

/* ── Estatísticas de um mês ─────────────────────────────────────────────── */
function monthStats(key) {
  const list = txInMonth(key);
  let income = 0, expense = 0;
  const byCat = {};
  const [y, m] = key.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const daily = Array(daysInMonth).fill(0);   // gasto por dia

  list.forEach(t => {
    if (t.type === 'in') income += t.amount;
    else {
      expense += t.amount;
      byCat[t.catId] = (byCat[t.catId] || 0) + t.amount;
      const day = Number(t.date.slice(8, 10)) - 1;
      daily[day] += t.amount;
    }
  });
  const cats = Object.entries(byCat)
    .map(([id, total]) => ({ id, total, cat: CAT[id] }))
    .sort((a, b) => b.total - a.total);
  return { income, expense, net: income - expense, byCat, cats, daily, count: list.length };
}

/* ── Série de fluxo de caixa mensal (todos os meses) ────────────────────── */
const CASHFLOW = MONTHS.map(key => {
  const st = monthStats(key);
  return { key, m: Number(key.split('-')[1]) - 1, in: st.income, out: st.expense, net: st.net };
});

/* ── Patrimônio / saldos ────────────────────────────────────────────────── */
const NET_WORTH = ACCOUNTS.reduce((a, x) => a + x.balance, 0);
const LIQUID = ACCOUNTS.filter(a => a.kind !== 'Investimentos').reduce((a, x) => a + x.balance, 0);

/* ── Fatura atual de cada cartão (mês corrente) ─────────────────────────── */
function cardInvoice(cardId, key = TODAY.slice(0, 7)) {
  return txInMonth(key).filter(t => t.source === cardId && t.type === 'out')
    .reduce((a, t) => a + t.amount, 0);
}

function recomputeWorth() {
  window.NET_WORTH = ACCOUNTS.reduce((a, x) => a + x.balance, 0);
  window.LIQUID = ACCOUNTS.filter(a => a.kind !== 'Investimentos').reduce((a, x) => a + x.balance, 0);
}

Object.assign(window, {
  TODAY, CATEGORIES, CAT, ACCOUNTS, ACC, CARDS, CARD, BUDGETS, SUBSCRIPTIONS, LOANS, FINANCINGS,
  TRANSACTIONS, MONTHS, MONTH_NAMES, MONTH_ABBR, monthKey, monthLabel, txInMonth,
  sourceName, sourceIsCard, fmtBRL, fmtK, monthStats, CASHFLOW, NET_WORTH, LIQUID, cardInvoice, recomputeWorth,
});
