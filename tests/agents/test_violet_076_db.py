"""Testes de integração da Violet no Design System (spec 076) — contra um PostgreSQL real.

Cenários: leitura que não cria página, número do dia estável, Arquivo só com dias com conteúdo,
vínculo sincronizado com a Komi (tokens, @ legado exato, edição e exclusão), referências a
outros agentes, cartas/emoções consolidadas, resumo da pessoa na Komi, força, Refletir,
Insights (StatsPayload), padrões emocionais, Avaliação dos Valores e o contexto da IA.

Como rodar (banco descartável com todos os schemas aplicados):
    export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
    pytest tests/agents/test_violet_076_db.py -v

Sem DATABASE_URL o módulo inteiro é pulado.
"""

import os
from datetime import date, timedelta

import pytest

if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Violet pulados.", allow_module_level=True)

from agents.db import get_conn, run_select  # noqa: E402
from agents.journal import tools as T  # noqa: E402
from agents.journal import values as V  # noqa: E402
from agents.journal import references as R  # noqa: E402
from agents.journal import chat_tools as CT  # noqa: E402
from agents.komi import tools as K  # noqa: E402

_TABLES = (
    "journal_refs, journal_mentions, journal_bullets, journal_emotion_logs, journal_letters, "
    "journal_values_commitments, journal_values_areas, journal_values_assessments, journal_values_checkins, "
    "journal_pages, person_links, person_aliases, people, movies"
)


@pytest.fixture(autouse=True)
def limpar():
    T._ensure_tables()
    V._ensure_values_tables()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE")
    yield


def _pessoa(nome, alias=None):
    pid = K.create_person(nome)["id"]
    if alias:
        K.add_alias(pid, alias)
    return pid


def _links(entity_type="journal_bullet"):
    return {(r["person_id"], r["entity_id"]) for r in run_select(
        "SELECT person_id, entity_id FROM person_links WHERE entity_type = %(t)s", {"t": entity_type})}


# ─── dia ────────────────────────────────────────────────────────────────────────

def test_ler_dia_nao_cria_pagina():
    r = T.get_page("2026-10-01")
    assert r["page"]["id"] is None and r["page"]["num"] == 1
    assert run_select("SELECT COUNT(*) AS n FROM journal_pages")[0]["n"] == 0


def test_numero_do_dia_conta_so_dias_com_conteudo():
    T.ensure_page("2026-10-01")  # visitado, vazio
    p2 = T.ensure_page("2026-10-02")["page"]["id"]
    T.upsert_bullet(p2, 0, "primeiro dia escrito")
    assert T.get_page("2026-10-02")["page"]["num"] == 1
    assert T.get_page("2026-10-05")["page"]["num"] == 2


def test_texto_vazio_apaga_o_bullet():
    p = T.ensure_page("2026-10-02")["page"]["id"]
    T.upsert_bullet(p, 0, "algo")
    r = T.upsert_bullet(p, 0, "   ")
    assert r["deleted"] is True
    assert T.get_page("2026-10-02")["bullets"] == []


# ─── Arquivo ────────────────────────────────────────────────────────────────────

def test_arquivo_so_mostra_dias_com_conteudo_e_num_estavel():
    T.ensure_page("2026-10-01")                                   # só visitado
    p2 = T.ensure_page("2026-10-02")["page"]["id"]
    T.upsert_bullet(p2, 0, "")                                    # bullet vazio não conta
    T.set_dream(p2, "   ")                                         # sonho só de espaço não conta
    p3 = T.ensure_page("2026-10-03")["page"]["id"]
    T.upsert_bullet(p3, 0, "fui ao cinema")
    p4 = T.ensure_page("2026-10-04")["page"]["id"]
    T.set_dream(p4, "sonhei com o mar")
    entries = T.list_entries()
    assert [e["date"] for e in entries] == ["2026-10-04", "2026-10-03"]
    assert entries[0]["has_dream"] and entries[0]["excerpt"] == "sonhei com o mar"
    busca = T.list_entries("cinema")
    assert [(e["date"], e["num"]) for e in busca] == [("2026-10-03", 1)]


