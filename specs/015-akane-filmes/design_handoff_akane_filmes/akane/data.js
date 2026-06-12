/* ─────────────────────────────────────────────────────────────────────────
   Akane · Filmes — dados do mock
   A LISTA (FILMS) é o acervo único de filmes. O DIÁRIO (DIARY) é o registro
   cronológico de sessões — bebe da lista; um mesmo filme pode aparecer várias
   vezes (rewatches), cada sessão com data, nota e marcadores próprios.
   Letterboxd-like. Notas/reviews na voz da Akane Kurokawa (ficção).
   ───────────────────────────────────────────────────────────────────────── */

const TODAY = '2026-06-12';

/* Paletas de pôster — colorgrades de cinema. bg (campo), ink (texto), accent. */
const POSTER = {
  noir:    { bg:'oklch(0.235 0.022 285)', ink:'oklch(0.93 0.018 285)', accent:'oklch(0.66 0.14 25)'  },
  ember:   { bg:'oklch(0.33 0.095 38)',   ink:'oklch(0.96 0.03 65)',   accent:'oklch(0.82 0.12 72)'  },
  rose:    { bg:'oklch(0.36 0.12 2)',     ink:'oklch(0.96 0.035 350)', accent:'oklch(0.84 0.10 350)' },
  neon:    { bg:'oklch(0.30 0.10 320)',   ink:'oklch(0.95 0.04 320)',  accent:'oklch(0.80 0.14 200)' },
  teal:    { bg:'oklch(0.32 0.062 210)',  ink:'oklch(0.95 0.03 200)',  accent:'oklch(0.82 0.10 195)' },
  gold:    { bg:'oklch(0.40 0.085 78)',   ink:'oklch(0.97 0.03 85)',   accent:'oklch(0.86 0.10 84)'  },
  ink:     { bg:'oklch(0.22 0.012 270)',  ink:'oklch(0.90 0.015 270)', accent:'oklch(0.72 0.10 30)'  },
  blood:   { bg:'oklch(0.30 0.13 24)',    ink:'oklch(0.96 0.03 30)',   accent:'oklch(0.85 0.10 50)'  },
  forest:  { bg:'oklch(0.31 0.055 160)',  ink:'oklch(0.94 0.03 150)',  accent:'oklch(0.80 0.09 140)' },
  dusk:    { bg:'oklch(0.34 0.075 290)',  ink:'oklch(0.95 0.03 300)',  accent:'oklch(0.82 0.10 330)' },
  bone:    { bg:'oklch(0.78 0.03 70)',    ink:'oklch(0.26 0.04 50)',   accent:'oklch(0.45 0.10 24)'  },
  slate:   { bg:'oklch(0.40 0.028 250)',  ink:'oklch(0.93 0.015 250)', accent:'oklch(0.80 0.09 210)' },
  wine:    { bg:'oklch(0.30 0.085 350)',  ink:'oklch(0.95 0.03 350)',  accent:'oklch(0.82 0.10 12)'  },
  sea:     { bg:'oklch(0.34 0.07 235)',   ink:'oklch(0.95 0.03 230)',  accent:'oklch(0.84 0.10 215)' },
};

/* status: 'watched' (já assisti) | 'watchlist' (quero ver)
   rating em passos de 0.5 (0–5) — pode vir do Letterboxd (ratingSource) ou ser sua.
   liked = coração (Letterboxd-style). tags = etiquetas (futuramente ligam à base de pessoas).
   review = sua crítica. notes = anotações soltas (≠ review).
   vault = conteúdos salvos SOBRE o filme (vídeos, textos, artigos, reviews).
   people = elenco/equipe-chave → prepara o link com a base de pessoas. */
