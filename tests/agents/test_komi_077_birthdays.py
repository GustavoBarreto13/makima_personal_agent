"""Spec 077 · Fase 3 — aniversário como campo da pessoa, calendário com lembrete e ponte da Kaguya.

Três blocos:
    1. Funções puras (sem banco): minutos de lembrete, 29/02, título -> nome.
    2. Komi com banco (tabelas só da Komi): datas, calendário, ``upcoming_birthdays``.
    3. Ponte da Kaguya (``create_task(type="birthday")``) com a Komi simulada, sem banco.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_birthdays.py -v
"""

import os
from datetime import date

import pytest

from agents.komi import calendar_provider as CP
from agents.komi import naming


# ── 1. funções puras ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("dias,minutos", [(None, None), (0, 0), (1, 900), (2, 2340), (7, 9540), (27, 38340), (99, 38340)])
def test_minutos_do_lembrete_dispara_as_9h_do_dia_do_aviso(dias, minutos):
    assert CP.reminder_minutes(dias) == minutos


def test_29_de_fevereiro_cai_em_28_nos_anos_comuns():
    assert CP._ocorrencia(29, 2, 2027) == date(2027, 2, 28)
    assert CP._ocorrencia(29, 2, 2028) == date(2028, 2, 29)


def test_today_sp_usa_o_fuso_de_sao_paulo_nao_o_do_servidor():
    from datetime import datetime, timezone
    # 01:30 UTC de 18/out = 22:30 de 17/out em São Paulo — "hoje" ainda é dia 17
    assert naming.today_sp(datetime(2026, 10, 18, 1, 30, tzinfo=timezone.utc)) == date(2026, 10, 17)


# ── 2. Komi com banco ────────────────────────────────────────────────────────

pytestmark_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")


@pytest.fixture
def banco():
    from tests.agents.komi_testing import reset_komi_schema
    reset_komi_schema()
    yield
    reset_komi_schema()


def _pessoa(nome, **extra):
    from agents.komi import tools as K
    r = K.create_person(nome, **extra)
    assert r["status"] == "ok", r
    return r["id"]


def _sql(sql, params=None, um=False):
    from agents.db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone() if um else None


@pytestmark_db
def test_set_birthday_preserva_o_ano_e_o_lembrete_quando_omitidos(banco):
    from agents.komi import tools as K
    pid = _pessoa("Bia", birth_day=1, birth_month=1, birth_year=1990, birthday_remind_days=3)
    assert K.set_birthday(pid, 15, 5)["status"] == "ok"
    assert _sql("SELECT birth_day, birth_month, birth_year, birthday_remind_days FROM people WHERE id=%s", (pid,), um=True) == (15, 5, 1990, 3)
    assert K.set_birthday(pid, 15, 5, remind_days=-1)["status"] == "ok"           # -1 desliga o lembrete
    assert _sql("SELECT birthday_remind_days FROM people WHERE id=%s", (pid,), um=True)[0] is None
    assert K.set_birthday(pid, 30, 2)["status"] == "error"                         # 30/02 não existe


@pytestmark_db
def test_add_important_date_com_rotulo_aniversario_grava_o_campo_da_pessoa(banco):
    from agents.komi import tools as K
    pid = _pessoa("Bia")
    r = K.add_important_date(pid, "Aniversário", "05-15")                          # sem ano
    assert r["status"] == "ok" and r["id"] is None
    assert _sql("SELECT birth_day, birth_month, birth_year FROM people WHERE id=%s", (pid,), um=True) == (15, 5, None)
    K.add_important_date(pid, "aniversario", "1998-05-15")                         # com ano
    assert _sql("SELECT birth_year FROM people WHERE id=%s", (pid,), um=True)[0] == 1998
    assert _sql("SELECT count(*) FROM person_dates", um=True)[0] == 0              # nada em person_dates


