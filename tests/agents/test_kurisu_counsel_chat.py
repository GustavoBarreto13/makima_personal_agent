"""Testes da conversa sobre o Conselho do Dia (``agents/kurisu/counsel_chat.py``) — sem rede nem banco.

Cobre as peças puras (validação, histórico, bloco do conselho, fontes já citadas, prompt) e o
pipeline de ``responder_conselho`` com a IA, o RAG e a gravação substituídos: citação inválida
some, erro de IA não grava nada, sem conselho não chama a IA.

Como rodar:
    pytest tests/agents/test_kurisu_counsel_chat.py -v
"""

import pytest

from agents.kurisu import counsel as C
from agents.kurisu import counsel_chat as CC
from agents.kurisu import violet_ai as AI
from agents.kurisu import violet_context as CTX


# ─── validar_mensagem ─────────────────────────────────────────────────────────

def test_mensagem_vazia_ou_so_espaco_e_erro():
    assert CC.validar_mensagem("") and CC.validar_mensagem("   \n") and CC.validar_mensagem(None)


def test_mensagem_longa_demais_e_erro():
    assert CC.validar_mensagem("a" * (CC.MAX_MESSAGE_CHARS + 1))


def test_mensagem_normal_passa():
    assert CC.validar_mensagem("Discordo do que você disse sobre o sono.") is None


# ─── bloco_historico ──────────────────────────────────────────────────────────

def test_historico_vazio_avisa_primeira_resposta():
    assert "primeira resposta" in CC.bloco_historico([])


def test_historico_marca_papeis_e_divisoria():
    msgs = [
        {"role": "user", "content_md": "oi"},
        {"role": "violet", "content_md": "olá"},
        {"role": "marker", "content_md": "Conselho regerado"},
    ]
    txt = CC.bloco_historico(msgs)
    assert "ELE: oi" in txt and "VIOLET: olá" in txt and "regerado" in txt


def test_historico_corta_nas_ultimas_mensagens():
    msgs = [{"role": "user", "content_md": f"m{i}"} for i in range(30)]
    txt = CC.bloco_historico(msgs, limite=20)
    assert "ELE: m9\n" not in txt + "\n" and "ELE: m10" in txt and "ELE: m29" in txt


# ─── bloco_conselho / fontes_da_conversa ──────────────────────────────────────

def test_bloco_conselho_formato_novo_traz_texto_acoes_e_fontes():
    counsel = {"essay_md": "## O que eu li\nTexto", "actions": [{"texto": "Dormir às 23h"}],
               "sources": [{"titulo": "Sono", "fonte": "sono.md"}]}
    txt = CC.bloco_conselho(counsel)
    assert "Texto" in txt and "Dormir às 23h" in txt and "Sono" in txt


def test_bloco_conselho_formato_antigo_usa_espelho_e_cards():
    counsel = {"essay_md": None, "mirror": "Dia pesado", "toolkit": [{"titulo": "Respirar", "porque": "acalma", "como": "4-7-8"}]}
    txt = CC.bloco_conselho(counsel)
    assert "Dia pesado" in txt and "Respirar" in txt


def test_bloco_conselho_trunca_texto_longo():
    txt = CC.bloco_conselho({"essay_md": "x" * 10000})
    assert len(txt) < 7000


def test_fontes_da_conversa_junta_conselho_e_respostas():
    counsel = {"sources": [{"uri": "gs://a.md", "fonte": "a.md"}]}
    msgs = [{"role": "violet", "sources": [{"uri": "", "fonte": "b.md"}]}, {"role": "user", "sources": []}]
    assert CC.fontes_da_conversa(counsel, msgs) == {"gs://a.md", "b.md"}


# ─── montar_prompt_resposta ───────────────────────────────────────────────────

def test_prompt_sem_trechos_pede_honestidade_e_nao_cita():
    p = CC.montar_prompt_resposta("dia", "ctx", "conselho", "hist", "minha msg", [])
    assert "não encontrou isso na base" in p and "minha msg" in p and AI.TOM_VIOLET in p


