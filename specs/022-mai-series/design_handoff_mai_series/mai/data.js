/* ─────────────────────────────────────────────────────────────────────────
   Mai · Séries — dados do mock
   O ACERVO (SERIES) é a lista de séries; cada uma tem TEMPORADAS (seasons),
   e o progresso é contado por episódio dentro da temporada (T2E5 / N eps).
   O DIÁRIO (LOGS) é o registro cronológico de sessões — cada bloco de
   episódios assistido, com data, temporada, eps, nota e review.
   Escala 0.5–5.0 (Letterboxd, meia estrela). Voz da Mai Sakurajima (ficção):
   serena, elegante, de humor seco e afeto contido. 🐰
   ───────────────────────────────────────────────────────────────────────── */

const TODAY = '2026-06-13';

/* Paletas de pôster — campos dusk elegantes (camarim ao entardecer).
   Menos saturadas que as da Marin; azul-violeta, âmbar, ardósia, vinho. */
const POSTER = {
  periwinkle: { a:'oklch(0.42 0.13 270)', b:'oklch(0.22 0.07 280)', ink:'oklch(0.96 0.02 270)' },
  dusk:       { a:'oklch(0.38 0.10 290)', b:'oklch(0.20 0.06 295)', ink:'oklch(0.95 0.02 290)' },
  amber:      { a:'oklch(0.48 0.11 62)',  b:'oklch(0.24 0.07 48)',  ink:'oklch(0.97 0.03 70)'  },
  slate:      { a:'oklch(0.40 0.05 250)', b:'oklch(0.21 0.03 255)', ink:'oklch(0.95 0.01 250)' },
  wine:       { a:'oklch(0.40 0.13 12)',  b:'oklch(0.22 0.08 8)',   ink:'oklch(0.96 0.02 14)'  },
  teal:       { a:'oklch(0.42 0.08 200)', b:'oklch(0.22 0.05 210)', ink:'oklch(0.95 0.02 200)' },
  moss:       { a:'oklch(0.42 0.08 150)', b:'oklch(0.22 0.05 160)', ink:'oklch(0.95 0.02 150)' },
  rose:       { a:'oklch(0.46 0.11 350)', b:'oklch(0.24 0.07 345)', ink:'oklch(0.96 0.02 350)' },
  indigo:     { a:'oklch(0.36 0.12 285)', b:'oklch(0.19 0.07 290)', ink:'oklch(0.95 0.02 285)' },
  sand:       { a:'oklch(0.50 0.07 78)',  b:'oklch(0.27 0.05 64)',  ink:'oklch(0.97 0.02 80)'  },
  steel:      { a:'oklch(0.44 0.04 235)', b:'oklch(0.23 0.03 240)', ink:'oklch(0.95 0.01 235)' },
  plum:       { a:'oklch(0.38 0.12 320)', b:'oklch(0.21 0.07 318)', ink:'oklch(0.96 0.02 320)' },
};

/* status: assistindo | concluida | quero_assistir | pausada | abandonada
   score: 0.5–5.0 em passos de 0.5 (Letterboxd) | null. fav = coração.
   seasons[]: { n, name?, eps, year, watched }. eps=null em temporada em exibição.
   genres[], network, first_air_year, synopsis + notes (voz da Mai). */
