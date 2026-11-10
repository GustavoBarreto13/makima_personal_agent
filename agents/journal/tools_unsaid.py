"""Tools dos "Não ditos" da Violet — o que a pessoa queria falar para alguém e não falou.

Cada registro tem um destinatário (pessoas da Komi e/ou nome livre), o texto, o motivo
(não posso / não quero / não consigo) e um desfecho: guardado, "acabei falando" ou
"deixei ir". Ancorado num dia do diário, como as cartas, e ortogonal aos bullets.

Os vínculos com a Komi usam o contrato único ``agents.komi.integration`` com
``entity_type = "journal_unsaid"``, gravados na mesma transação do registro.

Usage:
    >>> from agents.journal.tools_unsaid import REASONS, STATUSES
    >>> sorted(REASONS)
    ['nao_consigo', 'nao_posso', 'nao_quero']
"""

import psycopg2.extras  # RealDictCursor: linhas como dict

from agents.journal.tools import _get_conn, _people_tables_exist

# Valores aceitos — espelham os CHECKs da tabela (mensagem amigável antes do erro do banco)
REASONS = ("nao_posso", "nao_quero", "nao_consigo")
STATUSES = ("kept", "said", "let_go")

# Campos de texto que update_unsaid pode alterar (o desfecho passa por resolve_unsaid)
_UPDATABLE = ("recipient", "body", "reason", "why")

_BASE_COLUMNS = """
    u.id, u.page_id, p.date::text AS date, u.recipient, u.body, u.reason, u.why,
    u.status, u.outcome_note, u.resolved_at, u.created_at, u.updated_at"""

_PEOPLE_COLUMN = """,
    COALESCE(
      (SELECT json_agg(json_build_object('id', pe.id, 'name', pe.name, 'avatar_url', pe.avatar_url) ORDER BY pe.name)
         FROM person_links pl JOIN people pe ON pe.id = pl.person_id AND pe.deleted = FALSE
        WHERE pl.entity_type = 'journal_unsaid' AND pl.entity_id = u.id::text),
      '[]'
    ) AS people"""

_FROM = "FROM journal_unsaid u JOIN journal_pages p ON p.id = u.page_id"


def _columns(cur) -> str:
    """Montar a lista de colunas, com pessoas só se a Komi existir no banco."""
    people = _PEOPLE_COLUMN if _people_tables_exist(cur) else ", '[]'::json AS people"
    return _BASE_COLUMNS + people


def _serialize(row: dict) -> dict:
    """Converter timestamps em string ISO para o JSON.

    Args:
        row: Linha vinda do cursor.

    Returns:
        Cópia do dict com ``created_at``/``updated_at``/``resolved_at`` como texto.
    """
    d = dict(row)
    for campo in ("created_at", "updated_at", "resolved_at"):
        if d.get(campo):
            d[campo] = d[campo].isoformat()
    return d


def _fetch_one(cur, unsaid_id: int) -> dict | None:
    """Ler um registro completo (com dia e pessoas) pelo cursor dado."""
    cur.execute(f"SELECT {_columns(cur)} {_FROM} WHERE u.id = %s", (unsaid_id,))
    row = cur.fetchone()
    return _serialize(row) if row else None


