"""Meu Dia: evento e aniversário (data fixa) não são sugestão — só tarefas a fazer entram (sem banco: captura o SQL)."""

from agents.kaguya import tools_tasks as T


def test_sugestoes_so_de_tarefas(monkeypatch):
    queries: list[str] = []

    def fake_select(sql, params=None, *a, **k):
        queries.append(sql)
        return []

    monkeypatch.setattr(T, "run_select", fake_select)
    try:
        T.list_my_day("2026-06-01")
    except Exception:  # partes que dependem do banco (agenda, capacidade) não importam aqui
        pass
    sugestoes = [q for q in queries if "janela_fim" in q]
    assert sugestoes, "a consulta de sugestões não rodou"
    assert "t.type = 'task'" in sugestoes[0]
    # plano e pendências não filtram por tipo: o usuário põe no dia de propósito.
    plano = [q for q in queries if "t.my_day_date = %(hoje)s" in q and "janela_fim" not in q]
    assert plano and "t.type = 'task'" not in plano[0]


def test_board_filtrado_inclui_concluidas(monkeypatch):
    """O board com filtro carrega também as concluídas (a coluna de concluídas do quadro não pode esvaziar)."""
    from agents.kaguya import tools_kanban_views as V
    import agents.kaguya.tools_tasks as TT

    visto = {}

    def fake_list_tasks(project_id, include_completed=False, *a, **k):
        visto["include_completed"] = include_completed
        return [{"id": 1}, {"id": 2}]

    monkeypatch.setattr(TT, "list_tasks", fake_list_tasks)
    monkeypatch.setattr(V, "run_select", lambda *a, **k: [{"id": 2}])
    r = V.filter_board(5, {"combinator": "and", "conditions": [{"field": "priority", "op": "gte", "value": 2}]})
    assert visto["include_completed"] is True
    assert r == {"status": "ok", "tasks": [{"id": 2}]}


def test_filtro_avulso_invalido_devolve_erro():
    from agents.kaguya import tools_kanban_views as V

    r = V.filter_board(5, {"combinator": "talvez", "conditions": [{"field": "priority", "op": "eq", "value": 1}]})
    assert r["status"] == "error"
