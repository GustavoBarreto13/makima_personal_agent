// Ponte entre o app Android e o React Router. Fica DENTRO do <BrowserRouter> (precisa do `navigate`).
// Liga: deep links `makima://…`, botão voltar, privacidade por rota, barra de status e notificações push.
// No site não faz nada (`isNativeApp()` é falso).

import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { PrivacyScreen } from '@capacitor-community/privacy-screen'
import { parseDeepLink } from '../lib/deepLink'
import { useTheme } from '../design/headless/useTheme'
import { isNativeApp } from './nativeAuth'
import { closeTopOverlay, decideBack, hasOpenOverlay } from './backButton'
import { isSensitiveRoute } from './privacy'
import { applyStatusBar } from './statusBar'
import { flushOfflineWrites } from '../lib/offlineWrites'
import { initPush } from './push'
import { initShare } from './share'
import { initVoice } from './voice'

export function NativeBridge() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { resolved } = useTheme()

  // Abre a tela de um deep link (`makima://kaguya/lista/7` → `/tasks#lista/7`). Link inválido é ignorado.
  useEffect(() => {
    if (!isNativeApp()) return
    const open = (url: string) => {
      const rota = parseDeepLink(url)
      if (!rota) return
      navigate(rota)
      // O navigate só muda a URL (pushState): os shells escutam "hashchange" para trocar de tela / abrir o
      // formulário do atalho. Sem este aviso, um link aberto com o app já na mesma tela não faria nada.
      window.setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 0)
    }
    // App fechado e aberto por um link (ou toque numa notificação): o link de abertura.
    void CapApp.getLaunchUrl().then((r) => r?.url && open(r.url))
    // App já aberto e recebendo um link.
    const sub = CapApp.addListener('appUrlOpen', (e) => open(e.url))
    // Toque numa notificação push traz o link no campo `data.link`.
    void initPush(open)
    // "Compartilhar → Makima": links de filmes, animes e livros vindos de outros apps.
    const stopShare = initShare(open)
    return () => {
      void sub.then((h) => h.remove())
      stopShare()
    }
  }, [navigate])

  // Voltou para o app: reenvia o que foi escrito sem internet (o evento "online" nem sempre dispara no celular).
  useEffect(() => {
    if (!isNativeApp()) return
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void flushOfflineWrites()
    })
    return () => {
      void sub.then((h) => h.remove())
    }
  }, [])

  // Microfone da captura rápida (reconhecimento de voz do sistema).
  useEffect(() => {
    initVoice()
  }, [])

  // Botão voltar do Android: fecha modal → volta de tela → minimiza o app.
  useEffect(() => {
    if (!isNativeApp()) return
    const sub = CapApp.addListener('backButton', ({ canGoBack }) => {
      const acao = decideBack({ overlayOpen: hasOpenOverlay(), canGoBack })
      if (acao === 'close-overlay') closeTopOverlay()
      else if (acao === 'history-back') window.history.back()
      else void CapApp.minimizeApp()
    })
    return () => {
      void sub.then((h) => h.remove())
    }
  }, [])

  // Diário e Finanças: sem print e sem prévia em "apps recentes".
  useEffect(() => {
    if (!isNativeApp()) return
    void (isSensitiveRoute(pathname) ? PrivacyScreen.enable() : PrivacyScreen.disable()).catch(() => {})
  }, [pathname])

  // Ícones da barra de status acompanham o tema.
  useEffect(() => {
    void applyStatusBar(resolved === 'dark')
  }, [resolved])

  return null
}
