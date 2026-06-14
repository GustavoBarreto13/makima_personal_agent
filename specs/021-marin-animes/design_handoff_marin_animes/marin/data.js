/* ─────────────────────────────────────────────────────────────────────────
   Marin · Animes — dados do mock
   O ACERVO (ANIMES) é a lista única de animes. O DIÁRIO (LOGS) é o registro
   cronológico de sessões — bebe do acervo; um anime aparece várias vezes
   (vários blocos de episódios), cada sessão com data, eps, nota e nota textual.
   Escala MAL 0–10 (meia estrela). Voz da Marin Kitagawa (ficção) — kawaii,
   explosiva, apaixonada por anime. ✨
   ───────────────────────────────────────────────────────────────────────── */

const TODAY = '2026-06-13';

/* Paletas de pôster — campos de cor vibrantes (kawaii). bg gradiente, ink, kicker. */
const POSTER = {
  magenta: { a:'oklch(0.50 0.22 350)', b:'oklch(0.30 0.16 320)', ink:'oklch(0.97 0.03 350)' },
  violet:  { a:'oklch(0.46 0.20 296)', b:'oklch(0.28 0.14 300)', ink:'oklch(0.96 0.03 300)' },
  cyan:    { a:'oklch(0.50 0.16 210)', b:'oklch(0.28 0.10 230)', ink:'oklch(0.97 0.04 210)' },
  emerald: { a:'oklch(0.50 0.15 158)', b:'oklch(0.28 0.10 170)', ink:'oklch(0.97 0.04 158)' },
  amber:   { a:'oklch(0.58 0.15 70)',  b:'oklch(0.34 0.12 48)',  ink:'oklch(0.98 0.04 80)'  },
  sunset:  { a:'oklch(0.56 0.19 30)',  b:'oklch(0.32 0.15 12)',  ink:'oklch(0.98 0.04 40)'  },
  indigo:  { a:'oklch(0.44 0.16 270)', b:'oklch(0.26 0.10 282)', ink:'oklch(0.96 0.03 280)' },
  rose:    { a:'oklch(0.58 0.16 5)',   b:'oklch(0.34 0.13 350)', ink:'oklch(0.98 0.04 5)'   },
  teal:    { a:'oklch(0.50 0.12 195)', b:'oklch(0.28 0.08 205)', ink:'oklch(0.97 0.03 195)' },
  lime:    { a:'oklch(0.60 0.16 130)', b:'oklch(0.32 0.10 145)', ink:'oklch(0.98 0.04 130)' },
  plum:    { a:'oklch(0.42 0.18 330)', b:'oklch(0.26 0.12 320)', ink:'oklch(0.97 0.03 330)' },
  sky:     { a:'oklch(0.56 0.13 235)', b:'oklch(0.30 0.10 250)', ink:'oklch(0.98 0.04 235)' },
};

/* status: assistindo | completo | quero_assistir | pausado | abandonado
   score: 0–10 em passos de 0.5 (MAL) | null. fav = coração.
   episodes_total: null = em exibição (eps indefinidos).
   next: próximo ep (number, title, aired ISO). episodes: lista p/ a tela de detalhe.
   genres[], studio, season, media_type. synopsis + notes (voz da Marin). */
