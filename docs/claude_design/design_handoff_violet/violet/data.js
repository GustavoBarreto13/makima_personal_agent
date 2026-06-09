/* ─────────────────────────────────────────────────────────────────────────
   Violet · Diário — dados
   Entradas diárias (bullet journal). As coleções (Sonhos, Destaques, Ideias,
   Sabedoria, Notas) e os agregados (Tags, Pessoas) derivam dos bullets.
   "Hoje" = 8 de junho de 2026 (segunda), entrada nº 132.
   ───────────────────────────────────────────────────────────────────────── */

const TODAY = '2026-06-08';
const YEAR = 2026;

/* kinds de bullet:
   bullet (•) · highlight (♥) · dream (lua) · idea (lâmpada) · wisdom (gema) · note (alfinete) */

const ENTRIES = [
  {
    num: 132, date: '2026-06-08',
    dream: 'Estava numa estação de trem que não terminava nunca. Procurava uma carta que tinha esquecido de enviar — e o trem partia sem mim, calmo, sem pressa.',
    bullets: [
      { kind: 'bullet', time: '08:40', text: 'Acordei antes do alarme. Manhã fria e clara — abri a janela e fiquei um tempo só ouvindo a rua acordar antes de tocar em qualquer tela.' },
      { kind: 'bullet', time: '10:15', text: 'Fechei o corpus do agente @Kurisu no Vertex AI. O vault do #Obsidian inteiro indexado — 1.840 notas. Demorou, mas o caminho ficou limpo.' },
      { kind: 'highlight', time: '13:02', text: 'Almoço com @Pedro. Ele contou que vai pedir a @Mari em casamento em agosto e me pediu pra ajudar a escrever o que vai dizer. Fiquei honrado — e sem palavras, ironicamente.' },
      { kind: 'idea', time: '15:20', text: 'E se cada agente da Makima tivesse um "tom" próprio de escrita? A Violet escreveria o diário como cartas; a Nami, como extratos secos. A personalidade mora na voz, não só no ícone.' },
      { kind: 'bullet', time: '17:45', text: 'Treino #corrida — 6 km no parque. Pernas pesadas no começo, leves no fim. #saúde' },
      { kind: 'wisdom', time: '21:30', text: 'Escrever não é guardar o dia. É descobrir o que o dia significou depois que ele já passou.' },
    ],
  },
  {
    num: 131, date: '2026-06-07',
    dream: null,
    bullets: [
      { kind: 'bullet', time: '09:30', text: 'Domingo lento. Café demorado, li mais um capítulo de #Duna antes de abrir o computador.' },
      { kind: 'bullet', time: '12:48', text: 'Liguei pra @Ana — ela confirmou Portugal em agosto e me convidou. Preciso fechar o financeiro antes de dizer sim, mas o coração já disse.' },
      { kind: 'highlight', time: '16:10', text: 'Terminei #Frieren. O último episódio me pegou de jeito — uma história inteira sobre o que sobra de alguém depois que as palavras já foram ditas.' },
      { kind: 'idea', time: '19:22', text: 'Adicionar um modo "carta" no diário: a entrada do dia vira uma carta endereçada a alguém. Talvez a você mesmo de daqui a um ano.' },
      { kind: 'note', time: '22:05', text: 'Renovar o passaporte antes de julho. Validade vence em outubro. @Ana' },
    ],
  },
  {
    num: 130, date: '2026-06-06',
    dream: 'Sonhei que recebia uma carta com a minha própria letra, mas não lembrava de ter escrito. Era sobre algo que ainda não tinha acontecido.',
    bullets: [
      { kind: 'bullet', time: '08:15', text: 'Sábado de manutenção: limpei o backlog do #código e arrumei o repositório da Makima. Tarefa chata, mente leve depois.' },
      { kind: 'bullet', time: '11:40', text: 'Café da manhã com @Rafael. Falamos do projeto de #saúde dele — tem uma janela real de mercado, e ele finalmente parece acreditar nisso.' },
      { kind: 'wisdom', time: '18:50', text: 'Frieren me ensinou que registrar é uma forma de não deixar as pessoas sumirem duas vezes.' },
      { kind: 'highlight', time: '20:30', text: 'Jantar em casa, vinho, janela aberta. Um daqueles dias comuns que daqui a anos eu vou sentir falta sem saber explicar por quê.' },
    ],
  },
  {
    num: 129, date: '2026-06-05',
    dream: null,
    bullets: [
      { kind: 'bullet', time: '09:00', text: 'Deploy da #Nami em produção — finanças rodando com dados reais. Primeira vez que um agente sai do protótipo.' },
      { kind: 'idea', time: '14:30', text: 'Insights deveria abrir com uma frase, não com um número. A pessoa quer se reconhecer antes de se medir.' },
      { kind: 'bullet', time: '16:15', text: 'Reunião com @Lucas sobre infra. Vertex aguenta o tranco; o gargalo é o meu tempo, não a máquina.' },
      { kind: 'bullet', time: '19:40', text: 'Treino #musculação rápido, 40 min. #saúde' },
    ],
  },
  {
    num: 128, date: '2026-06-04',
    dream: 'Uma casa cheia de gavetas. Cada gaveta era um dia da minha vida, e eu podia reabrir qualquer uma. Acordei querendo organizar as minhas.',
    bullets: [
      { kind: 'highlight', time: '11:20', text: 'A interface da #Frieren-livros ficou linda. @Pedro disse que "parece um livro de verdade". Foi o melhor elogio possível.' },
      { kind: 'bullet', time: '15:00', text: 'Estudei chunking por parágrafo pra #RAG. Funciona muito melhor que cortar por número fixo de caracteres pras notas do #Obsidian.' },
      { kind: 'wisdom', time: '22:10', text: 'Toda ferramenta que construímos é, no fundo, um pedido: lembre de mim, me entenda, não me esqueça.' },
    ],
  },
  {
    num: 127, date: '2026-06-03',
    dream: null,
    bullets: [
      { kind: 'bullet', time: '08:50', text: 'Manhã produtiva no #código. Refatorei o roteador dos agentes — três horas que valeram por uma semana.' },
      { kind: 'idea', time: '13:15', text: 'Cada personagem-agente podia ter uma "paleta" tirada do próprio visual. A Violet: safira dos olhos, ouro do cabelo, esmeralda do broche.' },
      { kind: 'bullet', time: '18:00', text: 'Caminhada longa com @Ana depois do trabalho. Conversa boa, sem celular. #saúde' },
    ],
  },
  {
    num: 125, date: '2026-06-01',
    dream: 'Voava baixo sobre um campo de trigo dourado, devagar, como se o ar fosse água. Não tinha medo nenhum.',
    bullets: [
      { kind: 'highlight', time: '10:00', text: 'Primeiro dia de junho. Sentei e escrevi as metas do mês de verdade, à mão, num caderno. #planejamento' },
      { kind: 'bullet', time: '14:45', text: 'Comecei #Duna de novo, agora com calma. É outro livro quando você não tem pressa de terminar.' },
      { kind: 'note', time: '20:00', text: 'Comprar presente de aniversário da @Mari — dia 20. Algo de cerâmica, ela ama.' },
    ],
  },
  {
    num: 122, date: '2026-05-28',
    dream: null,
    bullets: [
      { kind: 'bullet', time: '09:20', text: 'Defini a arquitetura final da Makima: cada vida vira um agente, cada agente vira um personagem. #código' },
      { kind: 'wisdom', time: '21:00', text: 'A gente não escreve pra lembrar do que aconteceu. Escreve pra perceber quem a gente estava sendo.' },
      { kind: 'bullet', time: '17:30', text: 'Treino #corrida 5 km. #saúde' },
    ],
  },
  {
    num: 118, date: '2026-05-22',
    dream: 'Recebia visitas de pessoas que não via há anos. Cada uma deixava uma carta na mesa e ia embora sem falar.',
    bullets: [
      { kind: 'highlight', time: '19:00', text: 'Jantar com @Pedro, @Ana e @Rafael. A primeira vez que os três se conheceram — e funcionou. Noite rara.' },
      { kind: 'idea', time: '23:10', text: 'Modo "foco" pro diário: só a página em branco, sem menu, sem nada. A folha pedindo a tinta.' },
    ],
  },
  {
    num: 112, date: '2026-05-14',
    dream: null,
    bullets: [
      { kind: 'bullet', time: '10:30', text: 'Estudei tipografia editorial a tarde toda. Newsreader pra serifa, DM Sans pro corpo. #design' },
      { kind: 'wisdom', time: '20:40', text: 'Beleza não é enfeite. É respeito pelo tempo de quem vai olhar.' },
    ],
  },
  {
    num: 104, date: '2026-05-03',
    dream: 'Andava por uma biblioteca sem teto, sob a chuva, e nenhum livro molhava.',
    bullets: [
      { kind: 'highlight', time: '15:20', text: 'Terminei o protótipo da #Frieren. Senti aquele orgulho quieto de quando uma ideia finalmente fica de pé sozinha.' },
      { kind: 'bullet', time: '18:00', text: 'Corrida no fim de tarde, sol baixo. #corrida #saúde' },
    ],
  },
  {
    num: 96, date: '2026-04-21',
    dream: null,
    bullets: [
      { kind: 'idea', time: '11:00', text: 'E se o diário tivesse "insights" que parecem escritos por alguém que te conhece, não por uma planilha?' },
      { kind: 'bullet', time: '16:45', text: 'Li sobre embeddings a tarde toda. #RAG #estudo' },
    ],
  },
  {
    num: 84, date: '2026-04-02',
    dream: 'Escrevia uma carta que se traduzia sozinha em todas as línguas enquanto eu escrevia.',
    bullets: [
      { kind: 'wisdom', time: '22:30', text: 'Quem aprende a nomear o que sente, sente com mais clareza. A palavra não descreve a emoção — ela a termina.' },
      { kind: 'highlight', time: '13:00', text: 'Comecei a Makima de verdade hoje. Primeira linha de código de um projeto que eu sei que vai durar.' },
    ],
  },
  {
    num: 71, date: '2026-03-12',
    dream: null,
    bullets: [
      { kind: 'bullet', time: '09:45', text: 'Manhã de leitura pura. #Duna, café, silêncio. #leitura' },
      { kind: 'note', time: '19:00', text: 'Marcar consulta com a dentista. Adiando há um mês.' },
    ],
  },
];

