"""Testes de integração da camada de lógica do agente Yato (spec 066).

Testes contra um PostgreSQL real — exercitam: viagens, roteiro (validação de
intervalo + ordenação + órfãos), dossiê de mobilidade (protocolo de 7 passos +
estratégia), apps regionais, checklist (regeneração a partir do dossiê),
orçamento e o lançamento atômico de gasto cross-agent com a Nami.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
    pytest tests/agents/test_yato.py -v

Sem DATABASE_URL o módulo inteiro é pulado.
"""

import os

import pytest

if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração do Yato pulados.", allow_module_level=True)

from agents.db import get_conn, run_select  # noqa: E402
from agents.yato import tools as Y  # noqa: E402
from agents.yato import tools_mobility as M  # noqa: E402

_YATO_SCHEMA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "yato", "schema_pg.sql",
)
_NAMI_SCHEMA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "nami", "schema_pg.sql",
)

# Dependentes primeiro, para DROP CASCADE ser seguro.
_YATO_TABLES = (
    "trip_budget_items trip_checklist_items trip_mobility_snapshots "
    "mobility_checks mobility_apps mobility_dossiers trip_items trips"
)


@pytest.fixture()
def db():
    """Recria as tabelas do Yato antes de cada teste — isolamento total."""
    with open(_YATO_SCHEMA, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_YATO_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
    yield


@pytest.fixture()
def nami_env(db):
    """Aplica o schema da Nami + semeia o cache de contas, para log_trip_expense."""
    import agents.nami.tools as nami

    with open(_NAMI_SCHEMA, encoding="utf-8") as f:
        nami_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(nami_sql)
            cur.execute("TRUNCATE transactions")
    nami._accounts_cache = [{"id": "acc-test", "name": "Generico"}]
    yield
    nami._accounts_cache = None


def _create_trip(**overrides) -> dict:
    defaults = dict(
        city="Tiradentes", state_uf="MG", start_date="2026-09-12", end_date="2026-09-15",
        profile="economia",
    )
    defaults.update(overrides)
    return Y.create_trip(**defaults)


# ─────────────────────────────────────────────────────────────────────────────
# US1 — Viagens e roteiro
# ─────────────────────────────────────────────────────────────────────────────

def test_create_trip_happy_path(db):
    r = _create_trip()
    assert r["status"] == "ok"
    assert r["trip"]["status"] == "planejando"
    assert r["trip"]["city"] == "Tiradentes"


def test_create_trip_rejects_end_before_start(db):
    r = _create_trip(start_date="2026-09-15", end_date="2026-09-12")
    assert r["status"] == "error"


def test_create_trip_rejects_interval_over_60_days(db):
    r = _create_trip(start_date="2026-01-01", end_date="2026-04-01")
    assert r["status"] == "error"


def test_add_itinerary_item_and_group_ordering(db):
    trip_id = _create_trip()["trip"]["id"]
    Y.add_itinerary_item(trip_id, "2026-09-13", "tarde", "Passeio de tarde")
    Y.add_itinerary_item(trip_id, "2026-09-13", "manha", "Igreja São Francisco")
    Y.add_itinerary_item(trip_id, "2026-09-12", "noite", "Chegada")

    result = Y.list_itinerary(trip_id)
    assert result["status"] == "ok"
    days = result["days"]
    assert days[0]["day_date"] == "2026-09-12"
    assert days[1]["day_date"] == "2026-09-13"
    # dentro do dia 13: manhã antes de tarde
    assert days[1]["items"][0]["period"] == "manha"
    assert days[1]["items"][1]["period"] == "tarde"


def test_add_itinerary_item_rejects_date_outside_trip(db):
    trip_id = _create_trip()["trip"]["id"]
    r = Y.add_itinerary_item(trip_id, "2026-09-20", "manha", "Fora do intervalo")
    assert r["status"] == "error"


def test_update_trip_dates_with_orphans_returns_pending(db):
    trip_id = _create_trip()["trip"]["id"]
    Y.add_itinerary_item(trip_id, "2026-09-14", "manha", "Item que vai ficar órfão")

    r = Y.update_trip(trip_id, start_date="2026-09-12", end_date="2026-09-13")
    assert r["status"] == "orphans_pending"
    assert r["orphan_count"] == 1

    # a mudança de datas NÃO foi aplicada
    trip = Y.get_trip(trip_id)["trip"]
    assert trip["end_date"] == "2026-09-15"


def test_resolve_trip_orphans_move_then_apply_dates(db):
    trip_id = _create_trip()["trip"]["id"]
    item_id = Y.add_itinerary_item(trip_id, "2026-09-14", "manha", "Item órfão")["item"]["id"]

    pending = Y.update_trip(trip_id, start_date="2026-09-12", end_date="2026-09-13")
    assert pending["status"] == "orphans_pending"

    Y.resolve_trip_orphans(trip_id, action="move", item_ids=[item_id], new_day_date="2026-09-13")
    applied = Y.update_trip(trip_id, start_date="2026-09-12", end_date="2026-09-13")
    assert applied["status"] == "ok"
    assert applied["trip"]["end_date"] == "2026-09-13"


# ─────────────────────────────────────────────────────────────────────────────
# US2 — Dossiê de mobilidade
# ─────────────────────────────────────────────────────────────────────────────

def test_get_or_create_dossier_seeds_7_pending_checks(db):
    r = M.get_or_create_mobility_dossier("Tiradentes", "MG")
    assert r["status"] == "ok"
    assert len(r["checks"]) == 7
    assert all(c["verdict"] == "pendente" for c in r["checks"])
    assert r["dossier"]["stale"] is False


def test_get_or_create_dossier_requires_uf(db):
    r = M.get_or_create_mobility_dossier("Tiradentes", "")
    assert r["status"] == "error"


def test_record_mobility_check_inconclusivo_never_ausente_by_contract(db):
    """A tool grava exatamente o veredito que recebe — a regra de nunca
    inferir 'ausente' sozinho é do agente, mas a tool aceita 'inconclusivo'
    normalmente (o teste documenta o caso de uso real do protocolo)."""
    r = M.record_mobility_check(
        "Tiradentes", "MG", "transporte_publico", "inconclusivo", "google_maps",
        evidence="Google Maps não mostra rotas de ônibus.",
    )
    assert r["status"] == "ok"
    assert r["check"]["verdict"] == "inconclusivo"


def test_record_mobility_check_rejects_pendente_as_client_verdict(db):
    r = M.record_mobility_check("Tiradentes", "MG", "uber", "pendente", "outro")
    assert r["status"] == "error"


def test_record_mobility_check_rejects_invalid_check_key(db):
    r = M.record_mobility_check("Tiradentes", "MG", "nao_existe", "confirmado", "outro")
    assert r["status"] == "error"


def test_strategy_transfer_hospedagem_when_apps_absent(db):
    M.record_mobility_check("Tiradentes", "MG", "uber", "ausente", "simulacao_in_app")
    M.record_mobility_check("Tiradentes", "MG", "99", "ausente", "simulacao_in_app")
    M.record_mobility_check("Tiradentes", "MG", "indrive", "ausente", "simulacao_in_app")
    M.record_mobility_check("Tiradentes", "MG", "transporte_publico", "inconclusivo", "google_maps")
    M.record_mobility_check("Tiradentes", "MG", "hospedagem_transfer", "confirmado", "contato_hospedagem")

    r = M.get_mobility_strategy("Tiradentes", "MG")
    assert r["status"] == "ok"
    assert r["strategy"] == "transfer_hospedagem"


def test_strategy_app_corrida_when_indrive_confirmado(db):
    M.record_mobility_check("Tiradentes", "MG", "uber", "ausente", "simulacao_in_app")
    M.record_mobility_check("Tiradentes", "MG", "99", "ausente", "simulacao_in_app")
    M.record_mobility_check("Tiradentes", "MG", "indrive", "confirmado", "simulacao_in_app")

    r = M.get_mobility_strategy("Tiradentes", "MG")
    assert r["strategy"] == "app_corrida"


def test_strategy_pedestrian_scale_overrides_everything(db):
    M.get_or_create_mobility_dossier("Jericoacoara", "CE")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE mobility_dossiers SET pedestrian_scale = TRUE WHERE city = %s AND state_uf = %s",
                ("Jericoacoara", "CE"),
            )
    r = M.get_mobility_strategy("Jericoacoara", "CE")
    assert r["strategy"] == "caminhavel"


