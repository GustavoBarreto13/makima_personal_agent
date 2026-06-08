/* ─────────────────────────────────────────────────────────────────────────
   Frieren · Livros — dados do mock
   Acervo de leitura (fantasia / ficção científica / literatura), estantes,
   diário de leitura (atividade) e séries derivadas para os gráficos.
   ───────────────────────────────────────────────────────────────────────── */

/* Paletas de capa — tons sóbrios e coesos (lombadas de livro).
   Cada uma: bg (campo), ink (texto), edge (filete). */
const COVER = {
  sand:   { bg: 'oklch(0.74 0.072 80)',  ink: 'oklch(0.27 0.04 60)',  edge: 'oklch(0.84 0.06 84)' },
  teal:   { bg: 'oklch(0.50 0.072 200)', ink: 'oklch(0.95 0.02 200)', edge: 'oklch(0.66 0.07 196)' },
  slate:  { bg: 'oklch(0.43 0.035 250)', ink: 'oklch(0.93 0.015 250)',edge: 'oklch(0.58 0.04 250)' },
  sage:   { bg: 'oklch(0.62 0.055 150)', ink: 'oklch(0.24 0.04 150)', edge: 'oklch(0.76 0.05 150)' },
  rose:   { bg: 'oklch(0.58 0.085 18)',  ink: 'oklch(0.96 0.02 30)',  edge: 'oklch(0.72 0.08 22)' },
  plum:   { bg: 'oklch(0.42 0.075 320)', ink: 'oklch(0.94 0.02 320)', edge: 'oklch(0.58 0.07 320)' },
  indigo: { bg: 'oklch(0.40 0.082 270)', ink: 'oklch(0.93 0.02 270)', edge: 'oklch(0.56 0.08 268)' },
  clay:   { bg: 'oklch(0.56 0.085 45)',  ink: 'oklch(0.97 0.02 60)',  edge: 'oklch(0.70 0.08 48)' },
  fog:    { bg: 'oklch(0.80 0.018 230)', ink: 'oklch(0.34 0.03 250)', edge: 'oklch(0.88 0.015 230)' },
  forest: { bg: 'oklch(0.38 0.055 165)', ink: 'oklch(0.92 0.03 150)', edge: 'oklch(0.54 0.06 160)' },
  ink:    { bg: 'oklch(0.30 0.018 250)', ink: 'oklch(0.90 0.015 250)',edge: 'oklch(0.46 0.02 250)' },
  amber:  { bg: 'oklch(0.66 0.105 65)',  ink: 'oklch(0.26 0.05 50)',  edge: 'oklch(0.80 0.09 68)' },
};

/* status: 'reading' | 'read' | 'owned' | 'wishlist'
   owned = já tenho, ainda não li (TBR pile)
   wishlist = quero comprar (guarda storeLink)
   progress só importa quando reading; rating só quando há nota */
