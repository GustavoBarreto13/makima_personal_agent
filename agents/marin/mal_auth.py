"""Gerenciamento de autenticação OAuth2 do MyAnimeList — agente Marin.

Este módulo implementa a classe MALAuth, responsável por manter o access_token
do MyAnimeList sempre válido, fazendo refresh automático quando necessário e
persistindo os tokens no PostgreSQL (tabela `mal_sync_state`).

Por que no banco e não em arquivo?
    O container Docker (Dokploy) não tem volume de escrita persistente fora do
    PostgreSQL. Guardar tokens em arquivo em disco resultaria em perda a cada
    redeploy. O banco resolve isso de forma simples.

Fluxo de uso:
    auth = MALAuth()           # carrega tokens do banco (ou env vars no seed)
    token = auth.get_access_token()  # renova automaticamente se expirado
    headers = auth.auth_header()     # {"Authorization": "Bearer <token>"}

Usage:
    from agents.marin.mal_auth import MALAuth
"""

import logging        # Registra erros e avisos no container
import os             # Lê variáveis de ambiente (seeds MAL_*)
from datetime import datetime, timedelta, timezone  # Controle de validade do token

import requests       # Chamada HTTP para renovar o token com o MAL

# Helpers compartilhados de acesso ao PostgreSQL
from agents.db import run_select, run_dml


# ─────────────────────────────────────────────────────────────────────────────
# LOGGER
# ─────────────────────────────────────────────────────────────────────────────

# Logger nomeado para este módulo — facilita filtrar mensagens ao debugar
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# CLASSE PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

