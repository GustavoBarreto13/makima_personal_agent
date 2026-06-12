"""Testes dos built-ins GTD adicionais das smart-lists da Kaguya — ``tools_filters``.

Dois blocos:

1. **Puro** (sempre roda): o registro ``BUILTIN_FILTERS`` e ``list_builtin_filters`` são
   estáticos — valida-se que os 5 built-ins GTD existem, têm metadados e que suas regras são
   válidas e traduzíveis (parametrizadas), sem tocar no banco.
2. **Integração** (pula sem ``DATABASE_URL``): contra um PostgreSQL real, confirma que cada
   built-in casa as tarefas certas pelas tags reservadas e que o canal Telegram resolve um
   built-in pelo nome (paridade — FR-012).

Como rodar (bloco de integração):
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_kaguya_gtd_builtins.py -v
"""

import os

import pytest

from agents.kaguya import tools_filters as F

HAS_DB = bool(os.environ.get("DATABASE_URL"))
requires_db = pytest.mark.skipif(not HAS_DB, reason="DATABASE_URL não definida — integração pulada.")


# ─────────────────────────────────────────────────────────────────────────────
# Bloco 1 — puro (sempre roda)
# ─────────────────────────────────────────────────────────────────────────────
def test_five_gtd_builtins_present():
    """Os 5 built-ins GTD decididos no P2-CONTEXT estão registrados."""
    assert set(F.BUILTIN_FILTERS) == {"next-actions", "waiting", "someday", "quick", "energy"}


def test_list_builtin_filters_metadata():
    """list_builtin_filters devolve {key, name, icon} dos 5, na ordem de exibição."""
    listed = F.list_builtin_filters()
    assert [b["key"] for b in listed] == ["next-actions", "waiting", "someday", "quick", "energy"]
    assert all(b["name"] and b["icon"] for b in listed)


def test_reserved_tags():
    """As tags de estado GTD reservadas são #aguardando e #algum-dia."""
    assert F.RESERVED_TAGS == {"aguardando", "algum-dia"}


def test_all_builtins_validate():
    """Toda built-in GTD tem regras válidas (≥1 condição, campos/ops conhecidos)."""
    for key, meta in F.BUILTIN_FILTERS.items():
        assert F._validate_rules(meta["rules"]) is None, f"built-in {key} inválida"


def test_unknown_builtin_key_returns_empty():
    """Uma chave de built-in inexistente devolve lista vazia (sem erro)."""
    # Função pura quanto à chave: não chega a tocar o banco quando a chave é inválida.
    assert F.list_tasks_by_builtin("inexistente") == []


# ─────────────────────────────────────────────────────────────────────────────
# Bloco 2 — integração (PostgreSQL real)
# ─────────────────────────────────────────────────────────────────────────────
if HAS_DB:
    from agents.db import get_conn  # noqa: E402
    from agents.kaguya import tools_tasks as T  # noqa: E402

    _SCHEMA_PATH = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "agents", "kaguya", "schema_tasks_pg.sql",
    )
    _TASK_TABLES = (
        "habit_checkins habits task_filters task_tag_links task_tags "
        "task_recurrences tasks task_columns task_projects task_project_groups"
    )


@pytest.fixture()
def inbox_id() -> int:
    """Reseta as tabelas e reaplica o schema antes de cada teste de integração."""
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_TASK_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
            cur.execute("SELECT id FROM task_projects WHERE is_inbox")
            return cur.fetchone()[0]


@requires_db
def test_waiting_and_next_actions(inbox_id):
    """'Aguardando' casa #aguardando; 'Próximas Ações' exclui aguardando/algum-dia."""
    T.create_task("fazer agora")
    T.create_task("esperando fulano", tags=["aguardando"])
    T.create_task("talvez um dia", tags=["algum-dia"])

    waiting = {t["title"] for t in F.list_tasks_by_builtin("waiting")}
    next_actions = {t["title"] for t in F.list_tasks_by_builtin("next-actions")}
    assert waiting == {"esperando fulano"}
    assert next_actions == {"fazer agora"}


@requires_db
def test_builtin_translation_is_parametrized(inbox_id):
    """A tradução das built-ins é parametrizada — valores de tag não tocam o SQL (SC-003)."""
    for key, meta in F.BUILTIN_FILTERS.items():
        where_sql, _params, _orphans = F._build_where_from_rules(meta["rules"])
        assert where_sql.strip(), f"built-in {key} gerou WHERE vazio"
        assert "alta-energia" not in where_sql and "aguardando" not in where_sql


@requires_db
def test_quick_and_energy(inbox_id):
    """'Rápidas (5 min)' casa #5min; 'Alta energia' casa #alta-energia."""
    T.create_task("trocar lâmpada", tags=["5min"])
    T.create_task("escrever ensaio", tags=["alta-energia"])
    assert {t["title"] for t in F.list_tasks_by_builtin("quick")} == {"trocar lâmpada"}
    assert {t["title"] for t in F.list_tasks_by_builtin("energy")} == {"escrever ensaio"}


@requires_db
def test_telegram_resolves_builtin_by_name(inbox_id):
    """O canal Telegram resolve um built-in pelo nome (paridade com a sidebar — FR-012)."""
    T.create_task("delegada", tags=["aguardando"])
    r = F.list_tasks_by_filter_name("Aguardando")
    assert [t["title"] for t in r["tasks"]] == ["delegada"]
    # Prefixo também resolve ("próx" → "Próximas Ações").
    T.create_task("isolada")
    r2 = F.list_tasks_by_filter_name("Próximas")
    assert "isolada" in {t["title"] for t in r2["tasks"]}
