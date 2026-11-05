// Sessão do app Android: guarda os tokens e renova o de acesso quando vence.
//
// Lógica PURA (sem Capacitor nem rede direta): quem guarda, quem fala com o servidor e o relógio
// entram por `SessionDeps`. Assim dá para testar tudo no Node (tokenSession.test.ts) e o resto do
// app só enxerga `getAccessToken()`.
//
// Por que o cuidado com o refresh: o servidor GIRA o refresh token a cada uso e trata a REUTILIZAÇÃO
// de um token antigo como roubo — revoga o aparelho inteiro. Duas renovações ao mesmo tempo (ex.:
// duas telas pedindo dados ao abrir) fariam isso por engano. Por isso `refresh()` é de "fila única":
// quem chega enquanto uma renovação está em andamento espera a mesma resposta.

/** Resposta de `POST /auth/mobile` e de `POST /auth/mobile/refresh`. */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  /** Segundos de validade do token de acesso. */
  expires_in: number
  device_id: string
  user: { email: string; name: string }
}

/** O que fica guardado no cofre do aparelho (Keystore). */
export interface StoredSession {
  accessToken: string
  /** Instante (ms desde 1970) em que o token de acesso vence. */
  accessExpiresAt: number
  refreshToken: string
  deviceId: string
  email: string
  name: string
}

/** Resultado do pedido de renovação: separa "o servidor recusou" de "não consegui falar com ele". */
export type RefreshResult = { ok: true; data: TokenResponse } | { ok: false; status: number }

export interface SessionDeps {
  /** Cofre do aparelho. */
  store: {
    read(): Promise<StoredSession | null>
    write(session: StoredSession): Promise<void>
    clear(): Promise<void>
  }
  /** Chama `POST /auth/mobile/refresh`. Deve LANÇAR se a rede falhar (sem resposta do servidor). */
  refreshRequest(refreshToken: string): Promise<RefreshResult>
  /** Relógio em ms (injetável para os testes). */
  now(): number
}

/** Renova o token de acesso quando faltar menos que isso para vencer (evita vencer no meio do pedido). */
export const REFRESH_MARGIN_MS = 60_000

/** Converte a resposta do servidor no formato guardado. O refresh não devolve o nome: mantém o antigo. */
export function toStoredSession(
  data: TokenResponse,
  now: number,
  previous: StoredSession | null = null,
): StoredSession {
  return {
    accessToken: data.access_token,
    accessExpiresAt: now + data.expires_in * 1000,
    refreshToken: data.refresh_token,
    deviceId: data.device_id,
    email: data.user.email || previous?.email || '',
    name: data.user.name || previous?.name || '',
  }
}

export class NativeSession {
  private inflight: Promise<string | null> | null = null

  constructor(private readonly deps: SessionDeps) {}

  /** Guarda a sessão recém-criada pelo login. */
  async save(data: TokenResponse): Promise<StoredSession> {
    const session = toStoredSession(data, this.deps.now())
    await this.deps.store.write(session)
    return session
  }

  /** Quem está logado neste aparelho (ou null). Usado para preencher o nome que o refresh não devolve. */
  async current(): Promise<StoredSession | null> {
    return this.deps.store.read()
  }

  /** Apaga os tokens deste aparelho (não avisa o servidor — ver `nativeAuth.signOut`). */
  async clear(): Promise<void> {
    await this.deps.store.clear()
  }

  /**
   * Token de acesso válido para o próximo pedido.
   *
   * @returns O token; `null` se não há sessão (ou se o servidor recusou a renovação — sessão encerrada).
   * @throws Se a renovação falhou por falta de conexão: quem chamou trata como "sem internet",
   *         e a sessão continua guardada para a próxima tentativa.
   */
  async getAccessToken(): Promise<string | null> {
    const session = await this.deps.store.read()
    if (!session) return null
    if (session.accessExpiresAt - this.deps.now() > REFRESH_MARGIN_MS) return session.accessToken
    return this.refresh()
  }

  /** Renova o par de tokens, com fila única (veja o comentário do topo). */
  private refresh(): Promise<string | null> {
    if (!this.inflight) {
      this.inflight = this.doRefresh().finally(() => {
        this.inflight = null
      })
    }
    return this.inflight
  }

  private async doRefresh(): Promise<string | null> {
    const session = await this.deps.store.read()
    if (!session) return null

    const result = await this.deps.refreshRequest(session.refreshToken) // lança se não houver rede
    if (result.ok) {
      const next = toStoredSession(result.data, this.deps.now(), session)
      await this.deps.store.write(next)
      return next.accessToken
    }
    // 401/403: refresh inválido, expirado ou aparelho revogado → encerra a sessão aqui também.
    if (result.status === 401 || result.status === 403) {
      await this.deps.store.clear()
      return null
    }
    // Outro erro do servidor (500, 503…): é instabilidade, não recusa. Trata como sem conexão.
    throw new Error(`Renovação da sessão indisponível (HTTP ${result.status}).`)
  }
}