def test_arquivo_dia_so_com_carta_aparece_com_titulo():
    p = T.ensure_page("2026-10-02")["page"]["id"]
    T.create_letter(p, "Mãe", "obrigado por tudo", title="Para a mãe")
    e = T.list_entries()[0]
    assert e["letter_count"] == 1 and e["excerpt"] == "Para a mãe" and e["excerpt_kind"] == "letter"


# ─── Komi ───────────────────────────────────────────────────────────────────────

def test_token_vincula_e_edicao_desvincula():
    ana, bia = _pessoa("Ana Lima"), _pessoa("Bia")
    p = T.ensure_page("2026-10-02")["page"]["id"]
    b = T.upsert_bullet(p, 0, f"almocei com @[Ana Lima](komi:{ana})")["bullet"]
    assert _links() == {(ana, str(b["id"]))}
    T.upsert_bullet(p, 0, f"almocei com @[Bia](komi:{bia})")
    assert _links() == {(bia, str(b["id"]))}
    T.delete_bullet(b["id"])
    assert _links() == set()


def test_arroba_legado_so_vincula_com_match_exato_e_unico():
    ana = _pessoa("Ana Lima", alias="Aninha")
    _pessoa("Ana Souza")
    p = T.ensure_page("2026-10-02")["page"]["id"]
    b = T.upsert_bullet(p, 0, "falei com @Ana e com @Aninha")["bullet"]
    assert _links() == {(ana, str(b["id"]))}  # "@Ana" é prefixo de duas → não vincula
    m = run_select("SELECT value, person_id FROM journal_mentions ORDER BY value")
    assert m == [{"value": "Ana", "person_id": None}, {"value": "Aninha", "person_id": ana}]


def test_mencoes_agrupam_pela_pessoa():
    ana = _pessoa("Ana Lima")
    p = T.ensure_page("2026-10-02")["page"]["id"]
    T.upsert_bullet(p, 0, f"@[Ana Lima](komi:{ana})")
    T.upsert_bullet(p, 1000, f"@[Ana](komi:{ana}) de novo")
    pessoas = T.list_mentions("person")
    assert len(pessoas) == 1 and pessoas[0]["person_id"] == ana and pessoas[0]["count"] == 2
    assert len(T.get_bullets_by_mention("person", person_id=ana)[0]["bullets"]) == 2


def test_resumo_da_pessoa_na_komi_tem_deep_link_e_cartas():
    ana = _pessoa("Ana Lima")
    p = T.ensure_page("2026-10-02")["page"]["id"]
    T.upsert_bullet(p, 0, f"jantar com @[Ana Lima](komi:{ana})")
    T.create_letter(p, "Ana", "querida Ana", person_ids=[ana], font="cursiva")
    s = K.get_person_summary(ana)
    assert s["diario"]["trechos"][0]["deep_link"] == "/journal#dia/2026-10-02"
    assert s["diario"]["trechos"][0]["texto"] == "jantar com @Ana Lima"
    assert s["cartas"]["cartas"][0]["font"] == "cursiva"


def test_sugestoes_por_prefixo_e_apelido():
    _pessoa("Fulana de Tal", alias="Fu")
    _pessoa("Beltrano")
    nomes = [x["name"] for x in K.suggest_people("fu")["people"]]
    assert nomes == ["Fulana de Tal"]
    assert [x["name"] for x in K.suggest_people("tal")["people"]] == ["Fulana de Tal"]  # palavra do meio


# ─── referências ────────────────────────────────────────────────────────────────

def _filme(titulo):
    from agents.akane.tools import _norm
    mid = f"m-{_norm(titulo).replace(' ', '-')}"
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO movies (id, title, normalizado, year) VALUES (%s, %s, %s, 1999)",
                        (mid, titulo, _norm(titulo)))
    return mid


def test_busca_e_referencia_gravada():
    mid = _filme("Matrix")
    _filme("Matrix Reloaded")
    r = R.search("akane", "matrix")
    assert [x["label"] for x in r["results"]][:2] == ["Matrix", "Matrix Reloaded"] or len(r["results"]) == 2
    p = T.ensure_page("2026-10-02")["page"]["id"]
    T.upsert_bullet(p, 0, f"vi [Matrix](akane:movie:{mid})")
    assert T.list_refs()[0]["entity_id"] == mid
    assert T.get_bullets_by_ref("akane", "movie", mid)[0]["date"] == "2026-10-02"


