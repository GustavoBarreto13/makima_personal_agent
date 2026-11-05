// Botão "voltar" do Android.
//
// Sem tratamento, o voltar fecha o app inteiro mesmo com um modal aberto. Aqui seguimos o
// comportamento esperado de um app Android: fecha o que está por cima → volta de tela → minimiza.

/** O que fazer quando o usuário aperta "voltar". */
export type BackAction = 'close-overlay' | 'history-back' | 'minimize'

/**
 * Decide a ação do botão voltar.
 *
 * @param s.overlayOpen - Há modal/gaveta/paleta aberta (elemento com `aria-modal="true"`)?
 * @param s.canGoBack - O histórico do navegador tem para onde voltar?
 */
export function decideBack(s: { overlayOpen: boolean; canGoBack: boolean }): BackAction {
  if (s.overlayOpen) return 'close-overlay'
  if (s.canGoBack) return 'history-back'
  return 'minimize'
}

/** Existe alguma camada sobreposta aberta? Todas as do Design System usam `aria-modal="true"`. */
export function hasOpenOverlay(doc: Document = document): boolean {
  return doc.querySelector('[aria-modal="true"]') !== null
}

/**
 * Fecha a camada do topo simulando a tecla Esc — o `useDismissable` do Design System
 * (`design/headless/overlay.ts`) já escuta isso, então nenhum modal precisa ser alterado.
 */
export function closeTopOverlay(doc: Document = document): void {
  doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}