const SERIES = [
  { id:'severance', title:'Severance', title_original:'Severance', network:'Apple TV+', first_air_year:2022,
    genres:['Sci-Fi','Thriller','Drama'], poster:'teal', status:'assistindo', score:5.0, fav:true,
    seasons:[ { n:1, eps:9, year:2022, watched:9 }, { n:2, eps:10, year:2025, watched:4 } ],
    synopsis:'Mark e seus colegas da Lumon passaram por um procedimento que separa cirurgicamente as memórias do trabalho e da vida pessoal. Dentro do escritório, eles são pessoas que nunca viram o lado de fora — e começam a desconfiar do que assinaram.',
    notes:'A série mais elegante na TV agora, e nem disfarça. Cada corredor branco é uma frase. Reassisti o final da T1 três vezes só pelo corte. Não é sobre trabalho — é sobre o que sobra de uma pessoa quando você tira metade dela.' },

  { id:'the-bear', title:'The Bear', title_original:'The Bear', network:'Hulu · FX', first_air_year:2022,
    genres:['Drama','Comedy'], poster:'wine', status:'assistindo', score:4.5, fav:true,
    seasons:[ { n:1, eps:8, year:2022, watched:8 }, { n:2, eps:10, year:2023, watched:10 }, { n:3, eps:10, year:2024, watched:6 } ],
    synopsis:'Um chef de alta gastronomia volta para Chicago para administrar a lanchonete de sanduíches caótica da família depois de uma tragédia. Cozinha como campo de batalha, luto como tempero.',
    notes:'O episódio "Forks" é a coisa mais gentil que essa série já fez — e eu precisava. Grita, mas sabe a hora de baixar a voz. "Sim, chef" virou meu jeito de concordar com tudo.' },

  { id:'pachinko', title:'Pachinko', title_original:'파친코', network:'Apple TV+', first_air_year:2022,
    genres:['Drama','Historical'], poster:'sand', status:'assistindo', score:4.5, fav:false,
    seasons:[ { n:1, eps:8, year:2022, watched:8 }, { n:2, eps:8, year:2024, watched:3 } ],
    synopsis:'Quatro gerações de uma família coreana atravessam a ocupação japonesa, a guerra e a imigração. Uma saga sobre sobreviver sem deixar de ser quem se é.',
    notes:'A sequência de abertura, com o elenco dançando, devia ser estudada. Sunja carrega a série inteira nos ombros e ainda sobra ternura. Choro discreto, do tipo que ninguém vê.' },

  { id:'succession', title:'Succession', title_original:'Succession', network:'HBO', first_air_year:2018,
    genres:['Drama','Comedy'], poster:'slate', status:'concluida', score:5.0, fav:true,
    seasons:[ { n:1, eps:10, year:2018, watched:10 }, { n:2, eps:10, year:2019, watched:10 }, { n:3, eps:9, year:2021, watched:9 }, { n:4, eps:10, year:2023, watched:10 } ],
    synopsis:'Os filhos de um magnata da mídia disputam o controle do império enquanto o pai se recusa a soltar as rédeas. Shakespeare de terno, com insultos brilhantes.',
    notes:'Ninguém aqui merece ser amado e mesmo assim eu amei todos. O último episódio me deixou em silêncio por uns bons minutos. Humor seco campeão — eu me reconheço no desprezo elegante deles.' },

  { id:'chernobyl', title:'Chernobyl', title_original:'Chernobyl', network:'HBO', first_air_year:2019,
    genres:['Drama','Historical','Thriller'], poster:'moss', status:'concluida', score:5.0, fav:false,
    seasons:[ { n:1, name:'Minissérie', eps:5, year:2019, watched:5 } ],
    synopsis:'A reconstituição minuto a minuto do desastre nuclear de 1986 e do custo humano de mentir sobre ele. Terror sem monstro: só a verdade adiada.',
    notes:'"Qual é o preço das mentiras?" Cinco episódios, nenhum desperdiçado. A fotografia cinza não é falta de cor — é a cor certa. Vi de uma sentada, sem coragem de pausar.' },

  { id:'fleabag', title:'Fleabag', title_original:'Fleabag', network:'BBC · Amazon', first_air_year:2016,
    genres:['Comedy','Drama'], poster:'rose', status:'concluida', score:5.0, fav:true,
    seasons:[ { n:1, eps:6, year:2016, watched:6 }, { n:2, eps:6, year:2019, watched:6 } ],
    synopsis:'Uma mulher caótica em Londres encara o luto, o desejo e a culpa enquanto quebra a quarta parede para dividir conosco o que não conta a ninguém.',
    notes:'A segunda temporada é perfeita e eu não aceito debate. Aquele olhar para a câmera que ela para de fazer no final — silêncio que diz tudo. O humor seco que eu queria ter inventado.' },

  { id:'better-call-saul', title:'Better Call Saul', title_original:'Better Call Saul', network:'AMC', first_air_year:2015,
    genres:['Drama','Crime'], poster:'amber', status:'concluida', score:4.5, fav:false,
    seasons:[ { n:1, eps:10, year:2015, watched:10 }, { n:2, eps:10, year:2016, watched:10 }, { n:3, eps:10, year:2017, watched:10 }, { n:4, eps:10, year:2018, watched:10 }, { n:5, eps:10, year:2020, watched:10 }, { n:6, eps:13, year:2022, watched:13 } ],
    synopsis:'A lenta transformação de Jimmy McGill em Saul Goodman — um homem fugindo do próprio nome. Mais paciente e mais triste do que a série que a originou.',
    notes:'Uma aula de paciência narrativa. Levaram seis temporadas para um homem perder a alma em câmera lenta, e cada minuto valeu. O preto e branco do final é puro luto.' },

  { id:'arcane', title:'Arcane', title_original:'Arcane', network:'Netflix', first_air_year:2021,
    genres:['Animation','Fantasy','Drama'], poster:'plum', status:'concluida', score:4.5, fav:true,
    seasons:[ { n:1, eps:9, year:2021, watched:9 }, { n:2, eps:9, year:2024, watched:9 } ],
    synopsis:'Duas irmãs em lados opostos de uma cidade dividida entre o progresso reluzente e o submundo. Animação de tirar o fôlego sobre vínculos que não se desfazem.',
    notes:'Eu vim cética e saí destruída. A irmandade no centro de tudo é o que me pegou — não a magia. Cada quadro é uma pintura; alguns eu pausei só para olhar com calma.' },

  { id:'the-crown', title:'The Crown', title_original:'The Crown', network:'Netflix', first_air_year:2016,
    genres:['Drama','Historical'], poster:'steel', status:'pausada', score:4.0, fav:false,
    seasons:[ { n:1, eps:10, year:2016, watched:10 }, { n:2, eps:10, year:2017, watched:10 }, { n:3, eps:10, year:2019, watched:7 }, { n:4, eps:10, year:2020, watched:0 }, { n:5, eps:10, year:2022, watched:0 }, { n:6, eps:10, year:2023, watched:0 } ],
    synopsis:'O reinado de Elizabeth II contado como uma série de pequenas renúncias pessoais em nome do dever. Figurinos impecáveis, silêncios mais ainda.',
    notes:'Pausei quando trocaram o elenco — não por birra, só precisei de um tempo para aceitar outra Elizabeth. Voltarei. A contenção dela é uma performance que eu entendo bem.' },

  { id:'beef', title:'Beef', title_original:'Beef', network:'Netflix · A24', first_air_year:2023,
    genres:['Drama','Comedy'], poster:'amber', status:'concluida', score:4.5, fav:false,
    seasons:[ { n:1, name:'Minissérie', eps:10, year:2023, watched:10 } ],
    synopsis:'Uma briga de trânsito entre dois estranhos se transforma numa rivalidade que consome a vida de ambos. Raiva como linguagem para tudo o que não se consegue dizer.',
    notes:'Começa como comédia de vingança e termina como uma das coisas mais honestas sobre solidão que vi. O último episódio, com aquela conversa, me desarmou por completo.' },

  { id:'mr-robot', title:'Mr. Robot', title_original:'Mr. Robot', network:'USA Network', first_air_year:2015,
    genres:['Drama','Thriller','Crime'], poster:'indigo', status:'concluida', score:4.5, fav:false,
    seasons:[ { n:1, eps:10, year:2015, watched:10 }, { n:2, eps:12, year:2016, watched:12 }, { n:3, eps:10, year:2017, watched:10 }, { n:4, eps:13, year:2019, watched:13 } ],
    synopsis:'Um hacker solitário e instável é recrutado para derrubar a corporação que controla o mundo — sem saber bem em quem confiar, nem dentro da própria cabeça.',
    notes:'A direção é insolente do jeito que eu gosto: enquadra as pessoas no canto, deixa o vazio falar. O final divide opiniões; eu fiquei do lado dele. Solidão filmada com precisão.' },

  { id:'dark', title:'Dark', title_original:'Dark', network:'Netflix', first_air_year:2017,
    genres:['Sci-Fi','Thriller','Mystery'], poster:'dusk', status:'quero_assistir', score:null, fav:false,
    seasons:[ { n:1, eps:10, year:2017, watched:0 }, { n:2, eps:8, year:2019, watched:0 }, { n:3, eps:8, year:2020, watched:0 } ],
    synopsis:'O sumiço de uma criança numa pequena cidade alemã abre fendas no tempo que enredam quatro famílias por gerações. Um quebra-cabeças que exige caderno e paciência.',
    notes:'Todos me avisaram para não ver cansada. Estou guardando um fim de semana inteiro, e um bloco de anotações. Dizem que recompensa quem presta atenção — meu tipo de série.' },

  { id:'the-leftovers', title:'The Leftovers', title_original:'The Leftovers', network:'HBO', first_air_year:2014,
    genres:['Drama','Mystery'], poster:'slate', status:'quero_assistir', score:null, fav:false,
    seasons:[ { n:1, eps:10, year:2014, watched:0 }, { n:2, eps:10, year:2015, watched:0 }, { n:3, eps:8, year:2017, watched:0 } ],
    synopsis:'Dois por cento da população do mundo desaparece sem explicação, e a série acompanha quem ficou tentando seguir vivendo no luto do inexplicável.',
    notes:'Dizem que não é sobre a resposta, é sobre a falta dela. Isso já me convence. Guardando para um momento em que eu aguente sentir tudo de uma vez.' },

  { id:'normal-people', title:'Normal People', title_original:'Normal People', network:'Hulu · BBC', first_air_year:2020,
    genres:['Romance','Drama'], poster:'rose', status:'quero_assistir', score:null, fav:false,
    seasons:[ { n:1, name:'Minissérie', eps:12, year:2020, watched:0 } ],
    synopsis:'Dois jovens irlandeses se atraem e se afastam ao longo dos anos, presos entre o que sentem e o que não conseguem dizer. Intimidade filmada com paciência rara.',
    notes:'Me disseram que é silenciosa do jeito certo — mais nos olhares do que nas falas. Exatamente o que costumo procurar. Está no topo da fila há semanas.' },

  { id:'mad-men', title:'Mad Men', title_original:'Mad Men', network:'AMC', first_air_year:2007,
    genres:['Drama','Historical'], poster:'sand', status:'quero_assistir', score:null, fav:false,
    seasons:[ { n:1, eps:13, year:2007, watched:0 } ],
    synopsis:'Um publicitário brilhante e enigmático constrói campanhas perfeitas enquanto sua própria vida se desfaz por dentro, na Nova York dos anos 60.',
    notes:'A elegância dos anos 60 e um protagonista que é todo fachada — soa como uma série feita para mim. Quero ver com um copo de algo e tempo de sobra.' },

  { id:'westworld', title:'Westworld', title_original:'Westworld', network:'HBO', first_air_year:2016,
    genres:['Sci-Fi','Thriller','Drama'], poster:'wine', status:'abandonada', score:3.0, fav:false,
    seasons:[ { n:1, eps:10, year:2016, watched:10 }, { n:2, eps:10, year:2018, watched:5 } ],
    synopsis:'Num parque temático povoado por androides conscientes, os anfitriões começam a despertar para a natureza de sua própria existência — e da prisão em que vivem.',
    notes:'A primeira temporada é impecável. Depois disso me perdi nos labirintos, e percebi que a série também. Larguei sem mágoa — às vezes a saída elegante é fechar a porta.' },
];

