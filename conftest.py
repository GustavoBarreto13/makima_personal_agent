"""Configuração global do pytest para o projeto makima_personal_agent.

Mocka o módulo google.cloud.bigquery antes que qualquer arquivo de teste
tente importá-lo, permitindo rodar os testes sem credenciais GCP nem
a biblioteca instalada no ambiente local.
"""

import sys
from unittest.mock import MagicMock

# "Prime" o sys.modules com os submódulos REAIS de google.adk/google.genai usados por
# coordinator/ e mcp_servers/makima/legacy.py (spec 064) ANTES do mock de bigquery abaixo
# substituir sys.modules["google"]. `from google.adk.x import Y` resolve via
# sys.modules["google.adk.x"] diretamente (sem precisar percorrer o atributo .adk do
# módulo "google") — então, uma vez cacheados aqui, esses imports continuam funcionando
# mesmo depois do "google" de topo virar um MagicMock. google-adk é dependência normal
# do projeto (requirements.txt); o try/except é só para não derrubar a suíte inteira caso
# algum ambiente de CI reduzido não o tenha instalado.
try:
    import google.adk.agents  # noqa: F401
    import google.adk.runners  # noqa: F401
    import google.adk.sessions  # noqa: F401
    import google.adk.errors.session_not_found_error  # noqa: F401
    import google.genai  # noqa: F401
    # Cadeia completa do coordinator (McpToolset da Kaguya arrasta google.oauth2.credentials,
    # google.auth.transport.requests etc. — importar de verdade aqui cacheia tudo em
    # sys.modules antes do mock abaixo substituir google.oauth2) e do servidor MCP do
    # Calendar (mesma árvore de auth do Google).
    import coordinator.agent  # noqa: F401
    import mcp_servers.calendar.server  # noqa: F401
except ImportError:
    pass

# Substitui google.cloud.bigquery por um mock antes de qualquer import de teste.
# Isso é necessário porque os módulos de tools importam bigquery no nível do módulo
# (não dentro das funções), então o mock precisa estar presente antes do primeiro import.
google_mock = MagicMock()
sys.modules["google"] = google_mock
sys.modules["google.cloud"] = google_mock
sys.modules["google.cloud.bigquery"] = google_mock
sys.modules["google.oauth2"] = google_mock
sys.modules["google.oauth2.service_account"] = google_mock

# Garante que ScalarQueryParameter e os tipos de parâmetro retornem objetos
# com atributos "name" e "value" acessíveis (necessário para os asserts nos testes)
class FakeParam:
    """Simula um google.cloud.bigquery.ScalarQueryParameter para os testes."""
    def __init__(self, name, type_, value):
        self.name = name
        self.type_ = type_
        self.value = value

google_mock.ScalarQueryParameter = FakeParam
google_mock.cloud.bigquery.ScalarQueryParameter = FakeParam
google_mock.cloud.bigquery.QueryJobConfig = MagicMock