def test_escrever_no_diario_pelo_chat_resolve_tudo():
    mid = _filme("Matrix")
    fu = _pessoa("Fulana")
    out = CT.escrever_no_diario("hoje assisti /akane Matrix com a @Fulana", date="2026-10-02")
    assert out["content"] == f"hoje assisti [Matrix](akane:movie:{mid}) com a @[Fulana](komi:{fu})"
    assert out["ambiguous"] == []
    out2 = CT.escrever_no_diario("e depois /akane Filme Que Nao Existe", date="2026-10-02")
    assert out2["bullet"]["position"] == 1000 and out2["ambiguous"][0]["kind"] == "ref"


# ─── cartas e emoções ───────────────────────────────────────────────────────────

def test_cartas_consolidadas_com_fonte_e_filtros():
    ana = _pessoa("Ana")
    p1 = T.ensure_page("2026-10-01")["page"]["id"]
    p2 = T.ensure_page("2026-10-02")["page"]["id"]
    T.create_letter(p1, "Ana", "um", person_ids=[ana], font="roteiro")
    c2 = T.create_letter(p2, "Pai", "dois")["letter"]
    T.seal_letter(c2["id"])
    todas = T.list_all_letters()
    assert [c["date"] for c in todas] == ["2026-10-02", "2026-10-01"]
    assert [c["recipient"] for c in T.list_all_letters(person_id=ana)] == ["Ana"]
    assert [c["recipient"] for c in T.list_all_letters(status="sealed")] == ["Pai"]
    assert T.get_letter(todas[1]["id"])["letter"]["font"] == "roteiro"
    assert T.update_letter(todas[1]["id"], font="cursiva")["letter"]["font"] == "cursiva"


def test_emocoes_consolidadas_e_padroes():
    from agents.journal.emotion_patterns import get_emotion_patterns
    raiva = [e for e in T.list_emotions() if e["name"] == "raiva"][0]["id"]
    for i, d in enumerate(("2026-10-01", "2026-10-02", "2026-10-03")):
        pid = T.ensure_page(d)["page"]["id"]
        T.create_emotion_log(pid, raiva, 8 - i, situation="reunião", automatic_thought="vão me demitir")
    logs = T.list_all_emotion_logs(q="reunião")
    assert len(logs) == 3 and logs[0]["date"] == "2026-10-03"
    T.set_emotion_distortions(logs[0]["id"], ["catastrofizacao"])
    assert T.get_emotion_log(logs[0]["id"])["log"]["distortions"] == ["catastrofizacao"]
    r = get_emotion_patterns("2026-09-04", "2026-10-03")
    assert r["summary"]["total"] == 3
    assert T.get_emotion_stats(since="2026-10-02", until="2026-10-03")["total"] == 2


# ─── força, Refletir, Insights ──────────────────────────────────────────────────

def test_forca_refletir_e_insights_rodam():
    from agents.journal.reflect import get_reflect
    from agents.journal.strength import get_writing_strength
    from agents.journal.tools_stats import get_stats_payload
    hoje = T._today_sp()
    for i in range(12):
        d = (hoje - timedelta(days=i * 2)).isoformat()
        pid = T.ensure_page(d)["page"]["id"]
        T.upsert_bullet(pid, 0, f"dia {i} com #treino", kind="highlight" if i % 3 == 0 else "bullet")
        T.upsert_bullet(pid, 1000, "uma ideia boa", kind="idea")
    s = get_writing_strength(5)
    assert 0 < s["consistency"] <= 100 and len(s["series"]) == 90
    r = get_reflect(hoje, pins=["tag:treino"])
    assert r["idea"] is not None and r["memory_lane"] is not None and r["pins"][0]["total"] >= 1
    assert r["week"]["highlights"]
    p = get_stats_payload(hoje.year)
    keys = {k["key"] for k in p["kpis"]}
    assert {"strength", "days", "words", "highlight_rate"} <= keys
    assert p["rankings"]["tags"]["items"][0]["label"] == "#treino"


# ─── valores ────────────────────────────────────────────────────────────────────

