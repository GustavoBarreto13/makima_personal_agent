"""Testes de formatos e unidades de progresso da Frieren (páginas, capítulos, volumes).

Cobrem o vocabulário puro (`units.py`), as regras das tools (registro por capítulo, trava da troca de
unidade) e as estatísticas separadas por unidade. O banco é substituído por funções falsas
(`monkeypatch`), então nada aqui precisa de PostgreSQL.

Execute com:
    pytest tests/agents/test_frieren_units.py -v
"""

from datetime import date

import pytest

import agents.frieren.habit_provider as habit
import agents.frieren.tools as tools
import agents.frieren.tools_stats as stats
from agents.frieren import units

HOJE = date(2026, 10, 7)


# ─── vocabulário puro ─────────────────────────────────────────────────────────

def test_unidade_desconhecida_ou_vazia_vira_paginas():
    assert units.normalize_unit(None) == "pages"
    assert units.normalize_unit("xyz") == "pages"
    assert units.normalize_unit("Cap.") == "chapters"
    assert units.normalize_unit("vol") == "volumes"


def test_formato_sugere_a_unidade():
    assert units.default_unit_for("audiobook") == "chapters"
    assert units.default_unit_for("quadrinho") == "chapters"
    assert units.default_unit_for("fisico") == "pages"
    assert units.default_unit_for("qualquer") == "pages"


def test_quantidade_com_singular_plural_e_abreviacao():
    assert units.unit_label("chapters", 1) == "1 capítulo"
    assert units.unit_label("chapters", 3) == "3 capítulos"
    assert units.unit_label("volumes", 2, abbr=True) == "2 vol."
    assert units.unit_label("pages") == "páginas"


def test_resolve_formato_e_unidade():
    assert tools._resolve_format_unit("audiobook", None) == ("audiobook", "chapters", None)
    assert tools._resolve_format_unit(None, None) == ("fisico", "pages", None)
    # Unidade explícita vence a sugestão do formato.
    assert tools._resolve_format_unit("quadrinho", "volumes") == ("quadrinho", "volumes", None)
    assert tools._resolve_format_unit("papiro", None)[2] is not None
    assert tools._resolve_format_unit("fisico", "capitulos")[2] is not None


# ─── log_reading na unidade do livro ──────────────────────────────────────────

def _livro(**over) -> dict:
    base = {"id": "b1", "title": "Berserk", "total_pages": 120, "status": "lendo",
            "progress_unit": "chapters", "format": "quadrinho"}
    base.update(over)
    return base


@pytest.fixture
def banco(monkeypatch):
    """Banco falso: guarda os INSERT/UPDATE e devolve a última posição configurada."""
    estado = {"ultima": 40, "dml": []}
    monkeypatch.setattr(tools, "_find_book_by_query", lambda q: _livro())
    monkeypatch.setattr(
        tools, "run_select",
        lambda sql, params=None: [{"page_end": estado["ultima"]}] if estado["ultima"] is not None else [],
    )
    monkeypatch.setattr(tools, "run_dml", lambda sql, params=None: estado["dml"].append((sql, params)) or 1)
    return estado


def test_log_reading_em_capitulos_fala_a_unidade_do_livro(banco):
    msg = tools.log_reading("Berserk", 45)
    assert "45/120 capítulos" in msg
    assert "5 capítulos nesta sessão" in msg
    # O INSERT grava a posição e o avanço na unidade do livro.
    insert = next(p for sql, p in banco["dml"] if "INSERT INTO reading_logs" in sql)
    assert (insert["page_start"], insert["page_end"], insert["pages_read"]) == (40, 45, 5)


def test_log_reading_recusa_passar_do_total_na_unidade(banco):
    msg = tools.log_reading("Berserk", 121)
    assert "ultrapassa o total" in msg and "120 capítulos" in msg
    assert not banco["dml"]


def test_log_reading_recusa_posicao_menor_que_a_ultima(banco):
    msg = tools.log_reading("Berserk", 30)
    assert "menor que a última" in msg and "capítulos" in msg


def test_log_reading_sem_progresso(banco):
    assert "Nenhum progresso" in tools.log_reading("Berserk", 40)


def test_log_reading_livro_antigo_sem_unidade_continua_em_paginas(monkeypatch):
    # Linhas anteriores à migração não têm `progress_unit`: vale o padrão (páginas).
    monkeypatch.setattr(tools, "_find_book_by_query", lambda q: _livro(progress_unit=None, total_pages=300))
    monkeypatch.setattr(tools, "run_select", lambda sql, params=None: [{"page_end": 10}])
    monkeypatch.setattr(tools, "run_dml", lambda sql, params=None: 1)
    assert "página" in tools.log_reading("Duna", 20)


# ─── trava da troca de unidade ────────────────────────────────────────────────

def test_trocar_unidade_com_sessoes_e_recusado(monkeypatch):
    def select(sql, params=None):
        if "FROM books" in sql:
            return [{"progress_unit": "pages"}]
        if "FROM reading_logs" in sql:
            return [{"x": 1}]  # já tem sessão
        return []
    monkeypatch.setattr(tools, "run_select", select)
    monkeypatch.setattr(tools, "run_dml", lambda *a, **k: pytest.fail("não podia gravar"))
    msg = tools.update_book_metadata_by_id("b1", progress_unit="chapters")
    assert "já tem sessões" in msg