/* ── agregação de coleções a partir dos bullets ─────────────────────────── */
function _flatBullets() {
  const out = [];
  ENTRIES.forEach(e => e.bullets.forEach((b, i) => out.push({ ...b, entryNum: e.num, date: e.date, idx: i })));
  return out;
}
const ALL_BULLETS = _flatBullets();

const DREAMS = ENTRIES.filter(e => e.dream).map(e => ({ text: e.dream, date: e.date, entryNum: e.num }));
const HIGHLIGHTS = ALL_BULLETS.filter(b => b.kind === 'highlight');
const IDEAS = ALL_BULLETS.filter(b => b.kind === 'idea');
const WISDOM = ALL_BULLETS.filter(b => b.kind === 'wisdom');
const NOTES = ALL_BULLETS.filter(b => b.kind === 'note');

/* ── tags e pessoas (tokens inline) ─────────────────────────────────────── */
function _aggregate(re) {
  const map = {};
  ALL_BULLETS.forEach(b => {
    const found = b.text.match(re) || [];
    found.forEach(tok => {
      const key = tok;
      if (!map[key]) map[key] = { token: key, count: 0, last: b.date, dates: [] };
      map[key].count++;
      map[key].dates.push(b.date);
      if (b.date > map[key].last) map[key].last = b.date;
    });
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
}
const TAGS = _aggregate(/#[\wÀ-ÿ-]+/g);
const PEOPLE = _aggregate(/@[\wÀ-ÿ]+/g);

/* ── heatmap do ano: série de palavras/dia determinística ──────────────── */
function _buildHeatmap() {
  const out = [];
  let s = 20260608;
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return ((s >>> 0) / 0xffffffff); };
  const start = new Date(YEAR + '-01-01T00:00:00');
  const todayD = new Date(TODAY + 'T00:00:00');
  for (let d = new Date(start); d <= todayD; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const month = d.getMonth();              // ramp-up: mais constância no meio do ano
    const ramp = 0.18 + (month / 11) * 0.5;
    const wrote = rng() < ramp;
    let words = 0;
    if (wrote) words = Math.round(40 + rng() * (90 + month * 22));
    out.push({ date: iso, words });
  }
  // garante que os dias com entradas reais contem
  ENTRIES.forEach(e => {
    const hit = out.find(o => o.date === e.date);
    const w = e.bullets.reduce((a, b) => a + b.text.split(/\s+/).length, 0) + (e.dream ? e.dream.split(/\s+/).length : 0);
    if (hit) hit.words = Math.max(hit.words, w);
  });
  return out;
}
const HEATMAP = _buildHeatmap();

/* ── estatísticas derivadas ─────────────────────────────────────────────── */
const STATS = (() => {
  const daysWritten = HEATMAP.filter(d => d.words > 0).length;
  const totalWords = HEATMAP.reduce((a, d) => a + d.words, 0);
  const totalBullets = ALL_BULLETS.length * 9 + 4;     // escalado p/ o ano
  const elapsed = HEATMAP.length;
  return {
    entries: 132,
    bullets: 348,
    daysWritten,
    totalWords,
    perDay: Math.round(totalWords / Math.max(1, daysWritten)),
    highlights: 11,
    tags: 54,
    mentions: 96,
    dreams: 38,
    highlightRate: 8,         // %
    freqPerWeek: 3.4,
    bulletRate: 2.6,
    longestStreak: 14,
    currentStreak: 5,
  };
})();

/* contagem mensal de palavras p/ o gráfico de área */
const WORDS_BY_MONTH = (() => {
  const m = Array(12).fill(0);
  HEATMAP.forEach(d => { m[new Date(d.date + 'T00:00:00').getMonth()] += d.words; });
  return m;
})();

/* distribuição por hora do dia (a partir dos times dos bullets, escalado) */
const DAYTIME = (() => {
  const buckets = Array(12).fill(0);   // 0,2,4,...22h
  ALL_BULLETS.forEach(b => {
    const h = parseInt(b.time.split(':')[0], 10);
    buckets[Math.floor(h / 2)] += 1;
  });
  // suaviza/escala
  return buckets.map((v, i) => v * 7 + (i >= 4 && i <= 11 ? 6 : 1));
})();

/* prompts de reflexão (Reflect) */
const REFLECT_PROMPTS = [
  { q: 'O que você sentiu hoje que não conseguiu dizer a ninguém?', by: 'Violet' },
  { q: 'Qual pequena coisa de hoje você gostaria de poder reviver?', by: 'Violet' },
  { q: 'Por quem você foi grato hoje — e essa pessoa sabe disso?', by: 'Violet' },
  { q: 'Se o dia de hoje fosse uma carta, para quem você a enviaria?', by: 'Violet' },
];

/* prompts de sonho (cabeçalho do Write) */
const DREAM_PROMPTS = [
  'Com o que você sonhou?',
  'O que a noite te mostrou?',
  'Sobrou alguma imagem do sonho?',
];

Object.assign(window, {
  TODAY, YEAR, ENTRIES, ALL_BULLETS,
  DREAMS, HIGHLIGHTS, IDEAS, WISDOM, NOTES, TAGS, PEOPLE,
  HEATMAP, STATS, WORDS_BY_MONTH, DAYTIME, REFLECT_PROMPTS, DREAM_PROMPTS,
});
