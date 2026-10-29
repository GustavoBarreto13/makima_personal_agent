"""Testes da sincronização de mangás da Frieren com o MyAnimeList (pull, push e ganchos das tools).

O banco e a rede são substituídos por funções falsas (`monkeypatch`): nada aqui precisa de PostgreSQL
nem de internet.

Execute com:
    pytest tests/agents/test_frieren_mal_sync.py -v
"""

from datetime import datetime, timezone

import pytest

import agents.frieren.mal_sync as ms
import agents.frieren.tools as tools

MAL_TS = "2026-10-20T12:00:00+00:00"
MAL_DT = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)


# ─── conversões puras ─────────────────────────────────────────────────────────

def test_status_e_nota_nos_dois_sentidos():
    assert ms.status_from_mal("reading") == "lendo"
    assert ms.status_from_mal("completed") == "lido"
    assert ms.status_from_mal("dropped") == "abandonado"
    assert ms.status_from_mal("???") == "quero_ler"
    assert ms.rating_from_score(9) == 4.5 and ms.rating_from_score(0) is None
    assert ms.score_from_rating(4.5) == 9 and ms.score_from_rating(0.5) == 1 and ms.score_from_rating(None) is None


def test_unidade_do_mangá_novo_e_posicao():
    assert ms.pick_unit(12, 2) == "chapters"
    assert ms.pick_unit(0, 3) == "volumes"
    assert ms.progress_for_unit("chapters", 12, 2) == 12
    assert ms.progress_for_unit("volumes", 12, 2) == 2
    assert ms.progress_for_unit("pages", 12, 2) is None


def test_autores_sem_repeticao():
    autores = [{"node": {"first_name": "Kentaro", "last_name": "Miura"}},
               {"node": {"first_name": "Kentaro", "last_name": "Miura"}}]
    assert ms._author_text(autores) == "Kentaro Miura"
    assert ms._author_text(None) is None


# ─── banco falso ──────────────────────────────────────────────────────────────

class _Cur:
    def __init__(self, log, pos): self.log, self.pos = log, pos
    def execute(self, sql, params=None): self.log.append((sql, params))
    def fetchone(self): return (self.pos,)
    def __enter__(self): return self
    def __exit__(self, *a): return False


class _Conn:
    def __init__(self, log, pos): self.log, self.pos = log, pos
    def cursor(self): return _Cur(self.log, self.pos)
    def __enter__(self): return self
    def __exit__(self, *a): return False


@pytest.fixture
def banco(monkeypatch):
    """Banco falso: `estado['livros']` responde ao SELECT por mal_manga_id; `estado['sql']` guarda o que foi gravado."""
    estado = {"livros": [], "sql": [], "pos": 0, "push": []}
    monkeypatch.setattr(ms, "run_select", lambda sql, params=None: estado["livros"])
    monkeypatch.setattr(ms, "get_conn", lambda: _Conn(estado["sql"], estado["pos"]))
    # Qualquer push durante o PULL seria eco: o teste falha se acontecer.
    monkeypatch.setattr(ms, "push_manga_status", lambda *a, **k: estado["push"].append((a, k)))
    return estado


def _entrada(**ls) -> dict:
    base = {"status": "reading", "score": 8, "num_chapters_read": 12, "num_volumes_read": 2,
            "updated_at": MAL_TS, "start_date": "2026-01-02", "finish_date": None}
    base.update(ls)
    return {"node": {"id": 2, "title": "Berserk", "num_chapters": 364, "num_volumes": 41,
                     "main_picture": {"large": "http://x/capa.jpg"}, "genres": [{"name": "Action"}, {"name": "Seinen"}],
                     "authors": [{"node": {"first_name": "Kentaro", "last_name": "Miura"}}],
                     "start_date": "1989-08-25", "media_type": "manga", "synopsis": "Guts."},
            "list_status": base}


def _livro(**over) -> dict:
    base = {"id": "b1", "title": "Berserk", "status": "lendo", "rating": 4.0, "progress_unit": "chapters",
            "total_pages": 364, "deleted": False, "local_updated_at": None, "mal_updated_at": None}
    base.update(over)
    return base


