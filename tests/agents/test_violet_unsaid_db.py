"""Testes de integração dos "Não ditos" da Violet — contra um PostgreSQL real.

Cobre: criação com vínculo na Komi, validações, desfecho (resolve/reabrir), edição de pessoas,
exclusão com limpeza dos vínculos, dia com conteúdo, provedor da Komi SEM texto e o contexto da IA.

Como rodar (banco descartável com os schemas aplicados):
    export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
    pytest tests/agents/test_violet_unsaid_db.py -v

Sem DATABASE_URL o módulo inteiro é pulado.
"""

import os

import pytest

if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração pulados.", allow_module_level=True)

from agents.db import get_conn, run_select  # noqa: E402
from agents.journal import tools as T  # noqa: E402
from agents.journal import tools_unsaid as U  # noqa: E402
from agents.journal.komi_provider import LINK_TYPES, _resolve_unsaid  # noqa: E402
from agents.komi import tools as K  # noqa: E402
from agents.kurisu import violet_context as VC  # noqa: E402

_TABLES = "journal_unsaid, journal_bullets, journal_pages, person_links, person_aliases, people"


@pytest.fixture(autouse=True)
def limpar():
    T._ensure_tables()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE")
    yield


def _dia(data="2026-11-10") -> int:
    return T.ensure_page(data)["page"]["id"]


def test_cria_com_pessoa_e_lista_no_dia():
    pid = K.create_person("Bia")["id"]
    page = _dia()
    r = U.create_unsaid(page, "Bia", "Eu queria dizer que me magoou", "nao_consigo", why="medo", person_ids=[pid])
    assert r["status"] == "ok"
    item = r["unsaid"]
    assert item["status"] == "kept" and item["reason"] == "nao_consigo"
    assert [p["id"] for p in item["people"]] == [pid]
    assert [x["id"] for x in U.list_unsaid(page)] == [item["id"]]
    assert U.list_all_unsaid(person_id=pid)[0]["date"] == "2026-11-10"


def test_validacoes():
    page = _dia()
    assert U.create_unsaid(page, "Bia", "x", "talvez")["status"] == "error"
    assert U.create_unsaid(page, " ", "x", "nao_quero")["status"] == "error"
    assert U.create_unsaid(page, "Bia", "  ", "nao_quero")["status"] == "error"
    assert U.create_unsaid(999999, "Bia", "x", "nao_quero")["status"] == "error"


def test_desfecho_e_reabrir():
    uid = U.create_unsaid(_dia(), "Bia", "texto", "nao_posso")["unsaid"]["id"]
    r = U.resolve_unsaid(uid, "said", "conversamos")["unsaid"]
    assert r["status"] == "said" and r["resolved_at"] and r["outcome_note"] == "conversamos"
    r = U.resolve_unsaid(uid, "kept", "ignorada")["unsaid"]
    assert r["status"] == "kept" and r["resolved_at"] is None and r["outcome_note"] is None
    assert U.resolve_unsaid(uid, "outro")["status"] == "error"
    assert U.resolve_unsaid(12345, "said")["status"] == "error"
    assert [x["id"] for x in U.list_all_unsaid(status="kept")] == [uid]
    assert U.list_all_unsaid(status="said") == []


def test_update_troca_pessoas_e_valida():
    a, b = K.create_person("Ana")["id"], K.create_person("Beto")["id"]
    uid = U.create_unsaid(_dia(), "Ana", "texto", "nao_quero", person_ids=[a])["unsaid"]["id"]
    r = U.update_unsaid(uid, person_ids=[b], body="novo texto", reason="nao_posso")["unsaid"]
    assert [p["id"] for p in r["people"]] == [b] and r["body"] == "novo texto" and r["reason"] == "nao_posso"
    assert U.update_unsaid(uid, reason="xx")["status"] == "error"
    assert U.update_unsaid(uid, body="")["status"] == "error"
    assert U.update_unsaid(9999, body="a")["status"] == "error"


def test_delete_limpa_vinculos():
    pid = K.create_person("Caio")["id"]
    uid = U.create_unsaid(_dia(), "Caio", "texto", "nao_quero", person_ids=[pid])["unsaid"]["id"]
    assert U.delete_unsaid(uid)["status"] == "ok"
    assert run_select("SELECT 1 FROM person_links WHERE entity_type='journal_unsaid'") == []
    assert U.delete_unsaid(uid)["status"] == "error"


def test_dia_so_com_nao_dito_conta_como_conteudo():
    page = _dia()
    U.create_unsaid(page, "Bia", "texto", "nao_quero")
    dia = [d for d in T.list_entries() if d["date"] == "2026-11-10"]
    assert dia and dia[0]["unsaid_count"] == 1 and not dia[0]["excerpt"]  # sem vazar texto no excerto


def test_provedor_da_komi_nao_vaza_texto():
    pid = K.create_person("Dani")["id"]
    uid = U.create_unsaid(_dia(), "Dani", "segredo íntimo", "nao_consigo", person_ids=[pid])["unsaid"]["id"]
    U.resolve_unsaid(uid, "let_go")
    assert "journal_unsaid" in [t["entity_type"] for t in LINK_TYPES]
    spec = next(t for t in LINK_TYPES if t["entity_type"] == "journal_unsaid")
    assert "summary" not in spec  # resumo por IA da Komi não recebe o texto
    item = _resolve_unsaid([str(uid)])[0]
    assert item["snippet"] is None and "segredo" not in item["title"]
    assert item["title"] == "Algo não dito · deixei ir"
    assert item["deep_link"] == f"/journal#naodito/{uid}"


def test_contexto_da_ia_inclui_o_nao_dito():
    page = _dia()
    U.create_unsaid(page, "Bia", "queria pedir desculpas", "nao_quero")
    from datetime import date
    dias = VC.dias(date(2026, 11, 10), date(2026, 11, 10))
    assert dias and not VC.dia_vazio(dias[0])
    assert "Não dito para Bia" in VC.resumir_dia(dias[0])
