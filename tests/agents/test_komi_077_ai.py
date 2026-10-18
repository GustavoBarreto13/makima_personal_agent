"""Spec 077 · Fase 4 — resumo por IA (Kurisu), briefing e estatísticas da Komi.

A IA é sempre substituída por uma função falsa (nenhum teste usa a rede). Cobre a regra de honestidade
(ponto sem fonte válida é descartado), o cache pela "impressão digital" da Memória, o ciclo das
sugestões (nunca ativas sozinhas) e o formato do ``StatsPayload``.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_ai.py -v
"""

import os
from datetime import date, timedelta

import pytest

from agents.komi import integration as I
from agents.komi import tools_stats as S
from agents.kurisu import person_summary as P


# ── funções puras ────────────────────────────────────────────────────────────

def _item(n, ctx="personal", **extra):
    return {"entity_type": "task", "entity_id": str(n), "agent": "kaguya", "label": "Tarefas", "icon": "task",
            "title": f"Item {n}", "snippet": None, "date": f"2026-10-0{n}", "deep_link": f"/tasks#tarefa/{n}", "context": ctx, **extra}


def test_normalizar_descarta_o_que_a_memoria_nao_sustenta():
    itens = [_item(1), _item(2, "work")]
    r = P.normalizar({
        "resumo": "  Amiga próxima.  ",
        "pontos": [
            {"texto": "Gosta de café", "fontes": [1]},
            {"texto": "Sem fonte", "fontes": []},                           # nenhuma fonte → cai
            {"texto": "Fonte inventada", "fontes": [9, 0, -1, True]},       # números inexistentes (e bool) → cai
            {"texto": "gosta de CAFÉ", "fontes": [2]},                      # repetido (ignora caixa) → cai
            {"texto": "Misto", "fontes": [2, 9, 2]},                        # só o 2 vale, uma vez
            "lixo",
        ],
        "pendencias": [{"texto": "Devolver o livro", "fontes": [1, 2]}],
        "sugestoes": [{"tipo": "presente", "texto": "orquídea", "fontes": [1]}, {"tipo": "xyz", "texto": "algo", "fontes": [2]}],
    }, itens)
    assert r["resumo"] == "Amiga próxima."
    assert [p["texto"] for p in r["pontos"]] == ["Gosta de café", "Misto"]
    assert [f["entity_id"] for f in r["pontos"][1]["fontes"]] == ["2"]
    assert r["pontos"][0]["fontes"][0]["deep_link"] == "/tasks#tarefa/1"
    assert [f["entity_id"] for f in r["pendencias"][0]["fontes"]] == ["1", "2"]
    assert [(s["tipo"], s["texto"]) for s in r["sugestoes"]] == [("presente", "orquídea"), ("nota", "algo")]   # tipo ruim → nota


def test_normalizar_respeita_limites_e_resposta_vazia():
    itens = [_item(1)]
    muitos = [{"texto": f"ponto {i}", "fontes": [1]} for i in range(30)]
    r = P.normalizar({"resumo": "x", "pontos": muitos, "pendencias": muitos, "sugestoes": []}, itens)
    assert (len(r["pontos"]), len(r["pendencias"])) == (P.LIMITES["pontos"], P.LIMITES["pendencias"])
    assert P.normalizar({}, itens) == {"resumo": "", "pontos": [], "pendencias": [], "sugestoes": []}


def test_prompt_numera_os_registros_e_nao_manda_o_texto_inteiro():
    itens = [_item(1, snippet="x" * 500), _item(2, "work")]
    prompt = P.montar_prompt({"name": "Beatriz", "nickname": "Bia", "relationship": "amiga"}, itens,
                             [{"kind": "gosta", "text": "orquídeas"}], date(2026, 10, 18), "work")
    assert "[1] Tarefas · 2026-10-01 · pessoal — Item 1 — " + "x" * P._MAX_TRECHO + "\n" in prompt
    assert "x" * (P._MAX_TRECHO + 1) not in prompt                       # trecho cortado
    assert "[2] Tarefas · 2026-10-02 · trabalho — Item 2" in prompt
    assert "Beatriz (apelido: Bia)" in prompt and "Relação: amiga." in prompt
    assert "- (gosta) orquídeas" in prompt and "só o trabalho" in prompt and "2026-10-18" in prompt