def test_prompt_com_trechos_numera_para_citacao():
    p = CC.montar_prompt_resposta("dia", "ctx", "conselho", "hist", "msg", [{"fonte": "habitos.md", "texto": "repetição"}])
    assert "[1] nota: Habitos" in p and "[N]" in p


# ─── serialize_message ────────────────────────────────────────────────────────

def test_serialize_message_aceita_json_como_string():
    from datetime import datetime
    m = C.serialize_message({"id": 3, "role": "violet", "content_md": "oi", "sources_json": '[{"n": 1}]',
                             "created_at": datetime(2026, 10, 18, 21, 0)})
    assert m == {"id": 3, "role": "violet", "content_md": "oi", "sources": [{"n": 1}], "created_at": "2026-10-18T21:00:00"}


# ─── responder_conselho (pipeline com IA/banco substituídos) ──────────────────

@pytest.fixture
def pipeline(monkeypatch):
    estado = {"gravou": None, "respostas": []}
    counsel = {"essay_md": "Conselho", "actions": [], "sources": [], "messages": []}
    monkeypatch.setattr(CC, "_carregar", lambda date, type_id: (counsel, 7))
    monkeypatch.setattr(CTX, "dias", lambda a, b: [{"bullets": [{"kind": "bullet", "content": "trabalhei"}]}])
    monkeypatch.setattr(C, "_contexto", lambda date, dia: {})
    monkeypatch.setattr(C, "_bloco_contexto", lambda ctx: "CTX")
    monkeypatch.setattr(AI, "recuperar_amplo", lambda q, citadas=None: [{"fonte": "sono.md", "uri": "gs://sono.md", "texto": "dormir"}])

    def fake_json(prompt, schema, usage=None, **kw):
        return estado["respostas"].pop(0)
    monkeypatch.setattr(AI, "gemini_json", fake_json)

    def fake_gravar(counsel_id, mensagem, reply, sources, usage):
        estado["gravou"] = (counsel_id, mensagem, reply, sources)
        return [{"role": "user", "content_md": mensagem}, {"role": "violet", "content_md": reply, "sources": sources}]
    monkeypatch.setattr(CC, "_gravar", fake_gravar)
    return estado


def test_responder_valida_citacoes_e_grava(pipeline):
    pipeline["respostas"] = [{"queries": ["sono"]}, {"reply_md": "Durma mais [1]. Inventado [9]."}]
    r = CC.responder_conselho("2026-10-18", "  Não consigo dormir  ")
    assert r["status"] == "ok"
    counsel_id, mensagem, reply, sources = pipeline["gravou"]
    assert counsel_id == 7 and mensagem == "Não consigo dormir"
    assert "[1]" in reply and "[9]" not in reply
    assert [s["fonte"] for s in sources] == ["sono.md"]


def test_responder_erro_de_ia_nao_grava(pipeline, monkeypatch):
    def boom(*a, **k):
        raise AI.VioletAIError("Não consegui falar com a IA agora.")
    monkeypatch.setattr(AI, "gemini_json", boom)
    r = CC.responder_conselho("2026-10-18", "oi")
    assert r["status"] == "error" and pipeline["gravou"] is None


def test_responder_mensagem_vazia_nao_chama_ia(pipeline):
    r = CC.responder_conselho("2026-10-18", "   ")
    assert r["status"] == "error" and pipeline["gravou"] is None


def test_responder_sem_conselho_e_erro(pipeline, monkeypatch):
    monkeypatch.setattr(CC, "_carregar", lambda date, type_id: (None, None))
    r = CC.responder_conselho("2026-10-18", "oi")
    assert r["status"] == "error" and "conselho" in r["message"]


def test_responder_resposta_vazia_e_erro(pipeline):
    pipeline["respostas"] = [{"queries": []}, {"reply_md": "   "}]
    r = CC.responder_conselho("2026-10-18", "oi")
    assert r["status"] == "error" and pipeline["gravou"] is None