const ANIMES = [
  { id:'frieren', title:'Frieren: Beyond Journey\u2019s End', title_jp:'\u846C\u9001\u306E\u30D5\u30EA\u30FC\u30EC\u30F3', year:2023, season:'Outono 2023', studio:'Madhouse', media_type:'TV',
    genres:['Fantasy','Adventure','Drama'], poster:'cyan', status:'assistindo', score:9.5, fav:true,
    episodes_watched:24, episodes_total:28, next:{ number:25, title:'Aura, a Ceifadora', aired:'2026-06-14' },
    synopsis:'A elfa Frieren sobreviveu \u00e0s d\u00e9cadas que seus companheiros de jornada n\u00e3o viveram. Agora ela viaja para entender o que \u201cconhecer pessoas\u201d realmente significa \u2014 e o tempo, que para ela escorre devagar, vira o tema mais doloroso e bonito do anime.',
    notes:'EU N\u00c3O ESTAVA PRONTA pra chorar tanto com um anime sobre uma elfa de cara fechada. Cada flashback me destr\u00f3i. A cena da Himmel?? Refiz o cosplay da Frieren DUAS vezes por causa desse arco. \u2728',
    episodes:[] },
  { id:'dungeon-meshi', title:'Delicious in Dungeon', title_jp:'\u30C0\u30F3\u30B8\u30E7\u30F3\u98EF', year:2024, season:'Inverno 2024', studio:'TRIGGER', media_type:'TV',
    genres:['Fantasy','Adventure','Comedy'], poster:'amber', status:'assistindo', score:9.0, fav:true,
    episodes_watched:12, episodes_total:24, next:{ number:13, title:'Bolinhos / Dumplings', aired:'2026-06-15' },
    synopsis:'Para resgatar a irm\u00e3 das entranhas de uma masmorra, Laios e seu grupo decidem cozinhar e comer os monstros que enfrentam. Receita de fantasia gastron\u00f4mica com mais cora\u00e7\u00e3o do que tem direito.',
    notes:'O arco da Marcille foi TOP demais!! A TRIGGER cozinhando (literalmente). Quero o livro de receitas do Senshi na minha vida. Eu assistiria 200 eps disso.',
    episodes:[] },
  { id:'apothecary', title:'The Apothecary Diaries', title_jp:'\u85AC\u5C4B\u306E\u3072\u3068\u308A\u3054\u3068', year:2023, season:'Outono 2023', studio:'OLM \u00b7 TOHO', media_type:'TV',
    genres:['Mystery','Drama','Historical'], poster:'plum', status:'assistindo', score:8.5, fav:false,
    episodes_watched:18, episodes_total:24, next:{ number:19, title:'O Banquete de Inverno', aired:'2026-06-16' },
    synopsis:'Maomao, uma boticheira sequestrada e vendida ao har\u00e9m imperial, resolve mist\u00e9rios de envenenamento com a frieza de uma cientista e a curiosidade de uma gata.',
    notes:'A Maomao \u00e9 minha personalidade quando algu\u00e9m fala de veneno. Detetive + far\u00e1cia + drama de corte = combina\u00e7\u00e3o perfeita. O Jinshi que aguente.',
    episodes:[] },
  { id:'bocchi', title:'Bocchi the Rock!', title_jp:'\u307C\u3063\u3061\u30FB\u3056\u30FB\u308D\u3063\u304F\uFF01', year:2022, season:'Outono 2022', studio:'CloverWorks', media_type:'TV',
    genres:['Comedy','Music','Slice of Life'], poster:'rose', status:'completo', score:9.0, fav:true,
    episodes_watched:12, episodes_total:12, next:null,
    synopsis:'Hitori \u201cBocchi\u201d Gotoh sonha em ser uma estrela do rock \u2014 mas \u00e9 t\u00e3o ansiosa que mal consegue falar. Quando entra para uma banda, sua ang\u00fastia social vira anima\u00e7\u00e3o experimental geninha.',
    notes:'EU SOU A BOCCHI. Socialmente, fisicamente, espiritualmente. As anima\u00e7\u00f5es de surto dela s\u00e3o arte moderna. Coloquei \u201cseishun complex\u201d em loop por uma semana inteira.',
    episodes:[] },
  { id:'oshi-no-ko', title:'Oshi no Ko', title_jp:'\u3010\u63A8\u3057\u306E\u5B50\u3011', year:2023, season:'Primavera 2023', studio:'Doga Kobo', media_type:'TV',
    genres:['Drama','Supernatural'], poster:'magenta', status:'completo', score:8.5, fav:false,
    episodes_watched:11, episodes_total:11, next:null,
    synopsis:'Renascido como filho de sua \u00eddol favorita, um m\u00e9dico assassinado mergulha no lado sombrio da ind\u00fastria do entretenimento japon\u00eas, entre brilho de palco e mentiras.',
    notes:'O primeiro epis\u00f3dio (de 90 min!) me deixou de queixo ca\u00eddo. Doloroso e lindo. A Akane curou os filmes, mas esse aqui \u00e9 sobre o pre\u00e7o do palco \u2014 me deu calafrio.',
    episodes:[] },
  { id:'vinland-2', title:'Vinland Saga Season 2', title_jp:'\u30F4\u30A3\u30F3\u30E9\u30F3\u30C9\u30FB\u30B5\u30AC 2', year:2023, season:'Inverno 2023', studio:'MAPPA', media_type:'TV',
    genres:['Action','Adventure','Drama'], poster:'emerald', status:'completo', score:9.0, fav:false,
    episodes_watched:24, episodes_total:24, next:null,
    synopsis:'Longe das batalhas, Thorfinn vira escravo numa fazenda e precisa reconstruir um sentido para viver. Um arco de paz t\u00e3o intenso quanto qualquer guerra.',
    notes:'\u201cEu n\u00e3o tenho inimigos.\u201d Chorei. O arco da fazenda \u00e9 corajoso demais \u2014 trocar a a\u00e7\u00e3o por reden\u00e7\u00e3o e ainda prender? Respeito.',
    episodes:[] },
  { id:'jjk-2', title:'Jujutsu Kaisen Season 2', title_jp:'\u546A\u8853\u5EFB\u6226 2', year:2023, season:'Ver\u00e3o 2023', studio:'MAPPA', media_type:'TV',
    genres:['Action','Supernatural'], poster:'indigo', status:'pausado', score:8.0, fav:false,
    episodes_watched:17, episodes_total:23, next:{ number:18, title:'Shibuya, Right Before Dawn', aired:null },
    synopsis:'O incidente de Shibuya transforma o feiticeiro Yuji Itadori e seus aliados num inferno urbano de maldi\u00e7\u00f5es. A anima\u00e7\u00e3o atinge picos absurdos \u2014 e o luto, tamb\u00e9m.',
    notes:'Pausei porque o arco de Shibuya me deixa ANSIOSA demais pra maratonar. Preciso de coragem (e de um cobertor) pra voltar. A anima\u00e7\u00e3o \u00e9 surreal.',
    episodes:[] },
  { id:'csm', title:'Chainsaw Man', title_jp:'\u30C1\u30A7\u30F3\u30BD\u30FC\u30DE\u30F3', year:2022, season:'Outono 2022', studio:'MAPPA', media_type:'TV',
    genres:['Action','Horror','Supernatural'], poster:'sunset', status:'completo', score:8.5, fav:false,
    episodes_watched:12, episodes_total:12, next:null,
    synopsis:'Denji funde-se ao seu dem\u00f4nio-motosserra para sobreviver e ca\u00e7ar dem\u00f4nios. Caos, sangue e uma melancolia punk por baixo de toda a porrada.',
    notes:'Cada ED com um artista diferente foi um presente. O Denji s\u00f3 quer um abra\u00e7o e p\u00e3o com geleia, coitado. Vibe suja e linda.',
    episodes:[] },
  { id:'spy-family', title:'SPY \u00d7 FAMILY', title_jp:'SPY\u00d7FAMILY', year:2022, season:'Primavera 2022', studio:'WIT \u00b7 CloverWorks', media_type:'TV',
    genres:['Action','Comedy','Slice of Life'], poster:'teal', status:'assistindo', score:8.5, fav:false,
    episodes_watched:25, episodes_total:null, next:{ number:26, title:'Miss\u00e3o & Fam\u00edlia', aired:'2026-06-18' },
    synopsis:'Um espi\u00e3o, uma assassina e uma telep\u00e1tica formam uma fam\u00edlia falsa para uma miss\u00e3o \u2014 e acidentalmente viram a fam\u00edlia mais fofa da TV. A Anya carrega tudo.',
    notes:'ANYA. \u00c9 isso. \u201cwaku waku\u201d virou meu estado de esp\u00edrito padr\u00e3o. Em exibi\u00e7\u00e3o cont\u00ednua, ent\u00e3o nunca acaba \u2014 perfeito.',
    episodes:[] },
  { id:'mob-3', title:'Mob Psycho 100 III', title_jp:'\u30E2\u30D6\u30B5\u30A4\u30B3100 III', year:2022, season:'Outono 2022', studio:'Bones', media_type:'TV',
    genres:['Action','Comedy','Supernatural'], poster:'lime', status:'completo', score:9.0, fav:true,
    episodes_watched:12, episodes_total:12, next:null,
    synopsis:'Shigeo \u201cMob\u201d Kageyama, um esper poderos\u00edssimo, s\u00f3 quer crescer como pessoa. O clim\u00e1max da s\u00e9rie \u00e9 sobre gentileza \u2014 e ainda \u00e9 o melhor sakuga da TV.',
    notes:'O final mais maduro que um anime de a\u00e7\u00e3o j\u00e1 me deu. \u201c100% de gratid\u00e3o.\u201d Bones cozinhou. Chorei sorrindo.',
    episodes:[] },
  { id:'edgerunners', title:'Cyberpunk: Edgerunners', title_jp:'\u30B5\u30A4\u30D0\u30FC\u30D1\u30F3\u30AF', year:2022, season:'Setembro 2022', studio:'TRIGGER', media_type:'ONA',
    genres:['Action','Sci-Fi','Drama'], poster:'magenta', status:'completo', score:8.5, fav:false,
    episodes_watched:10, episodes_total:10, next:null,
    synopsis:'Em Night City, o jovem David vira mercen\u00e1rio cibern\u00e9tico atr\u00e1s de um sonho que a cidade jamais deixa ningu\u00e9m alcan\u00e7ar. Neon, velocidade e cora\u00e7\u00e3o partido.',
    notes:'\u201cI Really Want to Stay at Your House\u201d toca e eu desabo, toda santa vez. A TRIGGER no auge do estilo. Curto e devastador.',
    episodes:[] },
  { id:'made-in-abyss', title:'Made in Abyss', title_jp:'\u30E1\u30A4\u30C9\u30A4\u30F3\u30A2\u30D3\u30B9', year:2017, season:'Ver\u00e3o 2017', studio:'Kinema Citrus', media_type:'TV',
    genres:['Adventure','Drama','Fantasy'], poster:'sky', status:'quero_assistir', score:null, fav:false,
    episodes_watched:0, episodes_total:13, next:null,
    synopsis:'Uma menina e um rob\u00f4 descem um abismo gigantesco repleto de maravilhas \u2014 e de horrores que a arte fofa esconde at\u00e9 ser tarde demais.',
    notes:'Todo mundo me avisou: \u201cn\u00e3o se engane com o tra\u00e7o fofo\u201d. Guardando coragem (e len\u00e7os) pra come\u00e7ar. \u00cda entrar na fila faz tempo.',
    episodes:[] },
  { id:'monogatari', title:'Monogatari Series: First Season', title_jp:'\u5316\u7269\u8A9E', year:2009, season:'Ver\u00e3o 2009', studio:'Shaft', media_type:'TV',
    genres:['Mystery','Supernatural','Romance'], poster:'rose', status:'quero_assistir', score:null, fav:false,
    episodes_watched:0, episodes_total:15, next:null,
    synopsis:'Koyomi, meio vampiro, ajuda garotas atormentadas por \u201cesp\u00edritos\u201d que s\u00e3o, na verdade, met\u00e1foras de seus traumas. Di\u00e1logo afiado e a dire\u00e7\u00e3o mais maluca da Shaft.',
    notes:'O estilo visual da Shaft me fascina. Dizem que \u00e9 muito di\u00e1logo \u2014 perfeito pra ver com aten\u00e7\u00e3o total num fim de semana.',
    episodes:[] },
  { id:'violet-evergarden', title:'Violet Evergarden', title_jp:'\u30F4\u30A1\u30A4\u30AA\u30EC\u30C3\u30C8\u30FB\u30A8\u30F4\u30A1\u30FC\u30AC\u30FC\u30C7\u30F3', year:2018, season:'Inverno 2018', studio:'Kyoto Animation', media_type:'TV',
    genres:['Drama','Fantasy','Slice of Life'], poster:'violet', status:'quero_assistir', score:null, fav:false,
    episodes_watched:0, episodes_total:13, next:null,
    synopsis:'Uma ex-soldada aprende a entender sentimentos escrevendo cartas para os outros. A KyoAni transformando luto e amor em aquarela animada.',
    notes:'A Violet do app cura o di\u00e1rio \u2014 e eu ainda n\u00e3o vi o anime dela?! Vergonha. Separando os len\u00e7ois antes. Dizem que o ep 10 destr\u00f3i.',
    episodes:[] },
  { id:'sousou-movie', title:'A Silent Voice', title_jp:'\u8056\u3057\u3066\u30B3\u30A8', year:2016, season:'Filme 2016', studio:'Kyoto Animation', media_type:'Movie',
    genres:['Drama','Romance'], poster:'teal', status:'completo', score:9.5, fav:true,
    episodes_watched:1, episodes_total:1, next:null,
    synopsis:'Anos depois de ter sido cruel com uma colega surda, Shoya tenta se redimir. Um filme sobre culpa, perd\u00e3o e o medo de olhar nos olhos dos outros.',
    notes:'O filme que eu indico pra todo mundo que acha que \u201canime \u00e9 s\u00f3 desenho\u201d. Os Xs nos rostos? Genial. Reassisti e chorei do mesmo jeito.',
    episodes:[] },
  { id:'horimiya', title:'Horimiya', title_jp:'\u30DB\u30EA\u3055\u3093\u3068\u5BAE\u304F\u3093', year:2021, season:'Inverno 2021', studio:'CloverWorks', media_type:'TV',
    genres:['Romance','Comedy','Slice of Life'], poster:'sunset', status:'abandonado', score:6.5, fav:false,
    episodes_watched:7, episodes_total:13, next:null,
    synopsis:'Hori, a garota popular, e Miyamura, o nerd quieto, descobrem os lados escondidos um do outro. Rom-com fofa que corre r\u00e1pido demais pelo material.',
    notes:'Fofo, mas senti que pularam metade do mang\u00e1. Larguei sem rancor \u2014 talvez eu volte num dia mais paciente. Por ora, fica aqui.',
    episodes:[] },
];