def test_espaco_da_sugestao_vem_da_maioria_das_fontes():
    assert P._contexto_da_sugestao([{"context": "work"}, {"context": "work"}, {"context": "personal"}]) == "work"
    assert P._contexto_da_sugestao([{"context": "work"}, {"context": "personal"}]) == "personal"       # empate = pessoal


def test_impressao_digital_nao_depende_da_ordem_e_muda_com_o_conteudo():
    a, b = _item(1), _item(2)
    assert I.memory_fingerprint([a, b]) == I.memory_fingerprint([b, a])
    assert I.memory_fingerprint([a]) != I.memory_fingerprint([a, b])
    assert I.memory_fingerprint([]) == I.memory_fingerprint([])


def test_stats_periodo_sequencias_e_aniversarios_na_janela():
    assert S.period_bounds(2025, None, date(2026, 10, 18)) == (date(2025, 1, 1), date(2025, 12, 31), date(2024, 1, 1), date(2024, 12, 31))
    assert S.period_bounds(2024, 2, date(2026, 1, 1))[1] == date(2024, 2, 29)
    assert S.period_bounds(2026, None, date(2026, 2, 28))[3] == date(2025, 2, 28)
    assert S.compute_streaks(["2026-10-15", "2026-10-16", "2026-10-17"], date(2026, 10, 18)) == {"best": 3, "current": 3}
    assert S.compute_streaks(["2026-10-10", "2026-10-11", "2026-10-15"], date(2026, 10, 18)) == {"best": 2, "current": 0}
    assert S.compute_streaks([], date(2026, 10, 18)) == {"best": 0, "current": 0}
    gente = [{"id": "a", "name": "Bia", "birth_day": 29, "birth_month": 2, "birth_year": 2000},
             {"id": "b", "name": "Caio", "birth_day": 1, "birth_month": 3, "birth_year": None}]
    assert [(x["name"], x["date"], x["turning"]) for x in S.birthdays_in_window(gente, date(2027, 2, 1), date(2027, 3, 31))] == \
        [("Bia", "2027-02-28", 27), ("Caio", "2027-03-01", None)]


# ── com banco ────────────────────────────────────────────────────────────────

pytestmark_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")


@pytest.fixture
def banco():
    from tests.agents.komi_testing import reset_komi_schema
    reset_komi_schema()
    I.reset_providers()
    I._cache_descobertos = {}
    yield
    I.reset_providers()
    reset_komi_schema()


def _pessoa(nome, **extra):
    from agents.komi import tools as K
    r = K.create_person(nome, **extra)
    assert r["status"] == "ok", r
    return r["id"]


def _sql(sql, params=None, um=False, todas=False):
    from agents.db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        if um:
            return cur.fetchone()
        if todas:
            return cur.fetchall()


def _agentes_falsos(itens_por_id: dict):
    """Registra um agente falso cujos itens vêm de `itens_por_id` ({entity_id: item})."""
    I.register_link_type({
        "entity_type": "task", "agent": "kaguya", "label": "Tarefas", "icon": "task",
        "resolve": lambda ids: [itens_por_id[i] for i in ids if i in itens_por_id],
    })


def _ligar(pid, *ids):
    from agents.db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        for i in ids:
            I.link_people(cur, "task", i, [pid])


class LLM:
    """IA falsa: devolve o que o teste mandar e guarda os prompts recebidos."""

    def __init__(self, resposta=None, erro=None):
        self.resposta, self.erro, self.prompts, self.modelos = resposta, erro, [], []

    def __call__(self, prompt, schema, usage=None, temperature=None, model=None):
        self.prompts.append(prompt)
        self.modelos.append(model)
        if self.erro:
            raise self.erro
        return self.resposta


RESPOSTA = {
    "resumo": "Amiga próxima, vocês combinam muita coisa.",
    "pontos": [{"texto": "Gosta de orquídeas", "fontes": [1]}],
    "pendencias": [{"texto": "Enviar o relatório", "fontes": [2]}],
    "sugestoes": [{"tipo": "presente", "texto": "uma orquídea", "fontes": [1]},
                  {"tipo": "nota", "texto": "prefere reunião curta", "fontes": [2]}],
}


@pytestmark_db
def test_resumo_vazio_nao_chama_a_ia(banco):
    pid = _pessoa("Ana")
    llm = LLM(RESPOSTA)
    r = P.gerar_resumo(pid, llm=llm)
    assert r["status"] == "ok" and r["empty"] is True and llm.prompts == []
    assert P.gerar_resumo("nao-existe", llm=llm)["status"] == "error"
    assert P.gerar_resumo(pid, context="lua", llm=llm)["status"] == "error"
    assert P.resumo_da_pessoa(pid) == {"status": "ok", "summary": None, "stale": None, "generated_at": None}


