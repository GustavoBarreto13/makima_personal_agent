"""Spec 075 — campos novos da DSL de filtros (sem banco: só o SQL e os parâmetros gerados).

Cobre espaço, grupo, adiar, bloqueio, estimativa, follow-up, aguardando-pessoa e conclusão, além
das duas regras de base: adiadas ficam fora por padrão e projeto sequencial mostra só a próxima ação.
"""

import pytest

from agents.kaguya import tools_filters as F


def _where(*conds, default_open=True):
    rules = {"combinator": "and", "conditions": list(conds)}
    return F._build_where_from_rules(rules, default_open=default_open)


def test_space_filtra_pelo_espaco_da_lista():
    where, params, _ = _where({"field": "space", "op": "eq", "value": "work"})
    assert "SELECT pp.context FROM task_projects pp WHERE pp.id = t.project_id" in where
    assert list(params.values()) == ["work"]


def test_space_valor_invalido_cai_em_personal():
    _, params, _ = _where({"field": "space", "op": "eq", "value": "qualquer coisa"})
    assert list(params.values()) == ["personal"]


def test_group_id_in_e_not_in():
    where, params, _ = _where({"field": "group_id", "op": "in", "value": [1, "2"]})
    assert "pg.group_id = ANY(" in where and list(params.values()) == [[1, 2]]
    where, _, _ = _where({"field": "group_id", "op": "not_in", "value": 3})
    assert "NOT t.project_id IN" in where


def test_blocked_usa_dependencias_abertas():
    where, _, _ = _where({"field": "blocked", "op": "eq", "value": True})
    assert "task_dependencies" in where and "tb.completed_at IS NULL" in where
    where, _, _ = _where({"field": "blocked", "op": "eq", "value": False})
    assert "NOT EXISTS" in where


def test_duration_ops():
    where, params, _ = _where({"field": "duration_min", "op": "lte", "value": "30"})
    assert "t.duration_min <=" in where and list(params.values()) == [30]
    where, _, _ = _where({"field": "duration_min", "op": "none"})
    assert "t.duration_min IS NULL" in where


def test_follow_up_e_waiting_person():
    where, params, _ = _where({"field": "follow_up_date", "op": "within", "value": "7d"})
    assert "t.follow_up_date BETWEEN" in where and len(params) == 2
    where, params, _ = _where({"field": "waiting_person", "op": "has", "value": "pessoa-1"})
    assert "t.waiting_person_id =" in where and list(params.values()) == ["pessoa-1"]


def test_completed_at_usa_dia_local_nao_utc():
    where, _, _ = _where({"field": "state", "op": "eq", "value": "done"},
                         {"field": "completed_at", "op": "after", "value": "2026-06-01"})
    assert "AT TIME ZONE 'America/Sao_Paulo'" in where


def test_adiadas_somem_por_padrao():
    where, _, _ = _where({"field": "priority", "op": "gte", "value": 1})
    assert "t.start_date IS NULL OR t.start_date <=" in where


def test_regra_que_fala_de_start_date_nao_esconde_adiadas():
    where, _, _ = _where({"field": "start_date", "op": "deferred"})
    assert "t.start_date > (NOW()" in where
    assert "t.start_date IS NULL OR t.start_date <=" not in where


def test_projeto_sequencial_mostra_so_a_proxima_acao():
    where, _, _ = _where({"field": "priority", "op": "gte", "value": 0})
    assert "NOT p.sequential" in where and "ORDER BY t2.position, t2.id LIMIT 1" in where


def test_listas_excluidas_somem_das_visoes():
    where, _, _ = _where({"field": "priority", "op": "gte", "value": 0})
    assert "p.deleted_at IS NULL" in where


def test_kanban_sem_join_nao_referencia_p():
    where, _, _ = _where({"field": "priority", "op": "gte", "value": 0}, default_open=False)
    assert "p.sequential" not in where and "p.archived_at" not in where


def test_sql_gerado_e_valido():
    pglast = pytest.importorskip("pglast")
    where, params, _ = _where(
        {"field": "space", "op": "eq", "value": "work"},
        {"field": "group_id", "op": "in", "value": [1]},
        {"field": "blocked", "op": "eq", "value": False},
        {"field": "follow_up_date", "op": "before", "value": "today"},
    )
    sql = "SELECT t.id FROM tasks t JOIN task_projects p ON p.id = t.project_id WHERE " + where
    for k in sorted(params, key=len, reverse=True):
        v = params[k]
        sql = sql.replace(f"%({k})s", "ARRAY[1]" if isinstance(v, list) else "'x'" if isinstance(v, str) else "1")
    pglast.parse_sql(sql)
