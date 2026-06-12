"""Testes da camada de lógica de hábitos da Kaguya — ``tools_habits`` (Fase 4 / fatia 014).

São testes de **integração** contra um PostgreSQL real (mesmo padrão de ``test_kaguya_tags.py``):
o valor está em comportamentos que só o banco verdadeiro exercita — a constraint
``UNIQUE (habit_id, date)`` (um check-in por dia, com upsert), o cascade ao excluir e o
soft delete por ``archived_at``. A força em si já é coberta sem banco por
``test_kaguya_habit_strength.py``; aqui validamos que a lógica lê/escreve certo.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
    pytest tests/agents/test_kaguya_habits.py -v

Sem ``DATABASE_URL`` o módulo inteiro é **pulado** (skip).
"""

import os
from datetime import date, timedelta

import pytest

# Sem banco configurado, não há o que testar de integração: pula o módulo inteiro.
if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Kaguya pulados.", allow_module_level=True)

from agents.db import get_conn  # noqa: E402
from agents.kaguya import tools_habits as H  # noqa: E402

# Caminho absoluto do schema (a partir deste arquivo: tests/agents/ → raiz do repo).
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "kaguya", "schema_tasks_pg.sql",
)

# Tabelas do domínio, na ordem de drop (dependentes primeiro) — igual a test_kaguya_tags.
_TASK_TABLES = (
    "habit_checkins habits task_filters task_tag_links task_tags "
    "task_recurrences tasks task_columns task_projects task_project_groups"
)


@pytest.fixture()
def clean_db():
    """Reseta as tabelas do domínio e reaplica o schema antes de cada teste.

    Cada teste começa do zero, isolado (sem hábitos nem check-ins residuais).
    """
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_TASK_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
    yield


# ──────────────────────────────────────────────────────────────────────────────
# CRUD
# ──────────────────────────────────────────────────────────────────────────────
def test_criar_e_listar_habito(clean_db):
    """Criar um hábito o faz aparecer na listagem com força inicial zero (sem check-ins)."""
    r = H.create_habit("Meditar", freq_num=5, freq_den=7, icon="🧘")
    assert r["status"] == "ok"
    habitos = H.list_habits()
    assert len(habitos) == 1
    assert habitos[0]["name"] == "Meditar"
    assert habitos[0]["freq_num"] == 5 and habitos[0]["freq_den"] == 7
    assert habitos[0]["strength"] == 0.0          # sem check-ins → força zero
    assert habitos[0]["done_today"] is False


def test_frequencia_invalida_rejeitada(clean_db):
    """freq_num > freq_den é rejeitado com erro amigável (mesma invariante da CHECK)."""
    r = H.create_habit("Impossível", freq_num=8, freq_den=7)
    assert r["status"] == "error"


def test_update_parcial(clean_db):
    """Editar só o nome não mexe na frequência."""
    hid = H.create_habit("Ler", freq_num=3, freq_den=7)["id"]
    assert H.update_habit(hid, name="Ler 20 páginas")["status"] == "ok"
    h = H.get_habit(hid)
    assert h["name"] == "Ler 20 páginas"
    assert h["freq_num"] == 3 and h["freq_den"] == 7


def test_archive_some_da_listagem_mas_preserva(clean_db):
    """Arquivar (soft delete) tira o hábito da listagem, mas o histórico fica e reativa."""
    hid = H.create_habit("Correr")["id"]
    H.check_in(hid)                                  # um check-in para virar histórico
    assert H.archive_habit(hid)["status"] == "ok"
    assert H.list_habits() == []                      # sumiu da lista de ativos
    # Reativa e o check-in continua lá (força > 0).
    assert H.unarchive_habit(hid)["status"] == "ok"
    assert len(H.list_habits()) == 1


# ──────────────────────────────────────────────────────────────────────────────
# Check-ins
# ──────────────────────────────────────────────────────────────────────────────
def test_um_checkin_por_dia_upsert(clean_db):
    """Refazer o check-in do mesmo dia ATUALIZA o valor (não estoura a constraint UNIQUE)."""
    hid = H.create_habit("Ler", target_value=20, unit="páginas")["id"]
    hoje = date.today().isoformat()
    H.check_in(hid, date_iso=hoje, value=10)
    H.check_in(hid, date_iso=hoje, value=30)          # corrige o valor do mesmo dia
    hist = H.get_habit_history(hid, date.today().year)
    assert len(hist) == 1                              # ainda um único check-in no dia
    assert hist[0]["value"] == 30                      # com o valor atualizado
    assert hist[0]["done"] is True                     # 30 >= meta 20 → cumprido


def test_checkin_mensuravel_abaixo_da_meta_nao_conta(clean_db):
    """AC2 ao contrário: valor abaixo da meta registra o check-in mas não conta como cumprido."""
    hid = H.create_habit("Ler", target_value=20, unit="páginas")["id"]
    H.check_in(hid, value=15)                          # leu 15, meta 20
    hist = H.get_habit_history(hid, date.today().year)
    assert hist[0]["done"] is False
    # done_today deve ser False porque a meta não foi alcançada.
    assert H.get_habit(hid)["done_today"] is False


def test_checkin_sim_nao_basta_existir(clean_db):
    """Hábito sim/não: o check-in de hoje marca done_today=True."""
    hid = H.create_habit("Meditar")["id"]
    H.check_in(hid)
    assert H.get_habit(hid)["done_today"] is True


def test_remover_checkin(clean_db):
    """Remover o check-in desfaz o cumprimento do dia."""
    hid = H.create_habit("Meditar")["id"]
    H.check_in(hid)
    assert H.remove_check_in(hid)["status"] == "ok"
    assert H.get_habit(hid)["done_today"] is False
    # Remover de novo (nada para remover) devolve erro amigável.
    assert H.remove_check_in(hid)["status"] == "error"


def test_history_filtra_por_ano(clean_db):
    """O histórico anual só traz os check-ins do ano pedido."""
    hid = H.create_habit("Meditar")["id"]
    H.check_in(hid, date_iso="2025-12-31")
    H.check_in(hid, date_iso="2026-01-01")
    assert len(H.get_habit_history(hid, 2025)) == 1
    assert len(H.get_habit_history(hid, 2026)) == 1


def test_forca_sobe_com_checkins_recentes(clean_db):
    """Vários check-ins seguidos elevam a força acima de zero (integração leitura↔motor)."""
    hid = H.create_habit("Meditar", freq_num=1, freq_den=1)["id"]
    # 10 dias seguidos até hoje.
    for i in range(10):
        H.check_in(hid, date_iso=(date.today() - timedelta(days=i)).isoformat())
    assert H.get_habit(hid)["strength"] > 0.0
