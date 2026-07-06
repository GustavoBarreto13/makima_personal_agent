"""Testes de agents/lucy/tools.py::build_telegram_digest.

Cobre agrupamento por categoria, ocultação de Junk, cores por prioridade e o
caminho "sem emails" (FR-011) — sem IMAP/Gemini reais.
"""

from agents.lucy.tools import build_telegram_digest


def _item(category, priority="low", action="ler", summary="resumo"):
    return {
        "uid": "1",
        "category": category,
        "priority": priority,
        "action": action,
        "summary": summary,
        "from_name": "Alguém",
        "subject": "Assunto",
    }


def test_no_emails_returns_caixa_limpa_message():
    digest = build_telegram_digest([], {"prompt_tokens": 0, "candidates_tokens": 0})
    assert "quieta" in digest.lower() or "rede" in digest.lower()
    assert "LUCY" in digest


def test_junk_hidden_from_digest():
    classified = [_item("Junk", summary="lixo"), _item("Finance", summary="boleto")]
    digest = build_telegram_digest(classified, {"prompt_tokens": 10, "candidates_tokens": 5})
    assert "lixo" not in digest
    assert "boleto" in digest
    assert "Junk" not in digest


def test_groups_by_category():
    classified = [
        _item("Finance", summary="boleto 1"),
        _item("Finance", summary="boleto 2"),
        _item("Work", summary="reuniao"),
    ]
    digest = build_telegram_digest(classified, {"prompt_tokens": 0, "candidates_tokens": 0})
    assert "Finance</b> (2)" in digest
    assert "Work</b> (1)" in digest


def test_priority_colors():
    classified = [
        _item("Personal", priority="high", summary="urgente"),
        _item("Personal", priority="medium", summary="medio"),
        _item("Personal", priority="low", summary="tranquilo"),
    ]
    digest = build_telegram_digest(classified, {"prompt_tokens": 0, "candidates_tokens": 0})
    assert "🔴" in digest
    assert "🟡" in digest
    assert "🟢" in digest


def test_knowledge_feeds_intel_briefing():
    classified = [_item("Knowledge", summary="newsletter resumo")]
    digest = build_telegram_digest(classified, {"prompt_tokens": 0, "candidates_tokens": 0})
    assert "INTEL BRIEFING" in digest
    assert "newsletter resumo" in digest


def test_security_feeds_acao_imediata():
    classified = [_item("Security", summary="login suspeito")]
    digest = build_telegram_digest(classified, {"prompt_tokens": 0, "candidates_tokens": 0})
    assert "AÇÃO IMEDIATA" in digest
    assert "login suspeito" in digest


def test_footer_has_tokens_cost_and_time():
    classified = [_item("Personal")]
    digest = build_telegram_digest(classified, {"prompt_tokens": 1000, "candidates_tokens": 500})
    assert "Tokens: 1,000 in | 500 out" in digest
    assert "Custo" in digest
