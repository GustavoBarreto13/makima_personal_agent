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


def test_filter_task_ids_devolve_so_os_ids_que_casam(monkeypatch):
    from agents.kaguya import tools_kanban_views as V

    visto = {}

    def fake_select(sql, params=None):
        visto["sql"], visto["params"] = sql, params
        return [{"id": 3}, {"id": 8}]

    monkeypatch.setattr(V, "run_select", fake_select)
    r = V.filter_task_ids({"combinator": "and", "conditions": [{"field": "priority", "op": "gte", "value": 2}]}, "work")
    assert r == {"status": "ok", "ids": [3, 8]}
    # O espaço entra como condição extra (a tarefa herda o espaço da lista).
    assert "pp.context" in visto["sql"] and "work" in visto["params"].values()


def test_filter_task_ids_sem_regras_e_regra_invalida():
    from agents.kaguya import tools_kanban_views as V

    assert V.filter_task_ids(None) == {"status": "ok", "ids": None}
    assert V.filter_task_ids({}, "work") == {"status": "ok", "ids": None}
    assert V.filter_task_ids({"combinator": "talvez", "conditions": [{"field": "priority", "op": "eq", "value": 1}]})["status"] == "error"



def test_dsl_tipo_e_varias_listas_viram_sql_parametrizado():
    from agents.kaguya import tools_filters as F

    where, params, _ = F._build_where_from_rules({"combinator": "and", "conditions": [
        {"field": "type", "op": "in", "value": ["event", "birthday", "hacker'; DROP"]},
        {"field": "group_id", "op": "not_in", "value": [3, 4]},
    ]}, default_open=False)
    assert "t.type = ANY(" in where and "NOT t.project_id IN (SELECT pg.id" in where  # grupo: "todas menos as listas destes grupos"
    assert params["c0"] == ["event", "birthday"] and params["c1"] == [3, 4]  # valor desconhecido nunca chega ao SQL
    assert "DROP" not in where

    where2, _, _ = F._build_where_from_rules({"combinator": "and", "conditions": [{"field": "type", "op": "not_in", "value": ["task"]}]}, default_open=False)
    assert "NOT t.type = ANY(" in where2


def test_dsl_condicao_sem_valor_nao_filtra_nada():
    from agents.kaguya import tools_filters as F

    for cond in ({"field": "type", "op": "in", "value": []}, {"field": "project_id", "op": "in", "value": [None]}, {"field": "group_id", "op": "not_in", "value": None}):
        where, params, _ = F._build_where_from_rules({"combinator": "and", "conditions": [cond]}, default_open=False)
        assert params == {} and "ANY" not in where and "ALL(" not in where
