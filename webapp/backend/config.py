"""Configurações centrais da webapp Makima.

Este módulo carrega todas as variáveis de ambiente necessárias para o funcionamento
da aplicação web. As variáveis são lidas do ambiente do sistema operacional (ou do
arquivo .env, carregado antes da execução). Cada variável tem um valor padrão seguro
para desenvolvimento local.

Usage:
    from webapp.backend.config import SESSION_SECRET, ALLOWED_EMAIL
"""

import os  # Módulo padrão do Python para ler variáveis de ambiente

# --- Variáveis de autenticação e segurança ---

# Email permitido para login via Google OAuth.
# Somente este email poderá acessar a webapp. Se vazio, qualquer email passa (inseguro em produção).
ALLOWED_EMAIL: str = os.getenv("ALLOWED_EMAIL", "")

# Segredo usado para assinar cookies de sessão.
# Em produção, deve ser uma string longa e aleatória (ex.: gerada com `secrets.token_hex(32)`).
# O valor padrão "dev-secret-change-me" só deve existir em ambiente de desenvolvimento.
SESSION_SECRET: str = os.getenv("SESSION_SECRET", "dev-secret-change-me")

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