/* ── Favoritos (vitrine do perfil) — derivado de fav, editável em runtime ── */
const FAVORITES = ANIMES.filter(a => a.fav).map(a => a.id);

/* gera a lista de episódios de um anime (determinística) p/ a tela de detalhe */
const EP_TITLES = ['A Jornada Continua','O Encontro','Sombras do Passado','A Decis\u00e3o','Tempestade','La\u00e7os','O Confronto','Mem\u00f3rias','Amanhecer','A Promessa','Despedida','Reencontro','O Banquete','Travessia','A Verdade','Recome\u00e7o','O \u00daltimo Passo','Ecos','Floresta','A Carta','Solilo\u00f3quio','Maré','O Salto','Aurora','A Ceifadora','Silêncio','O Mapa','Retorno'];
function buildEpisodes(a) {
  if (a.episodes && a.episodes.length) return a.episodes;
  const total = a.episodes_total || (a.episodes_watched + 4);
  const out = [];
  const base = new Date(a.next?.aired ? a.next.aired : '2024-01-04');
  for (let i = 1; i <= total; i++) {
    const watched = i <= a.episodes_watched;
    const aired = new Date(base); aired.setDate(base.getDate() + (i - a.episodes_watched - 1) * 7);
    out.push({ number:i, title: (a.next && i === a.next.number ? a.next.title : EP_TITLES[(i-1) % EP_TITLES.length]),
      aired: aired.toISOString().slice(0,10), watched });
  }
  return out;
}