def test_trocar_unidade_sem_sessoes_grava(monkeypatch):
    gravados = []
    def select(sql, params=None):
        if "FROM books" in sql:
            return [{"progress_unit": "pages"}]
        return []  # nenhuma sessão
    monkeypatch.setattr(tools, "run_select", select)
    monkeypatch.setattr(tools, "run_dml", lambda sql, params=None: gravados.append((sql, params)) or 1)
    tools.update_book_metadata_by_id("b1", progress_unit="chapters", format="audiobook")
    sql, params = gravados[0]
    assert "progress_unit = %(progress_unit)s" in sql and "format = %(format)s" in sql
    assert params["progress_unit"] == "chapters" and params["format"] == "audiobook"


def test_repetir_a_mesma_unidade_nao_e_troca(monkeypatch):
    monkeypatch.setattr(tools, "run_select", lambda sql, params=None: [{"progress_unit": "chapters"}])
    gravados = []
    monkeypatch.setattr(tools, "run_dml", lambda sql, params=None: gravados.append(sql) or 1)
    # Só a unidade, igual à gravada: nada a atualizar (e nenhuma recusa).
    assert "Nenhum campo" in tools.update_book_metadata_by_id("b1", progress_unit="chapters")
    assert not gravados


def test_unidade_e_formato_invalidos():
    assert "Unidade inválida" in tools.update_book_metadata_by_id("b1", progress_unit="paginas")
    assert "Formato inválido" in tools.update_book_metadata_by_id("b1", format="papiro")


# ─── add_book ─────────────────────────────────────────────────────────────────

def test_add_book_audiobook_descarta_paginas_do_google_e_sugere_capitulos(monkeypatch):
    gravados = []
    monkeypatch.setattr(tools, "run_select", lambda sql, params=None: [])
    monkeypatch.setattr(tools, "_find_book_by_query", lambda q: None)
    monkeypatch.setattr(
        tools, "_fetch_google_books",
        lambda q, max_results=1: [{"google_books_id": "g1", "title": "Duna", "author": "Herbert", "total_pages": 680}],
    )

    class _Cur:
        def execute(self, sql, params=None):
            gravados.append(params)
        def __enter__(self): return self
        def __exit__(self, *a): return False

    class _Conn:
        def cursor(self): return _Cur()
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(tools, "get_conn", lambda: _Conn())
    msg = tools.add_book("Duna", format="audiobook")
    params = gravados[0]
    assert params["format"] == "audiobook" and params["progress_unit"] == "chapters"
    # As 680 páginas impressas não viram "680 capítulos".
    assert params["total_pages"] is None
    assert "680" not in msg


# ─── estatísticas por unidade ─────────────────────────────────────────────────

def _totals(**over) -> dict:
    base = {"started": 0, "finished": 0, "abandoned": 0, "pages": 0, "chapters": 0, "volumes": 0, "sessions": 0,
            "days_reading": 0, "days_per_book": None, "longest_pages": 0, "avg_rating": None}
    base.update(over)
    return base


def _payload(totals=None, prev=None, **over) -> dict:
    args = dict(year=2026, month=None, today=HOJE, totals=totals or _totals(), prev_totals=prev or _totals(),
                daily=[], ratings=[], rankings={}, longest=None, fastest=None, moments=[])
    args.update(over)
    return stats.build_stats_payload(**args)


def _chaves(p: dict) -> list[str]:
    return [k["key"] for k in p["kpis"]]


def test_kpis_de_capitulos_e_volumes_so_aparecem_com_leitura():
    assert "chapters" not in _chaves(_payload())
    assert "volumes" not in _chaves(_payload())
    p = _payload(totals=_totals(chapters=12, volumes=2, sessions=4))
    assert {"chapters", "volumes"} <= set(_chaves(p))
    kpi = next(k for k in p["kpis"] if k["key"] == "chapters")
    assert kpi["value"] == 12 and kpi["label"] == "Capítulos"


def test_kpi_de_capitulos_aparece_se_so_o_periodo_anterior_teve():
    p = _payload(prev=_totals(chapters=7, sessions=2))
    assert "chapters" in _chaves(p)


def test_capitulos_ficam_logo_depois_de_paginas_por_dia():
    p = _payload(totals=_totals(chapters=3, sessions=1))
    chaves = _chaves(p)
    assert chaves.index("chapters") == chaves.index("pages_per_day") + 1


def test_totais_antigos_sem_capitulos_continuam_funcionando():
    # Chamadores/testes antigos não passam `chapters`/`volumes`.
    antigos = {k: v for k, v in _totals().items() if k not in ("chapters", "volumes")}
    assert "chapters" not in _chaves(_payload(totals=antigos, prev=antigos))


def test_ranking_de_formatos_tem_titulo():
    p = _payload(rankings={"formats": [{"label": "Audiobook", "count": 3}, {"label": "Físico", "count": 5}]})
    assert p["rankings"]["formats"]["title"] == "Formatos"


def test_sql_de_paginas_so_soma_livros_em_paginas():
    assert "progress_unit = 'pages'" in stats._PAGES
    assert "progress_unit = 'chapters'" in stats._CHAPTERS
    assert "progress_unit = 'volumes'" in stats._VOLUMES
    # A regra antiga por gênero acabou.
    assert not hasattr(stats, "_COMIC")


# ─── hábito de leitura ────────────────────────────────────────────────────────

def test_habito_de_paginas_ignora_livros_em_capitulos(monkeypatch):
    vistos = []
    monkeypatch.setattr(habit, "run_select", lambda sql, params=None: vistos.append(sql) or [])
    assert habit.get_activity("2026-10-01", "2026-10-31") == {}
    assert "progress_unit = 'pages'" in vistos[0]
