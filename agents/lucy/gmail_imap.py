"""Camada IMAP pura da Lucy — conectar, buscar, parsear, etiquetar e arquivar.

Portada do script base (`n8n-python-scripts/lucy_email_agent/main.py`), sem
dependências novas (imaplib/email são stdlib). Reusada pelas tools read-only do
`lucy_agent` (fetch/search/get) e pelo script agendado `scripts/send_lucy_digest.py`
(fetch + label/archive).

As operações de escrita (`apply_label`, `archive`) existem aqui mas **não** são
expostas como tools do agente — a garantia de somente-leitura do `lucy_agent` é
estrutural (R7 do research.md).
"""

from __future__ import annotations

import email
import imaplib
import os
import re
from datetime import datetime, timedelta
from email.header import decode_header
from typing import Optional
from zoneinfo import ZoneInfo

_TZ = ZoneInfo("America/Sao_Paulo")

_SNIPPET_MAX_CHARS = 500


def _connect() -> imaplib.IMAP4_SSL:
    """Conectar e autenticar no Gmail via IMAP4_SSL, selecionando a inbox.

    Raises:
        RuntimeError: se GMAIL_USERNAME/GMAIL_APP_PASSWORD não estiverem configuradas.
        imaplib.IMAP4.error: falha de login/conexão.
    """
    username = os.environ.get("GMAIL_USERNAME")
    password = os.environ.get("GMAIL_APP_PASSWORD")
    if not username or not password:
        raise RuntimeError("GMAIL_USERNAME/GMAIL_APP_PASSWORD não configuradas")

    mail = imaplib.IMAP4_SSL("imap.gmail.com", timeout=30)
    mail.login(username, password)
    mail.select("inbox")
    return mail


def _decode(header_value: str) -> str:
    """Decodificar um header de email (RFC2047), lidando com partes mistas.

    Args:
        header_value: valor bruto do header (ex.: `msg.get("Subject", "")`).

    Returns:
        String decodificada em utf-8 (fallback ignorando bytes inválidos).
    """
    if not header_value:
        return ""
    parts = []
    for part, encoding in decode_header(header_value):
        if isinstance(part, bytes):
            enc = encoding or "utf-8"
            try:
                parts.append(part.decode(enc, errors="ignore"))
            except LookupError:
                parts.append(part.decode("utf-8", errors="ignore"))
        else:
            parts.append(str(part))
    return "".join(parts)


def _extract_body(msg: email.message.Message) -> str:
    """Extrair o corpo em texto puro de um email (multipart ou não).

    Prioriza `text/plain`; cai para `text/html` com tags removidas se não houver
    parte texto puro. Ignora anexos.
    """
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            if "attachment" in content_disposition:
                continue
            if content_type == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    body = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
                break
            if content_type == "text/html" and not body:
                payload = part.get_payload(decode=True)
                if payload:
                    html_content = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
                    body = re.sub(r"<[^>]+>", " ", html_content)
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            body = payload.decode(msg.get_content_charset() or "utf-8", errors="ignore")
            if msg.get_content_type() == "text/html":
                body = re.sub(r"<[^>]+>", " ", body)
    return body


def _extract_snippet(msg: email.message.Message) -> str:
    """Extrair um snippet de texto puro do corpo do email (~500 chars)."""
    full_text = " ".join(_extract_body(msg).split())
    return full_text[:_SNIPPET_MAX_CHARS]


def _extract_gmail_msgid(fetch_data) -> str:
    """Extrair o X-GM-MSGID (id permanente do Gmail) da resposta de FETCH.

    Args:
        fetch_data: resposta bruta de `mail.uid('FETCH', uid, '(X-GM-MSGID RFC822)')`.

    Returns:
        O valor do X-GM-MSGID como string, ou "" se não encontrado.
    """
    for item in fetch_data:
        if isinstance(item, tuple):
            header_bytes = item[0]
        else:
            header_bytes = item
        if not isinstance(header_bytes, (bytes, bytearray)):
            continue
        match = re.search(rb"X-GM-MSGID (\d+)", header_bytes)
        if match:
            return match.group(1).decode("ascii")
    return ""


def _parse_message(uid: bytes, fetch_data) -> Optional[dict]:
    """Montar o dict padrão de email a partir da resposta de FETCH.

    Returns:
        `{imap_uid, gmail_msgid, from_name, from_addr, subject, date, snippet}`
        ou None se o RFC822 não puder ser extraído.
    """
    raw_email = None
    for item in fetch_data:
        if isinstance(item, tuple) and len(item) == 2:
            raw_email = item[1]
            break
    if raw_email is None:
        return None

    msg = email.message_from_bytes(raw_email)

    subject = _decode(msg.get("Subject", ""))
    from_header = _decode(msg.get("From", ""))
    from_name, from_addr = _split_from(from_header)
    date_header = msg.get("Date", "")

    return {
        "imap_uid": uid.decode("utf-8"),
        "gmail_msgid": _extract_gmail_msgid(fetch_data),
        "from_name": from_name,
        "from_addr": from_addr,
        "subject": subject,
        "date": date_header,
        "snippet": _extract_snippet(msg),
    }