/* ── enriquecimento: episodes_watched/count, next, posição (TxEy) ──────── */
function enrich(s) {
  let watched = 0, total = 0, hasOpen = false;
  s.seasons.forEach(se => { watched += se.watched; if (se.eps == null) hasOpen = true; else total += se.eps; });
  s.episodes_watched = watched;
  s.episodes_count = hasOpen ? null : total;
  // próximo episódio não assistido
  let next = null;
  for (const se of s.seasons) {
    const cap = se.eps == null ? se.watched + 4 : se.eps;
    if (se.watched < cap) { next = { season: se.n, number: se.watched + 1 }; break; }
  }
  s.next = next;
  // posição atual (último assistido) — TxEy
  let pos = null;
  for (let i = s.seasons.length - 1; i >= 0; i--) {
    if (s.seasons[i].watched > 0) { pos = { season: s.seasons[i].n, ep: s.seasons[i].watched }; break; }
  }
  s.pos = pos;
  return s;
}
SERIES.forEach(enrich);

/* nomes de episódio (determinístico) por temporada/série, para o acordeão */
const EP_TITLES = ['Estreia','O Encontro','Sombras','A Decisão','Tempestade','Laços','O Confronto','Memórias','Amanhecer','A Promessa','Despedida','Reencontro','O Banquete','Travessia','A Verdade','Recomeço','O Último Ato','Ecos','O Mapa','A Carta','Solilóquio','Maré','O Salto','Aurora'];
const NEXT_TITLES = {
  severance: 'Woe\u2019s Hollow', 'the-bear': 'Doors', pachinko: 'Capítulo 12',
};
function buildSeasonEpisodes(s, seasonNumber) {
  const se = s.seasons.find(x => x.n === seasonNumber);
  if (!se) return [];
  const total = se.eps == null ? se.watched + 6 : se.eps;
  const base = new Date((se.year || s.first_air_year) + '-01-08T00:00:00');
  const out = [];
  for (let i = 1; i <= total; i++) {
    const watched = i <= se.watched;
    const aired = new Date(base); aired.setDate(base.getDate() + (i - 1) * 7);
    const isNext = s.next && s.next.season === seasonNumber && s.next.number === i;
    out.push({
      season: seasonNumber, number: i,
      title: (isNext && NEXT_TITLES[s.id]) ? NEXT_TITLES[s.id] : EP_TITLES[(i - 1 + seasonNumber) % EP_TITLES.length],
      aired: aired.toISOString().slice(0, 10), watched,
    });
  }
  return out;
}

