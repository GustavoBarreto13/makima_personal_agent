// Regra do bloqueio por biometria ao abrir o app.
//
// O app pede digital/rosto (ou o PIN do celular) ao abrir e ao voltar depois de um tempo em
// segundo plano — assim uma troca rápida de app não incomoda, mas um celular esquecido fica protegido.

/** Tempo em segundo plano (ms) a partir do qual pedimos a biometria de novo. */
export const LOCK_GRACE_MS = 2 * 60 * 1000

/**
 * Deve bloquear agora?
 *
 * @param s.lastActiveAt - Instante (ms) em que o app foi para o segundo plano; `null` = acabou de abrir.
 * @param s.now - Instante atual (ms).
 * @param s.graceMs - Tolerância em segundo plano antes de pedir de novo.
 */
export function shouldLock(s: { lastActiveAt: number | null; now: number; graceMs?: number }): boolean {
  if (s.lastActiveAt === null) return true // abertura a frio: sempre pede
  return s.now - s.lastActiveAt >= (s.graceMs ?? LOCK_GRACE_MS)
}
