/* ─────────────────────────────────────────────────────────────────────
   Yato · Viagens — dados mock (referência: §13 do guia de design)
   ───────────────────────────────────────────────────────────────────── */
const TODAY = '2026-08-20';

const TRIPS = [
  { id: 't1', title: 'Barroco a pé', city: 'Tiradentes', uf: 'MG', start: '2026-09-12', end: '2026-09-15',
    profile: 'economia', status: 'confirmada', created: '2026-08-02' },
  { id: 't2', title: null, city: 'Caraíva', uf: 'BA', start: '2026-11-08', end: '2026-11-12',
    profile: 'equilibrado', status: 'planejando', created: '2026-08-14' },
  { id: 't3', title: 'Minas fundadora', city: 'Ouro Preto', uf: 'MG', start: '2026-05-03', end: '2026-05-06',
    profile: 'economia', status: 'concluida', created: '2026-04-10' },
  { id: 't4', title: null, city: 'Cambará do Sul', uf: 'RS', start: '2026-06-20', end: '2026-06-24',
    profile: 'conforto', status: 'cancelada', created: '2026-05-28' },
];

const ITINERARY = [
  { id: 'i1', trip: 't1', day: '2026-09-12', period: 'tarde', time: '16:20', title: 'Chegada — rodoviária de Tiradentes', addr: 'Rodoviária, Av. Gov. Israel Pinheiro', mode: 'transfer', cost: 40 },
  { id: 'i2', trip: 't1', day: '2026-09-12', period: 'noite', time: null, title: 'Jantar no Largo das Forras', addr: 'Largo das Forras, centro', mode: 'a_pe', cost: 45 },
  { id: 'i3', trip: 't1', day: '2026-09-13', period: 'manha', time: '09:00', title: 'Igreja São Francisco de Assis', addr: 'R. Padre Toledo, 71', mode: 'a_pe', cost: 15 },
  { id: 'i4', trip: 't1', day: '2026-09-13', period: 'tarde', time: '13:00', title: 'Maria Fumaça para São João del-Rei', addr: 'Estação Ferroviária', mode: 'transfer', cost: 60 },
  { id: 'i5', trip: 't1', day: '2026-09-13', period: 'noite', time: null, title: 'Chafariz de São José', addr: 'R. do Chafariz', mode: 'a_pe', cost: null },
  { id: 'i6', trip: 't1', day: '2026-09-14', period: 'manha', time: '07:30', title: 'Serra de São José — trilha', addr: 'Portaria do Carteiro', mode: 'mototaxi', cost: 20 },
  { id: 'i7', trip: 't1', day: '2026-09-14', period: 'tarde', time: null, title: 'Museu Casa Padre Toledo', addr: 'R. Padre Toledo, 190', mode: 'a_pe', cost: 10 },
  { id: 'i8', trip: 't1', day: '2026-09-14', period: 'noite', time: null, title: 'Cervejaria local', addr: 'R. Direita', mode: 'a_pe', cost: 50 },
  { id: 'i9', trip: 't1', day: '2026-09-15', period: 'manha', time: null, title: 'Feira de artesanato', addr: 'Largo do Ó', mode: 'a_pe', cost: null },
  { id: 'i10', trip: 't1', day: '2026-09-15', period: 'tarde', time: '15:40', title: 'Volta — rodoviária', addr: 'Rodoviária', mode: 'transfer', cost: 40 },
];