/* ── DIÁRIO — sessões em ordem cronológica (mais recente primeiro) ───────── */
const LOGS = [
  { id:'l1',  date:'2026-06-12', animeId:'frieren',      ep_start:22, ep_end:24, score:9.5, note:'O arco da prova de magia \u00e9 perfeito. A Frieren fingindo n\u00e3o se importar enquanto se importa MUITO. \u2728' },
  { id:'l2',  date:'2026-06-10', animeId:'dungeon-meshi',ep_start:10, ep_end:12, score:9.0, note:'Epis\u00f3dio do Marcille foi top!! Senshi cozinhando kraken \u00e9 minha terapia.' },
  { id:'l3',  date:'2026-06-08', animeId:'apothecary',   ep_start:16, ep_end:18, score:8.5, note:'Maomao resolvendo envenenamento com cara de t\u00e9dio = eu no trabalho.' },
  { id:'l4',  date:'2026-06-05', animeId:'spy-family',   ep_start:23, ep_end:25, score:8.5, note:'A Anya tentando passar na prova. WAKU WAKU. Chorei de rir.' },
  { id:'l5',  date:'2026-05-30', animeId:'frieren',      ep_start:19, ep_end:21, score:9.5, note:'Stark sendo Stark. A din\u00e2mica do grupo t\u00e1 redonda demais.' },
  { id:'l6',  date:'2026-05-24', animeId:'sousou-movie', ep_start:1,  ep_end:1,  score:9.5, note:'Reassisti A Silent Voice. Continua me destruindo no mesmo segundo.' },
  { id:'l7',  date:'2026-05-18', animeId:'dungeon-meshi',ep_start:7,  ep_end:9,  score:9.0, note:'Arco do drag\u00e3o vermelho!! A TRIGGER soltando a anima\u00e7\u00e3o. Que delicia.' },
  { id:'l8',  date:'2026-05-11', animeId:'bocchi',       ep_start:9,  ep_end:12, score:9.0, note:'Maratona final. A apresenta\u00e7\u00e3o no festival me deu arrepio. EU SOU A BOCCHI.' },
  { id:'l9',  date:'2026-05-03', animeId:'apothecary',   ep_start:13, ep_end:15, score:8.5, note:'O mist\u00e9rio das concubinas adoecendo. Investiga\u00e7\u00e3o + corte imperial \u2764\ufe0f' },
  { id:'l10', date:'2026-04-26', animeId:'mob-3',        ep_start:9,  ep_end:12, score:9.0, note:'O cl\u00edmax. \u201c100% de gratid\u00e3o\u201d. Bones cozinhou demais. Chorei sorrindo.' },
  { id:'l11', date:'2026-04-19', animeId:'frieren',      ep_start:14, ep_end:18, score:9.5, note:'O exame de mago come\u00e7ou e eu n\u00e3o consigo parar. Maratona acidental.' },
  { id:'l12', date:'2026-04-12', animeId:'vinland-2',    ep_start:20, ep_end:24, score:9.0, note:'\u201cEu n\u00e3o tenho inimigos.\u201d Final do arco da fazenda. Coragem narrativa.' },
  { id:'l13', date:'2026-03-29', animeId:'oshi-no-ko',   ep_start:8,  ep_end:11, score:8.5, note:'O arco da pe\u00e7a de teatro. O pre\u00e7o do palco doi de ver.' },
  { id:'l14', date:'2026-03-15', animeId:'edgerunners',  ep_start:6,  ep_end:10, score:8.5, note:'Final. \u201cI Really Want to Stay at Your House\u201d e eu no ch\u00e3o. Night City venceu.' },
  { id:'l15', date:'2026-02-22', animeId:'csm',          ep_start:8,  ep_end:12, score:8.5, note:'Maratona Chainsaw. Cada ED \u00e9 um clipe. Denji merece um abra\u00e7o.' },
  { id:'l16', date:'2026-02-08', animeId:'jjk-2',        ep_start:14, ep_end:17, score:8.0, note:'Shibuya come\u00e7ou. Ansiedade m\u00e1xima. Vou precisar pausar (e pausei).' },
  { id:'l17', date:'2026-01-25', animeId:'spy-family',   ep_start:18, ep_end:22, score:8.5, note:'Anya, Bond e o cachorro vidente. Fam\u00edlia mais fofa da TV.' },
  { id:'l18', date:'2026-01-11', animeId:'apothecary',   ep_start:9,  ep_end:12, score:8.5, note:'Maomao + Jinshi. A tens\u00e3o do har\u00e9m. Detetive de far\u00e1cia, meu sonho.' },
];

