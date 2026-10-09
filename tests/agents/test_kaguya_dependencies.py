"""Spec 075 — dependências entre tarefas: detecção de ciclo (sem banco, cursor falso)."""

import pytest

from agents.kaguya import tools_dependencies as D


class FakeCursor:
    """Cursor mínimo: guarda arestas ``task_id → {blocked_by_id}`` e responde à query do ciclo."""

    def __init__(self, edges):
        self.edges = edges
        self._rows = []

    def execute(self, sql, params):
        assert "FROM task_dependencies WHERE task_id = ANY" in sql
        (frontier,) = params
        self._rows = [(b,) for t in frontier for b in self.edges.get(t, ())]

    def fetchall(self):
        return self._rows


def test_dependencia_direta_nao_e_ciclo():
    assert D._would_cycle(FakeCursor({}), task_id=1, blocked_by_id=2) is False


def test_ciclo_direto():
    # 2 já depende de 1; fazer 1 depender de 2 fecha A→B→A
    assert D._would_cycle(FakeCursor({2: {1}}), task_id=1, blocked_by_id=2) is True


def test_ciclo_indireto():
    # 3 depende de 2, 2 depende de 1; 1 depender de 3 fecha o triângulo
    assert D._would_cycle(FakeCursor({3: {2}, 2: {1}}), task_id=1, blocked_by_id=3) is True


def test_diamante_sem_ciclo():
    # 4 depende de 2 e 3, ambas dependem de 1: 1 não depende de ninguém → adicionar 5→4 é seguro
    edges = {4: {2, 3}, 2: {1}, 3: {1}}
    assert D._would_cycle(FakeCursor(edges), task_id=5, blocked_by_id=4) is False


def test_nao_entra_em_loop_com_grafo_cheio_de_voltas():
    # grafo já ciclico (dado sujo): a busca termina e responde sem pendurar
    assert D._would_cycle(FakeCursor({1: {2}, 2: {1}}), task_id=9, blocked_by_id=1) is False


def test_nao_pode_depender_de_si_mesma():
    assert D.add_dependency(7, 7)["status"] == "error"


def test_blocked_task_ids_vazio_nao_consulta_banco(monkeypatch):
    monkeypatch.setattr(D, "run_select", lambda *a, **k: pytest.fail("não deveria consultar"))
    assert D.blocked_task_ids([]) == set()