const STEPS = [
  { key: 'porte_cidade', n: 1, name: 'Porte da cidade',
    instr: 'Confirme a população no IBGE e classifique: capital, média ou pequena. Isso calibra a expectativa de tudo que vem depois.' },
  { key: 'uber', n: 2, name: 'Uber',
    instr: 'Abra a lista oficial de cidades da Uber. Depois — sempre depois — abra o app e simule uma corrida com um endereço real do centro. Lista não é cobertura; simulação é.' },
  { key: '99', n: 3, name: '99',
    instr: 'Mesma coisa: página oficial e depois simulação in-app com endereço real. Anote se aparece 99Pop, 99Táxi ou nada.' },
  { key: 'indrive', n: 4, name: 'InDrive',
    instr: 'Busque a cidade dentro do app. No interior o InDrive costuma ser a melhor aposta, mesmo quando a lista pública não menciona a cidade.' },
  { key: 'transporte_publico', n: 5, name: 'Transporte público',
    instr: 'Traçe uma rota no Google Maps e no Moovit entre dois pontos da cidade. Se não aparecer ônibus, o veredito é inconclusivo — só ~150 cidades brasileiras estão mapeadas.' },
  { key: 'hospedagem_transfer', n: 6, name: 'Transfer da hospedagem',
    instr: 'Mande mensagem para a pousada: tem transfer da rodoviária? Quanto? Como os hóspedes se locomovem? Tem táxi ou mototáxi confiável para indicar?' },
  { key: 'deslocamentos', n: 7, name: 'Deslocamentos',
    instr: 'Meça no mapa hospedagem → cada ponto do roteiro. Registre tempo a pé, de carro e de ônibus. É isso que decide se dá pra ficar sem carro.' },
];

const DOSSIERS = {
  'MG/Tiradentes': {
    city: 'Tiradentes', uf: 'MG', size: 'pequena', pop: '7.500 hab', pedestrian: false,
    strategy: 'caminhavel_transfer', last: '2026-08-15', stale: false,
    summary: 'Centro histórico inteiro dá pra fazer a pé. A 99 confirmada é o plano B de chuva e de noite; o transfer da pousada resolve rodoviária e passeios.',
    checks: {
      porte_cidade: { v: 'confirmado', src: 'MUNIC/IBGE', at: '2026-08-14',
        ev: 'Cidade pequena. Base estatística: 51% dos municípios não têm ônibus urbano; apps chegam a 26%. Expectativa: táxi/mototáxi sim, ônibus urbano provavelmente não.' },
      uber: { v: 'ausente', src: 'simulação in-app', at: '2026-08-14',
        ev: 'Simulei corrida com endereço real do Largo das Forras: nenhum carro disponível, nas duas tentativas.' },
      '99': { v: 'confirmado', src: 'simulação in-app', at: '2026-08-14',
        ev: 'Apareceram carros na simulação in-app. 99Pop e 99Táxi, espera de 6 a 11 minutos.' },
      indrive: { v: 'inconclusivo', src: 'lista oficial', at: '2026-08-14',
        ev: 'Cidade não aparece na lista do app, mas o InDrive mira cidades desse porte. Refazer a simulação mais perto da viagem.' },
      transporte_publico: { v: 'inconclusivo', src: 'Google Maps', at: '2026-08-14',
        ev: 'Sem rotas no Maps nem no Moovit — mas só ~150 cidades brasileiras estão mapeadas. Ausência de dado NÃO prova ausência de ônibus.' },
      hospedagem_transfer: { v: 'confirmado', src: 'WhatsApp', at: '2026-08-15',
        ev: 'Pousada faz transfer da rodoviária por R$ 40 e organiza passeios. Indicou a cooperativa de táxi da praça.' },
      deslocamentos: { v: 'pendente', src: null, at: null, ev: null },
    },
  },
  'BA/Caraíva': {
    city: 'Caraíva', uf: 'BA', size: 'pequena', pop: '900 hab', pedestrian: true,
    strategy: 'caminhavel', last: '2026-08-16', stale: false,
    summary: 'Vila sem ruas asfaltadas e sem carros — o deslocamento é a pé na areia, e travessia de canoa para chegar. Mobilidade motorizada não se aplica.',
    checks: {
      porte_cidade: { v: 'confirmado', src: 'MUNIC/IBGE', at: '2026-08-16',
        ev: 'Vila de ~900 habitantes, distrito de Porto Seguro. Sem circulação de veículos: acesso por balsa/canoa e depois areia.' },
      uber: { v: 'na', src: null, at: null, ev: null },
      '99': { v: 'na', src: null, at: null, ev: null },
      indrive: { v: 'na', src: null, at: null, ev: null },
      transporte_publico: { v: 'na', src: null, at: null, ev: null },
      hospedagem_transfer: { v: 'confirmado', src: 'WhatsApp', at: '2026-08-16',
        ev: 'Pousada busca na travessia com carrinho de mão para a bagagem. R$ 30 por trecho.' },
      deslocamentos: { v: 'confirmado', src: 'Google Maps', at: '2026-08-16',
        ev: 'Tudo dentro de 900 m da travessia. Máximo 15 minutos a pé, na areia — calçado adequado importa mais que app de corrida.' },
    },
  },
};