/* ── DIÁRIO — sessões cronológicas (mais recente primeiro) ──────────────── */
const LOGS = [
  { id:'l1',  date:'2026-06-11', seriesId:'severance', season:2, ep_start:3, ep_end:4, score:5.0, note:'A T2 está mais estranha e mais bonita. O episódio na neve é uma peça de teatro inteira disfarçada de TV.' },
  { id:'l2',  date:'2026-06-08', seriesId:'the-bear', season:3, ep_start:4, ep_end:6, score:4.0, note:'Menos foco que a T2, mas o silêncio entre a Syd e o Carmy diz tudo. Ainda me prende.' },
  { id:'l3',  date:'2026-06-05', seriesId:'pachinko', season:2, ep_start:2, ep_end:3, score:4.5, note:'Sunja de novo no centro. A série respira fundo antes de cada golpe. Elegante até na dor.' },
  { id:'l4',  date:'2026-05-30', seriesId:'severance', season:2, ep_start:1, ep_end:2, score:5.0, note:'Voltar à Lumon depois de tanto tempo foi como reencontrar um sonho ruim que eu sentia falta.' },
  { id:'l5',  date:'2026-05-24', seriesId:'arcane', season:2, ep_start:7, ep_end:9, score:4.5, note:'Final devastador. Reassisti com a Marin emprestando opinião alta demais. Mesmo assim, chorei discreta.' },
  { id:'l6',  date:'2026-05-18', seriesId:'the-bear', season:3, ep_start:1, ep_end:3, score:4.0, note:'A estreia da T3 é puro estilo. Quase sem trama, mas que fotografia.' },
  { id:'l7',  date:'2026-05-11', seriesId:'beef', season:1, ep_start:8, ep_end:10, score:5.0, note:'O final me desarmou. Dois estranhos que só conseguem ser honestos quando perdem tudo. Fiquei acordada pensando.' },
  { id:'l8',  date:'2026-05-04', seriesId:'pachinko', season:2, ep_start:1, ep_end:1, score:4.5, note:'A abertura continua sendo a melhor coisa da televisão. Começar de novo já vale o ingresso.' },
  { id:'l9',  date:'2026-04-27', seriesId:'beef', season:1, ep_start:5, ep_end:7, score:4.5, note:'A raiva como linguagem para tudo que não se diz. Eu entendo essa gramática mais do que gostaria.' },
  { id:'l10', date:'2026-04-19', seriesId:'fleabag', season:2, ep_start:4, ep_end:6, score:5.0, note:'Reassisti a T2 inteira de novo. O padre. O confessionário. Aquela última cena no ponto de ônibus. Perfeição contida.' },
  { id:'l11', date:'2026-04-12', seriesId:'severance', season:1, ep_start:7, ep_end:9, score:5.0, note:'Maratona acidental até o final da T1. O elevador. Não consegui dormir, e não me arrependo.' },
  { id:'l12', date:'2026-03-29', seriesId:'arcane', season:2, ep_start:4, ep_end:6, score:4.5, note:'A irmandade no centro de tudo. Cada quadro é uma pintura — pausei alguns só para olhar.' },
  { id:'l13', date:'2026-03-15', seriesId:'chernobyl', season:1, ep_start:1, ep_end:5, score:5.0, note:'De uma sentada. "Qual é o preço das mentiras?" Cinco episódios sem um minuto desperdiçado.' },
  { id:'l14', date:'2026-02-22', seriesId:'succession', season:4, ep_start:8, ep_end:10, score:5.0, note:'O final. Fiquei em silêncio uns bons minutos antes de conseguir levantar. Ninguém merecia ser amado e eu amei todos.' },
  { id:'l15', date:'2026-02-08', seriesId:'better-call-saul', season:6, ep_start:10, ep_end:13, score:4.5, note:'O preto e branco do final é puro luto. Seis temporadas para perder uma alma em câmera lenta. Valeu cada minuto.' },
  { id:'l16', date:'2026-01-25', seriesId:'the-bear', season:2, ep_start:6, ep_end:10, score:5.0, note:'"Forks". O episódio mais gentil da série. Eu precisava de gentileza naquele dia, e ele me deu.' },
  { id:'l17', date:'2026-01-11', seriesId:'succession', season:4, ep_start:3, ep_end:7, score:5.0, note:'O episódio do barco. Humor seco no auge. Eu me reconheço no desprezo elegante dessa gente terrível.' },
];