def _insert(estado, tabela):
    return next(p for sql, p in estado["sql"] if f"INSERT INTO {tabela}" in sql)


# ─── pull: mangá novo ─────────────────────────────────────────────────────────

def test_mangá_novo_vira_livro_em_capitulos_com_sessao_de_ajuste(banco):
    assert ms._upsert_manga_entry(_entrada()) == "created"
    livro = _insert(banco, "books")
    assert (livro["unit"], livro["format"], livro["total"], livro["mal_id"]) == ("chapters", "quadrinho", 364, 2)
    assert livro["author"] == "Kentaro Miura" and livro["genre"] == "Action, Seinen" and livro["year"] == 1989
    assert livro["rating"] == 4.0 and livro["status"] == "lendo"
    ajuste = _insert(banco, "reading_logs")
    assert (ajuste["de"], ajuste["ate"], ajuste["n"]) == (0, 12, 12)
    assert not banco["push"]  # anti-eco


def test_mangá_novo_so_com_volumes_usa_volumes(banco):
    assert ms._upsert_manga_entry(_entrada(num_chapters_read=0, num_volumes_read=3)) == "created"
    livro = _insert(banco, "books")
    assert livro["unit"] == "volumes" and livro["total"] == 41
    assert _insert(banco, "reading_logs")["ate"] == 3


def test_mangá_em_publicacao_fica_sem_total(banco):
    e = _entrada()
    e["node"]["num_chapters"] = 0
    ms._upsert_manga_entry(e)
    assert _insert(banco, "books")["total"] is None


def test_completo_grava_data_de_termino_e_abandonado_grava_o_dia(banco):
    ms._upsert_manga_entry(_entrada(status="completed", finish_date="2026-10-01"))
    assert str(_insert(banco, "books")["finished"]) == "2026-10-01"
    banco["sql"].clear()
    ms._upsert_manga_entry(_entrada(status="dropped"))
    assert _insert(banco, "books")["abandoned"] is not None


# ─── pull: livro existente ────────────────────────────────────────────────────

def test_excluido_localmente_nao_ressuscita(banco):
    banco["livros"] = [_livro(deleted=True)]
    assert ms._upsert_manga_entry(_entrada()) == "skipped"
    assert not banco["sql"]


def test_progresso_so_avanca(banco):
    banco["livros"] = [_livro()]
    banco["pos"] = 20  # local já está no cap. 20; o MAL diz 12
    ms._upsert_manga_entry(_entrada())
    assert not any("INSERT INTO reading_logs" in sql for sql, _ in banco["sql"])
    banco["sql"].clear()
    banco["pos"] = 5   # local atrás do MAL: cria ajuste 5 → 12
    ms._upsert_manga_entry(_entrada())
    ajuste = _insert(banco, "reading_logs")
    assert (ajuste["de"], ajuste["ate"]) == (5, 12)
    assert not banco["push"]


def test_livro_em_paginas_nao_recebe_progresso_do_mal(banco):
    banco["livros"] = [_livro(progress_unit="pages")]
    banco["pos"] = 0
    ms._upsert_manga_entry(_entrada())
    assert not any("INSERT INTO reading_logs" in sql for sql, _ in banco["sql"])


def test_conflito_de_status_vence_o_carimbo_mais_recente(banco):
    # Local mudou DEPOIS do MAL → o status local fica (o push é quem leva ao MAL).
    banco["livros"] = [_livro(status="pausado", local_updated_at=datetime(2026, 10, 25, tzinfo=timezone.utc))]
    banco["pos"] = 99
    ms._upsert_manga_entry(_entrada(status="reading"))
    assert not any("status" in (p or {}) and "UPDATE books SET" in sql and "date_abandoned" in sql
                   for sql, p in banco["sql"])
    # MAL mudou DEPOIS do local → o MAL vence.
    banco["sql"].clear()
    banco["livros"] = [_livro(status="pausado", local_updated_at=datetime(2026, 10, 1, tzinfo=timezone.utc))]
    ms._upsert_manga_entry(_entrada(status="reading"))
    troca = next(p for sql, p in banco["sql"] if "date_abandoned" in sql and p and "status" in p)
    assert troca["status"] == "lendo"


