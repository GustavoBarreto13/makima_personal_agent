"""Testes do agregador de calendários — calendar_hub (fatia 019, SC-005).

Exercita o fan-out de providers, degradação best-effort quando um provider
levanta exceção, filtragem por sources e a presença do stub Akane na listagem.

São testes **puros**: não tocam no banco de dados. Usam `register()` para
injetar providers de teste diretamente no hub e `with_prefs=False` em
`list_sources()` para evitar qualquer chamada à tabela calendar_prefs.

Como rodar:
    pytest tests/agents/test_kaguya_calendar_hub.py -v
"""

import pytest
from agents.kaguya import calendar_hub


# ---------------------------------------------------------------------------
# Fixture de isolamento: salva e restaura o estado global do hub
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def restore_hub_registry():
    """Salva e restaura o estado do registro do hub entre testes.

    O hub usa dicionários de módulo (_SOURCES, _PROVIDERS) que persistem
    enquanto o processo estiver rodando. Sem esse fixture, um teste que registra
    uma fonte de teste "nami_test" poluiria o estado para os testes seguintes.
    Salvamos cópias rasas antes de cada teste e restauramos no teardown.
    """
    # Salva o estado atual antes de qualquer alteração do teste
    saved_sources = dict(calendar_hub._SOURCES)
    saved_providers = dict(calendar_hub._PROVIDERS)

    # Executa o teste
    yield

    # Restaura o estado original após o teste (inclusive em caso de falha)
    calendar_hub._SOURCES.clear()
    calendar_hub._SOURCES.update(saved_sources)
    calendar_hub._PROVIDERS.clear()
    calendar_hub._PROVIDERS.update(saved_providers)


# ---------------------------------------------------------------------------
# Helpers de construção de fontes e itens de teste
# ---------------------------------------------------------------------------

def _make_source(source_id: str) -> dict:
    """Constrói um dicionário SOURCE mínimo para uso em testes.

    Args:
        source_id: Identificador único da fonte de teste.

    Returns:
        Dicionário com os campos obrigatórios de uma fonte de calendário.
    """
    return {
        "id": source_id,
        "account": "makima",
        "kind": "base",
        "name": f"Fonte de Teste · {source_id}",
        # Cor genérica para não interferir nas asserções
        "color": "oklch(0.70 0.17 52)",
    }


def _make_item(source_id: str, title: str) -> dict:
    """Constrói um CalendarItem mínimo para usar como retorno de provider de teste.

    Args:
        source_id: ID da fonte do item (campo `cal`).
        title: Título do evento.

    Returns:
        Dicionário compatível com CalendarItem.
    """
    return {
        "cal": source_id,
        "date": "2026-06-03",
        "title": title,
        "kind": "test",
        "all_day": True,
        "start": None,
        "end": None,
        "ref_id": None,
        "deep_link": None,
        "color": None,
        "loc": None,
    }


# ---------------------------------------------------------------------------
# Testes
# ---------------------------------------------------------------------------

def test_aggregate_dois_providers_concatena_itens():
    """Aggregate com 2 providers retorna itens de ambos concatenados."""
    # Cria dois items de teste, um por fonte
    item_a = _make_item("src_a", "Evento da Fonte A")
    item_b = _make_item("src_b", "Evento da Fonte B")

    # Registra duas fontes de teste com providers que retornam 1 item cada
    calendar_hub.register(_make_source("src_a"), lambda s, e: [item_a])
    calendar_hub.register(_make_source("src_b"), lambda s, e: [item_b])

    # Chama aggregate restringindo a src_a e src_b — evita que nami/frieren/violet
    # (providers reais) tentem abrir o banco durante os testes (sem DATABASE_URL).
    # O cenário validado é o fan-out entre os dois providers de teste.
    result = calendar_hub.aggregate("2026-06-01", "2026-06-07", sources=["src_a", "src_b"])

    # Ambos os itens devem estar na lista unificada
    titles = [i["title"] for i in result["items"]]
    assert "Evento da Fonte A" in titles, "Item da fonte A deve estar presente"
    assert "Evento da Fonte B" in titles, "Item da fonte B deve estar presente"

    # Nenhum provider falhou — errors deve estar vazio
    assert result["errors"] == [], "Nenhum erro esperado quando providers funcionam normalmente"


