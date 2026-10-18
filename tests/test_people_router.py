"""Testes do router de pessoas (webapp/backend/routers/pessoas.py) — spec 077.

Usa o TestClient do FastAPI com as funções da Komi simuladas (sem banco): confere que cada rota chama
a função certa com os argumentos certos e converte erro em HTTP 400/409.

Execute com:
    pytest tests/test_people_router.py -v
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from webapp.backend.deps import require_user
from webapp.backend.main import app

# Usuário fixo no lugar do cookie de sessão (mesmo padrão de tests/test_books_router.py).
app.dependency_overrides[require_user] = lambda: {"email": "test@example.com", "name": "Test"}
client = TestClient(app, raise_server_exceptions=True)

R = "webapp.backend.routers.pessoas"
OK = {"status": "ok"}
ERRO = {"status": "error", "message": "deu ruim"}


# ─── rotas fixas não podem ser engolidas por /{person_id} ─────────────────────

@pytest.mark.parametrize("caminho", [
    "/api/people/stats", "/api/people/categories", "/api/people/groups", "/api/people/duplicates",
    "/api/people/relation-kinds", "/api/people/suggest", "/api/people/overview", "/api/people/search?q=a",
])
def test_rotas_fixas_nao_viram_id_de_pessoa(caminho):
    with patch(f"{R}.get_person", side_effect=AssertionError("caiu em /{person_id}")), \
         patch(f"{R}.get_stats_payload", return_value=OK), patch(f"{R}.list_categories", return_value=OK), \
         patch(f"{R}.list_groups", return_value=OK), patch(f"{R}.find_duplicates", return_value=OK), \
         patch(f"{R}.list_relation_kinds", return_value=OK), patch(f"{R}.suggest_people", return_value=OK), \
         patch(f"{R}.get_people_overview", return_value=OK), patch(f"{R}.find_people", return_value=OK):
        assert client.get(caminho).status_code == 200


# ─── pessoas ──────────────────────────────────────────────────────────────────

@patch(f"{R}.list_people", return_value={"status": "ok", "people": []})
def test_listar_repassa_o_espaco(mock):
    assert client.get("/api/people/?space=work").status_code == 200
    mock.assert_called_once_with("work")
    mock.reset_mock()
    client.get("/api/people/")
    mock.assert_called_once_with(None)


@patch(f"{R}.create_person", return_value={"status": "ok", "id": "p1"})
def test_criar_repassa_os_tres_nomes_espaco_e_aniversario(mock):
    r = client.post("/api/people/", json={"name": "Beatriz", "nickname": "Bia", "full_name": "Beatriz Silva", "context": "both",
                                          "birth_day": 15, "birth_month": 5})
    assert r.status_code == 201
    args = mock.call_args.kwargs
    assert (args["name"], args["nickname"], args["full_name"], args["context"]) == ("Beatriz", "Bia", "Beatriz Silva", "both")
    assert (args["birth_day"], args["birth_month"], args["birth_year"], args["birthday_remind_days"]) == (15, 5, None, 1)


@patch(f"{R}.create_person", return_value=ERRO)
def test_criar_com_erro_vira_400(_):
    r = client.post("/api/people/", json={"name": "X"})
    assert r.status_code == 400 and r.json()["detail"] == "deu ruim"


@patch(f"{R}.update_person", return_value=OK)
def test_patch_so_manda_o_que_foi_enviado_e_null_limpa(mock):
    client.patch("/api/people/p1", json={"city": "Recife"})
    mock.assert_called_with("p1", city="Recife")
    client.patch("/api/people/p1", json={"nickname": None, "birth_day": None, "birth_month": None})
    mock.assert_called_with("p1", nickname=None, birth_day=None, birth_month=None)     # explícito → limpa
    client.patch("/api/people/p1", json={})
    mock.assert_called_with("p1")


@patch(f"{R}.delete_person", return_value=OK)
def test_excluir_devolve_204(mock):
    assert client.delete("/api/people/p1").status_code == 204
    mock.assert_called_once_with("p1")


@patch(f"{R}.delete_person", return_value=ERRO)
def test_excluir_com_erro_vira_400(_):
    assert client.delete("/api/people/p1").status_code == 400


@patch(f"{R}.restore_person", return_value=OK)
def test_restaurar(mock):
    assert client.post("/api/people/p1/restore").status_code == 200
    mock.assert_called_once_with("p1")


@patch(f"{R}.suggest_people", return_value=OK)
def test_sugerir_repassa_termo_limite_e_espaco(mock):
    client.get("/api/people/suggest?q=bi&limit=5&space=work")
    mock.assert_called_once_with("bi", 5, "work")
    assert client.get("/api/people/suggest?limit=99").status_code == 422               # limite máximo 20


# ─── apelidos e datas ─────────────────────────────────────────────────────────

@patch(f"{R}.add_alias", return_value=OK)
@patch(f"{R}.remove_alias", return_value=OK)
def test_apelidos_extras(mock_rm, mock_add):
    assert client.post("/api/people/p1/aliases", json={"alias": "Betinha"}).status_code == 201
    mock_add.assert_called_once_with("p1", "Betinha")
    assert client.delete("/api/people/p1/aliases/7").status_code == 204
    mock_rm.assert_called_once_with(7, "p1")                                             # só remove se for DESTA pessoa


@patch(f"{R}.add_important_date", return_value=OK)
@patch(f"{R}.update_important_date", return_value=OK)
@patch(f"{R}.delete_important_date", return_value=OK)
def test_datas_importantes_com_lembrete(mock_del, mock_upd, mock_add):
    client.post("/api/people/p1/dates", json={"label": "casamento", "date": "2018-06-20", "remind_days_before": 7})
    mock_add.assert_called_once_with("p1", "casamento", "2018-06-20", True, 7)
    client.patch("/api/people/p1/dates/3", json={"remind_days_before": -1})
    mock_upd.assert_called_once_with(3, remind_days_before=-1)
    assert client.delete("/api/people/p1/dates/3").status_code == 204
    mock_del.assert_called_once_with(3)


# ─── memória, resumo e briefing ───────────────────────────────────────────────

@patch(f"{R}.get_person_memory", return_value={"status": "ok", "items": []})
def test_memoria_repassa_espaco_e_limite(mock):
    assert client.get("/api/people/p1/memory?context=work&limit=50").status_code == 200
    mock.assert_called_once_with("p1", context="work", limit=50)


@patch(f"{R}.resumo_da_pessoa", return_value={"status": "ok", "summary": None, "stale": None})
@patch(f"{R}.gerar_resumo", return_value={"status": "ok", "summary": {"resumo": "x"}, "cached": False})
def test_resumo_de_ia_ler_e_gerar(mock_gerar, mock_ler):
    client.get("/api/people/p1/memory/summary?context=personal")
    mock_ler.assert_called_once_with("p1", "personal")
    client.post("/api/people/p1/memory/summary", json={"context": "work", "force": True})
    mock_gerar.assert_called_once_with("p1", "work", True)
    mock_gerar.reset_mock()
    client.post("/api/people/p1/memory/summary")                                          # sem body: padrão
    mock_gerar.assert_called_once_with("p1", "all", False)


@patch(f"{R}.gerar_resumo", return_value={"status": "error", "message": "IA fora do ar"})
def test_resumo_com_ia_fora_do_ar_vira_400(_):
    r = client.post("/api/people/p1/memory/summary", json={})
    assert r.status_code == 400 and r.json()["detail"] == "IA fora do ar"


@patch(f"{R}.get_person_briefing", return_value=OK)
def test_briefing(mock):
    client.get("/api/people/p1/briefing?check_stale=false")
    mock.assert_called_once_with("p1", False)


# ─── interações e anotações ───────────────────────────────────────────────────

@patch(f"{R}.log_interaction", return_value={"status": "ok", "id": 4})
@patch(f"{R}.list_interactions", return_value={"status": "ok", "interactions": []})
@patch(f"{R}.update_interaction", return_value=OK)
@patch(f"{R}.delete_interaction", return_value=OK)
@patch(f"{R}.restore_interaction", return_value=OK)
def test_interacoes(mock_restore, mock_del, mock_upd, mock_list, mock_log):
    assert client.post("/api/people/p1/interactions", json={"kind": "ligacao", "happened_at": "2026-10-01", "note": "oi"}).status_code == 201
    mock_log.assert_called_once_with("p1", "ligacao", "2026-10-01", "oi", None)
    client.get("/api/people/p1/interactions?context=work&limit=10")
    mock_list.assert_called_once_with("p1", 10, "work")
    client.patch("/api/people/interactions/4", json={"note": ""})
    mock_upd.assert_called_once_with(4, note="")                                          # "" apaga a nota
    assert client.delete("/api/people/interactions/4").status_code == 204
    client.post("/api/people/interactions/4/restore")
    mock_del.assert_called_once_with(4)
    mock_restore.assert_called_once_with(4)


@patch(f"{R}.add_person_note", return_value={"status": "ok", "id": 9})
@patch(f"{R}.list_person_notes", return_value={"status": "ok", "notes": []})
@patch(f"{R}.update_person_note", return_value=OK)
@patch(f"{R}.delete_person_note", return_value=OK)
@patch(f"{R}.restore_person_note", return_value=OK)
@patch(f"{R}.accept_person_note", return_value=OK)
@patch(f"{R}.dismiss_person_note", return_value=OK)
def test_anotacoes_e_sugestoes_da_ia(mock_dismiss, mock_accept, mock_restore, mock_del, mock_upd, mock_list, mock_add):
    assert client.post("/api/people/p1/notes", json={"text": "gosta de chá", "kind": "gosta"}).status_code == 201
    mock_add.assert_called_once_with("p1", "gosta de chá", "gosta", None)
    client.get("/api/people/p1/notes?status=sugerida&context=work")
    mock_list.assert_called_once_with("p1", "work", "sugerida")
    client.patch("/api/people/notes/9", json={"text": "novo"})
    mock_upd.assert_called_once_with(9, text="novo")
    assert client.delete("/api/people/notes/9").status_code == 204
    client.post("/api/people/notes/9/restore")
    client.post("/api/people/notes/9/accept", json={"text": "editado", "kind": "presente"})
    mock_accept.assert_called_once_with(9, text="editado", kind="presente")
    mock_accept.reset_mock()
    client.post("/api/people/notes/9/accept")                                             # sem body: aceita como está
    mock_accept.assert_called_once_with(9)
    client.post("/api/people/notes/9/dismiss")
    mock_del.assert_called_once_with(9)
    mock_restore.assert_called_once_with(9)
    mock_dismiss.assert_called_once_with(9)


# ─── relacionamentos configuráveis ────────────────────────────────────────────

@patch(f"{R}.create_category", return_value={"status": "ok", "slug": "colegas"})
@patch(f"{R}.update_category", return_value=OK)
@patch(f"{R}.reorder_categories", return_value=OK)
@patch(f"{R}.unarchive_category", return_value=OK)
def test_categorias(mock_un, mock_reorder, mock_upd, mock_new):
    assert client.post("/api/people/categories", json={"label": "Colegas", "icon": "school"}).status_code == 201
    mock_new.assert_called_once_with("Colegas", "school", None)
    client.patch("/api/people/categories/amigos", json={"label": "Amizades"})
    mock_upd.assert_called_once_with("amigos", label="Amizades")
    client.post("/api/people/categories/reorder", json={"slugs": ["outros", "amigos"]})
    mock_reorder.assert_called_once_with(["outros", "amigos"])
    client.post("/api/people/categories/trabalho/unarchive")
    mock_un.assert_called_once_with("trabalho")


@patch(f"{R}.archive_category")
def test_arquivar_pede_destino_com_409_e_conta_de_pessoas(mock):
    mock.return_value = {"status": "error", "needs_move_to": True, "people_count": 3, "message": "3 pessoa(s) usam isso. Para onde?"}
    r = client.post("/api/people/categories/trabalho/archive", json={})
    assert r.status_code == 409 and r.json()["detail"] == {"message": "3 pessoa(s) usam isso. Para onde?", "people_count": 3}
    mock.return_value = {"status": "ok", "moved": 3}
    assert client.post("/api/people/categories/trabalho/archive", json={"move_to": "amigos"}).status_code == 200
    mock.assert_called_with("trabalho", "amigos")
    mock.return_value = {"status": "error", "message": "Esse relacionamento já está arquivado."}
    assert client.post("/api/people/categories/trabalho/archive", json={}).status_code == 400


# ─── relações, grupos, vínculos, mesclar ──────────────────────────────────────

@patch(f"{R}.relate_people", return_value={"status": "ok", "created": True})
@patch(f"{R}.unrelate_people", return_value=OK)
@patch(f"{R}.list_relations", return_value={"status": "ok", "relations": []})
def test_relacoes_sao_ditas_do_ponto_de_vista_desta_pessoa(mock_list, mock_un, mock_rel):
    # "o João (p2) é filho da Ana (p1)" → relate_people(a=p2, b=p1, 'filho')  ("A é <kind> de B")
    assert client.post("/api/people/p1/relations", json={"other_id": "p2", "kind": "filho"}).status_code == 201
    mock_rel.assert_called_once_with("p2", "p1", "filho")
    assert client.delete("/api/people/p1/relations/p2?kind=filho").status_code == 204
    mock_un.assert_called_once_with("p2", "p1", "filho")
    client.get("/api/people/p1/relations")
    mock_list.assert_called_once_with("p1")


@patch(f"{R}.create_group", return_value={"status": "ok", "id": 1})
@patch(f"{R}.rename_group", return_value=OK)
@patch(f"{R}.delete_group", return_value=OK)
@patch(f"{R}.add_to_group", return_value=OK)
@patch(f"{R}.remove_from_group", return_value=OK)
@patch(f"{R}.list_person_groups", return_value={"status": "ok", "groups": []})
def test_grupos(mock_pg, mock_rm, mock_add, mock_del, mock_ren, mock_new):
    assert client.post("/api/people/groups", json={"name": "Turma"}).status_code == 201
    mock_new.assert_called_once_with("Turma")
    client.patch("/api/people/groups/1", json={"name": "Amigos"})
    mock_ren.assert_called_once_with(1, "Amigos")
    assert client.post("/api/people/groups/1/members", json={"person_id": "p1"}).status_code == 201
    mock_add.assert_called_once_with(1, "p1")
    assert client.delete("/api/people/groups/1/members/p1").status_code == 204
    mock_rm.assert_called_once_with(1, "p1")
    assert client.delete("/api/people/groups/1").status_code == 204
    mock_del.assert_called_once_with(1)
    client.get("/api/people/p1/groups")
    mock_pg.assert_called_once_with("p1")


@patch(f"{R}.unlink_item", return_value={"status": "ok", "removed": 1, "undoable": True})
@patch(f"{R}.link_item", return_value=OK)
def test_desvincular_e_vincular_de_novo(mock_link, mock_unlink):
    r = client.delete("/api/people/p1/links/transaction/tx1")
    assert r.status_code == 200 and r.json()["undoable"] is True
    mock_unlink.assert_called_once_with("p1", "transaction", "tx1")
    assert client.post("/api/people/p1/links", json={"entity_type": "transaction", "entity_id": "tx1"}).status_code == 201
    mock_link.assert_called_once_with("p1", "transaction", "tx1")


@patch(f"{R}.preview_merge", return_value={"status": "ok", "moves": {}})
@patch(f"{R}.merge_people", return_value={"status": "ok", "warnings": []})
def test_mesclar_e_previa(mock_merge, mock_preview):
    client.post("/api/people/merge/preview", json={"keep_id": "a", "drop_id": "b"})
    mock_preview.assert_called_once_with("a", "b")
    assert client.post("/api/people/merge", json={"keep_id": "a", "drop_id": "b"}).status_code == 200
    mock_merge.assert_called_once_with("a", "b")


@patch(f"{R}.merge_people", return_value={"status": "error", "message": "Escolha duas pessoas diferentes."})
def test_mesclar_com_erro_vira_400(_):
    assert client.post("/api/people/merge", json={"keep_id": "a", "drop_id": "a"}).status_code == 400


@patch(f"{R}.get_stats_payload", return_value={"status": "ok", "kpis": []})
def test_estatisticas_repassam_ano_e_mes(mock):
    client.get("/api/people/stats?year=2025&month=3")
    mock.assert_called_once_with(2025, 3)
    mock.reset_mock()
    client.get("/api/people/stats")
    mock.assert_called_once_with(0, None)


# ─── toda rota exige login ────────────────────────────────────────────────────

def test_todas_as_rotas_de_pessoas_exigem_usuario():
    """Sem o override de autenticação, nenhuma rota /api/people/* responde (401)."""
    anonimo = TestClient(app)
    app.dependency_overrides.pop(require_user, None)
    try:
        for metodo, caminho in [("get", "/api/people/"), ("get", "/api/people/categories"), ("post", "/api/people/merge"),
                                ("get", "/api/people/p1/memory"), ("delete", "/api/people/p1/links/task/1"),
                                ("get", "/api/people/stats"), ("post", "/api/people/p1/memory/summary")]:
            assert getattr(anonimo, metodo)(caminho).status_code == 401, (metodo, caminho)
    finally:
        app.dependency_overrides[require_user] = lambda: {"email": "test@example.com", "name": "Test"}