def test_suggest_mobility_apps_filters_by_uf(db):
    from scripts.seed_mobility_apps import seed
    seed()

    r = M.suggest_mobility_apps(state_uf="MG")
    assert r["status"] == "ok"
    names = {a["name"] for a in r["apps"]}
    assert "Ubiz Car" in names   # coverage_scope='uf', MG
    assert "Uber" in names       # coverage_scope='nacional'
    assert "Urban66" not in names  # só MT
    for app in r["apps"]:
        assert app["label"] == "cobertura declarada — confirmar in-app"


# ─────────────────────────────────────────────────────────────────────────────
# US3 — Checklist
# ─────────────────────────────────────────────────────────────────────────────

def test_regenerate_checklist_excludes_absent_apps(db):
    trip_id = _create_trip()["trip"]["id"]
    M.record_mobility_check("Tiradentes", "MG", "uber", "ausente", "simulacao_in_app")
    M.record_mobility_check("Tiradentes", "MG", "hospedagem_transfer", "confirmado", "contato_hospedagem")

    r = Y.regenerate_checklist_from_dossier(trip_id)
    assert r["status"] == "ok"
    assert r["added"] > 0

    labels = {i["label"] for i in Y.list_checklist(trip_id)["items"]}
    assert "Instalar o app Uber" not in labels
    assert "Combinar o transfer com a pousada/hotel" in labels