# ─── sync completo ────────────────────────────────────────────────────────────

class _Auth:
    def auth_header(self): return {"Authorization": "Bearer x"}


def _paginas(monkeypatch, paginas):
    fila = list(paginas)
    monkeypatch.setattr(ms, "MALAuth", lambda: _Auth())
    monkeypatch.setattr(ms, "mal_get", lambda url, auth, params=None: fila.pop(0) if fila else None)


def test_delta_para_na_primeira_entrada_antiga(monkeypatch, banco):
    antigo = _entrada(updated_at="2026-09-01T00:00:00+00:00")
    antigo["node"]["id"] = 9
    _paginas(monkeypatch, [{"data": [_entrada(), antigo], "paging": {"next": "http://p2"}}])
    gravou = []
    monkeypatch.setattr(ms, "_get_last_sync_at", lambda: datetime(2026, 10, 1, tzinfo=timezone.utc))
    monkeypatch.setattr(ms, "_update_last_sync_at", lambda t: gravou.append(t))
    r = ms.sync_manga_mal()
    assert r["ok"] and r["mal_entries_fetched"] == 2 and r["created"] == 1
    assert len(gravou) == 1


def test_dry_run_nao_grava_nada_nem_avanca_o_delta(monkeypatch, banco):
    _paginas(monkeypatch, [{"data": [_entrada()], "paging": {}}])
    monkeypatch.setattr(ms, "_get_last_sync_at", lambda: None)
    monkeypatch.setattr(ms, "_update_last_sync_at", lambda t: pytest.fail("não podia avançar o delta"))
    r = ms.sync_manga_mal(full=True, dry_run=True)
    assert r["created"] == 1 and r["would_create"] == ["Berserk"]
    assert not banco["sql"]


def test_falha_da_api_nao_avanca_o_delta(monkeypatch, banco):
    _paginas(monkeypatch, [])  # mal_get devolve None
    monkeypatch.setattr(ms, "_get_last_sync_at", lambda: None)
    monkeypatch.setattr(ms, "_update_last_sync_at", lambda t: pytest.fail("não podia avançar o delta"))
    r = ms.sync_manga_mal()
    assert r["ok"] is False and r["errors"]


def test_entrada_ruim_nao_derruba_o_sync(monkeypatch, banco):
    _paginas(monkeypatch, [{"data": [_entrada(), _entrada()], "paging": {}}])
    monkeypatch.setattr(ms, "_get_last_sync_at", lambda: None)
    monkeypatch.setattr(ms, "_update_last_sync_at", lambda t: None)
    chamadas = []
    def upsert(e):
        chamadas.append(1)
        if len(chamadas) == 1:
            raise RuntimeError("boom")
        return "created"
    monkeypatch.setattr(ms, "_upsert_manga_entry", upsert)
    r = ms.sync_manga_mal(full=True)
    assert r["created"] == 1 and len(r["errors"]) == 1


# ─── push ─────────────────────────────────────────────────────────────────────

class _Resp:
    def __init__(self, code): self.status_code, self.text = code, ""


def test_push_envia_so_o_informado_e_converte_nota(monkeypatch):
    enviados = []
    monkeypatch.setattr(ms, "MALAuth", lambda: _Auth())
    monkeypatch.setattr(ms.requests, "patch", lambda url, headers, data, timeout: enviados.append((url, data)) or _Resp(200))
    assert ms.push_manga_status(2, status="lido", rating=4.5, chapters_read=364) is True
    url, corpo = enviados[0]
    assert url.endswith("/manga/2/my_list_status")
    assert corpo == {"status": "completed", "score": "9", "num_chapters_read": "364"}
    # estante/wishlist não existem no MAL: não vão
    ms.push_manga_status(2, status="estante")
    assert len(enviados) == 1
    # sem vínculo: nada
    assert ms.push_manga_status(None, status="lido") is False