/* ── Lançamentos: próximos episódios dos animes "assistindo" ────────────── */
function buildSchedule() {
  return ANIMES
    .filter(a => a.status === 'assistindo' && a.next && a.next.aired)
    .map(a => ({ animeId:a.id, ep:a.next.number, title:a.next.title, aired:a.next.aired, time:'23:00 JST', timeBrt:'11:00 BRT' }))
    .sort((x, y) => x.aired.localeCompare(y.aired));
}
const SCHEDULE = buildSchedule();

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
    const watches = r < (weekend ? 0.5 : 0.26) ? (rng() < 0.2 && weekend ? 3 : rng() < 0.4 ? 2 : 1) : 0;
    days.push({ date: new Date(d).toISOString().slice(0, 10), count: watches });
  }
  LOGS.forEach(e => { const day = days.find(x => x.date === e.date); if (day) day.count = Math.max(day.count, 1); });
  return days;
}
const HEATMAP = buildHeatmap();

/* ── STATS — pré-calculadas para Início e Estatísticas ──────────────────── */
const STATS = (() => {
  const watched = ANIMES.filter(a => a.status === 'completo' || a.status === 'assistindo');
  const epsTotal = LOGS.reduce((a, e) => a + (e.ep_end - e.ep_start + 1), 0);
  const hours = Math.round(epsTotal * 23 / 60);   // ~23min por ep
  const scores = ANIMES.filter(a => a.score != null).map(a => a.score);
  const avgScore = scores.reduce((a, s) => a + s, 0) / (scores.length || 1);

  // sessões e episódios por mês
  const monthlyEps = Array(12).fill(0);
  LOGS.forEach(e => { monthlyEps[new Date(e.date + 'T00:00:00').getMonth()] += (e.ep_end - e.ep_start + 1); });

  // por status
  const byStatus = {};
  ['assistindo','completo','quero_assistir','pausado','abandonado'].forEach(s => { byStatus[s] = ANIMES.filter(a => a.status === s).length; });

  // top gêneros + estúdios
  const byGenre = {}; ANIMES.forEach(a => a.genres.forEach(g => { byGenre[g] = (byGenre[g] || 0) + 1; }));
  const byStudio = {}; watched.forEach(a => a.studio.split(' \u00b7 ').forEach(st => { byStudio[st] = (byStudio[st] || 0) + 1; }));

  const fav = [...ANIMES].filter(a => a.score).sort((a, b) => (b.score - a.score) || (b.fav - a.fav))[0];
  const maxSessions = Math.max(...HEATMAP.map(d => d.count), 1);

  return {
    animesTracked: ANIMES.length, completed: byStatus.completo, watching: byStatus.assistindo,
    epsTotal, hours, avgScore, monthlyEps, byStatus, byGenre, byStudio,
    topGenre: Object.entries(byGenre).sort((a, b) => b[1] - a[1])[0],
    fav, maxSessions, favCount: ANIMES.filter(a => a.fav).length, sessions: LOGS.length,
  };
})();

