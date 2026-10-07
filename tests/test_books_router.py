"""Testes do router de livros (webapp/backend/routers/books.py) — rotas da spec 073.

Usa o TestClient do FastAPI com as funções da Frieren mockadas (sem banco): confere que cada rota
chama a função certa, com os argumentos certos, e converte erro em HTTP 400/404.

Execute com:
    pytest tests/test_books_router.py -v
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from webapp.backend.deps import require_user
from webapp.backend.main import app

# Usuário fixo no lugar do cookie de sessão (mesmo padrão de tests/test_finances_router.py).
app.dependency_overrides[require_user] = lambda: {"email": "test@example.com", "name": "Test"}
client = TestClient(app, raise_server_exceptions=True)

R = "webapp.backend.routers.books"
LIVRO = {"id": "b1", "title": "Duna"}


# ─── rotas fixas não podem ser engolidas por /{book_id} ───────────────────────

@patch(f"{R}.get_books_home", return_value={"status": "ok", "favorites": [], "reading": []})
def test_home_chama_get_books_home(mock_home):
    r = client.get("/api/books/home")
    assert r.status_code == 200 and r.json()["favorites"] == []
    mock_home.assert_called_once()


@patch(f"{R}.get_stats_payload", return_value={"status": "ok", "kpis": []})
def test_stats_payload_repassa_ano_e_mes(mock_stats):
    assert client.get("/api/books/stats/payload?year=2025&month=3").status_code == 200
    mock_stats.assert_called_once_with(2025, 3)


@patch(f"{R}.get_stats_payload", return_value={"status": "error", "message": "month deve estar entre 1 e 12"})
def test_stats_payload_erro_vira_400(_):
    assert client.get("/api/books/stats/payload?month=13").status_code == 400


# ─── favoritos e coração ──────────────────────────────────────────────────────

@patch(f"{R}.set_book_favorites", return_value={"status": "ok", "favorites": []})
def test_put_favoritos_repassa_os_ids_em_ordem(mock_set):
    r = client.put("/api/books/favorites", json={"ids": ["b2", "b1"]})
    assert r.status_code == 200
    mock_set.assert_called_once_with(["b2", "b1"])


@patch(f"{R}.set_book_favorites", return_value={"status": "error", "message": "no máximo 4"})
def test_put_favoritos_com_erro_vira_400(_):
    assert client.put("/api/books/favorites", json={"ids": ["a", "b", "c", "d", "e"]}).status_code == 400


@patch(f"{R}.set_book_like", return_value={"status": "ok", "liked": True})
def test_curtir_livro(mock_like):
    r = client.patch("/api/books/b1/like", json={"liked": True})
    assert r.status_code == 200 and r.json()["liked"] is True
    mock_like.assert_called_once_with("b1", True)


# ─── status, conclusão e metadados pelo ID ────────────────────────────────────

@patch(f"{R}.update_book_status_by_id", return_value="<b>Duna</b> → status atualizado para <b>abandonado</b>.")
@patch(f"{R}.get_book_by_id", return_value=LIVRO)
def test_status_e_trocado_pelo_id_e_nao_pelo_titulo(_, mock_status):
    assert client.patch("/api/books/b1/status", json={"status": "abandonado"}).status_code == 200
    mock_status.assert_called_once_with("b1", "abandonado")


@patch(f"{R}.get_book_by_id", return_value=None)
def test_status_de_livro_inexistente_vira_404(_):
    assert client.patch("/api/books/xx/status", json={"status": "lido"}).status_code == 404


@patch(f"{R}.finish_book_by_id", return_value="A avaliação deve ser um valor entre <b>0.5</b> e <b>5.0</b>.")
@patch(f"{R}.get_book_by_id", return_value=LIVRO)
def test_nota_invalida_ao_terminar_vira_400(_, mock_finish):
    r = client.post("/api/books/b1/finish", json={"rating": 4.3})
    assert r.status_code == 400 and "<b>" not in r.json()["detail"]
    assert mock_finish.call_args.args[0] == "b1"


@patch(f"{R}.update_book_metadata_by_id", return_value="✅ Livro atualizado com sucesso.")
def test_metadados_repassam_campos_a_apagar(mock_meta):
    r = client.patch("/api/books/b1/metadata", json={"title": "Duna", "clear": ["rating", "store_url"]})
    assert r.status_code == 200
    mock_meta.assert_called_once_with("b1", title="Duna", clear=["rating", "store_url"])


# ─── registrar leitura devolve o ID para o "Desfazer" ─────────────────────────

@patch(f"{R}.run_select", return_value=[{"id": "log-9"}])
@patch(f"{R}.log_reading", return_value="📖 <b>Duna</b> — p. 120 (+20 páginas)")
@patch(f"{R}.get_book_by_id", return_value=LIVRO)
def test_registrar_leitura_devolve_log_id(*_):
    r = client.post("/api/books/b1/log", json={"current_page": 120})
    assert r.status_code == 201 and r.json()["log_id"] == "log-9"


# ─── desfazer exclusões ───────────────────────────────────────────────────────

@patch(f"{R}.restore_book", return_value={"status": "ok"})
def test_restaurar_livro(mock_restore):
    assert client.post("/api/books/b1/restore").status_code == 200
    mock_restore.assert_called_once_with("b1")


@patch(f"{R}.restore_reading_log", return_value={"status": "ok"})
def test_restaurar_sessao_com_os_mesmos_valores(mock_restore):
    body = {"id": "log-1", "date": "2026-10-01", "page_start": 100, "page_end": 120,
            "pages_read": 20, "session_notes": "bom capítulo"}
    assert client.post("/api/books/b1/logs/restore", json=body).status_code == 201
    mock_restore.assert_called_once_with(
        book_id="b1", log_id="log-1", log_date="2026-10-01", page_start=100, page_end=120,
        pages_read=20, session_notes="bom capítulo")
