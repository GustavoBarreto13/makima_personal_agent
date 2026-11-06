// Notificações push no app Android (Etapa 3 do plano).
//
// Fluxo: pede permissão → cria os canais por agente → pede ao Firebase o "endereço" deste aparelho
// (token FCM) → registra esse token no servidor (`POST /api/devices/push`). O servidor passa a poder
// avisar este celular (scheduler/notify_channels.py, canal "push"). Tocar numa notificação abre a tela
// certa pelo deep link que veio nela.
//
// Sem o `google-services.json` do Firebase no projeto Android, `register()` lança uma exceção NATIVA
// (não uma promessa rejeitada) e o Android derruba o app. Por isso o build (vite.config.ts) detecta o
// arquivo e `__PUSH_ENABLED__` fica falso sem ele: nesse caso nem tentamos — o app funciona normalmente,
// só não recebe push.

import { PushNotifications } from '@capacitor/push-notifications'
import { api } from '../lib/api'
import { webStorage } from '../design/headless/web'
import { deviceName, isNativeApp } from './nativeAuth'
import { PUSH_CHANNELS } from './pushChannels'

/** Guarda o id do registro no servidor, para removê-lo ao sair. */
const PUSH_ID_KEY = 'makima-push-id'

/** Definido no build: o Firebase está configurado no projeto Android? */
declare const __PUSH_ENABLED__: boolean

let started = false

/**
 * Liga o push: permissão, canais, registro do token e toque na notificação.
 *
 * @param onLink - Chamado com o deep link (`makima://…`) quando o usuário toca numa notificação.
 */
export async function initPush(onLink: (link: string) => void): Promise<void> {
  if (!isNativeApp() || started) return
  if (typeof __PUSH_ENABLED__ === 'undefined' || !__PUSH_ENABLED__) return // Firebase não configurado neste build
  started = true
  try {
    // Canais primeiro: precisam existir antes da primeira notificação chegar.
    for (const c of PUSH_CHANNELS) {
      await PushNotifications.createChannel({
        id: c.id,
        name: c.name,
        description: c.description,
        importance: 4, // alta: aparece como aviso na tela e faz som
        visibility: c.private ? 0 : 1, // 0 = privada (conteúdo oculto no bloqueio), 1 = pública
        vibration: true,
      })
    }

    // O token pode mudar a qualquer momento (reinstalação, limpeza de dados): registramos a cada um.
    await PushNotifications.addListener('registration', async (t) => {
      try {
        const nome = await deviceName()
        const res = await api.post<{ id: string }>('/api/devices/push', { fcm_token: t.value, device_name: nome })
        webStorage.set(PUSH_ID_KEY, res.id)
      } catch (err) {
        console.warn('Não foi possível registrar o push no servidor:', err)
      }
    })
    await PushNotifications.addListener('registrationError', (e) => {
      console.warn('Push indisponível neste build (falta o google-services.json?):', e.error)
    })
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const link = a.notification.data?.link
      if (typeof link === 'string') onLink(link)
    })

    // Android 13+ pede permissão; nas versões antigas ela já vem concedida.
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') return // recusou: respeitamos e não insistimos
    await PushNotifications.register()
  } catch (err) {
    console.warn('Falha ao iniciar as notificações push:', err)
  }
}

/** Remove este aparelho do push (ao sair da conta). Nunca lança. */
export async function unregisterPush(): Promise<void> {
  if (!isNativeApp()) return
  if (typeof __PUSH_ENABLED__ === 'undefined' || !__PUSH_ENABLED__) return
  try {
    const id = webStorage.get(PUSH_ID_KEY)
    if (id) await api.del(`/api/devices/push/${encodeURIComponent(id)}`)
    webStorage.remove(PUSH_ID_KEY)
    await PushNotifications.unregister()
  } catch {
    /* sem rede ou já removido: o servidor limpa o token quando o FCM o recusar */
  }
}