def _split_from(from_header: str) -> tuple[str, str]:
    """Separar 'Nome <endereco@ex.com>' em (nome, endereço).

    Se não houver `<...>`, trata o header inteiro como endereço (nome vazio).
    """
    match = re.match(r"^\s*(.*?)\s*<(.+?)>\s*$", from_header)
    if match:
        return match.group(1).strip().strip('"'), match.group(2).strip()
    return "", from_header.strip()


def fetch_emails(criteria: str, limit: int = 50) -> list[dict]:
    """Buscar emails por critério IMAP (ex.: `(SINCE "..." BEFORE "...")`).

    Usa `mail.uid('SEARCH', ...)` para localizar UIDs e `mail.uid('FETCH', ...,
    '(X-GM-MSGID RFC822)')` para trazer o conteúdo + o id permanente do Gmail em
    uma única viagem por email.

    Args:
        criteria: critério de busca IMAP (ex.: `'(SINCE "05-Jul-2026" BEFORE "06-Jul-2026")'`).
        limit: cap de resultados — se houver mais, mantém os `limit` mais recentes.

    Returns:
        Lista de dicts `{imap_uid, gmail_msgid, from_name, from_addr, subject, date, snippet}`.
    """
    mail = _connect()
    try:
        status, messages = mail.uid("SEARCH", None, criteria)
        if status != "OK" or not messages[0]:
            return []

        uids = messages[0].split()
        if len(uids) > limit:
            uids = uids[-limit:]

        emails = []
        for uid in uids:
            status, data = mail.uid("FETCH", uid, "(X-GM-MSGID RFC822)")
            if status != "OK":
                continue
            parsed = _parse_message(uid, data)
            if parsed:
                emails.append(parsed)
        return emails
    finally:
        mail.logout()


def get_email_full(uid: str) -> Optional[dict]:
    """Buscar o conteúdo completo de um email por UID (para exibição na íntegra).

    Args:
        uid: IMAP UID como string.

    Returns:
        `{"from_name", "from_addr", "subject", "date", "body"}` ou None se o UID não existir.
    """
    mail = _connect()
    try:
        status, data = mail.uid("FETCH", uid.encode("utf-8"), "(RFC822)")
        if status != "OK" or not data or not data[0]:
            return None

        raw_email = None
        for item in data:
            if isinstance(item, tuple) and len(item) == 2:
                raw_email = item[1]
                break
        if raw_email is None:
            return None

        msg = email.message_from_bytes(raw_email)
        subject = _decode(msg.get("Subject", ""))
        from_name, from_addr = _split_from(_decode(msg.get("From", "")))
        body = _extract_body(msg)

        return {
            "from_name": from_name,
            "from_addr": from_addr,
            "subject": subject,
            "date": msg.get("Date", ""),
            "body": body.strip(),
        }
    finally:
        mail.logout()


# ── Operações de escrita (usadas só pelo digest — NÃO expostas como tool) ──────

_LABEL_MAP = {
    "Art / Hobbies": '"Art / Hobbies"',
    "Finance": '"Finance"',
    "Knowledge": '"Knowledge"',
    "Shopping": '"Shopping"',
    "Personal": '"Personal"',
    "Health": '"Health"',
    "Security": '"Security"',
    "Work": '"Work"',
    "Junk": '"Junk"',
    "Other": '"Other"',
}


def apply_label(mail: imaplib.IMAP4_SSL, uid: str, label: str) -> None:
    """Aplicar uma label do Gmail a um email via STORE +X-GM-LABELS.

    Args:
        mail: conexão IMAP já autenticada (reusada entre chamadas no mesmo lote).
        uid: IMAP UID do email.
        label: nome da categoria (uma das 10 fixas) — mapeada para o rótulo IMAP.
    """
    imap_label = _LABEL_MAP.get(label)
    if not imap_label:
        return
    mail.uid("STORE", uid.encode("utf-8"), "+X-GM-LABELS", imap_label)


def archive(mail: imaplib.IMAP4_SSL, uid: str) -> None:
    """Arquivar um email (remover da inbox) via STORE -X-GM-LABELS \\Inbox.

    Args:
        mail: conexão IMAP já autenticada.
        uid: IMAP UID do email.
    """
    mail.uid("STORE", uid.encode("utf-8"), "-X-GM-LABELS", "\\Inbox")


def open_connection() -> imaplib.IMAP4_SSL:
    """Abrir uma conexão IMAP autenticada para uso externo (ex.: label/archive em lote).

    O chamador é responsável por `mail.logout()` ao final.
    """
    return _connect()


def yesterday_search_criteria(now: Optional[datetime] = None) -> str:
    """Montar o critério IMAP `(SINCE ... BEFORE ...)` para o dia anterior (UTC-3).

    Args:
        now: instante de referência (default: agora, em America/Sao_Paulo). Parametrizável
            para testes determinísticos.

    Returns:
        Critério IMAP no formato `(SINCE "DD-Mon-YYYY" BEFORE "DD-Mon-YYYY")`.
    """
    reference = now or datetime.now(_TZ)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=_TZ)
    today_local = reference.astimezone(_TZ).date()
    yesterday_local = today_local - timedelta(days=1)
    since_str = yesterday_local.strftime("%d-%b-%Y")
    before_str = today_local.strftime("%d-%b-%Y")
    return f'(SINCE "{since_str}" BEFORE "{before_str}")'
