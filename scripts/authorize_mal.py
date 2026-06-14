"""Autorização OAuth2 PKCE do MyAnimeList — rodar uma única vez localmente.

Guia o usuário pelo fluxo de autorização PKCE do MAL:
1. Gera code_verifier aleatório + code_challenge (SHA-256 base64url)
2. Abre o browser na URL de autorização do MAL
3. Aguarda o código de retorno em um servidor HTTP local (porta 8765)
4. Troca o código por access_token + refresh_token
5. Persiste os tokens na tabela `mal_sync_state` (PostgreSQL)
6. Imprime as variáveis de ambiente para copiar no .env / Dokploy

Pré-requisito:
    Variáveis de ambiente obrigatórias antes de rodar:
    - MAL_CLIENT_ID     — Client ID do app no MyAnimeList (mal-api.com)
    - MAL_CLIENT_SECRET — Client Secret do mesmo app

Usage:
    python scripts/authorize_mal.py
"""

import base64       # Codificação base64url para o code_challenge PKCE
import hashlib      # SHA-256 para o code_challenge
import os           # Lê variáveis de ambiente (MAL_CLIENT_ID, MAL_CLIENT_SECRET)
import secrets      # Gera o code_verifier criptograficamente seguro
import sys          # sys.exit() em caso de erro sem variáveis obrigatórias
import urllib.parse # Monta a URL de autorização com query params
import webbrowser   # Abre o browser automaticamente

# Servidor HTTP embutido para capturar o código de retorno do MAL
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime, timedelta, timezone

import requests  # Chamada POST para trocar o código pelo token

# Caminho do projeto para importar os helpers do banco
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.db import run_dml  # Helper compartilhado para escrita no PostgreSQL


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES DO FLUXO PKCE
# ─────────────────────────────────────────────────────────────────────────────

# URL onde o usuário autoriza o acesso — MAL redireciona de volta com `?code=...`
MAL_AUTHORIZE_URL = "https://myanimelist.net/v1/oauth2/authorize"

# URL para trocar o authorization code pelos tokens de acesso
MAL_TOKEN_URL = "https://myanimelist.net/v1/oauth2/token"

# Porta local que este script usa para receber o código de retorno do MAL.
# O redirect_uri cadastrado no app MAL deve ser exatamente "http://localhost:8765"
REDIRECT_URI = "http://localhost:8765"

# Porta do servidor HTTP local (deve bater com o redirect_uri)
LOCAL_PORT = 8765


# ─────────────────────────────────────────────────────────────────────────────
# PKCE — geração do code_verifier e code_challenge
# ─────────────────────────────────────────────────────────────────────────────

def _gerar_code_verifier() -> str:
    """Gera um code_verifier aleatório de 96 caracteres URL-safe.

    O code_verifier é uma string aleatória de alta entropia que só este
    processo conhece. O MAL usa para confirmar que quem troca o código pelo
    token é o mesmo que iniciou o fluxo (proteção PKCE S256).

    Returns:
        String de 96 caracteres URL-safe (letras, números, `-`, `_`, `.`, `~`).

    Example:
        >>> v = _gerar_code_verifier()
        >>> len(v) >= 43
        True
    """
    # secrets.token_bytes(72) gera 72 bytes aleatórios seguros.
    # base64url sem padding: 72 bytes → 96 chars base64 (72 * 4/3).
    # urlsafe_b64encode usa '-' e '_' em vez de '+' e '/' — exigido pelo PKCE.
    raw = secrets.token_bytes(72)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _gerar_code_challenge(verifier: str) -> str:
    """Gera o code_challenge S256 a partir do code_verifier.

    O MAL valida que `SHA256(verifier)` bate com o challenge enviado na
    autorização. Isso prova que o cliente que troca o código é o mesmo
    que iniciou o fluxo.

    Args:
        verifier: O code_verifier gerado por `_gerar_code_verifier()`.

    Returns:
        String base64url do SHA-256 do verifier (sem padding `=`).
    """
    # Calcula o SHA-256 do verifier em bytes
    digest = hashlib.sha256(verifier.encode("ascii")).digest()

    # Converte para base64url sem padding — formato exigido pelo MAL (PKCE S256)
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


# ─────────────────────────────────────────────────────────────────────────────
# SERVIDOR HTTP LOCAL — captura o ?code= no redirect
# ─────────────────────────────────────────────────────────────────────────────