/* ── "API" Jikan (mock) — animes fora do acervo, buscáveis ──────────────── */
const JIKAN_CATALOG = [
  { id:'steins-gate', title:'Steins;Gate', title_jp:'\u30B7\u30E5\u30BF\u30A4\u30F3\u30BA\u30FB\u30B2\u30FC\u30C8', year:2011, season:'Primavera 2011', studio:'White Fox', media_type:'TV', genres:['Sci-Fi','Thriller'], poster:'sky', episodes_total:24 },
  { id:'gurren', title:'Tengen Toppa Gurren Lagann', title_jp:'\u5929\u5143\u7A81\u7834\u30B0\u30EC\u30F3\u30E9\u30AC\u30F3', year:2007, season:'Primavera 2007', studio:'Gainax', media_type:'TV', genres:['Action','Sci-Fi','Adventure'], poster:'sunset', episodes_total:27 },
  { id:'hyouka', title:'Hyouka', title_jp:'\u6C37\u83D3', year:2012, season:'Primavera 2012', studio:'Kyoto Animation', media_type:'TV', genres:['Mystery','Slice of Life'], poster:'teal', episodes_total:22 },
  { id:'devilman', title:'Devilman Crybaby', title_jp:'\u30C7\u30D3\u30EB\u30DE\u30F3', year:2018, season:'Inverno 2018', studio:'Science SARU', media_type:'ONA', genres:['Action','Horror','Supernatural'], poster:'magenta', episodes_total:10 },
  { id:'odd-taxi', title:'Odd Taxi', title_jp:'\u30AA\u30C3\u30C9\u30FB\u30BF\u30AF\u30B7\u30FC', year:2021, season:'Primavera 2021', studio:'OLM \u00b7 P.I.C.S.', media_type:'TV', genres:['Mystery','Drama'], poster:'amber', episodes_total:13 },
  { id:'ping-pong', title:'Ping Pong the Animation', title_jp:'\u30D4\u30F3\u30DD\u30F3', year:2014, season:'Primavera 2014', studio:'Tatsunoko', media_type:'TV', genres:['Sports','Drama'], poster:'lime', episodes_total:11 },
  { id:'mononoke', title:'Princess Mononoke', title_jp:'\u3082\u306E\u306E\u3051\u59EB', year:1997, season:'Filme 1997', studio:'Studio Ghibli', media_type:'Movie', genres:['Adventure','Fantasy'], poster:'emerald', episodes_total:1 },
  { id:'cowboy-bebop', title:'Cowboy Bebop', title_jp:'\u30AB\u30A6\u30DC\u30FC\u30A4\u30D3\u30D0\u30C3\u30D7', year:1998, season:'Primavera 1998', studio:'Sunrise', media_type:'TV', genres:['Action','Sci-Fi','Drama'], poster:'indigo', episodes_total:26 },
  { id:'k-on', title:'K-On!', title_jp:'\u3051\u3044\u304A\u3093\uFF01', year:2009, season:'Primavera 2009', studio:'Kyoto Animation', media_type:'TV', genres:['Comedy','Music','Slice of Life'], poster:'rose', episodes_total:13 },
  { id:'erased', title:'Erased', title_jp:'\u50D5\u3060\u3051\u304C\u3044\u306A\u3044\u8857', year:2016, season:'Inverno 2016', studio:'A-1 Pictures', media_type:'TV', genres:['Mystery','Supernatural','Drama'], poster:'cyan', episodes_total:12 },
  { id:'nichijou', title:'Nichijou', title_jp:'\u65E5\u5E38', year:2011, season:'Primavera 2011', studio:'Kyoto Animation', media_type:'TV', genres:['Comedy','Slice of Life'], poster:'lime', episodes_total:26 },
  { id:'mushishi', title:'Mushishi', title_jp:'\u87F2\u5E2B', year:2005, season:'Outono 2005', studio:'Artland', media_type:'TV', genres:['Mystery','Slice of Life','Supernatural'], poster:'plum', episodes_total:26 },
];

