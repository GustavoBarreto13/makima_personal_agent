"""Limpeza one-time do backlog da Inbox da Lucy — "inbox zero".

Varre a inbox inteira em lotes, classifica cada e-mail (só a categoria, sem
summary/priority/action, pra economizar tokens/tempo) via Gemini, aplica a
label correspondente e **arquiva TODOS os itens**, independente da categoria —
diferente do job diário (`scripts/send_lucy_digest.py`), que só arquiva "Junk".

Porte de `n8n-python-scripts/lucy_email_agent/clean_inbox.py` (já usado antes
pelo usuário), reaproveitando `agents/lucy/gmail_imap.py` (login, apply_label,
archive, decode de headers) em vez de duplicar essa lógica.

Uso:
    python -m scripts.clean_inbox_once [--batch-size 50] [--limit 0]
"""

from __future__ import annotations

import argparse
import email as email_module
import json
import logging
import os
import re
import sys
import time
from typing import Optional

import requests

from agents.lucy import gmail_imap

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_DELAY = 6.0  # segundos entre chamadas, folga pro rate limit do tier gratuito
MAX_RETRIES = 5
RETRY_BACKOFF = 15.0  # backoff exponencial em 429/5xx: 15s, 30s, 60s...

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("clean_inbox_once")

_SYSTEM_PROMPT = (
    "Você é uma IA de categorização estrita. "
    "Sua única função é ler os e-mails e retornar a categoria correta para cada 'uid'.\n"
    "DIRETRIZES DE CATEGORIZAÇÃO:\n"
    "- Art / Hobbies: Arte, hobbies, esportes, interesses pessoais e lazer.\n"
    "- Finance: Faturas, boletos, bancos, Pix, comprovantes e investimentos.\n"
    "- Knowledge: Newsletters, artigos, cursos, aprendizado, blogs, newsletter no assunto ou no corpo.\n"
    "- Shopping: Rastreio de entregas, recibos de compras, ofertas, cupons e e-commerce.\n"
    "- Personal: E-mails diretos de pessoas (amigos, familiares), viagens, eventos sociais, voos e redes sociais.\n"
    "- Health: Exames, resultados, médicos, farmácia, bem-estar.\n"
    "- Security: Alertas de login, senhas, códigos de verificação, OTP e acessos novos.\n"
    "- Work: Trabalho, chefe, clientes, corporativo.\n"
    "- Junk: Lixo inútil, termos de uso irrelevantes, spam, promoções de lojas, cupons, marketing de vendas, LinkedIn, Instagram, notificações de redes sociais, eventos sociais.\n"
    "- Other: Tudo que não couber acima."
)

_RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "uid": {"type": "STRING"},
            "category": {
                "type": "STRING",
                "enum": list(gmail_imap._LABEL_MAP.keys()),
            },
        },
        "required": ["uid", "category"],
    },
}

_last_http_error: Optional[str] = None


def _http_request(method: str, url: str, *, params=None, json_body=None, timeout: int = 45) -> Optional[dict]:
    global _last_http_error
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.request(method, url, params=params, json=json_body, timeout=timeout)
            if resp.status_code == 429:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                log.warning("Rate limit 429. Aguardando %ds...", wait)
                time.sleep(wait)
                continue
            if 500 <= resp.status_code < 600:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                log.warning("Erro 5xx. Aguardando %ds...", wait)
                time.sleep(wait)
                continue
            if resp.status_code == 404:
                return None
            if 400 <= resp.status_code < 500:
                _last_http_error = f"{resp.status_code} {method}: {(resp.text or '')[:500]}"
                return None
            return resp.json() if resp.content else {}
        except requests.RequestException:
            time.sleep(RETRY_BACKOFF * (2 ** (attempt - 1)))
    return None


def _classify_batch(api_key: str, emails_data: list[dict]) -> list[dict]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    prompt = f"Categorize os seguintes e-mails:\n\n{json.dumps(emails_data, ensure_ascii=False, indent=2)}"
    body = {
        "system_instruction": {"parts": [{"text": _SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": _RESPONSE_SCHEMA,
        },
    }
    resp = _http_request("POST", url, params={"key": api_key}, json_body=body)
    time.sleep(GEMINI_DELAY)
    if not resp:
        log.error("Gemini falhou. Erro: %s", _last_http_error)
        return []
    try:
        raw = resp["candidates"][0]["content"]["parts"][0]["text"].strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        return json.loads(raw)
    except Exception as exc:
        log.error("Falha ao parsear resposta: %s", exc)
        return []


def _extract_email_data(mail, uid: bytes) -> Optional[dict]:
    status, data = mail.uid("FETCH", uid, "(RFC822)")
    if status != "OK" or not data or not data[0]:
        return None
    raw_email = None
    for item in data:
        if isinstance(item, tuple) and len(item) == 2:
            raw_email = item[1]
            break
    if raw_email is None:
        return None
    msg = email_module.message_from_bytes(raw_email)
    return {
        "uid": uid.decode("utf-8"),
        "subject": gmail_imap._decode(msg.get("Subject", "")),
        "from": gmail_imap._decode(msg.get("From", "")),
        "snippet": gmail_imap._extract_snippet(msg),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Categoriza e arquiva TODA a inbox (inbox zero).")
    parser.add_argument("--batch-size", type=int, default=50, help="E-mails por lote")
    parser.add_argument("--limit", type=int, default=0, help="Limite total (0 = todos)")
    args = parser.parse_args()

    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key:
        log.error("GEMINI_API_KEY não configurada.")
        return 1

    log.info("Conectando ao IMAP...")
    mail = gmail_imap.open_connection()
    try:
        status, messages = mail.uid("SEARCH", None, "ALL")
        if status != "OK" or not messages[0]:
            log.info("Nenhum e-mail na Inbox. Trabalho concluído!")
            return 0

        email_uids = messages[0].split()
        email_uids.reverse()  # mais novos primeiro
        if args.limit > 0:
            email_uids = email_uids[: args.limit]

        total = len(email_uids)
        log.info("Encontrados %d e-mails na Inbox para processar.", total)

        batch_size = args.batch_size
        total_batches = (total + batch_size - 1) // batch_size

        for i in range(0, total, batch_size):
            batch_uids = email_uids[i : i + batch_size]
            batch_num = i // batch_size + 1
            log.info("--- Lote %d de %d (%d e-mails) ---", batch_num, total_batches, len(batch_uids))

            emails_data = []
            for uid in batch_uids:
                data = _extract_email_data(mail, uid)
                if data:
                    emails_data.append(data)
            if not emails_data:
                continue

            log.info("Enviando %d e-mails para o Gemini (%s)...", len(emails_data), GEMINI_MODEL)
            categories = _classify_batch(gemini_key, emails_data)
            if not categories:
                log.warning("Falha na IA. Pulando lote %d.", batch_num)
                continue

            log.info("Aplicando labels e arquivando lote...")
            for item in categories:
                uid_str = item.get("uid")
                cat = item.get("category", "Other")
                if not uid_str:
                    continue
                try:
                    gmail_imap.apply_label(mail, uid_str, cat)
                    gmail_imap.archive(mail, uid_str)
                except Exception as exc:
                    log.error("Erro ao processar uid %s: %s", uid_str, exc)

            log.info("Lote %d concluído.", batch_num)

        log.info("Todos os lotes foram processados! Inbox limpa.")
        return 0
    finally:
        mail.logout()


if __name__ == "__main__":
    sys.exit(main())
