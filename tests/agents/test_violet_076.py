"""Testes dos motores puros da Violet no Design System (spec 076) — sem banco.

Cobre: marcação do texto (tokens de pessoa/referência, @ legado, #tags), resolução de texto
livre do chat, força da escrita (mesmo motor dos hábitos), padrões emocionais, diagnóstico da
Avaliação dos Valores, citações honestas e RAG amplo da IA da Violet, e as semanas da
Revisão semanal.

Como rodar:
    pytest tests/agents/test_violet_076.py -v
"""

from datetime import date, timedelta

import pytest

from agents.journal import markup
from agents.journal import references as R
from agents.journal import strength as S
from agents.journal import emotion_patterns as EP
from agents.journal import values_diagnosis as VD
from agents.kaguya import habit_strength as HS


# ─── markup ─────────────────────────────────────────────────────────────────────

def test_parse_token_de_pessoa_e_referencia():
    p = markup.parse("hoje assisti [Matrix](akane:movie:abc-1) com a @[Ana Lima](komi:9f2) #cinema")
    assert p.people == (markup.PersonMention("Ana Lima", "9f2"),)
    assert p.refs == (markup.Reference("Matrix", "akane", "movie", "abc-1"),)
    assert p.tags == ("cinema",)


def test_parse_legado_e_tag_com_hifen():
    p = markup.parse("falei com @Ana e @João sobre #vida-adulta e #vida-adulta.")
    assert [x.name for x in p.people] == ["Ana", "João"]
    assert all(x.person_id is None for x in p.people)
    assert p.tags == ("vida-adulta",)


def test_parse_nao_confunde_email_nem_token():
    p = markup.parse("mande para ana@mail.com e @[Bia](komi:2)")
    assert [x.name for x in p.people] == ["Bia"]


def test_link_markdown_comum_nao_vira_referencia():
    assert markup.parse("[site](https://x.com)").refs == ()


def test_plain_text_e_word_count():
    t = "vi [Matrix Reloaded](akane:movie:1) com @[Ana Lima](komi:2)"
    assert markup.plain_text(t) == "vi Matrix Reloaded com @Ana Lima"
    assert markup.word_count(t) == 6


def test_tokens_escapam_colchetes():
    assert markup.person_token("Ana [trabalho]", "7") == "@[Ana (trabalho)](komi:7)"
    assert markup.ref_token("A [b]", "kaguya", "task", 3) == "[A (b)](kaguya:task:3)"


# ─── references ─────────────────────────────────────────────────────────────────

def test_provider_por_alias():
    assert R.provider_for("k").key == "kaguya"
    assert R.provider_for("Série").key == "mai"
    assert R.provider_for("nada") is None


def test_resolve_free_text_resolve_titulo_exato_e_pessoa(monkeypatch):
    filmes = [{"id": "m1", "label": "Matrix", "entity_type": "movie"},
              {"id": "m2", "label": "Matrix Reloaded", "entity_type": "movie"}]
    akane = R.provider_for("akane")
    monkeypatch.setattr(R, "PROVIDERS", tuple(
        R.Provider(p.key, p.aliases, p.label, p.hint,
                   (lambda q, n: [f for f in filmes if q.lower() in f["label"].lower()]) if p.key == "akane" else p.search)
        for p in R.PROVIDERS))
    assert akane  # sanity

    def pessoa(nome):
        return [{"id": "p1", "name": "Fulana"}] if nome.lower() == "fulana" else []

    out = R.resolve_free_text("hoje assisti /akane Matrix com a @Fulana no cinema", pessoa)
    assert out["content"] == "hoje assisti [Matrix](akane:movie:m1) com a @[Fulana](komi:p1) no cinema"
    assert out["ambiguous"] == []


def test_resolve_free_text_ambiguo_fica_como_esta(monkeypatch):
    monkeypatch.setattr(R, "PROVIDERS", tuple(
        R.Provider(p.key, p.aliases, p.label, p.hint, (lambda q, n: []) if p.key == "akane" else p.search)
        for p in R.PROVIDERS))
    out = R.resolve_free_text("vi /akane Filme Inexistente ontem", lambda n: [])
    assert out["content"] == "vi /akane Filme Inexistente ontem"
    assert out["ambiguous"][0]["kind"] == "ref"


def test_resolve_free_text_pessoa_homonima_nao_vincula():
    out = R.resolve_free_text("com @Ana", lambda n: [{"id": 1, "name": "Ana A"}, {"id": 2, "name": "Ana B"}])
    assert out["content"] == "com @Ana"
    assert out["ambiguous"] == [{"kind": "person", "text": "Ana"}]


# ─── força da escrita ───────────────────────────────────────────────────────────

def test_forca_igual_ao_motor_dos_habitos():
    hoje = date(2026, 10, 12)
    feitas = {hoje - timedelta(days=i) for i in range(0, 40, 2)}
    resumo = S.summarize(feitas, 5, hoje, days=30)
    assert resumo["consistency"] == HS.summary(feitas, 5, today=hoje)["consistency"]
    assert len(resumo["series"]) == 30
    assert resumo["series"][-1]["date"] == hoje.isoformat()


def test_forca_nao_zera_com_um_dia_perdido():
    hoje = date(2026, 10, 12)
    feitas = {hoje - timedelta(days=i) for i in range(1, 60)}  # escreveu todo dia menos hoje
    assert S.summarize(feitas, 7, hoje, days=1)["consistency"] > 80