class MALAuth:
    """Gerencia autenticação OAuth2 do MyAnimeList com rotação automática de refresh-token.

    O MAL usa OAuth2 com PKCE. Após a autorização inicial (feita com
    `scripts/authorize_mal.py`), o fluxo cotidiano é:
      1. Carregar o refresh_token salvo no banco (ou de env vars no seed inicial).
      2. Trocar o refresh_token por um novo access_token (válido ~1h) via POST.
      3. CRÍTICO: salvar imediatamente o novo refresh_token — o MAL invalida o
         token anterior após cada uso. Perder o novo = precisar re-autorizar.

    Attributes:
        MAL_TOKEN_URL: URL de troca de token do MAL.
        EXPIRY_BUFFER_SECONDS: Renovar o token N segundos antes de expirar
            (margem de segurança para chamadas que demoram mais que o esperado).
    """

    # URL de endpoint para trocar refresh_token por access_token
    MAL_TOKEN_URL: str = "https://myanimelist.net/v1/oauth2/token"

    # Renovar 5 minutos antes de expirar — evita falha em chamadas longas
    EXPIRY_BUFFER_SECONDS: int = 300

    def __init__(self) -> None:
        """Carrega estado atual do banco; seeds das env vars se banco vazio.

        Tenta primeiro carregar tokens do banco (tabela `mal_sync_state`).
        Se o banco estiver vazio (primeiro uso), usa as variáveis de ambiente
        MAL_ACCESS_TOKEN, MAL_REFRESH_TOKEN e MAL_TOKEN_EXPIRY como seed.

        Raises:
            RuntimeError: Se não houver refresh_token disponível nem no banco
                nem nas env vars — usuário precisa rodar authorize_mal.py.
        """
        # Inicializa campos internos como None; _load_state() irá preenchê-los
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._expires_at: datetime | None = None

        # Carrega tokens do banco (ou env vars como fallback de seed)
        self._load_state()

    # ─────────────────────────────────────────────────────────────────────────
    # API PÚBLICA
    # ─────────────────────────────────────────────────────────────────────────

    def get_access_token(self) -> str:
        """Retorna access_token válido, renovando automaticamente se necessário.

        Verifica se o token atual está prestes a expirar (dentro do buffer de
        5 minutos). Em caso positivo, realiza o refresh antes de retornar.

        Returns:
            String com o access_token atual e válido.

        Raises:
            RuntimeError: Se não houver refresh_token disponível para renovar.
        """
        # Verifica se o token está expirado ou prestes a expirar
        if self._is_expired():
            logger.info("MALAuth: access_token expirado ou próximo do vencimento — renovando")
            self._refresh()

        # Neste ponto, o token é válido (ou acabou de ser renovado)
        return self._access_token  # type: ignore[return-value]

    def auth_header(self) -> dict[str, str]:
        """Retorna dicionário de header de autorização Bearer.

        Chama get_access_token() internamente para garantir que o token
        esteja sempre válido antes de construir o header.

        Returns:
            Dicionário {"Authorization": "Bearer <token>"} pronto para passar
            ao parâmetro `headers` de requests.get() ou requests.post().

        Example:
            >>> auth = MALAuth()
            >>> headers = auth.auth_header()
            >>> # {"Authorization": "Bearer abc123..."}
        """
        # Sempre passa por get_access_token() para garantir validade
        token = self.get_access_token()
        return {"Authorization": f"Bearer {token}"}

    # ─────────────────────────────────────────────────────────────────────────
    # VERIFICAÇÃO DE VALIDADE
    # ─────────────────────────────────────────────────────────────────────────

    def _is_expired(self) -> bool:
        """Verifica se o access_token expirou ou está próximo de expirar.

        Considera "expirado" qualquer token que vença nos próximos
        EXPIRY_BUFFER_SECONDS segundos. Isso dá margem para que chamadas
        lentas não falhem com 401 no meio do request.

        Returns:
            True se o token está expirado ou dentro da janela de buffer.
            True também se expires_at for None (estado desconhecido = renovar).
        """
        # Se não temos acesso a nenhum token, consideramos expirado para forçar refresh
        if self._access_token is None:
            return True

        # Se não sabemos quando expira, renovamos por precaução
        if self._expires_at is None:
            return True

        # Calcula o tempo restante até a expiração
        # now(timezone.utc) garante comparação correta com timestamptz do PostgreSQL
        agora = datetime.now(timezone.utc)
        tempo_restante = (self._expires_at - agora).total_seconds()

        # Renova se estiver dentro da janela de buffer (5 min = 300 seg)
        return tempo_restante < self.EXPIRY_BUFFER_SECONDS

    # ─────────────────────────────────────────────────────────────────────────
    # REFRESH
    # ─────────────────────────────────────────────────────────────────────────

    def _refresh(self) -> None:
        """Renova o access_token usando o refresh_token e persiste imediatamente.

        CRÍTICO: o MAL invalida o refresh_token ANTIGO após cada chamada de
        refresh. O novo refresh_token DEVE ser salvo no banco ANTES de qualquer
        outro uso — se o processo morrer entre o refresh e o save, o usuário
        precisará re-autorizar.

        Args: Nenhum (usa self._refresh_token carregado em _load_state).

        Raises:
            RuntimeError: Se não houver refresh_token disponível.
            requests.HTTPError: Se o MAL retornar erro HTTP (ex.: token inválido).
        """
        # Sem refresh_token, não há como renovar — usuário precisa re-autorizar
        if not self._refresh_token:
            raise RuntimeError(
                "MALAuth: sem refresh_token disponível. "
                "Execute scripts/authorize_mal.py para gerar o token inicial."
            )

        # Lê credenciais do app MAL nas variáveis de ambiente
        client_id = os.environ.get("MAL_CLIENT_ID", "")
        client_secret = os.environ.get("MAL_CLIENT_SECRET", "")

        if not client_id or not client_secret:
            raise RuntimeError(
                "MALAuth: MAL_CLIENT_ID e MAL_CLIENT_SECRET são obrigatórios. "
                "Configure as variáveis de ambiente."
            )

        # Payload do request de refresh OAuth2.
        # Content-Type deve ser application/x-www-form-urlencoded (não JSON).
        payload = {
            "grant_type":    "refresh_token",   # Tipo de concessão OAuth2
            "refresh_token": self._refresh_token,  # Token atual (será invalidado após esta chamada)
            "client_id":     client_id,
            "client_secret": client_secret,
        }

        logger.debug("MALAuth: enviando request de refresh para MAL")

        # Faz o POST de refresh — timeout de 15s para evitar travamento indefinido
        response = requests.post(
            self.MAL_TOKEN_URL,
            data=payload,  # `data=` (não `json=`) → envia como form-urlencoded
            timeout=15,
        )

        # Lança HTTPError se o MAL retornar 4xx ou 5xx
        response.raise_for_status()

        # Extrai os novos tokens da resposta JSON
        dados = response.json()
        novo_access_token: str  = dados["access_token"]
        novo_refresh_token: str = dados["refresh_token"]
        expires_in: int         = dados["expires_in"]  # Validade em segundos

        # Calcula a data/hora de expiração absoluta
        # NOW() + expires_in segundos, sempre em UTC para consistência com o banco
        nova_expiracao = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        # SALVA OS NOVOS TOKENS NO BANCO IMEDIATAMENTE.
        # Esta é a etapa mais crítica: o refresh_token antigo já foi invalidado
        # pelo MAL. Se não persistirmos agora e o processo morrer, precisamos
        # re-autorizar do zero.
        self._persist(novo_access_token, novo_refresh_token, nova_expiracao)

        # Atualiza os campos internos APÓS persistir (não antes, para garantir
        # que o banco está sincronizado antes do estado em memória)
        self._access_token  = novo_access_token
        self._refresh_token = novo_refresh_token
        self._expires_at    = nova_expiracao

        logger.info(
            "MALAuth: tokens renovados com sucesso. Expiram em: %s",
            nova_expiracao.isoformat()
        )

    # ─────────────────────────────────────────────────────────────────────────
    # PERSISTÊNCIA
    # ─────────────────────────────────────────────────────────────────────────

    def _load_state(self) -> None:
        """Carrega tokens do banco. Se banco vazio, usa env vars como seed.

        O banco é a fonte de verdade (tokens podem ter sido rotacionados).
        As env vars MAL_* são apenas o ponto de entrada inicial (seed) —
        depois de persistidas no banco, as env vars não são mais lidas.

        Raises:
            RuntimeError: Se não houver refresh_token nem no banco nem nas env vars.
        """
        # Tenta ler a linha única da tabela singleton mal_sync_state
        linhas = run_select(
            "SELECT access_token, refresh_token, expires_at "
            "FROM mal_sync_state WHERE id = 1"
        )

        # Verifica se a linha existe E tem tokens preenchidos
        linha = linhas[0] if linhas else {}
        tem_token_no_banco = bool(linha.get("refresh_token"))

        if tem_token_no_banco:
            # Usa os tokens do banco — fonte de verdade após o seed inicial
            self._access_token  = linha.get("access_token")
            self._refresh_token = linha.get("refresh_token")

            # expires_at vem do PostgreSQL como datetime com timezone (aware)
            # ou como None se a coluna for NULL
            self._expires_at = linha.get("expires_at")

            logger.debug("MALAuth: tokens carregados do banco com sucesso")

        else:
            # Banco vazio — primeira execução. Tenta seed das env vars.
            logger.info("MALAuth: banco sem tokens, tentando seed das variáveis de ambiente")

            # Variáveis de ambiente de seed (geradas pelo authorize_mal.py)
            access_token_env  = os.environ.get("MAL_ACCESS_TOKEN")
            refresh_token_env = os.environ.get("MAL_REFRESH_TOKEN")
            expiry_env        = os.environ.get("MAL_TOKEN_EXPIRY")  # ISO 8601 ex: "2026-06-15T10:00:00+00:00"

            # refresh_token é obrigatório — sem ele, não há como renovar acesso
            if not refresh_token_env:
                raise RuntimeError(
                    "MALAuth: sem tokens no banco e sem MAL_REFRESH_TOKEN na env. "
                    "Execute scripts/authorize_mal.py para gerar o token inicial, "
                    "depois defina MAL_ACCESS_TOKEN, MAL_REFRESH_TOKEN e MAL_TOKEN_EXPIRY."
                )

            self._access_token  = access_token_env
            self._refresh_token = refresh_token_env

            # Converte a string ISO para datetime aware (com timezone)
            if expiry_env:
                try:
                    # fromisoformat aceita "2026-06-15T10:00:00+00:00" no Python 3.11+
                    self._expires_at = datetime.fromisoformat(expiry_env)
                except ValueError:
                    # Se o formato for inválido, forçamos refresh imediato na próxima chamada
                    logger.warning(
                        "MALAuth: MAL_TOKEN_EXPIRY com formato inválido ('%s'). "
                        "Token será renovado na próxima chamada.",
                        expiry_env
                    )
                    self._expires_at = None
            else:
                # Sem data de expiração conhecida → forçar refresh na próxima chamada
                self._expires_at = None

            # Persiste o seed no banco imediatamente para que futuras instâncias
            # (ex.: próxima chamada do agente) possam ler do banco sem depender das env vars
            if self._refresh_token and self._access_token:
                # Usa expiração atual ou "já expirou" para forçar refresh em seguida
                expiracao_seed = self._expires_at or datetime.now(timezone.utc)
                self._persist(self._access_token, self._refresh_token, expiracao_seed)
                logger.info("MALAuth: seed das env vars persistido no banco com sucesso")

    def _persist(
        self,
        access_token: str,
        refresh_token: str,
        expires_at: datetime,
    ) -> None:
        """Salva access_token, refresh_token e expires_at no banco.

        Usa INSERT ... ON CONFLICT DO UPDATE (upsert) para garantir que
        a linha com id=1 sempre exista após a primeira chamada. Nunca
        insere uma segunda linha (o CHECK id=1 no schema também garante isso).

        Args:
            access_token: Novo access_token recebido do MAL.
            refresh_token: Novo refresh_token recebido do MAL (rotacionado!).
            expires_at: Datetime (timezone-aware) de quando o access_token expira.
        """
        # UPSERT: insere se não existir, atualiza se já existir.
        # O CHECK (id = 1) no schema garante que esta tabela nunca terá mais de 1 linha.
        sql = """
            INSERT INTO mal_sync_state (id, access_token, refresh_token, expires_at, updated_at)
            VALUES (1, %(access_token)s, %(refresh_token)s, %(expires_at)s, NOW())
            ON CONFLICT (id) DO UPDATE
                SET access_token  = EXCLUDED.access_token,
                    refresh_token = EXCLUDED.refresh_token,
                    expires_at    = EXCLUDED.expires_at,
                    updated_at    = NOW()
        """
        run_dml(sql, {
            "access_token":  access_token,
            "refresh_token": refresh_token,
            "expires_at":    expires_at,
        })

        logger.debug("MALAuth: tokens persistidos no banco (expires_at=%s)", expires_at.isoformat())
