"""Script de autorização OAuth do Google Calendar — rodar uma única vez localmente.

Abre o browser para o usuário autorizar o acesso ao Google Calendar e imprime
os valores das variáveis de ambiente necessárias para copiar no .env e no Dokploy.

Pré-requisito:
    Baixar o arquivo client_secret.json do Google Cloud Console
    (APIs e Serviços → Credenciais → OAuth 2.0 → Desktop App → baixar JSON)
    e salvá-lo na pasta scripts/.

Usage:
    python scripts/authorize_calendar.py
"""

import json
import os
from google_auth_oauthlib.flow import InstalledAppFlow

# Permissões necessárias: leitura de todos os calendários + escrita no principal.
# O escopo "calendar" (não "calendar.readonly") é necessário para criar e editar eventos.
SCOPES = ["https://www.googleapis.com/auth/calendar"]

# Caminho para o arquivo de credenciais do app OAuth baixado do Google Cloud Console.
# Deve estar na mesma pasta que este script (scripts/).
CLIENT_SECRET_FILE = os.path.join(os.path.dirname(__file__), "client_secret.json")


def main() -> None:
    """Executa o fluxo OAuth e imprime os valores das variáveis de ambiente.

    Abre o browser para o usuário fazer login com a conta Google e autorizar
    o acesso ao calendário. Após a autorização, imprime os tokens no terminal
    para serem copiados para o .env do projeto e para o painel do Dokploy.
    """
    # Inicia o fluxo OAuth usando as credenciais do app — abre o browser automaticamente.
    # port=0 faz o servidor local escutar em uma porta disponível aleatória (evita conflitos).
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
    creds = flow.run_local_server(port=0)

    # Exibe os valores para copiar nas variáveis de ambiente do projeto
    print("\n=== Copie os valores abaixo para o seu .env ===\n")
    print(f"GOOGLE_CALENDAR_CLIENT_ID={flow.client_config['client_id']}")
    print(f"GOOGLE_CALENDAR_CLIENT_SECRET={flow.client_config['client_secret']}")
    print(f"GOOGLE_CALENDAR_ACCESS_TOKEN={creds.token}")
    print(f"GOOGLE_CALENDAR_REFRESH_TOKEN={creds.refresh_token}")

    # creds.expiry pode ser None se a API não retornou data de expiração
    print(f"GOOGLE_CALENDAR_TOKEN_EXPIRY={creds.expiry.isoformat() if creds.expiry else ''}")

    print("\n=== Não se esqueça de definir também: ===")
    print("GOOGLE_CALENDAR_MAIN_CALENDAR_ID=<seu email ou ID do calendário principal>")
    print("\nDica: o ID do calendário principal geralmente é o seu endereço de email.")


if __name__ == "__main__":
    main()
