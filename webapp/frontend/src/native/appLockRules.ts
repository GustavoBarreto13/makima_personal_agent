// Regra do bloqueio por biometria ao abrir o app.
//
// O app pede digital/rosto (ou o PIN do celular) ao abrir e ao voltar depois de um tempo em
// segundo plano — assim uma troca rápida de app não incomoda, mas um celular esquecido fica protegido.

/** Tempo em segundo plano (ms) a partir do qual pedimos a biometria de novo. */
export const LOCK_GRACE_MS = 2 * 60 * 1000

/** Janela (ms) após o pedido de biometria em que ignoramos pausa/volta do app (o prompt é outra Activity). */
export const PROMPT_SETTLE_MS = 2000

/**
 * Ao VOLTAR do segundo plano: deve bloquear de novo?
 *
 * A abertura a frio não passa por aqui — o componente já nasce bloqueado. Sem registro de quando o app
 * foi para o segundo plano (`null`), não há o que medir e NÃO bloqueamos: tratar `null` como "bloquear"
 * fazia a volta do próprio prompt da biometria reabrir o prompt, num laço sem fim.
 *
 * @param s.backgroundedAt - Instante (ms) em que o app foi para o segundo plano; `null` = não foi.
 * @param s.now - Instante atual (ms).
 * @param s.graceMs - Tolerância em segundo plano antes de pedir de novo.
 */
export function shouldLock(s: { backgroundedAt: number | null; now: number; graceMs?: number }): boolean {
  if (s.backgroundedAt === null) return false
  return s.now - s.backgroundedAt >= (s.graceMs ?? LOCK_GRACE_MS)
}