# ─── padrões emocionais ─────────────────────────────────────────────────────────

def _log(i, d, emo, inten, **kw):
    return {"id": i, "date": d, "emotion_name": emo, "intensity": inten, "created_at": f"{d}T23:00:00+00:00", **kw}


def test_padroes_gatilho_por_pessoa():
    d1, d2, d3, d4 = "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"
    logs = [_log(1, d1, "raiva", 8), _log(2, d2, "raiva", 9), _log(3, d3, "tristeza", 3), _log(4, d4, "tristeza", 2)]
    ctx = {date.fromisoformat(d1): {"people": {"Chefe"}}, date.fromisoformat(d2): {"people": {"Chefe"}}}
    achados = EP.analyze(logs, ctx)
    trig = [a for a in achados if a["kind"] == "trigger"]
    assert trig and trig[0]["title"].startswith("Quando @Chefe")
    assert set(trig[0]["evidence"]) == {1, 2}


def test_padroes_sem_registros_nao_inventa():
    assert EP.analyze([]) == []


def test_padroes_registros_pesados_sem_resposta():
    logs = [_log(1, "2026-10-01", "medo", 8), _log(2, "2026-10-02", "medo", 9)]
    ids = [a["id"] for a in EP.analyze(logs)]
    assert "reappraisal:missing" in ids


def test_resumo_alivio_medio():
    logs = [_log(1, "2026-10-01", "medo", 8, reappraised_intensity=4, adaptive_response="x"),
            _log(2, "2026-10-02", "medo", 6, reappraised_intensity=5, adaptive_response="y")]
    s = EP.summarize(logs, date(2026, 10, 2), days=7)
    assert s["avg_relief"] == 2.5 and s["total"] == 2 and len(s["series"]) == 7


# ─── valores ────────────────────────────────────────────────────────────────────

def _area(key, **kw):
    return {"domain_key": key, "skipped": False, **kw}


def test_area_de_alerta():
    a = _area("saude", importance_now=9, importance_general=7, satisfaction=3, concern=8, action=2, possibility=8)
    b = _area("lazer", importance_now=5, importance_general=6, satisfaction=3, concern=9, action=2, possibility=8)
    diag = VD.diagnose([a, b, {"domain_key": "arte", "skipped": True}])
    assert diag["alerts"] == ["saude"]
    assert diag["ranked"][0]["domain_key"] == "saude"
    assert all(r["domain_key"] != "arte" for r in diag["ranked"])


def test_dicas_de_texto():
    assert VD.text_hints("familia", "quero ser um bom marido")
    assert any("objetivo" in h for h in VD.text_hints("carreira", "quero ser promovido"))
    assert VD.text_hints("amizades", "ser presente e leal") == []


def test_checkin_trend():
    t = VD.checkin_trend([
        {"week_start": "2026-09-21", "domain_key": "saude", "action": 3, "satisfaction": 3},
        {"week_start": "2026-09-28", "domain_key": "saude", "action": 4, "satisfaction": 3},
        {"week_start": "2026-10-05", "domain_key": "saude", "action": 7, "satisfaction": 6},
    ])
    assert t["saude"]["trend"] == "up"


# ─── IA da Violet (partes puras) ────────────────────────────────────────────────

def test_normalizar_citacoes_valida_e_agrupa_por_nota():
    from agents.kurisu import violet_ai as AI
    trechos = [{"fonte": "ansiedade.md", "uri": "gs://w/ansiedade.md#1"},
               {"fonte": "ansiedade.md", "uri": "gs://w/ansiedade.md#2"},
               {"fonte": "habitos-atomicos.md", "uri": "gs://w/habitos.md"}]
    texto, fontes = AI.normalizar_citacoes("A [1] e [2, 3] mas não [9].", trechos)
    assert texto == "A [1] e [1, 2] mas não."
    assert [f["titulo"] for f in fontes] == ["Ansiedade", "Habitos atomicos"]


def test_merge_trechos_teto_por_nota_e_intercalado():
    from agents.kurisu import violet_ai as AI
    l1 = [{"fonte": "a.md", "uri": f"a{i}"} for i in range(4)]
    l2 = [{"fonte": "b.md", "uri": "b0"}, {"fonte": "c.md", "uri": "c0"}]
    out = AI.merge_trechos([l1, l2])
    assert [t["uri"] for t in out] == ["a0", "b0", "a1", "c0"]


def test_penalizar_repetidas_vai_para_o_fim():
    from agents.kurisu import violet_ai as AI
    ts = [{"fonte": "a.md", "uri": "u1"}, {"fonte": "b.md", "uri": "u2"}]
    assert [t["uri"] for t in AI.penalizar_repetidas(ts, {"u1"})] == ["u2", "u1"]


# ─── revisão semanal ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("hoje,esperado", [
    (date(2026, 10, 11), date(2026, 10, 5)),   # domingo → a semana corrente
    (date(2026, 10, 12), date(2026, 10, 5)),   # segunda → a semana que acabou
    (date(2026, 10, 15), date(2026, 10, 5)),
])
def test_semana_da_revisao(hoje, esperado):
    from agents.kurisu.weekly_review import last_closed_week
    assert last_closed_week(hoje)[0] == esperado
