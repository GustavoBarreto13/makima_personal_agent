/**
 * steps.ts — Yato · Viagens (fatia 066)
 *
 * Metadados de apresentação dos 7 passos do protocolo de mobilidade — nome e
 * instrução operacional literal (copiados do handoff, `yato/data.js` → STEPS).
 * A ORDEM e as CHAVES vêm do backend (`agents/yato/tools_mobility.py` →
 * CHECK_KEYS); este arquivo só nomeia o que já existe lá, não decide nada.
 */

import type { CheckKey } from './types'

export interface StepMeta {
  key: CheckKey
  n: number
  name: string
  instr: string
}

export const STEPS: StepMeta[] = [
  {
    key: 'porte_cidade', n: 1, name: 'Porte da cidade',
    instr: 'Confirme a população no IBGE e classifique: capital, média ou pequena. Isso calibra a expectativa de tudo que vem depois.',
  },
  {
    key: 'uber', n: 2, name: 'Uber',
    instr: 'Abra a lista oficial de cidades da Uber. Depois — sempre depois — abra o app e simule uma corrida com um endereço real do centro. Lista não é cobertura; simulação é.',
  },
  {
    key: '99', n: 3, name: '99',
    instr: 'Mesma coisa: página oficial e depois simulação in-app com endereço real. Anote se aparece 99Pop, 99Táxi ou nada.',
  },
  {
    key: 'indrive', n: 4, name: 'InDrive',
    instr: 'Busque a cidade dentro do app. No interior o InDrive costuma ser a melhor aposta, mesmo quando a lista pública não menciona a cidade.',
  },
  {
    key: 'transporte_publico', n: 5, name: 'Transporte público',
    instr: 'Trace uma rota no Google Maps e no Moovit entre dois pontos da cidade. Se não aparecer ônibus, o veredito é inconclusivo — só ~150 cidades brasileiras estão mapeadas.',
  },
  {
    key: 'hospedagem_transfer', n: 6, name: 'Transfer da hospedagem',
    instr: 'Mande mensagem para a pousada: tem transfer da rodoviária? Quanto? Como os hóspedes se locomovem? Tem táxi ou mototáxi confiável para indicar?',
  },
  {
    key: 'deslocamentos', n: 7, name: 'Deslocamentos',
    instr: 'Meça no mapa hospedagem → cada ponto do roteiro. Registre tempo a pé, de carro e de ônibus. É isso que decide se dá pra ficar sem carro.',
  },
]

export const STEP_BY_KEY: Record<string, StepMeta> = Object.fromEntries(STEPS.map(s => [s.key, s]))

export const SOURCES: [string, string][] = [
  ['simulacao_in_app', 'simulação in-app'], ['pagina_oficial', 'página oficial'],
  ['google_maps', 'Google Maps'], ['moovit', 'Moovit'],
  ['contato_hospedagem', 'contato com hospedagem'], ['relato_local', 'relato local'], ['outro', 'outro'],
]

export const STRATEGY_LABEL: Record<string, { txt: string; emoji: string }> = {
  caminhavel: { txt: 'Caminhável', emoji: '🚶' },
  transporte_publico: { txt: 'Transporte público', emoji: '🚌' },
  app_corrida: { txt: 'App de corrida', emoji: '🚗' },
  taxi_mototaxi: { txt: 'Táxi / mototáxi', emoji: '🛺' },
  transfer_hospedagem: { txt: 'Transfer da hospedagem', emoji: '🚐' },
  carro_alugado: { txt: 'Carro alugado', emoji: '🚗' },
}