/* ── Próximos episódios das séries "assistindo" (timeline) ──────────────── */
function buildUpcoming() {
  const days = ['2026-06-13','2026-06-17','2026-06-20','2026-06-24'];
  const items = SERIES.filter(s => s.status === 'assistindo' && s.next);
  return items.map((s, i) => ({
    seriesId: s.id, season: s.next.season, ep: s.next.number,
    title: NEXT_TITLES[s.id] || EP_TITLES[(s.next.number + s.next.season) % EP_TITLES.length],
    aired: days[i % days.length],
  })).sort((a, b) => a.aired.localeCompare(b.aired));
}
const UPCOMING = buildUpcoming();

/* ── Heatmap de sessões/dia (ano corrente, determinístico) ──────────────── */
function buildHeatmap() {
  let s = 20260613;
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 0xffffffff; };
  const days = [];
  const start = new Date('2026-01-01T00:00:00');
  const today = new Date(TODAY + 'T00:00:00');
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const r = rng(); const wd = d.getDay();
    const weekend = (wd === 0 || wd === 5 || wd === 6);
    const watches = r < (weekend ? 0.46 : 0.22) ? (rng() < 0.18 && weekend ? 3 : rng() < 0.38 ? 2 : 1) : 0;
    days.push({ date: new Date(d).toISOString().slice(0, 10), count: watches });
  }
  LOGS.forEach(e => { const day = days.find(x => x.date === e.date); if (day) day.count = Math.max(day.count, 1); });
  return days;
}
const HEATMAP = buildHeatmap();

