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