def list_unsaid(page_id: int) -> list:
    """Listar os não ditos de um dia (página).

    Args:
        page_id: ID da página (dia).

    Returns:
        Lista de registros em ordem de escrita, cada um com ``people``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"SELECT {_columns(cur)} {_FROM} WHERE u.page_id = %s ORDER BY u.created_at", (page_id,)
            )
            return [_serialize(r) for r in cur.fetchall()]
    finally:
        conn.close()


def list_all_unsaid(
    status: str | None = None,
    person_id: str | None = None,
    reason: str | None = None,
    q: str | None = None,
    limit: int = 50,
    before: str | None = None,
) -> list:
    """Listar todos os não ditos, do mais recente para o mais antigo.

    Args:
        status: ``kept`` | ``said`` | ``let_go`` | None (todos).
        person_id: Só os vinculados a esta pessoa da Komi.
        reason: ``nao_posso`` | ``nao_quero`` | ``nao_consigo`` | None.
        q: Busca (sem caixa) no destinatário e no texto.
        limit: Máximo de registros (1–200).
        before: Paginação — só dias anteriores a esta data (YYYY-MM-DD).

    Returns:
        Lista de registros com ``date`` e ``people``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            person_filter = (
                "AND EXISTS (SELECT 1 FROM person_links pl WHERE pl.entity_type = 'journal_unsaid' "
                "AND pl.entity_id = u.id::text AND pl.person_id = %(pid)s)"
                if person_id else ""
            )
            cur.execute(f"""
                SELECT {_columns(cur)} {_FROM}
                WHERE (%(status)s::text IS NULL OR u.status = %(status)s)
                  AND (%(reason)s::text IS NULL OR u.reason = %(reason)s)
                  AND (%(before)s::date IS NULL OR p.date < %(before)s::date)
                  AND (%(q)s::text IS NULL OR (u.recipient || ' ' || u.body) ILIKE %(qlike)s)
                  {person_filter}
                ORDER BY p.date DESC, u.created_at DESC
                LIMIT %(limit)s
            """, {
                "status": status if status in STATUSES else None,
                "reason": reason if reason in REASONS else None,
                "before": before, "q": q or None, "qlike": f"%{q}%" if q else None,
                "pid": person_id, "limit": max(1, min(int(limit), 200)),
            })
            return [_serialize(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_unsaid(unsaid_id: int) -> dict:
    """Buscar um não dito com o dia e as pessoas.

    Args:
        unsaid_id: ID do registro.

    Returns:
        ``{"status": "ok", "unsaid": {...}}`` ou ``{"status": "error", "message": str}``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            item = _fetch_one(cur, unsaid_id)
        if item is None:
            return {"status": "error", "message": "registro não encontrado"}
        return {"status": "ok", "unsaid": item}
    finally:
        conn.close()


def create_unsaid(
    page_id: int,
    recipient: str,
    body: str,
    reason: str,
    why: str | None = None,
    person_ids: list[str] | None = None,
) -> dict:
    """Registrar algo que a pessoa queria dizer e não disse.

    Os vínculos com a Komi são gravados na mesma transação (tudo-ou-nada).

    Args:
        page_id: ID da página (dia) onde fica ancorado.
        recipient: Para quem (texto livre; vem do nome da pessoa quando há vínculo).
        body: O que queria dizer.
        reason: ``nao_posso`` | ``nao_quero`` | ``nao_consigo``.
        why: O que impede de dizer (opcional).
        person_ids: IDs de pessoas da Komi (opcional).

    Returns:
        ``{"status": "ok", "unsaid": {...}}`` ou ``{"status": "error", "message": str}``.
    """
    if reason not in REASONS:
        return {"status": "error", "message": f"motivo deve ser um de {', '.join(REASONS)}"}
    if not recipient.strip() or not body.strip():
        return {"status": "error", "message": "informe para quem e o que você queria dizer"}

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO journal_unsaid (page_id, recipient, body, reason, why)
                VALUES (%s, %s, %s, %s, %s) RETURNING id
            """, (page_id, recipient.strip(), body, reason, (why or "").strip() or None))
            new_id = cur.fetchone()["id"]
            if person_ids:
                # Import lazy: evita ciclo agents.journal → agents.komi → agents.journal
                from agents.komi.integration import link_people  # noqa: PLC0415
                link_people(cur, "journal_unsaid", new_id, person_ids)
            item = _fetch_one(cur, new_id)
        conn.commit()
        return {"status": "ok", "unsaid": item}
    except psycopg2.errors.ForeignKeyViolation:
        conn.rollback()
        return {"status": "error", "message": "page_id não encontrado"}
    finally:
        conn.close()


def update_unsaid(unsaid_id: int, person_ids: list[str] | None = None, **fields) -> dict:
    """Editar o texto, o motivo, o "porquê" ou as pessoas de um não dito.

    Args:
        unsaid_id: ID do registro.
        person_ids: Se enviado, substitui o conjunto de pessoas da Komi.
        **fields: ``recipient``, ``body``, ``reason``, ``why``.

    Returns:
        ``{"status": "ok", "unsaid": {...}}`` ou ``{"status": "error", "message": str}``.
    """
    updates = {k: v for k, v in fields.items() if k in _UPDATABLE}
    if "reason" in updates and updates["reason"] not in REASONS:
        return {"status": "error", "message": f"motivo deve ser um de {', '.join(REASONS)}"}
    for obrigatorio in ("recipient", "body"):
        if obrigatorio in updates and not str(updates[obrigatorio] or "").strip():
            return {"status": "error", "message": f"{obrigatorio} não pode ficar vazio"}
    if "why" in updates:
        updates["why"] = (updates["why"] or "").strip() or None

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT 1 FROM journal_unsaid WHERE id = %s FOR UPDATE", (unsaid_id,))
            if cur.fetchone() is None:
                return {"status": "error", "message": "registro não encontrado"}
            if updates:
                # Nomes de coluna vêm da lista fixa _UPDATABLE; valores sempre por parâmetro
                sets = ", ".join(f"{k} = %s" for k in updates)
                cur.execute(
                    f"UPDATE journal_unsaid SET {sets}, updated_at = NOW() WHERE id = %s",
                    [*updates.values(), unsaid_id],
                )
            if person_ids is not None:
                from agents.komi.integration import sync_people  # noqa: PLC0415
                sync_people(cur, "journal_unsaid", unsaid_id, person_ids)
            item = _fetch_one(cur, unsaid_id)
        conn.commit()
        return {"status": "ok", "unsaid": item}
    finally:
        conn.close()


def resolve_unsaid(unsaid_id: int, status: str, outcome_note: str | None = None) -> dict:
    """Dar um desfecho ao não dito (ou reabrir).

    Args:
        unsaid_id: ID do registro.
        status: ``said`` (acabei falando), ``let_go`` (deixei ir) ou ``kept`` (reabrir).
        outcome_note: Como foi (opcional; limpa ao reabrir).

    Returns:
        ``{"status": "ok", "unsaid": {...}}`` ou ``{"status": "error", "message": str}``.
    """
    if status not in STATUSES:
        return {"status": "error", "message": f"status deve ser um de {', '.join(STATUSES)}"}
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            reaberto = status == "kept"
            cur.execute("""
                UPDATE journal_unsaid
                SET status = %s,
                    outcome_note = %s,
                    resolved_at = CASE WHEN %s THEN NULL ELSE NOW() END,
                    updated_at = NOW()
                WHERE id = %s RETURNING id
            """, (status, None if reaberto else ((outcome_note or "").strip() or None), reaberto, unsaid_id))
            if cur.fetchone() is None:
                return {"status": "error", "message": "registro não encontrado"}
            item = _fetch_one(cur, unsaid_id)
        conn.commit()
        return {"status": "ok", "unsaid": item}
    finally:
        conn.close()


def delete_unsaid(unsaid_id: int) -> dict:
    """Apagar um não dito e os vínculos dele com a Komi.

    Args:
        unsaid_id: ID do registro.

    Returns:
        ``{"status": "ok"}`` ou ``{"status": "error", "message": str}`` se não existir.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM journal_unsaid WHERE id = %s RETURNING id", (unsaid_id,))
            if cur.fetchone() is None:
                return {"status": "error", "message": "registro não encontrado"}
            try:
                cur.execute("SAVEPOINT limpa_vinculos")
                cur.execute(
                    "DELETE FROM person_links WHERE entity_type = 'journal_unsaid' AND entity_id = %s",
                    (str(unsaid_id),),
                )
            except psycopg2.Error:
                # Komi ausente: não há vínculos para remover
                cur.execute("ROLLBACK TO SAVEPOINT limpa_vinculos")
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()
