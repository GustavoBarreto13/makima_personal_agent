# Script auxiliar para gerar credenciais OAuth do Google Calendar.
# Rodar uma única vez localmente para obter access_token e refresh_token.
# Requer client_secret.json baixado do Google Cloud Console na mesma pasta.

import json
import os
from google_auth_oauthlib.flow import InstalledAppFlow

# Permissões necessárias: leitura de todos os calendários + escrita no principal
SCOPES = ["https://www.googleapis.com/auth/calendar"]

# Caminho para o arquivo de credenciais baixado do Google Cloud Console
CLIENT_SECRET_FILE = os.path.join(os.path.dirname(__file__), "client_secret.json")


def main():
    # Inicia o fluxo OAuth — abre o browser para o usuário autorizar
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
    creds = flow.run_local_server(port=0)

    # Exibe os valores para copiar nas variáveis de ambiente
    print("\n=== Copie os valores abaixo para o seu .env ===\n")
    print(f"GOOGLE_CALENDAR_CLIENT_ID={flow.client_config['client_id']}")
    print(f"GOOGLE_CALENDAR_CLIENT_SECRET={flow.client_config['client_secret']}")
    print(f"GOOGLE_CALENDAR_ACCESS_TOKEN={creds.token}")
    print(f"GOOGLE_CALENDAR_REFRESH_TOKEN={creds.refresh_token}")
    print(f"GOOGLE_CALENDAR_TOKEN_EXPIRY={creds.expiry.isoformat() if creds.expiry else ''}")
    print("\n=== Não se esqueça de definir também: ===")
    print("GOOGLE_CALENDAR_MAIN_CALENDAR_ID=<seu email ou ID do calendário principal>")
    print("\nDica: o ID do calendário principal geralmente é o seu endereço de email.")


if __name__ == "__main__":
    main()
