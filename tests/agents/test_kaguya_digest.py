"""Testes de agents/kaguya/digest.py — remoção dos hábitos do digest matinal (spec 067).

Cobre só o contrato ESTÁTICO do módulo (o schema de resposta do Gemini e o texto do
prompt são atributos de módulo, sem custo de mock). `build_digest_context` e
`generate_suggestion` em si compõem 6+ dependências externas (DB, Google Calendar,
Gemini, RAG da Kurisu) — fora do escopo de um teste leve; a verificação de ponta a
ponta é manual (rodar `scripts/send_kaguya_digest.py` e conferir que a mensagem do
WhatsApp não tem mais a seção "🔁 Hábitos pendentes").
"""

from agents.kaguya import digest as D


def test_suggestion_schema_nao_aceita_habit():
    """O enum de `type` em _SUGGESTION_SCHEMA é só "task" — "habit" saiu (spec 067).

    Regressão direta: se alguém reintroduzir "habit" no enum, este teste quebra.
    """
    type_schema = D._SUGGESTION_SCHEMA["properties"]["items"]["items"]["properties"]["type"]
    assert type_schema["enum"] == ["task"]


def test_system_prompt_nao_menciona_habitos():
    """O prompt do Gemini não deve mais pedir para considerar hábitos na sugestão."""
    assert "hábito" not in D._SYSTEM_PROMPT.lower()
    assert "habit" not in D._SYSTEM_PROMPT.lower()


# ──────────────────────────────────────────────────────────────────────────────
# Spec 075 — trabalho só em dia de trabalho + tempo livre pela agenda real
# ──────────────────────────────────────────────────────────────────────────────
from datetime import date, time  # noqa: E402

from agents.kaguya import capacity as cap  # noqa: E402

_PREFS = {
    "work_days": [1, 2, 3, 4, 5], "work_start": time(9), "work_end": time(18),
    "lunch_start": time(12), "lunch_end": time(13), "lunch_is_free": False,
    "wake_time": time(7), "sleep_time": time(23),
}


def _task(tid, ctx, mins):
    return {"id": tid, "title": f"t{tid}", "context": ctx, "duration_min": mins,
            "due_date": None, "due_time": None, "priority": 0, "project_name": "p"}


def _build(monkeypatch, day, override=None):
    from agents.kaguya import digest as D
    from agents.kaguya import gcal, tools_filters, tools_schedule, tools_tasks

    monkeypatch.setattr(tools_tasks, "get_myday_prefs", lambda: {"hide_work": False})
    monkeypatch.setattr(tools_tasks, "list_tasks_today", lambda: {
        "overdue": [], "today": [_task(1, "work", 60), _task(2, "personal", 30)]})
    monkeypatch.setattr(tools_filters, "list_tasks_by_builtin", lambda key: [])
    monkeypatch.setattr(gcal, "list_events", lambda *a, **k: [])
    monkeypatch.setattr(tools_schedule, "get_day_schedule",
                        lambda d: cap.resolve_day_schedule(_PREFS, d, override))
    monkeypatch.setattr(D, "_recent_journal_notes", lambda today: [])
    monkeypatch.setattr(D, "_query_kurisu_context", lambda *a, **k: [])
    monkeypatch.setattr(D, "_upcoming_birthdays", lambda today, hide_work: [])   # hermético: sem Komi/banco
    return D.build_digest_context(day)


def test_digest_dia_util_inclui_trabalho_e_usa_tempo_livre_real(monkeypatch):
    ctx = _build(monkeypatch, date(2026, 6, 1))   # segunda
    assert ctx["is_work_day"] is True
    assert {t["id"] for t in ctx["today_tasks"]} == {1, 2}
    # 7–23h (960) − expediente 9–18 (540) = 420 geral; trabalho 540 − almoço 60 = 480
    assert ctx["free_time"]["general"]["livre_min"] == 420
    assert ctx["free_time"]["work"]["livre_min"] == 480
    assert ctx["capacity"]["livre_min"] == 900 and ctx["capacity"]["estimado_min"] == 90


def test_digest_fim_de_semana_omite_trabalho(monkeypatch):
    ctx = _build(monkeypatch, date(2026, 6, 6))   # sábado
    assert ctx["is_work_day"] is False
    assert [t["id"] for t in ctx["today_tasks"]] == [2]
    assert ctx["free_time"]["general"]["livre_min"] == 960