def test_fluxo_da_avaliacao_dos_valores():
    a = V.start_assessment()["assessment"]
    assert len(a["areas"]) == 12 and a["status"] == "draft"
    V.update_area(a["id"], "saude", description="cuidar do corpo", importance_now=9, importance_general=9,
                  possibility=8, action=2, satisfaction=3, concern=9)
    V.update_area(a["id"], "arte", skipped=True)
    V.add_commitment(a["id"], "saude", "caminhar 3x")
    done = V.complete_assessment(a["id"])["assessment"]
    assert done["diagnosis"]["alerts"] == ["saude"] and "Áreas de alerta" in done["summary_md"]
    # Refazer parte da anterior pré-preenchida; concluída não edita.
    assert V.update_area(a["id"], "saude", action=5)["status"] == "error"
    b = V.start_assessment()["assessment"]
    assert next(x for x in b["areas"] if x["domain_key"] == "saude")["importance_now"] == 9
    assert V.checkin("saude", 6, 6)["status"] == "ok"
    assert "saude" not in V.values_context_for_counsel() and "Autocuidado" in V.values_context_for_counsel()


# ─── contexto da IA (sem chamar o Gemini) ───────────────────────────────────────

def test_contexto_da_violet_monta_sem_erro():
    from agents.kurisu import violet_context as CTX
    ana = _pessoa("Ana")
    d = date(2026, 10, 2)
    pid = T.ensure_page(d.isoformat())["page"]["id"]
    T.upsert_bullet(pid, 0, f"briguei com @[Ana](komi:{ana})")
    dias = CTX.dias(d - timedelta(days=3), d)
    assert dias[0]["bullets"][0]["content"] == "briguei com @Ana"
    assert "briguei" in CTX.resumir_dia(dias[0])
    assert isinstance(CTX.sinais(d), dict)
    assert isinstance(CTX.bloco_kaguya(CTX.kaguya()), str)
    assert CTX.conselhos(d - timedelta(days=7), d) == []


# ─── conversa sobre o Conselho do Dia (IA substituída) ─────────────────────────

def _ia_falsa(monkeypatch):
    from agents.kurisu import counsel as C
    from agents.kurisu import violet_ai as AI
    monkeypatch.setattr(C, "_extrair_temas", lambda *a: {"queries": ["sono"], "carga_emocional": "cansado"})
    monkeypatch.setattr(C, "_mapear", lambda *a: {"espelho": "Dia cansado.", "humor": "cansado", "principios": []})
    monkeypatch.setattr(C, "_escrever", lambda *a: {"essay_md": "## O que eu li no seu dia\nDurma [1].", "actions": []})
    monkeypatch.setattr(AI, "recuperar_amplo", lambda q, citadas=None: [{"fonte": "sono.md", "uri": "gs://sono.md", "texto": "dormir"}])
    monkeypatch.setattr(AI, "gemini_web", lambda *a, **k: None)
    respostas = iter([{"queries": ["sono"]}, {"reply_md": "Então durma às 23h [1]."}] * 5)
    monkeypatch.setattr(AI, "gemini_json", lambda *a, **k: next(respostas))


def test_conversa_do_conselho_persiste_e_regerar_mantem_com_divisoria(monkeypatch):
    from agents.kurisu import counsel as C
    from agents.kurisu import counsel_chat as CC
    C._ensure_counsel_tables()
    _ia_falsa(monkeypatch)
    d = "2026-10-03"
    pid = T.ensure_page(d)["page"]["id"]
    T.upsert_bullet(pid, 0, "dormi às 3h de novo")

    assert CC.responder_conselho(d, "oi")["status"] == "error"  # ainda sem conselho
    assert C.gerar_conselho(d)["counsel"]["messages"] == []

    r = CC.responder_conselho(d, "Mas eu precisava terminar o trabalho.")
    assert r["status"] == "ok"
    assert [m["role"] for m in r["messages"]] == ["user", "violet"]
    assert r["messages"][1]["sources"][0]["fonte"] == "sono.md"

    lida = C.get_conselho(d)
    assert [m["content_md"] for m in lida["messages"]][0] == "Mas eu precisava terminar o trabalho."

    regerado = C.gerar_conselho(d)["counsel"]
    assert [m["role"] for m in regerado["messages"]] == ["user", "violet", "marker"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM journal_counsel WHERE page_id = %s", (pid,))
    assert run_select("SELECT 1 FROM journal_counsel_messages") == []
