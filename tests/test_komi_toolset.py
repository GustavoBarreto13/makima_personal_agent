"""O conjunto de tools da Komi exposto ao Hermes/MCP (spec 077): paridade com o webapp.

Garante nomes únicos (inclusive contra a Kaguya, que o Hermes enxerga ao mesmo tempo), docstring em
todas, que o FastMCP monta o schema de todas, e o comportamento das tools novas que não precisam de banco.
"""

from unittest.mock import patch

from agents.kaguya.toolset import TOOLS as KAGUYA_TOOLS
from agents.komi.toolset import TOOLS
from mcp_servers.makima.registry import DOMAINS

NAMES = [f.__name__ for f in TOOLS]
DOMINIO = DOMAINS["komi"]

ESPERADAS = {
    "create_person", "update_person", "delete_person", "restore_person", "add_alias", "remove_alias",
    "find_people", "resolve_person", "get_person", "get_person_summary",
    "set_birthday", "upcoming_birthdays", "add_important_date", "update_important_date", "delete_important_date",
    "log_interaction", "list_interactions", "add_person_note", "list_person_notes", "get_person_memory", "get_person_briefing",
    "relate_person", "list_relations", "list_relation_kinds", "create_people_group", "list_people_groups",
    "add_person_to_group", "remove_person_from_group", "list_categories", "create_category",
    "find_duplicates", "preview_merge", "merge_people",
}


def test_sem_nomes_repetidos():
    nomes = [f.__name__ for f in DOMINIO]
    assert len(nomes) == len(set(nomes))


def test_capacidades_do_webapp_estao_no_hermes():
    assert ESPERADAS <= {f.__name__ for f in DOMINIO}, sorted(ESPERADAS - {f.__name__ for f in DOMINIO})


def test_resumo_de_ia_entra_no_dominio_pelo_registry_sem_a_komi_depender_da_kurisu():
    assert "summarize_person_memory" in {f.__name__ for f in DOMINIO}
    assert "summarize_person_memory" not in NAMES                              # agents/komi não importa a Kurisu


def test_nomes_nao_colidem_com_os_da_kaguya():
    """O Hermes carrega os dois servidores; `create_group` da Kaguya (listas) não pode se confundir com o da Komi."""
    colisao = set(NAMES) & {f.__name__ for f in KAGUYA_TOOLS}
    assert not colisao, sorted(colisao)


def test_todas_as_tools_tem_docstring():
    sem = [f.__name__ for f in DOMINIO if not (f.__doc__ or "").strip()]
    assert not sem, sem


def test_fastmcp_monta_o_schema_de_todas():
    from mcp.server.fastmcp import FastMCP

    server = FastMCP("komi-test")
    for f in DOMINIO:
        server.add_tool(f)
    assert len(server._tool_manager.list_tools()) == len(DOMINIO)


def test_mesclar_avisa_que_nao_tem_desfazer_e_exige_confirmacao():
    doc = next(f for f in DOMINIO if f.__name__ == "merge_people").__doc__
    assert "SEM DESFAZER" in doc and "preview_merge" in doc and "EXPLICITAMENTE" in doc


# ── tools novas que não precisam de banco ────────────────────────────────────

def test_relate_person_inverte_a_ordem_para_ficar_do_ponto_de_vista_da_pessoa():
    from agents.komi import toolset
    with patch.object(toolset, "relate_people", return_value={"status": "ok"}) as mock:
        toolset.relate_person("ana", "joao", "filho")                           # "o João é filho da Ana"
    mock.assert_called_once_with("joao", "ana", "filho")                         # "João é filho de Ana"


def test_grupos_de_pessoas_delegam_com_nomes_proprios():
    from agents.komi import toolset
    with patch.object(toolset, "create_group", return_value={"status": "ok"}) as c, \
         patch.object(toolset, "list_groups", return_value={"status": "ok"}) as l, \
         patch.object(toolset, "add_to_group", return_value={"status": "ok"}) as a, \
         patch.object(toolset, "remove_from_group", return_value={"status": "ok"}) as r:
        toolset.create_people_group("Turma"); toolset.list_people_groups()
        toolset.add_person_to_group(1, "p1"); toolset.remove_person_from_group(1, "p1")
    c.assert_called_once_with("Turma"); l.assert_called_once(); a.assert_called_once_with(1, "p1"); r.assert_called_once_with(1, "p1")


def test_resumo_de_ia_resolve_pessoa_pela_regra_zero_um_varios():
    from agents.kurisu import komi_tools as KT
    uma = {"status": "ok", "match": "one", "people": [{"id": "p1", "name": "Bia"}], "person": {"id": "p1", "name": "Bia"}}
    nenhuma = {"status": "ok", "match": "none", "people": [], "person": None}
    varias = {"status": "ok", "match": "many", "people": [{"id": "1", "name": "Ana Lima"}, {"id": "2", "name": "Ana Souza"}], "person": None}
    with patch("agents.komi.integration.resolve_person") as resolve, \
         patch.object(KT.person_summary, "gerar_resumo", return_value={"status": "ok", "summary": {}}) as gerar:
        resolve.return_value = uma
        KT.summarize_person_memory("Bia", space="work", regenerate=True)
        gerar.assert_called_once_with("p1", context="work", force=True)
        gerar.reset_mock()

        resolve.return_value = nenhuma
        r = KT.summarize_person_memory("Zé")
        assert r["status"] == "error" and "cadastrar" in r["message"]

        resolve.return_value = varias
        r = KT.summarize_person_memory("Ana")
        assert r["ambiguous"] is True and len(r["people"]) == 2
        resolve.return_value = {"status": "error", "message": "banco fora"}
        assert KT.summarize_person_memory("x")["status"] == "error"
        gerar.assert_not_called()                                                 # ambíguo/inexistente NUNCA gera