/* ── STATS — pré-calculadas para Início e Estatísticas ──────────────────── */
const STATS = (() => {
  const watched = SERIES.filter(a => a.status === 'concluida' || a.status === 'assistindo');
  const epsTotal = LOGS.reduce((a, e) => a + (e.ep_end - e.ep_start + 1), 0);
  const hours = Math.round(epsTotal * 48 / 60);   // ~48min por ep (prestígio)
  const scores = SERIES.filter(a => a.score != null).map(a => a.score);
  const avgScore = scores.reduce((a, x) => a + x, 0) / (scores.length || 1);

  const monthlyEps = Array(12).fill(0);
  LOGS.forEach(e => { monthlyEps[new Date(e.date + 'T00:00:00').getMonth()] += (e.ep_end - e.ep_start + 1); });

  const byStatus = {};
  ['assistindo','concluida','quero_assistir','pausada','abandonada'].forEach(st => { byStatus[st] = SERIES.filter(a => a.status === st).length; });

  const byGenre = {}; SERIES.forEach(a => a.genres.forEach(g => { byGenre[g] = (byGenre[g] || 0) + 1; }));
  const byNetwork = {}; watched.forEach(a => a.network.split(' \u00b7 ').forEach(nw => { byNetwork[nw] = (byNetwork[nw] || 0) + 1; }));

  const fav = [...SERIES].filter(a => a.score).sort((a, b) => (b.score - a.score) || (b.fav - a.fav))[0];
  const maxSessions = Math.max(...HEATMAP.map(d => d.count), 1);

  return {
    seriesTracked: SERIES.length, completed: byStatus.concluida, watching: byStatus.assistindo,
    epsTotal, hours, avgScore, monthlyEps, byStatus, byGenre, byNetwork,
    topGenre: Object.entries(byGenre).sort((a, b) => b[1] - a[1])[0],
    fav, maxSessions, favCount: SERIES.filter(a => a.fav).length, sessions: LOGS.length,
  };
})();