@pytestmark_db
def test_outras_datas_continuam_em_person_dates_com_lembrete_proprio(banco):
    from agents.komi import tools as K
    pid = _pessoa("Bia")
    namoro = K.add_important_date(pid, "aniversário de namoro", "2020-03-10")       # não é "o" aniversário
    assert namoro["status"] == "ok" and isinstance(namoro["id"], int)
    casamento = K.add_important_date(pid, "casamento", "06-20", remind_days_before=7)
    sem = K.add_important_date(pid, "formatura", "2019-12-01", recurring=False, remind_days_before=-1)
    rows = dict(_sql_all("SELECT label, remind_days_before FROM person_dates"))
    assert rows == {"aniversário de namoro": 1, "casamento": 7, "formatura": None}
    assert K.update_important_date(casamento["id"], remind_days_before=0)["status"] == "ok"
    assert K.update_important_date(sem["id"], remind_days_before=14)["status"] == "ok"
    assert K.update_important_date(sem["id"], remind_days_before=999)["status"] == "error"
    assert K.update_important_date(sem["id"])["status"] == "error"                  # nada a atualizar
    assert K.delete_important_date(namoro["id"])["status"] == "ok"
    assert K.delete_important_date(namoro["id"])["status"] == "error"
    perfil = K.get_person(pid)
    assert perfil["status"] == "ok" and {d["label"] for d in perfil["datas"]} == {"casamento", "formatura"}
    assert "is_synced" not in perfil["datas"][0] and "remind_days_before" in perfil["datas"][0]


def _sql_all(sql, params=None):
    from agents.db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


@pytestmark_db
def test_calendario_projeta_aniversarios_com_idade_e_lembrete(banco):
    bia = _pessoa("Bia", birth_day=15, birth_month=5, birth_year=1990, birthday_remind_days=1)
    sem_ano = _pessoa("Caio", birth_day=2, birth_month=1, birthday_remind_days=None)
    bis = _pessoa("Duda", birth_day=29, birth_month=2)
    _pessoa("Sem aniversário")
    ev = CP.list_calendar_events("2026-05-01", "2026-05-31")
    assert [(e["date"], e["title"], e["reminders"]) for e in ev] == [("2026-05-15", "🎂 aniversário — Bia (36 anos)", [900])]
    assert ev[0]["kind"] == "birthday" and ev[0]["ref_id"] == bia and ev[0]["deep_link"] == f"/people#pessoa/{bia}"
    # janela que cruza o ano: dez/2026 → jan/2027
    cruz = CP.list_calendar_events("2026-12-20", "2027-01-10")
    assert [(e["date"], e["title"]) for e in cruz] == [("2027-01-02", "🎂 aniversário — Caio")]
    assert "reminders" not in cruz[0]                                                # lembrete desligado
    # 29/02: ano comum cai em 28/02; ano bissexto fica em 29/02
    assert [e["date"] for e in CP.list_calendar_events("2027-02-01", "2027-02-28") if "Duda" in e["title"]] == ["2027-02-28"]
    assert [e["date"] for e in CP.list_calendar_events("2028-02-01", "2028-02-29") if "Duda" in e["title"]] == ["2028-02-29"]
    assert sem_ano and bis


@pytestmark_db
def test_calendario_outras_datas_recorrentes_e_unicas_e_ignora_excluidos(banco):
    from agents.komi import tools as K
    ana = _pessoa("Ana")
    K.add_important_date(ana, "casamento", "2018-06-20", remind_days_before=2)
    K.add_important_date(ana, "formatura", "2019-12-01", recurring=False)
    fantasma = _pessoa("Fantasma", birth_day=10, birth_month=6)
    K.delete_person(fantasma)
    ev = CP.list_calendar_events("2026-06-01", "2026-06-30")
    assert [(e["date"], e["title"], e["kind"], e.get("reminders")) for e in ev] == [("2026-06-20", "📅 casamento — Ana", "person-date", [2340])]
    assert CP.list_calendar_events("2019-12-01", "2019-12-31")[0]["title"] == "📅 formatura — Ana"   # única: só no dia
    assert CP.list_calendar_events("2020-12-01", "2020-12-31") == []