def test_push_nunca_levanta(monkeypatch):
    monkeypatch.setattr(ms, "MALAuth", lambda: _Auth())
    def boom(*a, **k): raise ConnectionError("fora do ar")
    monkeypatch.setattr(ms.requests, "patch", boom)
    monkeypatch.setattr(ms.requests, "delete", boom)
    assert ms.push_manga_status(2, status="lido") is False
    assert ms.push_manga_delete(2) is False


# ─── ganchos nas tools locais ─────────────────────────────────────────────────

def _tools_db(monkeypatch, livro: dict, pos: int = 7):
    dml = []
    def select(sql, params=None):
        if "FROM reading_logs" in sql:
            return [{"pos": pos}]
        return [livro]
    monkeypatch.setattr(tools, "run_select", select)
    monkeypatch.setattr(tools, "run_dml", lambda sql, params=None: dml.append(sql) or 1)
    return dml


def test_mudanca_local_carimba_e_envia_capitulos(monkeypatch):
    dml = _tools_db(monkeypatch, {"mal_manga_id": 2, "status": "lendo", "rating": 4.5, "progress_unit": "chapters"})
    enviados = []
    monkeypatch.setattr(ms, "push_manga_status", lambda *a, **k: enviados.append((a, k)))
    tools._after_local_change("b1")
    assert any("local_updated_at" in sql for sql in dml)
    assert enviados == [((2,), {"status": "lendo", "rating": 4.5, "chapters_read": 7, "volumes_read": None})]


def test_livro_em_volumes_envia_volumes_e_em_paginas_nenhum(monkeypatch):
    enviados = []
    monkeypatch.setattr(ms, "push_manga_status", lambda *a, **k: enviados.append(k))
    _tools_db(monkeypatch, {"mal_manga_id": 2, "status": "lendo", "rating": None, "progress_unit": "volumes"})
    tools._after_local_change("b1")
    assert enviados[-1]["volumes_read"] == 7 and enviados[-1]["chapters_read"] is None
    _tools_db(monkeypatch, {"mal_manga_id": 2, "status": "lendo", "rating": None, "progress_unit": "pages"})
    tools._after_local_change("b1")
    assert enviados[-1]["volumes_read"] is None and enviados[-1]["chapters_read"] is None


def test_livro_sem_vinculo_so_carimba(monkeypatch):
    dml = _tools_db(monkeypatch, {"mal_manga_id": None, "status": "lendo", "rating": None, "progress_unit": "chapters"})
    monkeypatch.setattr(ms, "push_manga_status", lambda *a, **k: pytest.fail("sem vínculo não envia"))
    tools._after_local_change("b1")
    assert any("local_updated_at" in sql for sql in dml)


def test_falha_do_mal_nao_desfaz_a_operacao_local(monkeypatch):
    _tools_db(monkeypatch, {"mal_manga_id": 2, "status": "lendo", "rating": None, "progress_unit": "chapters"})
    def boom(*a, **k): raise RuntimeError("MAL fora do ar")
    monkeypatch.setattr(ms, "push_manga_status", boom)
    tools._after_local_change("b1")  # não levanta


def test_link_book_to_mal(monkeypatch):
    gravou = []
    monkeypatch.setattr(tools, "_find_book_by_query", lambda q: {"id": "b1", "title": "Berserk"})
    monkeypatch.setattr(tools, "run_select", lambda sql, params=None: [])
    monkeypatch.setattr(tools, "run_dml", lambda sql, params=None: gravou.append(params) or 1)
    assert "vinculado" in tools.link_book_to_mal("Berserk", 2)
    assert gravou[0]["m"] == 2
    assert "inválido" in tools.link_book_to_mal("Berserk", 0)
    # mangá do MAL já vinculado a outro livro: recusa
    monkeypatch.setattr(tools, "run_select", lambda sql, params=None: [{"title": "Outro"}])
    assert "já está vinculado" in tools.link_book_to_mal("Berserk", 2)