/* ── "API" TMDB (mock) — séries fora do acervo, buscáveis ───────────────── */
const TMDB_CATALOG = [
  { id:'true-detective', title:'True Detective', title_original:'True Detective', first_air_year:2014, network:'HBO', genres:['Crime','Drama','Mystery'], poster:'moss', seasons:[{n:1,eps:8,year:2014,watched:0}] },
  { id:'the-wire', title:'The Wire', title_original:'The Wire', first_air_year:2002, network:'HBO', genres:['Crime','Drama'], poster:'steel', seasons:[{n:1,eps:13,year:2002,watched:0}] },
  { id:'twin-peaks', title:'Twin Peaks', title_original:'Twin Peaks', first_air_year:1990, network:'ABC', genres:['Mystery','Drama'], poster:'wine', seasons:[{n:1,eps:8,year:1990,watched:0}] },
  { id:'the-sopranos', title:'The Sopranos', title_original:'The Sopranos', first_air_year:1999, network:'HBO', genres:['Crime','Drama'], poster:'slate', seasons:[{n:1,eps:13,year:1999,watched:0}] },
  { id:'six-feet-under', title:'Six Feet Under', title_original:'Six Feet Under', first_air_year:2001, network:'HBO', genres:['Drama'], poster:'dusk', seasons:[{n:1,eps:13,year:2001,watched:0}] },
  { id:'station-eleven', title:'Station Eleven', title_original:'Station Eleven', first_air_year:2021, network:'HBO Max', genres:['Drama','Sci-Fi'], poster:'teal', seasons:[{n:1,name:'Minissérie',eps:10,year:2021,watched:0}] },
  { id:'i-may-destroy-you', title:'I May Destroy You', title_original:'I May Destroy You', first_air_year:2020, network:'HBO · BBC', genres:['Drama'], poster:'amber', seasons:[{n:1,name:'Minissérie',eps:12,year:2020,watched:0}] },
  { id:'the-americans', title:'The Americans', title_original:'The Americans', first_air_year:2013, network:'FX', genres:['Drama','Thriller'], poster:'indigo', seasons:[{n:1,eps:13,year:2013,watched:0}] },
  { id:'halt-catch-fire', title:'Halt and Catch Fire', title_original:'Halt and Catch Fire', first_air_year:2014, network:'AMC', genres:['Drama'], poster:'sand', seasons:[{n:1,eps:10,year:2014,watched:0}] },
  { id:'patrick-melrose', title:'Patrick Melrose', title_original:'Patrick Melrose', first_air_year:2018, network:'Showtime', genres:['Drama'], poster:'plum', seasons:[{n:1,name:'Minissérie',eps:5,year:2018,watched:0}] },
  { id:'the-knick', title:'The Knick', title_original:'The Knick', first_air_year:2014, network:'Cinemax', genres:['Drama','Historical'], poster:'steel', seasons:[{n:1,eps:10,year:2014,watched:0}] },
  { id:'sharp-objects', title:'Sharp Objects', title_original:'Sharp Objects', first_air_year:2018, network:'HBO', genres:['Drama','Mystery'], poster:'wine', seasons:[{n:1,name:'Minissérie',eps:8,year:2018,watched:0}] },
];

