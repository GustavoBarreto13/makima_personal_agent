"""Testes das funções puras de parsing em agents/lucy/gmail_imap.py.

Cobre decodificação de headers RFC2047, extração de snippet (texto puro e
fallback HTML) e split de "Nome <endereco>" — sem IMAP real (sem rede).
"""

import email

from agents.lucy.gmail_imap import _decode, _extract_snippet, _split_from


def test_decode_plain_ascii():
    assert _decode("Hello World") == "Hello World"


def test_decode_empty():
    assert _decode("") == ""


def test_decode_rfc2047_utf8():
    # "Assunto" codificado em UTF-8 Base64 (=?utf-8?b?...?=)
    encoded = "=?utf-8?b?QXNzdW50byBjb20gYWNlbnRvcyDDow==?="
    assert "Assunto com acentos" in _decode(encoded)


def test_split_from_with_name():
    name, addr = _split_from('Nubank <contato@nubank.com.br>')
    assert name == "Nubank"
    assert addr == "contato@nubank.com.br"


def test_split_from_quoted_name():
    name, addr = _split_from('"Nubank Alertas" <alertas@nubank.com.br>')
    assert name == "Nubank Alertas"
    assert addr == "alertas@nubank.com.br"


def test_split_from_no_angle_brackets():
    name, addr = _split_from("someone@example.com")
    assert name == ""
    assert addr == "someone@example.com"


def test_extract_snippet_plain_text():
    msg = email.message.Message()
    msg.set_type("text/plain")
    msg.set_payload("Este e um corpo de email simples de teste.")
    snippet = _extract_snippet(msg)
    assert "corpo de email simples" in snippet


def test_extract_snippet_html_fallback():
    msg = email.message.Message()
    msg.set_type("text/html")
    msg.set_payload("<html><body><p>Ola <b>mundo</b></p></body></html>")
    snippet = _extract_snippet(msg)
    assert "<" not in snippet
    assert "Ola" in snippet
    assert "mundo" in snippet


def test_extract_snippet_truncates_to_500_chars():
    msg = email.message.Message()
    msg.set_type("text/plain")
    msg.set_payload("a" * 1000)
    snippet = _extract_snippet(msg)
    assert len(snippet) == 500


def test_extract_snippet_empty_body():
    msg = email.message.Message()
    msg.set_type("text/plain")
    msg.set_payload("")
    assert _extract_snippet(msg) == ""
