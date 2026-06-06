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

# --- Banco de dados ---

# String de conexão ao PostgreSQL, no formato:
# postgresql://usuario:senha@host:porta/banco
# Usada pelas tools do journal (psycopg2) e pelo ADK DatabaseSessionService (asyncpg).
# Em produção, injetada pelo orquestrador (Dokploy/Docker).
DATABASE_URL: str = os.getenv("DATABASE_URL", "")