@pytestmark_db
def test_resumo_gera_guarda_cria_sugestoes_e_usa_cache(banco):
    from agents.komi import tools_notes as TN
    pid = _pessoa("Ana", context="both")
    _agentes_falsos({"1": _item(1, "personal", entity_id="1"), "2": _item(2, "work", entity_id="2")})
    _ligar(pid, "1", "2")
    llm = LLM(RESPOSTA)

    r = P.gerar_resumo(pid, llm=llm)
    assert r["status"] == "ok" and r["cached"] is False and r["suggestions_created"] == 2
    assert len(llm.prompts) == 1 and llm.modelos == [P.KOMI_MODEL]
    assert [p["texto"] for p in r["summary"]["pontos"]] == ["Gosta de orquídeas"]
    # Mais recente primeiro: o item 2 vira [1] no prompt e o 1 vira [2] — as fontes seguem a ordem do prompt
    assert r["summary"]["pontos"][0]["fontes"][0]["entity_id"] == "2"

    # as sugestões entram como "sugerida" (nunca ativa), com a origem
    notas = TN.list_person_notes(pid)["notes"]
    assert {n["status"] for n in notas} == {"sugerida"} and {n["source"] for n in notas} == {"ia"}
    presente = next(n for n in notas if n["kind"] == "presente")
    assert presente["source_refs"][0]["title"] and presente["source_refs"][0]["entity_type"] == "task"
    assert {n["context"] for n in notas} == {"personal", "work"}                  # espaço pela fonte

    # mesma Memória → cache, sem chamar a IA
    again = P.gerar_resumo(pid, llm=llm)
    assert again["cached"] is True and len(llm.prompts) == 1 and again["suggestions_created"] == 0
    assert P.resumo_da_pessoa(pid)["stale"] is False
    assert P.gerar_resumo(pid, force=True, llm=llm)["cached"] is False and len(llm.prompts) == 2


@pytestmark_db
def test_resumo_fica_desatualizado_quando_a_memoria_muda_e_descartada_nao_volta(banco):
    from agents.komi import tools_notes as TN
    pid = _pessoa("Ana")
    base = {"1": _item(1, entity_id="1"), "2": _item(2, entity_id="2")}
    _agentes_falsos(base)
    _ligar(pid, "1", "2")
    llm = LLM(RESPOSTA)
    P.gerar_resumo(pid, llm=llm)
    descartada = next(n for n in TN.list_person_notes(pid)["notes"] if n["text"] == "uma orquídea")
    TN.dismiss_person_note(descartada["id"])

    base["3"] = _item(3, entity_id="3")                                           # nasce um item novo na Memória
    _ligar(pid, "3")
    assert P.resumo_da_pessoa(pid)["stale"] is True
    r = P.gerar_resumo(pid, llm=llm)
    assert r["cached"] is False and len(llm.prompts) == 2
    assert "uma orquídea" not in [n["text"] for n in TN.list_person_notes(pid)["notes"]]        # descartada não volta
    assert P.resumo_da_pessoa(pid)["stale"] is False


@pytestmark_db
def test_falha_da_ia_nao_grava_nada(banco):
    from agents.komi import tools_notes as TN
    from agents.kurisu.violet_ai import VioletAIError
    pid = _pessoa("Ana")
    _agentes_falsos({"1": _item(1, entity_id="1")})
    _ligar(pid, "1")
    r = P.gerar_resumo(pid, llm=LLM(erro=VioletAIError("IA fora do ar")))
    assert r == {"status": "error", "message": "IA fora do ar"}
    assert _sql("SELECT count(*) FROM person_memory_summaries", um=True)[0] == 0
    assert TN.list_person_notes(pid)["notes"] == []