const FILMS = [
  { id:'perfect-blue', title:'Perfect Blue', year:1997, director:'Satoshi Kon', runtime:81,
    genre:'Animação · Thriller', country:'Japão', poster:'rose',
    status:'watched', rating:5, ratingSource:'letterboxd', liked:true,
    people:[{name:'Satoshi Kon', role:'Direção'},{name:'Junko Iwao', role:'Mima (voz)'},{name:'Sadayuki Murai', role:'Roteiro'}],
    tags:['identidade','atuação','metalinguagem','Satoshi Kon','final-perfeito'],
    review:'O filme que eu reassisto antes de cada papel difícil. A linha entre a Mima ídolo e a Mima atriz some, e eu reconheço cada centímetro desse pavor. Kon filma a dissociação como ninguém.',
    notes:'Reparar: o uso do reflexo (aquário, vidro, monitor) sempre que ela perde o fio de quem é. Roubar isso pro próximo teste de elenco. O grito no set é gravado seco, sem trilha — é o que dá o arrepio.',
    vault:[
      { type:'video',   title:'Satoshi Kon — Editing Space & Time', source:'youtube.com' },
      { type:'essay',   title:'O terror de ser olhada: Perfect Blue 25 anos', source:'mubi.com' },
      { type:'article', title:'A herança de Perfect Blue em Aronofsky', source:'criterion.com' },
      { type:'review',  title:'“Mima me assombra” — diário de uma atriz', source:'letterboxd.com' },
    ] },
  { id:'millennium-actress', title:'Millennium Actress', year:2001, director:'Satoshi Kon', runtime:87,
    genre:'Animação · Drama', country:'Japão', poster:'gold',
    status:'watched', rating:4.5, ratingSource:'letterboxd', liked:true,
    people:[{name:'Satoshi Kon', role:'Direção'},{name:'Miyoko Shoji', role:'Chiyoko (voz)'}],
    tags:['atuação','metalinguagem','Satoshi Kon','luto'],
    review:'Uma vida inteira contada como filmografia — a memória e a ficção interpretando o mesmo papel. Chorei quando entendi que a perseguição dela nunca foi pelo homem, foi pela própria juventude correndo.',
    notes:'A montagem que atravessa eras sem corte de respiração. Estudar como a câmera “entra” na lembrança.',
    vault:[
      { type:'video',   title:'Como Kon funde memória e cinema', source:'youtube.com' },
      { type:'article', title:'A chave é correr: leitura de Millennium Actress', source:'sensesofcinema.com' },
    ] },
  { id:'in-the-mood-for-love', title:'Amor à Flor da Pele', year:2000, director:'Wong Kar-wai', runtime:98,
    genre:'Romance · Drama', country:'Hong Kong', poster:'wine',
    status:'watched', rating:5, ratingSource:'own', liked:true,
    people:[{name:'Wong Kar-wai', role:'Direção'},{name:'Maggie Cheung', role:'Su Li-zhen'},{name:'Tony Leung', role:'Chow Mo-wan'},{name:'Christopher Doyle', role:'Fotografia'}],
    tags:['trilha-sonora','plano-sequência','rewatch','romance-que-dói'],
    review:'Tudo que não é dito vira figurino e corredor. O desejo aqui é coreografia de contenção — e é por isso que dói tanto. O melhor uso de repetição que o cinema já me deu.',
    notes:'Os mesmos vestidos, os mesmos corredores, a mesma valsa: a repetição como prisão emocional. Yumeji’s Theme tocando em câmera lenta deveria ser proibido de tão bonito.',
    vault:[
      { type:'video',   title:'A cor do desejo: a paleta de Wong Kar-wai', source:'youtube.com' },
      { type:'essay',   title:'Slow motion como memória afetiva', source:'mubi.com' },
    ] },
  { id:'mulholland-drive', title:'Cidade dos Sonhos', year:2001, director:'David Lynch', runtime:147,
    genre:'Mistério · Drama', country:'EUA', poster:'noir',
    status:'watched', rating:4.5, ratingSource:'letterboxd', liked:true,
    people:[{name:'David Lynch', role:'Direção'},{name:'Naomi Watts', role:'Betty / Diane'},{name:'Laura Harring', role:'Rita / Camilla'}],
    tags:['identidade','atuação','metalinguagem','Hollywood'],
    review:'O sonho de uma atriz que Hollywood mastigou. A cena do teste — quando a Betty muda de pele — é a melhor aula de atuação já filmada. Assustadora de tão boa.',
    notes:'A cena do teste: ela ensaia canastra e entrega devastadora. Diferença entre dizer a fala e habitá-la.',
    vault:[
      { type:'video',   title:'A cena do teste, decomposta plano a plano', source:'youtube.com' },
      { type:'article', title:'Lynch e o pesadelo da fama', source:'theguardian.com' },
    ] },
  { id:'black-swan', title:'Cisne Negro', year:2010, director:'Darren Aronofsky', runtime:108,
    genre:'Drama · Terror', country:'EUA', poster:'wine',
    status:'watched', rating:4.5, ratingSource:'own', liked:true,
    people:[{name:'Darren Aronofsky', role:'Direção'},{name:'Natalie Portman', role:'Nina'}],
    tags:['identidade','atuação','metalinguagem','rewatch'],
    review:'A performance que devora a intérprete. Perigosamente parecido com o que sinto perto de uma estreia. Bonito e doente na medida.',
    notes:'Diálogo claro com Perfect Blue (Aronofsky admite). Comparar o uso de espelho dos dois.',
    vault:[
      { type:'video',  title:'Perfect Blue vs Cisne Negro: o mesmo espelho', source:'youtube.com' },
    ] },
  { id:'drive-my-car', title:'Drive My Car', year:2021, director:'Ryusuke Hamaguchi', runtime:179,
    genre:'Drama', country:'Japão', poster:'sea',
    status:'watched', rating:4.5, ratingSource:'letterboxd', liked:false,
    people:[{name:'Ryusuke Hamaguchi', role:'Direção'},{name:'Hidetoshi Nishijima', role:'Yusuke'},{name:'Tôko Miura', role:'Misaki'}],
    tags:['atuação','luto','trilha-sonora'],
    review:'Ensaiar Tchekhov até a fala virar verdade. Um filme sobre dirigir atores que me ensinou a dirigir a mim mesma. As leituras de mesa valem o ingresso.',
    notes:'A ideia de repetir o texto até esvaziá-lo de interpretação e deixar a emoção vir por baixo. Testar.',
    vault:[
      { type:'essay',   title:'Hamaguchi e a arte da leitura de mesa', source:'mubi.com' },
      { type:'review',  title:'Três horas que passam como um suspiro', source:'letterboxd.com' },
    ] },
  { id:'parasite', title:'Parasita', year:2019, director:'Bong Joon-ho', runtime:132,
    genre:'Thriller · Drama', country:'Coreia do Sul', poster:'forest',
    status:'watched', rating:4.5, ratingSource:'letterboxd', liked:false,
    people:[{name:'Bong Joon-ho', role:'Direção'},{name:'Song Kang-ho', role:'Ki-taek'}],
    tags:['plano-sequência','metalinguagem'],
    review:'A escada como roteiro. Cada degrau é classe social, e a câmera nunca deixa esquecer. Vi duas vezes só pra rir nervoso de novo.',
    notes:'Estudar o blocking vertical — quem está acima/abaixo no quadro em cada cena.', vault:[] },
  { id:'spirited-away', title:'A Viagem de Chihiro', year:2001, director:'Hayao Miyazaki', runtime:125,
    genre:'Animação · Fantasia', country:'Japão', poster:'teal',
    status:'watched', rating:5, ratingSource:'own', liked:true,
    people:[{name:'Hayao Miyazaki', role:'Direção'},{name:'Joe Hisaishi', role:'Trilha'}],
    tags:['cinema-japonês','rewatch','trilha-sonora','conforto'],
    review:'Meu filme de quando o mundo pesa demais. Lembrar o próprio nome como ato de resistência — preciso disso mais do que admito.',
    notes:'O silêncio do trem sobre a água. Hisaishi sabe exatamente quando calar.', vault:[
      { type:'video', title:'O trem que cruza a água: o silêncio de Miyazaki', source:'youtube.com' } ] },
  { id:'portrait-lady-fire', title:'Retrato de uma Jovem em Chamas', year:2019, director:'Céline Sciamma', runtime:122,
    genre:'Romance · Drama', country:'França', poster:'ember',
    status:'watched', rating:5, ratingSource:'letterboxd', liked:true,
    people:[{name:'Céline Sciamma', role:'Direção'},{name:'Noémie Merlant', role:'Marianne'},{name:'Adèle Haenel', role:'Héloïse'}],
    tags:['romance-que-dói','plano-sequência','olhar'],
    review:'Sobre o ato de olhar e ser olhada — que é literalmente o meu ofício. Vire-se na página 28. Eu nunca mais fui a mesma depois dessa última cena.',
    notes:'Quem observa quem? O filme inteiro inverte o quadro. A cena final, em plano fixo longo, é uma aula de atuação só com respiração.', vault:[
      { type:'essay', title:'O olhar como linguagem amorosa', source:'mubi.com' } ] },
  { id:'past-lives', title:'Vidas Passadas', year:2023, director:'Celine Song', runtime:105,
    genre:'Romance · Drama', country:'EUA · Coreia', poster:'dusk',
    status:'watched', rating:4.5, ratingSource:'letterboxd', liked:true,
    people:[{name:'Celine Song', role:'Direção'},{name:'Greta Lee', role:'Nora'}],
    tags:['romance-que-dói','luto','silêncio'],
    review:'O que poderia ter sido, dito sem uma única palavra a mais que o necessário. A despedida na rua me partiu ao meio.',
    notes:'In-yun. A contenção do roteiro — confiar no não-dito.', vault:[] },
  { id:'aftersun', title:'Aftersun', year:2022, director:'Charlotte Wells', runtime:102,
    genre:'Drama', country:'Reino Unido', poster:'sea',
    status:'watched', rating:4.5, ratingSource:'own', liked:false,
    people:[{name:'Charlotte Wells', role:'Direção'},{name:'Paul Mescal', role:'Calum'}],
    tags:['luto','memória','silêncio'],
    review:'Uma memória se montando em tempo real, com toda a culpa de quem só entende tarde demais. A cena da dança me destruiu.',
    notes:'O que a câmera DV não mostra é o filme inteiro. Ausência como dramaturgia.', vault:[] },
  { id:'whiplash', title:'Whiplash — Em Busca da Perfeição', year:2014, director:'Damien Chazelle', runtime:106,
    genre:'Drama · Música', country:'EUA', poster:'blood',
    status:'watched', rating:4, ratingSource:'letterboxd', liked:false,
    people:[{name:'Damien Chazelle', role:'Direção'},{name:'Miles Teller', role:'Andrew'},{name:'J.K. Simmons', role:'Fletcher'}],
    tags:['atuação','obsessão'],
    review:'A obsessão pela excelência filmada como horror — e eu, que vivo disso, ri e me encolhi na cadeira. O último solo é puro corpo.',
    notes:'Montagem no ritmo da bateria. Estudar como o som conduz o corte.', vault:[] },
  { id:'tokyo-story', title:'Era uma Vez em Tóquio', year:1953, director:'Yasujiro Ozu', runtime:137,
    genre:'Drama', country:'Japão', poster:'bone',
    status:'watched', rating:5, ratingSource:'own', liked:true,
    people:[{name:'Yasujiro Ozu', role:'Direção'},{name:'Setsuko Hara', role:'Noriko'}],
    tags:['cinema-japonês','luto','plano-fixo'],
    review:'A câmera na altura do tatami, paciente, sem julgar ninguém. Aprendi mais sobre interpretar com o rosto parado da Setsuko Hara do que em qualquer aula.',
    notes:'Plano-travesseiro: os cortes para objetos vazios entre cenas. O tempo respira.', vault:[
      { type:'article', title:'Setsuko Hara: o sorriso mais difícil do cinema', source:'criterion.com' } ] },
  { id:'la-la-land', title:'La La Land — Cantando Estações', year:2016, director:'Damien Chazelle', runtime:128,
    genre:'Musical · Romance', country:'EUA', poster:'neon',
    status:'watched', rating:4, ratingSource:'letterboxd', liked:false,
    people:[{name:'Damien Chazelle', role:'Direção'},{name:'Emma Stone', role:'Mia'}],
    tags:['atuação','sonho','audição'],
    review:'A cena da audição — “a cena dos sonhadores” — é a coisa mais honesta já filmada sobre ser atriz. O resto é bonito; aquilo é verdadeiro.',
    notes:'O epílogo: o que poderia ter sido em forma de número musical. Doce e cruel.', vault:[
      { type:'video', title:'“The Fools Who Dream”: a audição, sem cortes', source:'youtube.com' } ] },
  /* ── Watchlist (quero ver) ── */
  { id:'persona', title:'Persona', year:1966, director:'Ingmar Bergman', runtime:84,
    genre:'Drama · Experimental', country:'Suécia', poster:'ink',
    status:'watchlist', rating:null, ratingSource:null, liked:false,
    people:[{name:'Ingmar Bergman', role:'Direção'},{name:'Liv Ullmann', role:'Elisabet'},{name:'Bibi Andersson', role:'Alma'}],
    tags:['identidade','atuação','duas-mulheres'], review:null,
    notes:'Recomendado por todo mundo que viu Perfect Blue. Sobre uma atriz que para de falar. Preciso ver antes do papel da peça.', vault:[] },
  { id:'a-brighter-summer-day', title:'Quatro Luas', year:1991, director:'Edward Yang', runtime:237,
    genre:'Drama', country:'Taiwan', poster:'slate',
    status:'watchlist', rating:null, ratingSource:null, liked:false,
    people:[{name:'Edward Yang', role:'Direção'}],
    tags:['cinema-japonês','épico','juventude'], review:null,
    notes:'Quatro horas. Separar um domingo inteiro e desligar o telefone.', vault:[] },
  { id:'burning', title:'Em Chamas', year:2018, director:'Lee Chang-dong', runtime:148,
    genre:'Mistério · Drama', country:'Coreia do Sul', poster:'ember',
    status:'watchlist', rating:null, ratingSource:null, liked:false,
    people:[{name:'Lee Chang-dong', role:'Direção'},{name:'Steven Yeun', role:'Ben'}],
    tags:['ambiguidade','classe'], review:null,
    notes:'Dizem que a ambiguidade é o ponto. Ver sem ler nada antes.', vault:[] },
  { id:'paprika', title:'Paprika', year:2006, director:'Satoshi Kon', runtime:90,
    genre:'Animação · Ficção científica', country:'Japão', poster:'neon',
    status:'watchlist', rating:null, ratingSource:null, liked:false,
    people:[{name:'Satoshi Kon', role:'Direção'}],
    tags:['Satoshi Kon','sonho','identidade'], review:null,
    notes:'Fechar a filmografia do Kon. Guardar pro fim — não quero que acabe.', vault:[] },
];