@pytestmark_db
def test_upcoming_birthdays_janela_ordem_idade_e_ideias_de_presente(banco):
    from agents.komi import tools as K
    hoje = _pessoa("Bia", birth_day=18, birth_month=10, birth_year=1990)
    amanha = _pessoa("Caio", birth_day=19, birth_month=10)
    longe = _pessoa("Duda", birth_day=1, birth_month=12)
    bis = _pessoa("Edu", birth_day=29, birth_month=2, birth_year=2000)
    trabalho = _pessoa("Chefe", birth_day=20, birth_month=10, context="work")
    for kind, txt in [("presente", "orquídea"), ("presente", "livro"), ("presente", "vinho"), ("presente", "meia"), ("gosta", "café")]:
        _sql("INSERT INTO person_notes (person_id, kind, text, text_norm) VALUES (%s,%s,%s,%s)", (hoje, kind, txt, txt))
    _sql("INSERT INTO person_notes (person_id, kind, text, text_norm, status) VALUES (%s,'presente','sugestão da IA','x','sugerida')", (hoje,))
    _sql("INSERT INTO person_notes (person_id, kind, text, text_norm, deleted) VALUES (%s,'presente','apagada','y',TRUE)", (hoje,))

    r = K.upcoming_birthdays(days=7, today="2026-10-18")
    assert r["status"] == "ok"
    assert [(b["name"], b["in_days"]) for b in r["birthdays"]] == [("Bia", 0), ("Caio", 1), ("Chefe", 2)]
    bia = r["birthdays"][0]
    assert bia["turning"] == 36 and bia["date"] == "2026-10-18"
    assert len(bia["gift_ideas"]) == 3 and set(bia["gift_ideas"]) <= {"orquídea", "livro", "vinho", "meia"}   # no máximo 3
    assert "sugestão da IA" not in bia["gift_ideas"] and "apagada" not in bia["gift_ideas"]                  # só notas ativas
    assert bia["likes"] == ["café"] and r["birthdays"][1]["turning"] is None
    assert [b["name"] for b in K.upcoming_birthdays(days=0, today="2026-10-18")["birthdays"]] == ["Bia"]
    assert [b["name"] for b in K.upcoming_birthdays(days=7, space="personal", today="2026-10-18")["birthdays"]] == ["Bia", "Caio"]
    assert [b["name"] for b in K.upcoming_birthdays(days=7, space="work", today="2026-10-18")["birthdays"]] == ["Chefe"]
    # 29/02 em ano comum: comemora em 28/02 e completa 27 anos
    fev = K.upcoming_birthdays(days=2, today="2027-02-27")["birthdays"]
    assert [(b["name"], b["date"], b["turning"]) for b in fev] == [("Edu", "2027-02-28", 27)]
    assert K.upcoming_birthdays(days=7, today="amanhã")["status"] == "error"
    assert longe and amanha and trabalho and bis


# ── 3. ponte da Kaguya (sem banco) ───────────────────────────────────────────

def test_titulo_vira_nome_da_pessoa():
    from agents.kaguya.birthdays import person_name_from_title as nome
    assert nome("Aniversário da Bia") == "Bia"
    assert nome("aniversario do João Silva") == "João Silva"
    assert nome("ANIVERSÁRIO DE Ana") == "Ana"
    assert nome("Bia") == "Bia" and nome(None) == "" and nome("  ") == ""


@pytest.fixture
def komi_simulada(monkeypatch):
    """Troca resolve_person/update_person da Komi por simulações, para testar a ponte sem banco."""
    import agents.komi.integration as I
    import agents.komi.tools as K
    estado = {"update": [], "resolve": {}}

    def resolve(texto, space=None):
        return estado["resolve"].get(texto, {"status": "ok", "match": "none", "people": [], "person": None})

    def update(pid, **campos):
        estado["update"].append((pid, campos))
        return estado.get("update_resultado", {"status": "ok"})

    monkeypatch.setattr(I, "resolve_person", resolve)
    monkeypatch.setattr(K, "update_person", update)
    return estado


