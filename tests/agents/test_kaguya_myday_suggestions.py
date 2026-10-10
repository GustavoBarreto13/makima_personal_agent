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