/* ── Filmes favoritos (4) — vitrine do perfil ───────────────────────────── */
const FAVORITES = ['perfect-blue', 'in-the-mood-for-love', 'portrait-lady-fire', 'tokyo-story'];

/* ── Listas curadas (coleções) — Letterboxd lists ───────────────────────── */
const LISTS = [
  { id:'atrizes-colapso', name:'Atrizes em colapso', accent:'oklch(0.66 0.20 355)',
    desc:'A performance que devora quem performa. Meu espelho profissional — e meu medo.',
    films:['perfect-blue','millennium-actress','black-swan','mulholland-drive','persona'] },
  { id:'cinema-japones', name:'Cinema japonês', accent:'oklch(0.70 0.12 200)',
    desc:'De Ozu a Kon — a casa, em telas.',
    films:['perfect-blue','millennium-actress','drive-my-car','spirited-away','tokyo-story','paprika'] },
  { id:'romance-que-doi', name:'Romance que dói', accent:'oklch(0.62 0.16 8)',
    desc:'Amores feitos de contenção e do que ficou por dizer.',
    films:['in-the-mood-for-love','portrait-lady-fire','past-lives','aftersun'] },
  { id:'conforto', name:'Reassistir quando o mundo pesa', accent:'oklch(0.74 0.10 150)',
    desc:'Os que eu ponho pra tocar e respiro fundo.',
    films:['spirited-away','in-the-mood-for-love','tokyo-story'] },
  { id:'vistos-2026', name:'Vistos em 2026', accent:'oklch(0.78 0.12 85)',
    desc:'O diário do ano, pôster a pôster.',
    films:['perfect-blue','drive-my-car','past-lives','portrait-lady-fire','parasite','aftersun','black-swan'] },
];