const STRATEGY_LABEL = {
  caminhavel: { txt: 'Caminhável', emoji: '🚶' },
  caminhavel_transfer: { txt: 'Caminhável + transfer da pousada', emoji: '🚶' },
  transporte_publico: { txt: 'Transporte público', emoji: '🚌' },
  app_corrida: { txt: 'App de corrida', emoji: '🚗' },
  taxi_mototaxi: { txt: 'Táxi / mototáxi', emoji: '🛺' },
  transfer_hospedagem: { txt: 'Transfer da hospedagem', emoji: '🚐' },
  carro_alugado: { txt: 'Carro alugado', emoji: '🚗' },
};

const APPS = [
  { name: 'Uber', kind: 'app de corrida', cov: 'Capitais e cidades médias; cobertura declarada de ~1.000 municípios.', uf: 'BR' },
  { name: '99', kind: 'app de corrida', cov: 'Maior alcance declarado no interior; 99Pop e 99Táxi.', uf: 'BR' },
  { name: 'InDrive', kind: 'app de corrida', cov: 'Preço negociado; mira cidades pequenas onde os grandes não entram.', uf: 'BR' },
  { name: 'Garupa', kind: 'app de corrida', cov: 'Regional Sul e Sudeste, forte em cidades de até 100 mil hab.', uf: 'MG' },
  { name: 'Rota Pop', kind: 'app de corrida', cov: 'Interior de Minas e Goiás.', uf: 'MG' },
  { name: 'Ubiz Car', kind: 'app de corrida', cov: 'Cidades médias do Sudeste.', uf: 'MG' },
  { name: 'BibiMob', kind: 'app de corrida', cov: 'Interior mineiro e capixaba.', uf: 'MG' },
  { name: 'Urbano Norte', kind: 'app de corrida', cov: 'Norte e Nordeste.', uf: 'BA' },
  { name: 'Bora94', kind: 'app de corrida', cov: 'Centro-Oeste e Nordeste.', uf: 'BA' },
  { name: 'Chofer 46', kind: 'app de corrida', cov: 'Sul, cidades pequenas.', uf: 'RS' },
  { name: 'Urban66', kind: 'app de corrida', cov: 'Norte, foco no Pará.', uf: 'PA' },
  { name: 'V1', kind: 'app de corrida', cov: 'Interior paulista.', uf: 'SP' },
  { name: 'Cittamobi', kind: 'transporte público', cov: 'Horário de ônibus em ~200 cidades declaradas.', uf: 'BR' },
  { name: 'Moovit', kind: 'transporte público', cov: 'Rotas de ônibus onde há GTFS publicado.', uf: 'BR' },
];

const CONTACTS = [
  { name: 'Cooperativa de Táxi de Tiradentes', num: '(32) 3355-1099', note: 'Ponto no Largo das Forras. Indicada pela pousada.' },
  { name: 'Mototáxi — Zé da Serra', num: '(32) 98811-4402', note: 'Trilha da Serra de São José, R$ 20 o trecho.' },
  { name: 'Pousada Alicerce', num: '(32) 98120-7731', note: 'Transfer da rodoviária R$ 40. Organiza passeios.' },
];