# Variável global para armazenar o código capturado pelo handler HTTP
_auth_code: str | None = None


class _CallbackHandler(BaseHTTPRequestHandler):
    """Handler HTTP mínimo para capturar o código de retorno do MAL.

    O MAL redireciona o browser para `http://localhost:8765?code=XXXX`.
    Este handler extrai o parâmetro `code` da URL e fecha a conexão.
    """

    def do_GET(self) -> None:
        """Recebe o redirect do MAL e extrai o authorization code."""
        global _auth_code

        # Parseia a query string da URL (?code=XXXX&state=YYYY)
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        # Extrai o code (lista → pega o primeiro elemento)
        code = params.get("code", [None])[0]

        if code:
            # Salva o código na variável global para o fluxo principal acessar
            _auth_code = code

            # Envia uma resposta HTML mínima para o browser do usuário
            body = b"<h2>Autorizado! Pode fechar esta aba.</h2>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            # Caso de erro: MAL retornou ?error=... em vez de ?code=...
            error = params.get("error", ["desconhecido"])[0]
            body = f"<h2>Erro de autorização: {error}</h2>".encode()
            self.send_response(400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        """Silencia os logs do HTTPServer (sem poluir o terminal)."""
        pass


def _aguardar_codigo() -> str:
    """Inicia o servidor local e aguarda o código de retorno do MAL.

    Bloqueia até receber exatamente uma requisição (o redirect do MAL)
    ou falhar por ausência de código.

    Returns:
        O authorization code recebido do MAL.

    Raises:
        SystemExit: Se o servidor receber uma requisição sem `?code=`.
    """
    global _auth_code

    # Inicia o servidor HTTP na porta LOCAL_PORT
    servidor = HTTPServer(("localhost", LOCAL_PORT), _CallbackHandler)
    print(f"  → Aguardando autorização em {REDIRECT_URI} ...")

    # Processa uma única requisição (o redirect do MAL) e encerra
    servidor.handle_request()
    servidor.server_close()

    # Verifica se o código foi capturado com sucesso
    if not _auth_code:
        print("❌ Nenhum código de autorização recebido. Tente novamente.")
        sys.exit(1)

    return _auth_code


# ─────────────────────────────────────────────────────────────────────────────
# TROCA DO CÓDIGO PELOS TOKENS
# ─────────────────────────────────────────────────────────────────────────────

def _trocar_codigo_por_tokens(
    code: str,
    code_verifier: str,
    client_id: str,
    client_secret: str,
) -> dict:
    """Troca o authorization code pelos tokens de acesso MAL.

    Faz o POST para o endpoint de token do MAL enviando o code_verifier
    (que prova que somos o mesmo processo que iniciou o fluxo PKCE).

    Args:
        code: Authorization code recebido no redirect.
        code_verifier: O verifier original gerado em `_gerar_code_verifier()`.
        client_id: Client ID do app no MAL.
        client_secret: Client Secret do app no MAL.

    Returns:
        Dict com access_token, refresh_token, expires_in, token_type.

    Raises:
        SystemExit: Se o MAL retornar erro HTTP.
    """
    # Payload do request de troca — application/x-www-form-urlencoded
    payload = {
        "client_id":     client_id,
        "client_secret": client_secret,
        "code":          code,
        "code_verifier": code_verifier,   # prova PKCE: MAL verifica SHA256(verifier) == challenge
        "grant_type":    "authorization_code",
        "redirect_uri":  REDIRECT_URI,
    }

    print("  → Trocando código por tokens ...")

    # POST com Content-Type: application/x-www-form-urlencoded (não JSON)
    response = requests.post(MAL_TOKEN_URL, data=payload, timeout=15)

    # Valida o status HTTP — MAL retorna 200 em sucesso, 4xx em erro
    if response.status_code != 200:
        print(f"❌ Erro ao trocar código: HTTP {response.status_code}")
        print(f"   Resposta: {response.text[:500]}")
        sys.exit(1)

    return response.json()


# ─────────────────────────────────────────────────────────────────────────────
# PERSISTÊNCIA NO BANCO
# ─────────────────────────────────────────────────────────────────────────────

def _persistir_tokens(
    access_token: str,
    refresh_token: str,
    expires_in: int,
) -> None:
    """Salva os tokens no banco PostgreSQL (tabela `mal_sync_state`).

    Usa UPSERT (INSERT ... ON CONFLICT DO UPDATE) para garantir que
    a linha singleton com id=1 seja criada ou atualizada.

    Args:
        access_token: Token de acesso recebido do MAL.
        refresh_token: Token de refresh recebido do MAL.
        expires_in: Validade do access_token em segundos.
    """
    # Calcula a data/hora de expiração absoluta
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    # Upsert na linha singleton (id=1 é garantido pelo CHECK no schema)
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

    print("  ✓ Tokens persistidos no banco (mal_sync_state)")
    print(f"    Expiram em: {expires_at.isoformat()}")


# ─────────────────────────────────────────────────────────────────────────────
# FLUXO PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    """Executa o fluxo PKCE completo e persiste os tokens no banco.

    1. Lê MAL_CLIENT_ID e MAL_CLIENT_SECRET do ambiente
    2. Gera code_verifier + code_challenge
    3. Abre o browser na URL de autorização do MAL
    4. Aguarda o código de retorno em localhost:8765
    5. Troca o código pelos tokens
    6. Persiste no banco
    7. Imprime os valores das variáveis de ambiente
    """
    # ── 1. Verifica variáveis obrigatórias ───────────────────────────────────
    client_id     = os.environ.get("MAL_CLIENT_ID", "").strip()
    client_secret = os.environ.get("MAL_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        print("❌ Variáveis obrigatórias ausentes:")
        print("   MAL_CLIENT_ID     — Client ID do app no MyAnimeList")
        print("   MAL_CLIENT_SECRET — Client Secret do app no MyAnimeList")
        print()
        print("   Obtenha em: https://myanimelist.net/apiconfig")
        print("   Redirect URI do app: http://localhost:8765")
        sys.exit(1)

    # ── 2. Gera PKCE ─────────────────────────────────────────────────────────
    code_verifier  = _gerar_code_verifier()
    code_challenge = _gerar_code_challenge(code_verifier)

    # state aleatório para proteção CSRF (MAL retorna junto com o code)
    state = secrets.token_urlsafe(16)

    # ── 3. Monta e abre a URL de autorização ─────────────────────────────────
    params = {
        "response_type":         "code",
        "client_id":             client_id,
        "code_challenge":        code_challenge,
        "code_challenge_method": "S256",   # SHA-256, método mais seguro
        "state":                 state,
        "redirect_uri":          REDIRECT_URI,
    }
    auth_url = MAL_AUTHORIZE_URL + "?" + urllib.parse.urlencode(params)

    print("\n=== Autorização OAuth2 PKCE — MyAnimeList ===\n")
    print("Abrindo o browser para você autorizar o acesso ...")
    print(f"\nSe o browser não abrir, acesse manualmente:\n{auth_url}\n")

    # Abre o browser com a URL de autorização
    webbrowser.open(auth_url)

    # ── 4. Aguarda o código de retorno (servidor local) ────────────────────
    code = _aguardar_codigo()
    print(f"  ✓ Código de autorização recebido ({code[:8]}...)")

    # ── 5. Troca o código pelos tokens ─────────────────────────────────────
    tokens = _trocar_codigo_por_tokens(code, code_verifier, client_id, client_secret)

    access_token  = tokens["access_token"]
    refresh_token = tokens["refresh_token"]
    expires_in    = tokens.get("expires_in", 3600)  # MAL padrão: 3600s (1 hora)

    print(f"  ✓ Tokens recebidos (expira em {expires_in}s)")

    # ── 6. Persiste no banco ───────────────────────────────────────────────
    _persistir_tokens(access_token, refresh_token, expires_in)

    # ── 7. Imprime os valores para o .env / Dokploy ───────────────────────
    expiry_iso = (
        datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    ).isoformat()

    print("\n=== Copie os valores abaixo para o seu .env / Dokploy ===\n")
    print(f"MAL_CLIENT_ID={client_id}")
    print(f"MAL_CLIENT_SECRET={client_secret}")
    print(f"MAL_ACCESS_TOKEN={access_token}")
    print(f"MAL_REFRESH_TOKEN={refresh_token}")
    print(f"MAL_TOKEN_EXPIRY={expiry_iso}")
    print()
    print("✅ Autorização concluída! O agente Marin já pode usar o MAL.")
    print()
    print("Próximo passo: rodar o setup do schema se ainda não fez:")
    print("  docker exec makima-web sh -c 'cd /app && python -m scripts.setup_schemas'")


if __name__ == "__main__":
    main()