/* ── DIÁRIO — sessões em ordem cronológica (mais recente primeiro).
   Cada entrada referencia um filme da LISTA. rewatch = revisão.
   rating é a nota DAQUELA sessão (pode diferir/evoluir). ─────────────────── */
const DIARY = [
  { id:'d1',  date:'2026-06-11', filmId:'perfect-blue',        rating:5,   liked:true,  rewatch:true,
    note:'Reassisti na véspera do teste. Continua sendo o mapa do meu medo — e do meu ofício.' },
  { id:'d2',  date:'2026-06-08', filmId:'past-lives',          rating:4.5, liked:true,  rewatch:false,
    note:'A despedida na rua. Fiquei sentada até subir todos os créditos.' },
  { id:'d3',  date:'2026-06-02', filmId:'aftersun',            rating:4.5, liked:false, rewatch:false,
    note:'A cena da dança me destruiu. Liguei pro meu pai depois.' },
  { id:'d4',  date:'2026-05-28', filmId:'drive-my-car',        rating:4.5, liked:false, rewatch:false,
    note:'Três horas que passaram como um suspiro. As leituras de mesa valem um curso inteiro.' },
  { id:'d5',  date:'2026-05-19', filmId:'in-the-mood-for-love',rating:5,   liked:true,  rewatch:true,
    note:'Terceira vez. Toda vez encontro um corredor novo pra me perder.' },
  { id:'d6',  date:'2026-05-10', filmId:'portrait-lady-fire',  rating:5,   liked:true,  rewatch:false,
    note:'Vire-se na página 28. A última cena, em plano fixo, é só respiração — e é tudo.' },
  { id:'d7',  date:'2026-04-27', filmId:'parasite',            rating:4.5, liked:false, rewatch:false,
    note:'A escada como roteiro. Ri nervoso de novo.' },
  { id:'d8',  date:'2026-04-14', filmId:'black-swan',          rating:4.5, liked:true,  rewatch:false,
    note:'Perigosamente parecido com a véspera de uma estreia.' },
  { id:'d9',  date:'2026-03-30', filmId:'mulholland-drive',    rating:4.5, liked:true,  rewatch:false,
    note:'A cena do teste. Voltei três vezes só nela.' },
  { id:'d10', date:'2026-03-08', filmId:'spirited-away',       rating:5,   liked:true,  rewatch:true,
    note:'Domingo difícil. Lembrar o próprio nome como resistência.' },
  { id:'d11', date:'2026-02-22', filmId:'whiplash',            rating:4,   liked:false, rewatch:false,
    note:'Ri e me encolhi na cadeira. O último solo é puro corpo.' },
  { id:'d12', date:'2026-02-09', filmId:'millennium-actress',  rating:4.5, liked:true,  rewatch:false,
    note:'A chave é correr. Chorei no final.' },
  { id:'d13', date:'2026-01-25', filmId:'la-la-land',          rating:4,   liked:false, rewatch:false,
    note:'“A cena dos sonhadores” é a coisa mais honesta sobre ser atriz.' },
  { id:'d14', date:'2026-01-12', filmId:'tokyo-story',         rating:5,   liked:true,  rewatch:false,
    note:'O rosto parado da Setsuko Hara ensina mais que qualquer aula.' },
];