function searchTmdb(q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return [];
  return TMDB_CATALOG
    .filter(a => !seriesById(a.id))
    .filter(a => a.title.toLowerCase().includes(s) || a.network.toLowerCase().includes(s) || String(a.first_air_year).includes(s) || a.genres.some(g => g.toLowerCase().includes(s)))
    .slice(0, 6);
}
function addSeriesFromCatalog(entry) {
  let a = seriesById(entry.id);
  if (a) return a;
  a = { ...entry, status:'quero_assistir', score:null, fav:false,
        synopsis: entry.synopsis || 'Adicionada pela busca \u2014 sinopse virá do TMDB na próxima sincronização.', notes:null };
  a.seasons = entry.seasons.map(x => ({ ...x }));
  enrich(a);
  SERIES.push(a);
  return a;
}

/* ── helpers ────────────────────────────────────────────────────────────── */
function seriesById(id) { return SERIES.find(a => a.id === id); }
function logsFor(id) { return LOGS.filter(e => e.seriesId === id); }
function sessionsInLast(nDays) { return HEATMAP.slice(-nDays).reduce((a, d) => a + d.count, 0); }
function posLabel(s) { return s.pos ? `T${s.pos.season}E${s.pos.ep}` : '—'; }

const STATUS_LABEL = { assistindo:'Assistindo', concluida:'Concluída', quero_assistir:'Quero assistir', pausada:'Pausada', abandonada:'Abandonada' };
const STATUS_VAR = { assistindo:'--st-assistindo', concluida:'--st-concluida', quero_assistir:'--st-quero_assistir', pausada:'--st-pausada', abandonada:'--st-abandonada' };

Object.assign(window, {
  TODAY, POSTER, SERIES, LOGS, UPCOMING, HEATMAP, STATS, TMDB_CATALOG,
  seriesById, logsFor, sessionsInLast, buildSeasonEpisodes, searchTmdb, addSeriesFromCatalog,
  enrich, posLabel, STATUS_LABEL, STATUS_VAR,
});