const BOOKS = [
  { id:'duna', title:'Duna', author:'Frank Herbert', year:1965, pages:680, genre:'Ficção científica',
    status:'read', rating:4.5, finished:'2026-01-19', cover:'sand', shelves:['space','reler','ano-2026'],
    review:'Política, ecologia e messianismo numa engrenagem perfeita. Reli o apêndice duas vezes só pelo prazer do mundo.' },
  { id:'nome-do-vento', title:'O Nome do Vento', author:'Patrick Rothfuss', year:2007, pages:656, genre:'Fantasia',
    status:'reading', progress:0.62, page:407, started:'2026-05-21', cover:'teal', shelves:['fantasia-epica'],
    review:null },
  { id:'mao-esquerda', title:'A Mão Esquerda da Escuridão', author:'Ursula K. Le Guin', year:1969, pages:336, genre:'Ficção científica',
    status:'read', rating:5, finished:'2026-02-08', cover:'fog', shelves:['space','reler','ano-2026'],
    review:'Le Guin escreve gelo e gênero com a mesma frieza precisa. O melhor livro que li esse ano.' },
  { id:'kafka', title:'Kafka à Beira-Mar', author:'Haruki Murakami', year:2002, pages:608, genre:'Literatura',
    status:'read', rating:4, finished:'2026-03-02', cover:'indigo', shelves:['ano-2026','devagar'],
    review:'Gatos que falam, peixes que caem do céu. Não tento entender — deixo o sonho me levar.' },
  { id:'lotr', title:'O Senhor dos Anéis', author:'J.R.R. Tolkien', year:1954, pages:1216, genre:'Fantasia',
    status:'read', rating:5, finished:'2026-04-14', cover:'forest', shelves:['fantasia-epica','reler'],
    review:'Releitura anual. Sempre choro em Cormallen, sempre.' },
  { id:'neuromancer', title:'Neuromancer', author:'William Gibson', year:1984, pages:288, genre:'Ficção científica',
    status:'wishlist', cover:'plum', shelves:['space'], review:null },
  { id:'sangue-frio', title:'A Sangue Frio', author:'Truman Capote', year:1966, pages:384, genre:'Não-ficção',
    status:'read', rating:4, finished:'2026-02-25', cover:'ink', shelves:['ano-2026'],
    review:'Romance de não-ficção que inaugura um gênero. Gélido e impecável.' },
  { id:'conto-aia', title:'O Conto da Aia', author:'Margaret Atwood', year:1985, pages:368, genre:'Ficção científica',
    status:'read', rating:4.5, finished:'2026-01-30', cover:'rose', shelves:['ano-2026'],
    review:'Nolite te bastardes carborundorum. Mais urgente a cada releitura.' },
  { id:'solaris', title:'Solaris', author:'Stanisław Lem', year:1961, pages:224, genre:'Ficção científica',
    status:'reading', progress:0.28, page:63, started:'2026-06-02', cover:'slate', shelves:['space','devagar'],
    review:null },
  { id:'cem-anos', title:'Cem Anos de Solidão', author:'Gabriel García Márquez', year:1967, pages:432, genre:'Literatura',
    status:'read', rating:5, finished:'2026-03-21', cover:'amber', shelves:['reler','ano-2026'],
    review:'Macondo me arruina e me reconstrói. Realismo mágico no auge absoluto.' },
  { id:'guerra-tronos', title:'A Guerra dos Tronos', author:'George R. R. Martin', year:1996, pages:592, genre:'Fantasia',
    status:'read', rating:4, finished:'2026-05-02', cover:'clay', shelves:['fantasia-epica','ano-2026'],
    review:'Nenhum personagem está a salvo, e é por isso que eu não consigo parar.' },
  { id:'fundacao', title:'Fundação', author:'Isaac Asimov', year:1951, pages:255, genre:'Ficção científica',
    status:'owned', cover:'sand', shelves:['space'], review:null },
  { id:'klara', title:'Klara e o Sol', author:'Kazuo Ishiguro', year:2021, pages:320, genre:'Literatura',
    status:'read', rating:4.5, finished:'2026-04-28', cover:'fog', shelves:['ano-2026','devagar'],
    review:'A ternura de uma máquina que aprende a esperança. Ishiguro nunca erra o tom.' },
  { id:'roda-tempo', title:'O Olho do Mundo', author:'Robert Jordan', year:1990, pages:800, genre:'Fantasia',
    status:'reading', progress:0.12, page:96, started:'2026-06-05', cover:'sage', shelves:['fantasia-epica'],
    review:null },
  { id:'norwegian', title:'Norwegian Wood', author:'Haruki Murakami', year:1987, pages:296, genre:'Literatura',
    status:'read', rating:4, finished:'2026-02-14', cover:'forest', shelves:['devagar'],
    review:'Melancolia que gruda na pele. A trilha sonora dos Beatles toca o livro inteiro.' },
  { id:'hobbit', title:'O Hobbit', author:'J.R.R. Tolkien', year:1937, pages:310, genre:'Fantasia',
    status:'read', rating:4.5, finished:'2026-01-08', cover:'sage', shelves:['fantasia-epica','reler','ano-2026'],
    review:'O começo de tudo. Conforto em forma de livro.' },
  { id:'piranesi', title:'Piranesi', author:'Susanna Clarke', year:2020, pages:272, genre:'Fantasia',
    status:'read', rating:5, finished:'2026-05-26', cover:'teal', shelves:['reler','ano-2026','devagar'],
    review:'A Beleza da Casa é imensurável; sua Bondade, infinita. Um livro que parece um sussurro.' },
  { id:'estrada', title:'A Estrada', author:'Cormac McCarthy', year:2006, pages:256, genre:'Literatura',
    status:'read', rating:4.5, finished:'2026-03-30', cover:'ink', shelves:['ano-2026'],
    review:'Carregar o fogo. Devastador e tão tenro quanto devastador.' },
  { id:'tres-corpos', title:'O Problema dos Três Corpos', author:'Liu Cixin', year:2008, pages:424, genre:'Ficção científica',
    status:'wishlist', cover:'slate', shelves:['space'], review:null },
  { id:'mervyn', title:'Titus Groan', author:'Mervyn Peake', year:1946, pages:512, genre:'Fantasia',
    status:'owned', cover:'plum', shelves:['fantasia-epica','devagar'], review:null },
];

const SHELVES = [
  { id:'fantasia-epica', name:'Fantasia épica', accent:'oklch(0.58 0.06 160)',
    desc:'Mundos imensos para se perder por mil páginas.' },
  { id:'space', name:'Distâncias siderais', accent:'oklch(0.52 0.07 250)',
    desc:'Ficção científica — do deserto de Arrakis ao oceano pensante de Solaris.' },
  { id:'reler', name:'Reler algum dia', accent:'oklch(0.62 0.09 60)',
    desc:'Os que pedem uma segunda visita. Memória é coisa que se cultiva.' },
  { id:'ano-2026', name:'Lidos em 2026', accent:'oklch(0.58 0.085 195)',
    desc:'O diário do ano, capa a capa.' },
  { id:'devagar', name:'Para ler devagar', accent:'oklch(0.55 0.07 320)',
    desc:'Livros que não se deve apressar. Um capítulo por noite basta.' },
];

/* Diário de leitura — mais recente primeiro.
   type: 'progress' | 'finished' | 'started' | 'review' */
