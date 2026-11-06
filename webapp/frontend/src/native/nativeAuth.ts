// Login e sessão do app Android: liga a lógica pura (tokenSession.ts) ao celular de verdade.
//
// Fluxo (docs/planos/app_android/etapa-2-capacitor-login.md, seção B):
//   1. "Entrar com Google" abre o seletor NATIVO de contas do Android (o Google bloqueia OAuth em WebView);
//   2. o Google devolve um ID token ("crachá");
//   3. `POST /auth/mobile` confere o crachá e o e-mail permitido e devolve access + refresh token;
//   4. os tokens vão para o Keystore do Android (cofre cifrado) — nunca para localStorage;
//   5. `lib/api.ts` passa a mandar `Authorization: Bearer …` em todo pedido (provedor registrado aqui).
//
// No site (navegador comum) nada disso roda: `isNativeApp()` é falso e continua valendo o cookie.

import { Capacitor } from '@capacitor/core'
import { Device } from '@capacitor/device'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { SocialLogin } from '@capgo/capacitor-social-login'
import { apiUrl, setAuthTokenProvider } from '../lib/api'
import {
  NativeSession,
  type RefreshResult,
  type StoredSession,
  type TokenResponse,
} from './tokenSession'

/** Estamos dentro do app Android (e não no navegador)? */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/** Chave única no Keystore: a sessão inteira vai como um JSON cifrado. */
const STORE_KEY = 'makima-session'

/**
 * Client ID do tipo "Aplicativo da Web" criado no Google Cloud (não é segredo).
 * É o MESMO valor que o servidor aceita em `GOOGLE_MOBILE_CLIENT_IDS`. Vem do `.env.android`.
 */
const GOOGLE_WEB_CLIENT_ID = String(import.meta.env?.VITE_GOOGLE_WEB_CLIENT_ID ?? '').trim()

/** Erro de login com mensagem pronta para mostrar na tela. */
export class LoginError extends Error {}

const session = new NativeSession({
  store: {
    async read(): Promise<StoredSession | null> {
      try {
        const raw = await SecureStorage.getItem(STORE_KEY)
        return raw ? (JSON.parse(raw) as StoredSession) : null
      } catch {
        return null // cofre vazio ou ilegível: tratamos como "não logado"
      }
    },
    async write(s) {
      await SecureStorage.setItem(STORE_KEY, JSON.stringify(s))
    },
    async clear() {
      try {
        await SecureStorage.remove(STORE_KEY)
      } catch {
        /* nada guardado: nada a apagar */
      }
    },
  },
  async refreshRequest(refreshToken): Promise<RefreshResult> {
    // `fetch` direto (e não `authFetch`): esta chamada é quem CRIA o token, não pode depender dele.
    const res = await fetch(apiUrl('/auth/mobile/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, data: (await res.json()) as TokenResponse }
  },
  now: () => Date.now(),
})

/** Liga o app ao token: chamado uma vez no início (main.tsx). No site não faz nada. */
export function initNativeAuth(): void {
  if (!isNativeApp()) return
  setAuthTokenProvider(() => session.getAccessToken())
}

/** Nome do aparelho para a lista "aparelhos conectados" (ex.: "samsung SM-A546E"). */
export async function deviceName(): Promise<string> {
  try {
    const info = await Device.getInfo()
    return `${info.manufacturer ?? ''} ${info.model ?? ''}`.trim() || 'Android'
  } catch {
    return 'Android'
  }
}

/**
 * Abre o seletor de contas do Google, troca o crachá por tokens do app e guarda no Keystore.
 *
 * @returns O usuário logado.
 * @throws LoginError com mensagem em português (cancelou, sem conexão, e-mail não autorizado…).
 */
export async function signInWithGoogle(): Promise<{ email: string; name: string }> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new LoginError('Login do Google não configurado neste build (falta VITE_GOOGLE_WEB_CLIENT_ID).')
  }

  let idToken: string | null | undefined
  try {
    await SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } })
    const res = await SocialLogin.login({ provider: 'google', options: {} })
    const result = res.result as { idToken?: string | null }
    idToken = result.idToken
  } catch (err) {
    // O plugin rejeita tanto quando a pessoa fecha o seletor quanto em erro de configuração.
    console.warn('Login do Google falhou:', err)
    throw new LoginError('Não foi possível entrar com o Google. Tente de novo.')
  }
  if (!idToken) throw new LoginError('O Google não devolveu o token de acesso. Tente de novo.')

  let res: Response
  try {
    res = await fetch(apiUrl('/auth/mobile'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken, device_name: await deviceName() }),
    })
  } catch {
    throw new LoginError('Sem conexão com a Makima. Confira a internet e tente de novo.')
  }

  if (res.status === 403) throw new LoginError('Esta conta do Google não tem acesso à Makima.')
  if (res.status === 503) throw new LoginError('O login pelo app ainda não está ativo no servidor.')
  if (!res.ok) throw new LoginError('A Makima recusou o login. Tente de novo.')

  const saved = await session.save((await res.json()) as TokenResponse)
  return { email: saved.email, name: saved.name }
}

/** Nome guardado no aparelho — o refresh não o devolve, então `/auth/me` pode vir sem nome. */
export async function storedUser(): Promise<{ email: string; name: string } | null> {
  const s = await session.current()
  return s ? { email: s.email, name: s.name } : null
}

/** Esquece a sessão só neste aparelho (o servidor já a recusou). */
export function clearNativeSession(): Promise<void> {
  return session.clear()
}

/** Sair: avisa o servidor (revoga o aparelho) e apaga os tokens locais. Nunca falha para o usuário. */
export async function signOut(): Promise<void> {
  // Para de receber notificações neste aparelho (antes de apagar os tokens, que a chamada precisa).
  try {
    const { unregisterPush } = await import('./push')
    await unregisterPush()
  } catch {
    /* sem push configurado ou sem rede: o servidor limpa o token quando o FCM o recusar */
  }
  const s = await session.current()
  if (s) {
    try {
      await fetch(apiUrl('/auth/mobile/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refreshToken }),
      })
    } catch {
      /* sem rede: apagamos o local mesmo assim; o aparelho pode ser revogado depois no servidor */
    }
  }
  await session.clear()
  try {
    await SocialLogin.logout({ provider: 'google' })
  } catch {
    /* a conta do Google não estava ativa no plugin: ok */
  }
}
