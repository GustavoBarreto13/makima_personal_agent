/* ═══════════════════════════════════════════════════════════════════════════
   Makima · Hub — dados compartilhados
   Voz da Makima: calma, precisa, no controle. Cada agente cuida de um domínio
   da vida; a Makima orquestra todas. Cores: preto + vermelho Makima + amarelo
   (os olhos dela). Cada agente carrega seu próprio acento de origem.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const MAKIMA = {
    copy: {
      kicker: 'CENTRO DE CONTROLE',
      name: 'Makima',
      role: 'Orquestradora',
      hello: 'Bom te ver de volta.',
      lead: 'Cada parte da sua vida tem uma responsável.',
      manifesto:
        'Dinheiro, leituras, pessoas, tempo, histórias — nada fica solto, nada se perde. ' +
        'Cada agente cuida do que importa no seu domínio. Eu mantenho todas em ordem ' +
        'para que você só precise decidir o que de fato importa.',
      tagline: 'Oito agentes cuidam de tudo. Eu cuido delas.',
      footer: 'Tudo sob controle.',
    },

    // domínios da vida — cada um com sua agente, acento e ação principal
    agents: [
      {
        id: 'nami', name: 'Nami', role: 'Finanças',
        img: 'nami/nami-hero.png', pos: '50% 22%',
        href: 'Nami - Finanças.html',
        does: 'Controla cada real — contas, cartões, orçamentos e o saldo do mês.',
        note: 'Nada entra ou sai sem ela saber.',
        stat: { v: '+R$ 2.480', k: 'saldo do mês' },
        stat2: { v: '12', k: 'lançamentos / semana' },
        action: { label: 'Adicionar transação', href: 'Nami - Finanças.html?novo=1', icon: 'plus' },
        accent: 'oklch(0.74 0.168 57)', accentText: 'oklch(0.80 0.150 62)',
        h: 57,
      },
      {
        id: 'frieren', name: 'Frieren', role: 'Livros',
        img: 'frieren/frieren.png', pos: '50% 18%',
        href: 'Frieren - Livros.html',
        does: 'Guarda tudo que você lê — catálogo, progresso e o que vem depois.',
        note: 'Ela tem todo o tempo do mundo para ler.',
        stat: { v: 'Duna · 47%', k: 'lendo agora' },
        stat2: { v: '9', k: 'livros este ano' },
        action: { label: 'Registrar leitura', href: 'Frieren - Livros.html?novo=1', icon: 'book' },
        accent: 'oklch(0.77 0.118 184)', accentText: 'oklch(0.82 0.110 184)',
        h: 184,
      },
      {
        id: 'komi', name: 'Komi', role: 'Pessoas',
        img: 'komi/komi.png', pos: '50% 14%',
        href: 'Komi - Pessoas.html',
        does: 'Cuida das suas relações — datas, contatos e quem anda sumido.',
        note: 'Ela não deixa ninguém ficar para trás.',
        stat: { v: '23', k: 'pessoas' },
        stat2: { v: '3', k: 'para reconectar' },
        action: { label: 'Adicionar pessoa', href: 'Komi - Pessoas.html?novo=1', icon: 'user' },
        accent: 'oklch(0.70 0.135 276)', accentText: 'oklch(0.78 0.125 276)',
        h: 276,
      },
      {
        id: 'violet', name: 'Violet', role: 'Diário',
        img: 'violet/violet.png', pos: '50% 12%',
        href: 'Violet - Diário.html',
        does: 'Escreve com você — registra os dias e o que eles significaram.',
        note: 'Ela traduz em palavras o que você sente.',
        stat: { v: '142', k: 'entradas' },
        stat2: { v: '9 dias', k: 'sequência' },
        action: { label: 'Nova entrada', href: 'Violet - Diário.html?novo=1', icon: 'pen' },
        accent: 'oklch(0.70 0.088 253)', accentText: 'oklch(0.78 0.090 253)',
        h: 253,
      },
      {
        id: 'kaguya', name: 'Kaguya', role: 'Tarefas · Agenda',
        img: 'kaguya/kaguya.jpg', pos: '50% 18%',
        href: 'Kaguya - Tarefas.html',
        does: 'Comanda seu tempo — tarefas, hábitos e a agenda da semana.',
        note: 'Quem controla o dia, controla tudo.',
        stat: { v: '5', k: 'tarefas hoje' },
        stat2: { v: '2', k: 'atrasadas' },
        action: { label: 'Nova tarefa', href: 'Kaguya - Tarefas.html?novo=1', icon: 'check' },
        action2: { label: 'Abrir agenda', href: 'Kaguya - Calendário (3 direções).html', icon: 'calendar' },
        accent: 'oklch(0.72 0.165 340)', accentText: 'oklch(0.80 0.150 340)',
        h: 340,
      },
      {
        id: 'mai', name: 'Mai', role: 'Séries',
        img: 'mai/mai-hero.png', pos: '50% 24%',
        href: 'Mai - Séries.html',
        does: 'Acompanha suas séries — temporadas, episódios e notas.',
        note: 'Atriz consagrada — sabe o que merece destaque.',
        stat: { v: 'Severance', k: 'T2 · E5' },
        stat2: { v: '24', k: 'séries' },
        action: { label: 'Adicionar série', href: 'Mai - Séries.html?novo=1', icon: 'tv' },
        accent: 'oklch(0.70 0.120 292)', accentText: 'oklch(0.78 0.115 292)',
        h: 292,
      },
      {
        id: 'marin', name: 'Marin', role: 'Animes',
        img: 'marin/marin-hero.png', pos: '50% 26%',
        href: 'Marin - Animes.html',
        does: 'Sua estante de animes — temporada atual, progresso e wishlist.',
        note: 'Pura empolgação — vive cada lançamento.',
        stat: { v: '3', k: 'na temporada' },
        stat2: { v: '128', k: 'episódios' },
        action: { label: 'Adicionar anime', href: 'Marin - Animes.html?novo=1', icon: 'sparkle' },
        accent: 'oklch(0.74 0.16 210)', accentText: 'oklch(0.84 0.14 208)',
        h: 210,
      },
      {
        id: 'akane', name: 'Akane', role: 'Filmes',
        img: 'akane/akane-hero.png', pos: '50% 24%',
        href: 'Akane - Filmes.html',
        does: 'Seu diário de cinema — filmes vistos, notas e o que assistir.',
        note: 'Olhar de crítica, escuro de sala de projeção.',
        stat: { v: '4.5★', k: 'última nota' },
        stat2: { v: '87', k: 'filmes vistos' },
        action: { label: 'Marcar filme', href: 'Akane - Filmes.html?novo=1', icon: 'film' },
        accent: 'oklch(0.66 0.115 196)', accentText: 'oklch(0.79 0.10 192)',
        h: 196,
      },
    ],
  };

  MAKIMA.makimaImg = 'uploads/dd4146def807f4b81d23a20dd4692703-removebg-preview.png';
  window.MAKIMA = MAKIMA;
})();
