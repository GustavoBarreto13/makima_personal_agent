// Tela de bloqueio por biometria do app Android.
//
// Ao abrir o app (e ao voltar depois de um tempo em segundo plano) cobrimos tudo com esta tela e
// pedimos digital/rosto — ou o PIN do celular, para quem não tem biometria. O conteúdo de baixo fica
// montado (só coberto), então nada que estava aberto se perde. Se o celular não tem NENHUM bloqueio de
// tela configurado, não há como proteger: avisamos uma vez e deixamos entrar.

import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'
import { Button, Icon } from '../design/ui'
import { toast } from '../design/headless/toast'
import { isNativeApp } from './nativeAuth'
import { PROMPT_SETTLE_MS, shouldLock } from './appLockRules'

/** Cobre o app e pede a biometria. Renderiza nada no site. */
export function AppLock() {
  const native = isNativeApp()
  const [locked, setLocked] = useState(native) // abre bloqueado: nada aparece antes do desbloqueio
  const asking = useRef(false) // evita abrir dois pedidos de biometria ao mesmo tempo
  const backgroundedAt = useRef<number | null>(null)
  const ignoreUntil = useRef(0) // o prompt da biometria é outra Activity: pausa/volta logo depois dele não conta
  const [erro, setErro] = useState<string | null>(null)

  const unlock = useCallback(async () => {
    if (asking.current) return
    asking.current = true
    try {
      const info = await BiometricAuth.checkBiometry()
      if (!info.isAvailable && !info.deviceIsSecure) {
        // Sem digital, rosto, PIN ou padrão: não há o que pedir.
        toast('Ative um bloqueio de tela no celular para proteger a Makima.', { tone: 'info' })
        setLocked(false)
        return
      }
      await BiometricAuth.authenticate({
        reason: 'Desbloqueie a Makima',
        androidTitle: 'Makima',
        androidSubtitle: 'Confirme que é você',
        allowDeviceCredential: true, // aceita o PIN/padrão do celular se a digital falhar
      })
      setErro(null)
      setLocked(false)
    } catch (err) {
      // Cancelou ou errou: continua bloqueado; o botão "Desbloquear" tenta de novo. Mostramos o motivo
      // (sem isso, uma falha de configuração parece "não reconhece" e ninguém sabe o porquê).
      console.warn('Biometria falhou:', err)
      const code = (err as { code?: string })?.code
      if (code !== 'userCancel' && code !== 'systemCancel' && code !== 'appCancel') {
        setErro((err as { message?: string })?.message || 'Não foi possível confirmar. Tente de novo.')
      }
    } finally {
      asking.current = false
      ignoreUntil.current = Date.now() + PROMPT_SETTLE_MS
    }
  }, [])

  // Pede a biometria assim que o app abre.
  useEffect(() => {
    if (native) void unlock()
  }, [native, unlock])

  // Volta do segundo plano: bloqueia se ficou fora tempo suficiente.
  useEffect(() => {
    if (!native) return
    let handle: { remove: () => Promise<void> } | undefined
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      const now = Date.now()
      if (asking.current || now < ignoreUntil.current) return // o próprio prompt alterna o estado do app
      if (!isActive) {
        backgroundedAt.current = now
        return
      }
      const since = backgroundedAt.current
      backgroundedAt.current = null // cada ida ao segundo plano vale uma única vez
      if (shouldLock({ backgroundedAt: since, now })) {
        setLocked(true)
        void unlock()
      }
    }).then((h) => {
      handle = h
    })
    return () => {
      void handle?.remove()
    }
  }, [native, unlock])

  if (!native || !locked) return null
  return (
    <div className="ds-frame" role="dialog" aria-modal="true" aria-label="Makima bloqueada" style={{ zIndex: 1000 }}>
      <div className="ds-empty" style={{ height: '100%', justifyContent: 'center' }}>
        <div className="ds-eic"><Icon name="blocked" size={24} /></div>
        <h3>Makima bloqueada</h3>
        <p>Use a digital, o rosto ou o PIN do celular para continuar.</p>
        {erro && <p role="alert">{erro}</p>}
        <Button variant="primary" onClick={() => void unlock()}>Desbloquear</Button>
      </div>
    </div>
  )
}