@pytestmark_db
def test_resumo_so_do_trabalho_manda_so_itens_e_anotacoes_de_trabalho(banco):
    from agents.komi import tools_notes as TN
    pid = _pessoa("Ana", context="both")
    _agentes_falsos({"1": _item(1, "personal", entity_id="1"), "2": _item(2, "work", entity_id="2")})
    _ligar(pid, "1", "2")
    TN.add_person_note(pid, "segredo pessoal", context="personal")
    TN.add_person_note(pid, "prefere e-mail", context="work")
    llm = LLM({"resumo": "x", "pontos": [], "pendencias": [], "sugestoes": [{"tipo": "nota", "texto": "usa Slack", "fontes": [1]}]})
    r = P.gerar_resumo(pid, context="work", llm=llm)
    assert "Item 2" in llm.prompts[0] and "Item 1" not in llm.prompts[0]
    assert "prefere e-mail" in llm.prompts[0] and "segredo pessoal" not in llm.prompts[0]
    assert r["suggestions_created"] == 1 and TN.list_person_notes(pid, status="sugerida")["notes"][0]["context"] == "work"
    assert P.resumo_da_pessoa(pid, "work")["summary"] is not None and P.resumo_da_pessoa(pid, "personal")["summary"] is None


# ── briefing ─────────────────────────────────────────────────────────────────

@pytestmark_db
def test_briefing_junta_tudo_e_isola_blocos_que_falham(banco):
    from agents.komi import briefing as B, tools as K, tools_interactions as TI, tools_notes as TN, tools_relations as R
    hoje = date.today()
    amanha = hoje + timedelta(days=1)
    pid = _pessoa("Beatriz", nickname="Bia", category="amigos", birth_day=amanha.day, birth_month=amanha.month, birth_year=1990)
    outro = _pessoa("João")
    TN.add_person_note(pid, "gosta de orquídeas", kind="gosta")
    TN.add_person_note(pid, "livro de poesia", kind="presente")
    TN.save_suggestions(pid, [{"kind": "nota", "text": "nova ideia"}])
    TI.log_interaction(pid, kind="ligacao", happened_at=(hoje - timedelta(days=10)).isoformat(), note="combinar viagem")
    K.add_important_date(pid, "casamento", (hoje + timedelta(days=20)).isoformat(), recurring=False)
    K.add_important_date(pid, "formatura", (hoje + timedelta(days=200)).isoformat(), recurring=False)     # longe demais
    R.relate_people(pid, outro, "irmao")
    g = R.create_group("Turma")["id"]; R.add_to_group(g, pid)
    I.register_link_type({"entity_type": "transaction", "agent": "nami", "label": "Finanças", "icon": "money",
                          "resolve": lambda ids: [], "summary_key": "financas",
                          "summary": lambda p: {"saldo": -150.0, "transacoes": []}})
    I.register_link_type({"entity_type": "task", "agent": "kaguya", "label": "Tarefas", "icon": "task",
                          "resolve": lambda ids: [], "summary_key": "tarefas",
                          "summary": lambda p: (_ for _ in ()).throw(RuntimeError("Kaguya fora"))})        # falha isolada
    b = B.get_person_briefing(pid)
    assert b["status"] == "ok" and b["perfil"]["name"] == "Beatriz" and b["perfil"]["category_label"] == "Amigos"
    assert b["birthday"]["in_days"] == 1 and b["birthday"]["turning"] == amanha.year - 1990
    assert [d["label"] for d in b["dates"]] == ["casamento"]
    assert set(b["notes"]) == {"gosta", "presente"} and b["suggestions_pending"] == 1
    assert b["pending"] == {"balance": -150.0, "open_tasks": 0, "waiting": []}                              # Kaguya caiu → padrão
    assert b["contact"]["days_since"] == 10 and b["contact"]["last"]["kind"] == "interação"
    assert [x["note"] for x in b["contact"]["recent_interactions"]] == ["combinar viagem"]
    assert [(r["other_name"], r["kind"]) for r in b["relations"]] == [("João", "irmao")]
    assert [x["name"] for x in b["groups"]] == ["Turma"]
    assert b["ai"] is None
    assert B.get_person_briefing("nao-existe")["status"] == "error"


@pytestmark_db
def test_briefing_traz_o_resumo_de_ia_e_diz_se_esta_velho(banco):
    from agents.komi import briefing as B
    pid = _pessoa("Ana")
    base = {"1": _item(1, entity_id="1")}
    _agentes_falsos(base)
    _ligar(pid, "1")
    P.gerar_resumo(pid, llm=LLM({"resumo": "Resumo X", "pontos": [], "pendencias": [], "sugestoes": []}))
    assert B.get_person_briefing(pid)["ai"]["summary"]["resumo"] == "Resumo X" and B.get_person_briefing(pid)["ai"]["stale"] is False
    base["2"] = _item(2, entity_id="2")
    _ligar(pid, "2")
    assert B.get_person_briefing(pid)["ai"]["stale"] is True
    assert B.get_person_briefing(pid, check_stale=False)["ai"]["stale"] is None