def test_ponte_exige_data_valida_e_uma_pessoa_so(komi_simulada):
    from agents.kaguya.birthdays import register_birthday as reg
    assert reg("Aniversário da Bia", None)["status"] == "error"
    assert "inválida" in reg("Aniversário da Bia", "15/05")["message"]
    assert "uma pessoa só" in reg("x", "2026-05-15", ["a", "b"])["message"]
    assert "de quem" in reg("   ", "2026-05-15")["message"]
    assert komi_simulada["update"] == []


def test_ponte_resolve_pela_regra_zero_um_varios(komi_simulada):
    from agents.kaguya.birthdays import register_birthday as reg
    komi_simulada["resolve"]["Bia"] = {"status": "ok", "match": "one", "people": [{"id": "p1", "name": "Beatriz"}], "person": {"id": "p1", "name": "Beatriz"}}
    ok = reg("Aniversário da Bia", "2026-05-15")
    assert ok["status"] == "ok" and ok["id"] is None and ok["person_id"] == "p1"
    assert "Beatriz" in ok["message"] and "15/05" in ok["message"] and "nenhuma tarefa" in ok["message"]
    assert komi_simulada["update"] == [("p1", {"birth_day": 15, "birth_month": 5})]       # o ano da due_date NÃO é o de nascimento

    assert "Cadastre" in reg("Aniversário do Zé", "2026-05-15")["message"]                 # ninguém → oferecer cadastro
    komi_simulada["resolve"]["Ana"] = {"status": "ok", "match": "many", "people": [{"id": "1", "name": "Ana Lima"}, {"id": "2", "name": "Ana Souza"}], "person": None}
    muitos = reg("Aniversário da Ana", "2026-05-15")
    assert muitos["status"] == "error" and "Ana Lima" in muitos["message"] and "Qual" in muitos["message"]
    assert len(komi_simulada["update"]) == 1                                               # nunca grava na pessoa errada


def test_ponte_com_person_ids_e_repassa_erro_da_komi(komi_simulada):
    from agents.kaguya.birthdays import register_birthday as reg
    assert reg("qualquer", "2026-05-15", ["p9"])["person_id"] == "p9"
    komi_simulada["update_resultado"] = {"status": "error", "message": "Pessoa não encontrada ou já excluída."}
    assert reg("qualquer", "2026-05-15", ["p9"]) == {"status": "error", "message": "Pessoa não encontrada ou já excluída."}


def test_create_task_aniversario_nao_cria_tarefa_e_update_task_recusa(monkeypatch):
    """Sem banco: o aniversário é desviado ANTES de qualquer acesso ao banco."""
    import agents.kaguya.birthdays as B
    import agents.kaguya.tools_tasks as T
    monkeypatch.setattr(B, "register_birthday", lambda title, due, ids=None: {"status": "ok", "id": None, "message": "na Komi"})
    assert T.create_task("Aniversário da Bia", type="birthday", due_date="2026-05-15") == {"status": "ok", "id": None, "message": "na Komi"}
    r = T.update_task(1, type="birthday")
    assert r["status"] == "error" and "Komi" in r["message"]


@pytestmark_db
def test_overview_traz_nomes_espaco_aniversario_e_datas_com_lembrete(banco):
    from agents.komi import tools as K
    pid = _pessoa("Beatriz", nickname="Bia", full_name="Beatriz Silva", context="both", birth_day=15, birth_month=5)
    K.add_important_date(pid, "casamento", "2018-06-20", remind_days_before=3)
    p = K.get_people_overview()["people"][0]
    assert (p["name"], p["nickname"], p["full_name"], p["context"]) == ("Beatriz", "Bia", "Beatriz Silva", "both")
    assert (p["birth_day"], p["birth_month"], p["birth_year"], p["birthday_remind_days"]) == (15, 5, None, 1)
    assert p["dates"] == [{"label": "casamento", "date": "2018-06-20", "recurring": True, "remind_days_before": 3}]