def test_regenerate_checklist_does_not_duplicate(db):
    trip_id = _create_trip()["trip"]["id"]
    M.record_mobility_check("Tiradentes", "MG", "hospedagem_transfer", "confirmado", "contato_hospedagem")

    first = Y.regenerate_checklist_from_dossier(trip_id)
    second = Y.regenerate_checklist_from_dossier(trip_id)
    assert second["added"] == 0
    assert second["skipped_existing"] == first["added"]


def test_checklist_progress_persists(db):
    trip_id = _create_trip()["trip"]["id"]
    item_id = Y.add_checklist_item(trip_id, "Baixar mapa offline")["item"]["id"]
    Y.set_checklist_item_done(item_id, True)

    items = Y.list_checklist(trip_id, done=True)["items"]
    assert len(items) == 1
    assert items[0]["id"] == item_id


# ─────────────────────────────────────────────────────────────────────────────
# US5 — Orçamento e cross-agent Nami
# ─────────────────────────────────────────────────────────────────────────────

def test_set_and_get_trip_budget(db):
    trip_id = _create_trip()["trip"]["id"]
    Y.set_trip_budget(trip_id, [
        {"category": "hospedagem", "estimated": 600},
        {"category": "transporte_ida", "estimated": 400},
    ])
    r = Y.get_trip_budget(trip_id)
    assert r["total_estimated"] == 1000.0


def test_log_trip_expense_happy_path_books_in_both_tables(nami_env):
    trip_id = _create_trip()["trip"]["id"]
    r = Y.log_trip_expense(trip_id, "alimentacao", 45.0, "Almoço")
    assert r["status"] == "ok"
    assert r["budget_item"]["actual"] == 45.0

    rows = run_select("SELECT valor, categoria FROM transactions")
    assert len(rows) == 1
    assert rows[0]["valor"] == 45.0
    assert rows[0]["categoria"] == "Alimentacao"


def test_log_trip_expense_invalid_category_rolls_back_everything(nami_env):
    trip_id = _create_trip()["trip"]["id"]
    r = Y.log_trip_expense(trip_id, "categoria_invalida", 45.0, "Almoço")
    assert r["status"] == "error"
    assert run_select("SELECT count(*) AS c FROM transactions")[0]["c"] == 0
    budget = Y.get_trip_budget(trip_id)["items"]
    assert budget == []


def test_log_trip_expense_nami_failure_rolls_back_everything(nami_env):
    import agents.nami.tools as nami
    nami._accounts_cache = []  # nenhuma conta resolve → create_transaction_on_cursor falha

    trip_id = _create_trip()["trip"]["id"]
    r = Y.log_trip_expense(trip_id, "alimentacao", 45.0, "Almoço")
    assert r["status"] == "error"
    assert run_select("SELECT count(*) AS c FROM transactions")[0]["c"] == 0
    assert Y.get_trip_budget(trip_id)["items"] == []


def test_get_trip_readiness_reflects_checklist_and_budget(db):
    trip_id = _create_trip()["trip"]["id"]
    item_id = Y.add_checklist_item(trip_id, "Compartilhar roteiro")["item"]["id"]
    Y.set_checklist_item_done(item_id, True)
    Y.set_trip_budget(trip_id, [{"category": "hospedagem", "estimated": 600}])

    r = Y.get_trip_readiness(trip_id)
    assert r["status"] == "ok"
    assert r["checklist_done"] == 1
    assert r["checklist_total"] == 1
    assert r["budget_defined"] is True


# ─────────────────────────────────────────────────────────────────────────────
# Matriz de conforto (fachada da tool sobre o motor puro)
# ─────────────────────────────────────────────────────────────────────────────

def test_recommend_comfort_class_facade(db):
    r = Y.recommend_comfort_class(11, night=True)
    assert r["status"] == "ok"
    assert r["recommended_class"] in ("semi_leito", "leito", "leito_cama")
