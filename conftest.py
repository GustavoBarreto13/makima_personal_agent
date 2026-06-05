"""Configuração global do pytest para o projeto makima_personal_agent.

Mocka o módulo google.cloud.bigquery antes que qualquer arquivo de teste
tente importá-lo, permitindo rodar os testes sem credenciais GCP nem
a biblioteca instalada no ambiente local.
"""

import sys
from unittest.mock import MagicMock

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