function searchJikan(q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return [];
  return JIKAN_CATALOG
    .filter(a => !animeById(a.id))
    .filter(a => a.title.toLowerCase().includes(s) || a.studio.toLowerCase().includes(s) || String(a.year).includes(s) || a.genres.some(g => g.toLowerCase().includes(s)))
    .slice(0, 6);
}
function addAnimeFromCatalog(entry) {
  let a = animeById(entry.id);
  if (a) return a;
  a = { ...entry, status:'quero_assistir', score:null, fav:false, episodes_watched:0, next:null, notes:null, synopsis: entry.synopsis || 'Adicionado pela busca \u2014 sinopse vir\u00e1 do MAL na pr\u00f3xima sincroniza\u00e7\u00e3o.', episodes:[] };
  ANIMES.push(a);
  return a;
}

/* ── helpers ────────────────────────────────────────────────────────────── */
function animeById(id) { return ANIMES.find(a => a.id === id); }
function logsFor(id) { return LOGS.filter(e => e.animeId === id); }
function sessionsInLast(nDays) { return HEATMAP.slice(-nDays).reduce((a, d) => a + d.count, 0); }

const STATUS_LABEL = { assistindo:'Assistindo', completo:'Completo', quero_assistir:'Quero assistir', pausado:'Pausado', abandonado:'Abandonado' };
const STATUS_VAR = { assistindo:'--st-assistindo', completo:'--st-completo', quero_assistir:'--st-quero_assistir', pausado:'--st-pausado', abandonado:'--st-abandonado' };

/* ── Perfil MAL sincronizado — números reais da conta (widget de stats) ──── */
const MAL_PROFILE = {
  rows: [
    { status:'assistindo',     label:'Assistindo',     n:14  },
    { status:'completo',       label:'Completo',       n:167 },
    { status:'pausado',        label:'Em pausa',       n:32  },
    { status:'abandonado',     label:'Abandonado',     n:16  },
    { status:'quero_assistir', label:'Quero assistir', n:141 },
  ],
  total: 370, rewatched: 6, episodes: 2328,
};

Object.assign(window, {
  TODAY, POSTER, ANIMES, FAVORITES, LOGS, SCHEDULE, HEATMAP, STATS, JIKAN_CATALOG,
  animeById, logsFor, sessionsInLast, buildEpisodes, searchJikan, addAnimeFromCatalog,
  STATUS_LABEL, STATUS_VAR, MAL_PROFILE,
});
