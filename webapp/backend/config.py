"""Configurações centrais da webapp Makima.

Este módulo carrega todas as variáveis de ambiente necessárias para o funcionamento
da aplicação web. As variáveis são lidas do ambiente do sistema operacional (ou do
arquivo .env, carregado antes da execução). Cada variável tem um valor padrão seguro
para desenvolvimento local.

Usage:
    from webapp.backend.config import SESSION_SECRET, ALLOWED_EMAIL
"""

import logging  # Módulo padrão do Python para emitir avisos e logs
import os  # Módulo padrão do Python para ler variáveis de ambiente

# --- Variáveis de autenticação e segurança ---

# Email permitido para login via Google OAuth.
# Somente este email poderá acessar a webapp. Se vazio, qualquer email passa (inseguro em produção).
# O .strip() remove espaços acidentais ao redor do valor (ex.: "email@gmail.com " no .env)
ALLOWED_EMAIL: str = os.getenv("ALLOWED_EMAIL", "").strip()

# Segredo usado para assinar cookies de sessão.
# Em produção, deve ser uma string longa e aleatória (ex.: gerada com `secrets.token_hex(32)`).
# O valor padrão "dev-secret-change-me" só deve existir em ambiente de desenvolvimento.
SESSION_SECRET: str = os.getenv("SESSION_SECRET", "dev-secret-change-me")

# Avisa no log se SESSION_SECRET estiver com o valor padrão inseguro.
# Isso garante visibilidade em produção se a variável não foi configurada corretamente.
if SESSION_SECRET == "dev-secret-change-me":
    logging.warning(
        "AVISO DE SEGURANÇA: SESSION_SECRET está com o valor padrão inseguro. "
        "Configure a variável de ambiente SESSION_SECRET antes do deploy em produção."
    )

# Client ID do app OAuth do Google Cloud Console.
# Necessário para o fluxo de login "Entrar com Google".
GOOGLE_OAUTH_CLIENT_ID: str = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")

# Client Secret do app OAuth do Google Cloud Console.
# Nunca expor este valor em logs ou no frontend — é uma chave secreta.
GOOGLE_OAUTH_CLIENT_SECRET: str = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")

# URL para onde o Google redireciona o usuário após autorizar o login.
# Em produção, deve ser o domínio real (ex.: https://makima.exemplo.com/auth/callback).
OAUTH_REDIRECT_URL: str = os.getenv(
    "OAUTH_REDIRECT_URL", "http://localhost:8080/auth/callback"
)

# --- Constantes de sessão ---

# Nome do cookie de sessão gravado no navegador do usuário.
# Compartilhado entre auth.py (que emite o cookie) e deps.py (que valida o cookie).
SESSION_COOKIE_NAME: str = "makima_session"

# Duração máxima do cookie de sessão: 7 dias em segundos.
# Após esse período, o itsdangerous rejeita o token mesmo que a assinatura seja válida.
SESSION_MAX_AGE: int = 60 * 60 * 24 * 7  # 604800 segundos

# --- Login do app Android (Etapa 2 do docs/planos/app_android) ---

# Client IDs do Google aceitos como "audiência" do ID token enviado pelo app, separados por vírgula.
# Normalmente é o client ID "Web" do projeto OAuth (o plugin de login nativo pede o token para ele).
# Vazio = o login mobile fica desligado (POST /auth/mobile responde 503) — nada muda para o site.
GOOGLE_MOBILE_CLIENT_IDS: list[str] = [
    cid.strip()
    for cid in os.getenv("GOOGLE_MOBILE_CLIENT_IDS", "").split(",")
    if cid.strip()
]

# Vida do token de acesso do app (curto, para limitar o estrago se vazar): 30 minutos.
MOBILE_ACCESS_MAX_AGE: int = 60 * 30

# Refresh token "deslizante": vale 90 dias a partir do último uso. Passou disso sem abrir o app, pede login de novo.
MOBILE_REFRESH_MAX_AGE_DAYS: int = 90

# --- Banco de dados ---

# String de conexão ao PostgreSQL, no formato:
# postgresql://usuario:senha@host:porta/banco
# Usada pelas tools do journal (psycopg2) e pelo ADK DatabaseSessionService (asyncpg).
# Em produção, injetada pelo orquestrador (Dokploy/Docker).
DATABASE_URL: str = os.getenv("DATABASE_URL", "")

# --- Google Calendar (fatia 019 — Calendar Hub) ---
# Credenciais OAuth do Google Calendar, compartilhadas com o MCP do agente Kaguya.
# O container makima-web precisa dessas vars porque gcal.py (cliente não-MCP) roda
# dentro do webapp para o espelho de tarefas e o CRUD da Agenda pessoal (FR-017).
# Em produção, injetar via Dokploy (as mesmas vars já configuradas no coordinator).

# Token de acesso OAuth (curta duração; renovado automaticamente via refresh_token).
GOOGLE_CALENDAR_ACCESS_TOKEN: str = os.getenv("GOOGLE_CALENDAR_ACCESS_TOKEN", "")

# Token de renovação OAuth (longa duração; único que precisa ser persistido durável).
GOOGLE_CALENDAR_REFRESH_TOKEN: str = os.getenv("GOOGLE_CALENDAR_REFRESH_TOKEN", "")

# Client ID e Secret do app OAuth no Google Cloud Console.
GOOGLE_CALENDAR_CLIENT_ID: str = os.getenv("GOOGLE_CALENDAR_CLIENT_ID", "")
GOOGLE_CALENDAR_CLIENT_SECRET: str = os.getenv("GOOGLE_CALENDAR_CLIENT_SECRET", "")

# Data/hora de expiração do access_token (string ISO 8601).
GOOGLE_CALENDAR_TOKEN_EXPIRY: str = os.getenv("GOOGLE_CALENDAR_TOKEN_EXPIRY", "")

# ID do calendário principal do Google (escrita de eventos só aqui).
GOOGLE_CALENDAR_MAIN_CALENDAR_ID: str = os.getenv("GOOGLE_CALENDAR_MAIN_CALENDAR_ID", "")

# Liga/desliga o espelho automático de tarefas → Google Calendar.
# Se "false" (qualquer caixa), o CRUD de tarefas funciona normalmente sem chamar o Google.
GCAL_SYNC_ENABLED: bool = os.getenv("GCAL_SYNC_ENABLED", "true").lower() != "false"