const BUDGET = [
  { cat: 'transporte_ida', label: 'Transporte ida', est: 200, act: 195 },
  { cat: 'transporte_volta', label: 'Transporte volta', est: 200, act: 195 },
  { cat: 'hospedagem', label: 'Hospedagem', est: 600, act: 580 },
  { cat: 'alimentacao', label: 'Alimentação', est: 300, act: 385 },
  { cat: 'mobilidade_local', label: 'Mobilidade local', est: 150, act: 60 },
  { cat: 'passeios', label: 'Passeios', est: 200, act: 120 },
  { cat: 'outros', label: 'Outros', est: 100, act: 0 },
];

const EXPENSES = [
  { id: 'e1', date: '2026-08-05', cat: 'hospedagem', desc: 'Pousada Alicerce — 3 noites', v: 580 },
  { id: 'e2', date: '2026-08-06', cat: 'transporte_ida', desc: 'Ônibus BH → Tiradentes (convencional)', v: 195 },
  { id: 'e3', date: '2026-08-06', cat: 'transporte_volta', desc: 'Ônibus Tiradentes → BH', v: 195 },
  { id: 'e4', date: '2026-08-12', cat: 'passeios', desc: 'Maria Fumaça — ida e volta', v: 120 },
  { id: 'e5', date: '2026-08-14', cat: 'alimentacao', desc: 'Reserva de jantar (sinal)', v: 85 },
  { id: 'e6', date: '2026-08-16', cat: 'alimentacao', desc: 'Mercado — água e lanche de estrada', v: 60 },
  { id: 'e7', date: '2026-08-18', cat: 'mobilidade_local', desc: 'Transfer rodoviária (ida)', v: 40 },
  { id: 'e8', date: '2026-08-19', cat: 'alimentacao', desc: 'Almoço de chegada', v: 240 },
  { id: 'e9', date: '2026-08-19', cat: 'mobilidade_local', desc: 'Mototáxi — trilha', v: 20 },
];

const CHECKLIST = [
  { id: 'c1', group: 'antes de comprar', label: 'Comparar preço da passagem em três dias diferentes', done: true, src: 'manual' },
  { id: 'c2', group: 'antes de comprar', label: 'Confirmar transfer com a pousada antes de fechar a diária', done: true, src: 'dossie' },
  { id: 'c3', group: 'antes de embarcar', label: 'Instalar 99', done: true, src: 'dossie' },
  { id: 'c4', group: 'antes de embarcar', label: 'Refazer a simulação do InDrive (passo 4 ficou inconclusivo)', done: false, src: 'dossie' },
  { id: 'c5', group: 'antes de embarcar', label: 'Salvar telefone da cooperativa de táxi', done: false, src: 'dossie' },
  { id: 'c6', group: 'antes de embarcar', label: 'Baixar mapa offline de Tiradentes', done: false, src: 'dossie' },
  { id: 'c7', group: 'antes de embarcar', label: 'Compartilhar roteiro com alguém de confiança', done: false, src: 'manual' },
  { id: 'c8', group: 'na chegada', label: 'Perguntar na recepção como se vai à Serra de São José', done: true, src: 'dossie' },
  { id: 'c9', group: 'na chegada', label: 'Trocar dinheiro em espécie para feira e mototáxi', done: true, src: 'manual' },
];

const CHK_GROUPS = ['antes de comprar', 'antes de embarcar', 'na chegada'];

const COMFORT = [
  { key: 'convencional', name: 'Convencional', ang: '~45°', deg: 12, note: 'poltrona quase reta' },
  { key: 'executivo', name: 'Executivo', ang: '130–140°', deg: 26, note: 'ar e banheiro obrigatórios' },
  { key: 'semi-leito', name: 'Semi-leito', ang: '135–145°', deg: 36, note: 'apoio de pernas' },
  { key: 'leito', name: 'Leito', ang: '150–160°', deg: 52, note: 'quase deitado' },
  { key: 'leito-cama', name: 'Leito-cama', ang: '180°', deg: 78, note: 'totalmente plano' },
];