def test_digest_sabado_trabalhado_por_excecao_inclui_trabalho(monkeypatch):
    ctx = _build(monkeypatch, date(2026, 6, 6), override={"works": True, "work_start": None, "work_end": None})
    assert ctx["is_work_day"] is True
    assert {t["id"] for t in ctx["today_tasks"]} == {1, 2}


def test_digest_folga_no_meio_da_semana_omite_trabalho(monkeypatch):
    ctx = _build(monkeypatch, date(2026, 6, 2), override={"works": False, "work_start": None, "work_end": None})
    assert ctx["is_work_day"] is False and [t["id"] for t in ctx["today_tasks"]] == [2]


# ─── aniversários da Komi no digest (spec 077) ──────────────────────────────────

def test_digest_inclui_aniversarios_e_o_texto_mostra_ideias_de_presente(monkeypatch):
    from agents.kaguya import digest as D
    aniv = [{"name": "Bia", "in_days": 0, "date": "2026-06-01", "turning": 30, "gift_ideas": ["orquídea", "livro"], "likes": []},
            {"name": "Caio", "in_days": 3, "date": "2026-06-04", "turning": None, "gift_ideas": [], "likes": []}]
    ctx = _build_with_birthdays(monkeypatch, aniv)
    assert ctx["birthdays"] == aniv
    texto = D.build_whatsapp_digest(ctx, {"narrative": "", "items": [], "usage": {}})
    assert "🎂 <b>Aniversários</b>" in texto
    assert "Bia faz 30 anos hoje — ideias: orquídea; livro" in texto
    assert "Caio em 3 dias (04/06)" in texto


def _build_with_birthdays(monkeypatch, aniv):
    from agents.kaguya import digest as D
    from agents.kaguya import gcal, tools_filters, tools_schedule, tools_tasks
    monkeypatch.setattr(tools_tasks, "get_myday_prefs", lambda: {"hide_work": False})
    monkeypatch.setattr(tools_tasks, "list_tasks_today", lambda: {"overdue": [], "today": []})
    monkeypatch.setattr(tools_filters, "list_tasks_by_builtin", lambda key: [])
    monkeypatch.setattr(gcal, "list_events", lambda *a, **k: [])
    monkeypatch.setattr(tools_schedule, "get_day_schedule", lambda d: cap.resolve_day_schedule(_PREFS, d, None))
    monkeypatch.setattr(D, "_recent_journal_notes", lambda today: [])
    monkeypatch.setattr(D, "_query_kurisu_context", lambda *a, **k: [])
    monkeypatch.setattr(D, "_upcoming_birthdays", lambda today, hide_work: aniv)
    return D.build_digest_context(date(2026, 6, 1))


def test_digest_sem_aniversarios_nao_mostra_a_secao(monkeypatch):
    from agents.kaguya import digest as D
    ctx = _build_with_birthdays(monkeypatch, [])
    assert "Aniversários" not in D.build_whatsapp_digest(ctx, {"narrative": "", "items": [], "usage": {}})


def test_aniversarios_do_digest_respeitam_o_espaco_e_nao_derrubam_o_digest(monkeypatch):
    """Sem trabalho (férias/folga) só pessoas do espaço pessoal; falha da Komi = lista vazia."""
    from agents.kaguya import digest as D
    import agents.komi.tools as K
    chamadas = []

    def fake(days, space, today):
        chamadas.append((days, space, today))
        return {"status": "ok", "birthdays": [{"name": "Bia"}]}

    monkeypatch.setattr(K, "upcoming_birthdays", fake)
    assert D._upcoming_birthdays(date(2026, 6, 1), hide_work=True) == [{"name": "Bia"}]
    assert D._upcoming_birthdays(date(2026, 6, 1), hide_work=False) == [{"name": "Bia"}]
    assert chamadas == [(7, "personal", "2026-06-01"), (7, None, "2026-06-01")]

    def quebra(**_):
        raise RuntimeError("sem banco")

    monkeypatch.setattr(K, "upcoming_birthdays", quebra)
    assert D._upcoming_birthdays(date(2026, 6, 1), hide_work=False) == []
    monkeypatch.setattr(K, "upcoming_birthdays", lambda **_: {"status": "error", "message": "x"})
    assert D._upcoming_birthdays(date(2026, 6, 1), hide_work=False) == []
