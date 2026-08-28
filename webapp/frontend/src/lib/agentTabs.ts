// Título de aba + favicon de cada domínio — ponto único de edição.
// Trocar a arte de um agente = trocar só o path aqui (e o arquivo em public/).
export const AGENT_TABS = {
  akane:   { title: 'Akane',   icon: '/favicon-akane.png' },
  kaguya:  { title: 'Kaguya',  icon: '/favicon-kaguya.jpg' },
  nami:    { title: 'Nami',    icon: '/favicon-nami.png' },
  frieren: { title: 'Frieren', icon: '/favicon-frieren.png' },
  marin:   { title: 'Marin',   icon: '/favicon-marin.png' },
  mai:     { title: 'Mai',     icon: '/favicon-mai.png' },
  komi:    { title: 'Komi',    icon: '/favicon-komi.png' },
  violet:  { title: 'Violet',  icon: '/favicon-violet.png' },
  yato:    { title: 'Yato',    icon: '/favicon-yato.png' },
  makima:  { title: 'Makima',  icon: '/favicon.png' },
} as const