const COMFORT_REC = {
  key: 'semi-leito',
  why: '11h em período noturno: convencional anula seu dia seguinte. Semi-leito é o menor upgrade que ainda te entrega inteiro na chegada.',
  roi: ['Transfer privativo na chegada', 'Hospedagem melhor localizada', 'Passeio privativo', 'Executiva doméstica'],
};

const MODE_EMOJI = { a_pe: '🚶', transporte_publico: '🚌', app_corrida: '🚗', taxi: '🚕', mototaxi: '🛺', transfer: '🚐', outro: '•' };
const MODE_LABEL = { a_pe: 'a pé', transporte_publico: 'ônibus', app_corrida: 'app', taxi: 'táxi', mototaxi: 'mototáxi', transfer: 'transfer', outro: 'outro' };
const PROFILE_LABEL = { economia: 'economia', equilibrado: 'equilibrado', conforto: 'conforto' };
const PROFILE_CLASS = { economia: 'chip-eco', equilibrado: 'chip-mid', conforto: 'chip-lux' };
const STATUS_LABEL = { planejando: 'planejando', confirmada: 'confirmada', em_curso: 'em curso', concluida: 'concluída', cancelada: 'cancelada' };
const CAT_LABEL = { transporte_ida: 'transporte ida', transporte_volta: 'transporte volta', hospedagem: 'hospedagem', alimentacao: 'alimentação', mobilidade_local: 'mobilidade local', passeios: 'passeios', outros: 'outros' };
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

/* ── helpers ─────────────────────────────────────────────────────────── */
const MESES_ABR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DOW = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

function dparse(iso) { return new Date(iso + 'T00:00:00'); }
function fmtBR(iso) { const d = dparse(iso); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
function fmtBRfull(iso) { const d = dparse(iso); return fmtBR(iso) + '/' + d.getFullYear(); }
function fmtRange(a, b) {
  const da = dparse(a), db = dparse(b);
  if (da.getMonth() === db.getMonth()) return `${da.getDate()}–${db.getDate()} ${MESES_ABR[da.getMonth()]} ${db.getFullYear()}`;
  return `${da.getDate()} ${MESES_ABR[da.getMonth()]} – ${db.getDate()} ${MESES_ABR[db.getMonth()]} ${db.getFullYear()}`;
}
function daysBetween(a, b) { return Math.round((dparse(b) - dparse(a)) / 86400000); }
function tripDays(t) { return daysBetween(t.start, t.end) + 1; }
function dayList(t) {
  const out = []; const n = tripDays(t); const d0 = dparse(t.start);
  for (let i = 0; i < n; i++) { const d = new Date(d0.getTime() + i * 86400000); out.push(d.toISOString().slice(0, 10)); }
  return out;
}
function money(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR'); }
function dossierOf(t) { return DOSSIERS[t.uf + '/' + t.city] || null; }
function checksOf(d) { return d ? STEPS.map(s => ({ step: s, ...d.checks[s.key] })) : STEPS.map(s => ({ step: s, v: 'pendente', src: null, at: null, ev: null })); }
function pendingCount(d) { return checksOf(d).filter(c => c.v === 'pendente').length; }
function checkedCount(d) { return checksOf(d).filter(c => c.v !== 'pendente').length; }
function itinOf(tripId) { return ITINERARY.filter(i => i.trip === tripId); }
function budgetTotals() {
  const est = BUDGET.reduce((a, b) => a + b.est, 0), act = BUDGET.reduce((a, b) => a + b.act, 0);
  return { est, act, saldo: est - act };
}
function checklistDone() { return CHECKLIST.filter(c => c.done).length; }