/* ── Heatmap de sessões/dia (ano corrente, determinístico) ──────────────── */
function buildHeatmap() {
  let s = 20260612;
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 0xffffffff; };
  const days = [];
  const start = new Date('2026-01-01T00:00:00');
  const today = new Date(TODAY + 'T00:00:00');
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const r = rng();
    const wd = d.getDay();
    const weekend = (wd === 0 || wd === 5 || wd === 6);
    // cinéfila: ~32% dos dias com sessão, picos no fim de semana (maratonas)
    const watches = r < (weekend ? 0.46 : 0.20) ? (rng() < 0.18 && weekend ? 3 : rng() < 0.4 ? 2 : 1) : 0;
    days.push({ date: new Date(d).toISOString().slice(0, 10), count: watches });
  }
  // garante que os dias do DIÁRIO tenham ao menos a contagem real
  DIARY.forEach(e => { const day = days.find(x => x.date === e.date); if (day) day.count = Math.max(day.count, 1); });
  return days;
}
const HEATMAP = buildHeatmap();

/* ── Séries derivadas para Início e Rewind ──────────────────────────────── */
const STATS = (() => {
  const watched = FILMS.filter(f => f.status === 'watched');
  const sessions = DIARY.length;
  const rewatches = DIARY.filter(e => e.rewatch).length;
  const totalMinutes = DIARY.reduce((a, e) => { const f = filmById(e.filmId); return a + (f ? f.runtime : 0); }, 0);
  const ratings = DIARY.filter(e => e.rating).map(e => e.rating);
  const avgRating = ratings.reduce((a, r) => a + r, 0) / (ratings.length || 1);

  // sessões por mês (jan–dez)
  const monthly = Array(12).fill(0);
  DIARY.forEach(e => { monthly[new Date(e.date + 'T00:00:00').getMonth()]++; });

  // histograma de notas em passos de 0.5 (0.5 … 5.0)
  const dist = {}; for (let v = 0.5; v <= 5; v += 0.5) dist[v.toFixed(1)] = 0;
  ratings.forEach(r => { const k = r.toFixed(1); if (k in dist) dist[k]++; });

  // gêneros (separa por " · ") e diretores
  const byGenre = {};
  watched.forEach(f => f.genre.split(' · ').forEach(g => { byGenre[g] = (byGenre[g] || 0) + 1; }));
  const byDirector = {};
  watched.forEach(f => { byDirector[f.director] = (byDirector[f.director] || 0) + 1; });

  // top pessoas (direção + elenco/equipe) → prepara base de pessoas
  const people = {};
  watched.forEach(f => (f.people || []).forEach(p => {
    if (!people[p.name]) people[p.name] = { name: p.name, count: 0, roles: new Set() };
    people[p.name].count++; people[p.name].roles.add(p.role);
  }));
  const topPeople = Object.values(people).map(p => ({ name: p.name, count: p.count, roles: [...p.roles] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 8);

  // décadas
  const byDecade = {};
  watched.forEach(f => { const d = Math.floor(f.year / 10) * 10; byDecade[d] = (byDecade[d] || 0) + 1; });
  const topDecade = Object.entries(byDecade).sort((a, b) => b[1] - a[1])[0];

  // maior maratona (mais sessões num único dia)
  const perDay = {}; DIARY.forEach(e => { perDay[e.date] = (perDay[e.date] || 0) + 1; });
  const maxSessions = Math.max(...HEATMAP.map(d => d.count), 1);

  // favorito do ano (maior nota; desempate por gostou + mais recente)
  const fav = [...watched].filter(f => f.rating).sort((a, b) =>
    (b.rating - a.rating) || (b.liked - a.liked))[0];

  return {
    filmsWatched: watched.length, sessions, rewatches, totalMinutes,
    avgRating, monthly, dist, byGenre, byDirector, topPeople,
    topGenre: Object.entries(byGenre).sort((a, b) => b[1] - a[1])[0],
    topDirector: Object.entries(byDirector).sort((a, b) => b[1] - a[1])[0],
    topDecade, maxSessions, fav,
    liked: watched.filter(f => f.liked).length,
  };
})();

/* ── Tags com contagem (futuramente ligam à base de pessoas) ─────────────── */
const PERSON_TAGS = new Set(['Satoshi Kon']);  // tags que já apontam para uma pessoa
const TAGS = (() => {
  const m = {};
  FILMS.forEach(f => (f.tags || []).forEach(t => { m[t] = (m[t] || 0) + 1; }));
  return Object.entries(m).map(([name, count]) => ({ name, count, person: PERSON_TAGS.has(name) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
})();

/* ── Catálogo "API" (mock TMDB) — filmes fora da base, buscáveis ─────────
   Num app real isto é uma chamada à API de filmes; aqui simulamos a resposta
   já com todos os metadados. Selecionar um adiciona o filme à sua base. */
const TMDB_CATALOG = [
  { id:'oldboy', title:'Oldboy', year:2003, director:'Park Chan-wook', runtime:120, genre:'Thriller · Drama', country:'Coreia do Sul', poster:'blood', people:[{name:'Park Chan-wook',role:'Direção'},{name:'Choi Min-sik',role:'Oh Dae-su'}] },
  { id:'your-name', title:'Your Name.', year:2016, director:'Makoto Shinkai', runtime:106, genre:'Animação · Romance', country:'Japão', poster:'sea', people:[{name:'Makoto Shinkai',role:'Direção'}] },
  { id:'the-handmaiden', title:'A Criada', year:2016, director:'Park Chan-wook', runtime:145, genre:'Drama · Romance', country:'Coreia do Sul', poster:'wine', people:[{name:'Park Chan-wook',role:'Direção'},{name:'Kim Min-hee',role:'Hideko'}] },
  { id:'eternal-sunshine', title:'Brilho Eterno de uma Mente sem Lembranças', year:2004, director:'Michel Gondry', runtime:108, genre:'Romance · Ficção científica', country:'EUA', poster:'teal', people:[{name:'Michel Gondry',role:'Direção'},{name:'Kate Winslet',role:'Clementine'}] },
  { id:'2001', title:'2001: Uma Odisseia no Espaço', year:1968, director:'Stanley Kubrick', runtime:149, genre:'Ficção científica', country:'EUA · Reino Unido', poster:'ink', people:[{name:'Stanley Kubrick',role:'Direção'}] },
  { id:'chungking', title:'Amores Expressos', year:1994, director:'Wong Kar-wai', runtime:102, genre:'Romance · Drama', country:'Hong Kong', poster:'neon', people:[{name:'Wong Kar-wai',role:'Direção'},{name:'Tony Leung',role:'Cop 663'}] },
  { id:'paris-texas', title:'Paris, Texas', year:1984, director:'Wim Wenders', runtime:145, genre:'Drama', country:'Alemanha · EUA', poster:'ember', people:[{name:'Wim Wenders',role:'Direção'},{name:'Harry Dean Stanton',role:'Travis'}] },
  { id:'memories-murder', title:'Memórias de um Assassino', year:2003, director:'Bong Joon-ho', runtime:132, genre:'Crime · Drama', country:'Coreia do Sul', poster:'slate', people:[{name:'Bong Joon-ho',role:'Direção'},{name:'Song Kang-ho',role:'Det. Park'}] },
  { id:'cleo-5-7', title:'Cléo das 5 às 7', year:1962, director:'Agnès Varda', runtime:90, genre:'Drama', country:'França', poster:'rose', people:[{name:'Agnès Varda',role:'Direção'},{name:'Corinne Marchand',role:'Cléo'}] },
  { id:'stalker', title:'Stalker', year:1979, director:'Andrei Tarkovsky', runtime:162, genre:'Ficção científica · Drama', country:'União Soviética', poster:'forest', people:[{name:'Andrei Tarkovsky',role:'Direção'}] },
  { id:'a-separation', title:'A Separação', year:2011, director:'Asghar Farhadi', runtime:123, genre:'Drama', country:'Irã', poster:'bone', people:[{name:'Asghar Farhadi',role:'Direção'}] },
  { id:'red-shoes', title:'Os Sapatinhos Vermelhos', year:1948, director:'Powell & Pressburger', runtime:135, genre:'Drama · Musical', country:'Reino Unido', poster:'blood', people:[{name:'Michael Powell',role:'Direção'},{name:'Moira Shearer',role:'Victoria'}] },
];

/* simula a busca na API (com pequena latência) */
function searchTmdb(q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return [];
  return TMDB_CATALOG
    .filter(f => !filmById(f.id))   // não sugere o que já está na base
    .filter(f => f.title.toLowerCase().includes(s) || f.director.toLowerCase().includes(s) || String(f.year).includes(s))
    .slice(0, 6);
}

/* adiciona um resultado da API à base (status 'watched' — você acabou de ver) */
function addFilmFromCatalog(entry) {
  let f = filmById(entry.id);
  if (f) return f;
  f = { ...entry, status: 'watched', rating: null, ratingSource: null, liked: false,
        tags: [], review: null, notes: null, vault: [] };
  FILMS.push(f);
  return f;
}

/* helpers */
function filmById(id) { return FILMS.find(f => f.id === id); }
function diaryFor(id) { return DIARY.filter(e => e.filmId === id); }
function sessionsInLast(nDays) {
  const slice = HEATMAP.slice(-nDays);
  return slice.reduce((a, d) => a + d.count, 0);
}
function fmtRuntime(min) { const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h${m ? ' ' + m + 'min' : ''}` : `${m}min`; }

Object.assign(window, {
  TODAY, POSTER, FILMS, FAVORITES, LISTS, DIARY, HEATMAP, STATS, TAGS, PERSON_TAGS, TMDB_CATALOG,
  filmById, diaryFor, sessionsInLast, fmtRuntime, searchTmdb, addFilmFromCatalog,
});