# ── estatísticas ─────────────────────────────────────────────────────────────

@pytestmark_db
def test_estatisticas_do_ano_com_comparacao_rankings_e_quem_esta_sem_contato(banco):
    from agents.komi import tools_interactions as TI
    hoje = date.today()
    ana, bia, carlos = _pessoa("Ana"), _pessoa("Bia"), _pessoa("Carlos")
    proximo = hoje + timedelta(days=5)
    _pessoa("Duda", birth_day=proximo.day, birth_month=proximo.month, birth_year=2000)
    # 2025: Ana 3×(mensagem, ligacao, ligacao), Bia 1× em dia consecutivo; 2024: só 1
    for quando, pid, tipo in [("2025-03-10", ana, "mensagem"), ("2025-03-11", ana, "ligacao"), ("2025-03-11", bia, "ligacao"),
                              ("2025-07-01", ana, "ligacao"), ("2024-03-05", carlos, "encontro")]:
        TI.log_interaction(pid, kind=tipo, happened_at=quando)
    apagada = TI.log_interaction(ana, kind="outro", happened_at="2025-08-01")["id"]
    TI.delete_interaction(apagada)                                                            # apagada: fora da conta
    I.register_link_type({"entity_type": "task", "agent": "kaguya", "label": "Tarefas", "icon": "task", "resolve": lambda ids: []})
    from agents.db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        I.link_people(cur, "task", "t1", [ana, bia])
        I.link_people(cur, "weird_thing", "x", [ana])
        cur.execute("UPDATE person_links SET created_at = '2025-05-01 12:00-03'")             # as menções contam pela data do vínculo

    r = S.get_stats_payload(2025)
    assert r["status"] == "ok" and r["period"] == {"year": 2025, "month": None, "label": "2025"}
    kpis = {k["key"]: k for k in r["kpis"]}
    assert (kpis["interactions"]["value"], kpis["interactions"]["prev"]) == (4, 1)
    assert (kpis["people_contacted"]["value"], kpis["people_contacted"]["prev"]) == (2, 1)
    assert r["previous"] == {"label": "2024"}
    assert kpis["no_contact"]["value"] == 4                                                   # todo mundo está há +30 dias (ou nunca)
    assert [d for d in r["daily"] if d["date"] == "2025-03-11"] == [{"date": "2025-03-11", "value": 2}]
    meses = {m["month"]: m["value"] for m in r["monthly"]}
    assert (meses[3], meses[7], meses[8]) == (3, 1, 0) and r["monthlyUnit"] == "interações"
    rank = {k: [(i["label"], i["count"]) for i in v["items"]] for k, v in r["rankings"].items()}
    assert rank["kinds"] == [("Ligação", 3), ("Mensagem", 1)]
    assert rank["people"] == [("Ana", 3), ("Bia", 1)]
    assert rank["mentions"] == [("Tarefas", 2), ("Weird thing", 1)]                             # rótulo do provedor; senão o tipo
    assert [i[0] for i in rank["stale"]] == ["Carlos", "Bia", "Ana"]                          # mais dias primeiro; quem nunca falou (Duda) fica de fora
    assert {rec["label"] for rec in r["records"]} >= {"Maior sequência de contatos", "Mais contatada"}
    assert r["distribution"] == [] and r["first_year"] == 2024
    assert [m["title"] for m in r["moments"]] == ["Duda"] and "faz" in r["moments"][0]["subtitle"]
    assert next(k for k in r["kpis"] if k["key"] == "birthdays")["value"] == 1                  # o aniversário da Duda cai dentro de 2025

    mes = S.get_stats_payload(2025, 3)
    assert {k["key"]: k for k in mes["kpis"]}["interactions"]["value"] == 3 and mes["period"]["label"] == "Março de 2025"
    assert S.get_stats_payload(2025, 13)["status"] == "error"


@pytestmark_db
def test_estatisticas_sem_dados_nao_quebram(banco):
    r = S.get_stats_payload()
    assert r["status"] == "ok" and r["previous"] is None
    assert [k["value"] for k in r["kpis"]] == [0, 0, 0, 0] and r["rankings"] == {} and r["records"] == [] and r["moments"] == []
    assert all(k["prev"] is None for k in r["kpis"])