const ACTIVITY = [
  { id:'a1', date:'2026-06-08', bookId:'nome-do-vento', type:'progress', pages:38, page:407,
    note:'A história da Universidade finalmente engatou. Kvothe é insuportável e eu adoro.' },
  { id:'a2', date:'2026-06-08', bookId:'solaris', type:'progress', pages:21, page:63, note:null },
  { id:'a3', date:'2026-06-07', bookId:'roda-tempo', type:'started', page:0,
    note:'Comecei a Roda do Tempo. Quatorze volumes pela frente — sem pressa.' },
  { id:'a4', date:'2026-06-06', bookId:'nome-do-vento', type:'progress', pages:44, page:369, note:null },
  { id:'a5', date:'2026-06-05', bookId:'solaris', type:'progress', pages:18, page:42,
    note:'O planeta como personagem. Lem antecipou tudo.' },
  { id:'a6', date:'2026-06-03', bookId:'nome-do-vento', type:'progress', pages:52, page:325, note:null },
  { id:'a7', date:'2026-05-26', bookId:'piranesi', type:'finished', rating:5,
    note:'Terminei e fiquei em silêncio uns minutos. Os Mortos me são preciosos.' },
  { id:'a8', date:'2026-05-24', bookId:'piranesi', type:'progress', pages:71, page:240, note:null },
  { id:'a9', date:'2026-05-22', bookId:'piranesi', type:'progress', pages:96, page:169, note:null },
  { id:'a10', date:'2026-05-21', bookId:'nome-do-vento', type:'started', page:0, note:'Reler antes do terceiro livro (que talvez nunca venha).' },
  { id:'a11', date:'2026-05-02', bookId:'guerra-tronos', type:'finished', rating:4, note:null },
  { id:'a12', date:'2026-04-28', bookId:'klara', type:'finished', rating:4.5,
    note:'A esperança de uma máquina é a coisa mais humana do livro.' },
];

/* ── Heatmap de páginas/dia (ano corrente, determinístico) ──────────────── */
function buildHeatmap() {
  let s = 20260608;
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 0xffffffff; };
  const days = [];
  const start = new Date('2026-01-01T00:00:00');
  const today = new Date('2026-06-08T00:00:00');
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const r = rng();
    // leitor consistente: ~70% dos dias com leitura, picos nos fins de semana
    const wd = d.getDay();
    const weekendBoost = (wd === 0 || wd === 6) ? 1.4 : 1;
    const read = r < 0.72;
    const pages = read ? Math.round((6 + rng() * 64) * weekendBoost) : 0;
    days.push({ date: new Date(d).toISOString().slice(0, 10), pages });
  }
  return days;
}
const HEATMAP = buildHeatmap();

/* ── Séries derivadas para Início e Estatísticas ────────────────────────── */
const STATS = (() => {
  const read = BOOKS.filter(b => b.status === 'read');
  const totalPages = HEATMAP.reduce((a, d) => a + d.pages, 0);
  const ratings = read.filter(b => b.rating).map(b => b.rating);
  const avgRating = ratings.reduce((a, r) => a + r, 0) / ratings.length;

  // páginas por mês (jan–jun)
  const monthly = Array(12).fill(0);
  HEATMAP.forEach(d => { monthly[new Date(d.date + 'T00:00:00').getMonth()] += d.pages; });

  // sequência (streak) — maior corrida de dias com leitura terminando hoje
  let cur = 0, best = 0;
  HEATMAP.forEach(d => { if (d.pages > 0) { cur++; best = Math.max(best, cur); } else cur = 0; });
  let streak = 0;
  for (let i = HEATMAP.length - 1; i >= 0; i--) { if (HEATMAP[i].pages > 0) streak++; else break; }

  // gênero favorito
  const byGenre = {};
  read.forEach(b => { byGenre[b.genre] = (byGenre[b.genre] || 0) + 1; });
  const topGenre = Object.entries(byGenre).sort((a, b) => b[1] - a[1])[0];

  // autor favorito (por nº de livros lidos)
  const byAuthor = {};
  read.forEach(b => { byAuthor[b.author] = (byAuthor[b.author] || 0) + 1; });
  const topAuthor = Object.entries(byAuthor).sort((a, b) => b[1] - a[1])[0];

  // distribuição de notas (3, 3.5, 4, 4.5, 5)
  const dist = { '3': 0, '3.5': 0, '4': 0, '4.5': 0, '5': 0 };
  ratings.forEach(r => { const k = String(r); if (k in dist) dist[k]++; });

  return {
    booksRead: read.length, totalPages, avgRating, monthly, streak, bestStreak: best,
    topGenre, topAuthor, dist, byGenre,
  };
})();

/* helpers */
function bookById(id) { return BOOKS.find(b => b.id === id); }
function pagesInLast(nDays) {
  const slice = HEATMAP.slice(-nDays);
  const sum = slice.reduce((a, d) => a + d.pages, 0);
  return { sum, avg: Math.round(sum / nDays) };
}

Object.assign(window, { COVER, BOOKS, SHELVES, ACTIVITY, HEATMAP, STATS, bookById, pagesInLast });