def test_aggregate_provider_com_erro_vai_para_errors_sem_lancar():
    """Provider que levanta RuntimeError vai para errors[]; outros itens ainda chegam.

    Verifica a política best-effort: uma fonte com falha não impede as demais
    de retornar seus dados, e a exceção não se propaga para o chamador.
    """
    # Fonte boa: retorna 1 item normalmente
    item_bom = _make_item("src_boa", "Item da fonte boa")
    calendar_hub.register(_make_source("src_boa"), lambda s, e: [item_bom])

    # Fonte ruim: simula banco fora do ar ou bug interno com RuntimeError
    def provider_falho(start_date: str, end_date: str):
        """Simula falha de provider (banco indisponível, timeout, etc.)."""
        raise RuntimeError("Banco de dados indisponível — simulação de falha")

    calendar_hub.register(_make_source("src_ruim"), provider_falho)

    # A chamada a aggregate NÃO deve levantar exceção, mesmo com um provider falhando
    try:
        result = calendar_hub.aggregate("2026-06-01", "2026-06-07")
    except Exception as exc:
        pytest.fail(f"aggregate() não deveria levantar exceção, mas levantou: {exc}")

    # A fonte falha deve aparecer em errors[]
    assert "src_ruim" in result["errors"], (
        "Source ID da fonte falha deve constar em errors[]"
    )

    # O item da fonte boa deve estar presente mesmo com o outro provider falhando
    titles = [i["title"] for i in result["items"]]
    assert "Item da fonte boa" in titles, (
        "Item da fonte boa deve aparecer mesmo quando outro provider falha"
    )


def test_aggregate_filtra_por_sources():
    """aggregate(sources=[...]) retorna apenas itens da fonte especificada.

    Verifica que a filtragem por source_id é exclusiva: itens de fontes não
    listadas não aparecem no resultado.
    """
    item_nami = _make_item("nami_test", "Despesa Nami")
    item_frieren = _make_item("frieren_test", "Sessão de leitura Frieren")

    # Registra as duas fontes de teste
    calendar_hub.register(_make_source("nami_test"), lambda s, e: [item_nami])
    calendar_hub.register(_make_source("frieren_test"), lambda s, e: [item_frieren])

    # Solicita apenas os items de nami_test via filtro de sources
    result = calendar_hub.aggregate(
        "2026-06-01",
        "2026-06-07",
        sources=["nami_test"],
    )

    titles = [i["title"] for i in result["items"]]

    # Apenas o item de nami_test deve estar presente
    assert "Despesa Nami" in titles, "Item de nami_test deve aparecer quando filtrado"

    # O item de frieren_test NÃO deve aparecer — foi explicitamente excluído do filtro
    assert "Sessão de leitura Frieren" not in titles, (
        "Item de frieren_test não deve aparecer quando sources filtra para nami_test"
    )


def test_list_sources_contem_stub_akane():
    """list_sources() sempre inclui o stub Akane com os metadados corretos.

    Akane é registrada no módulo na inicialização (agents/media/ ainda não implementado)
    e deve aparecer na listagem mesmo sem nenhuma pref no banco. Usamos with_prefs=False
    para não depender do banco de dados nos testes.
    """
    # Obtém a lista de fontes sem consultar o banco (with_prefs=False)
    sources = calendar_hub.list_sources(with_prefs=False)

    # Indexa as fontes por id para acesso fácil
    sources_by_id = {s["id"]: s for s in sources}

    # Akane deve estar registrada — é um stub que deve aparecer sempre na sidebar
    assert "akane" in sources_by_id, (
        "Fonte 'akane' deve estar presente em list_sources() — registrada no módulo"
    )

    akane = sources_by_id["akane"]

    # Verifica que o nome de exibição corresponde ao esperado pela spec
    assert akane["name"] == "Akane · Filmes", (
        f"Nome de Akane deve ser 'Akane · Filmes', mas foi '{akane['name']}'"
    )

    # Akane deve ter uma cor definida (não pode ser None ou string vazia)
    assert akane.get("color"), (
        "Fonte Akane deve ter uma cor de exibição definida"
    )
