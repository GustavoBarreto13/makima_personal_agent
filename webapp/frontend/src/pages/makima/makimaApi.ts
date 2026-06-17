/**
 * makimaApi.ts — Makima · Hub (Centro de Controle, fatia 023)
 *
 * Cliente tipado do endpoint agregador `/api/hub/summary`. Segue o padrão de
 * "um objeto de API por domínio" do webapp: os componentes NUNCA chamam `fetch`
 * ou `api.get` diretamente — eles usam `makimaApi.getSummary()`. Isso centraliza
 * a URL e o tipo de resposta em um único lugar.
 */

import { api } from '../../lib/api'
import type { HubSummary } from './types'

/**
 * Objeto de API do Hub.
 *
 * `getSummary` busca os stats reais dos 8 agentes de uma vez. Reaproveita o
 * wrapper `api.get`, que já envia o cookie de sessão (`credentials: 'include'`)
 * e lança Error para qualquer resposta não-2xx (ex.: 401 sem login).
 */
export const makimaApi = {
  /** Busca o resumo agregado dos 8 agentes em `/api/hub/summary`. */
  getSummary: () => api.get<HubSummary>('/api/hub/summary'),
}
