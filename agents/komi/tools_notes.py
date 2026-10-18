"""Anotações sobre pessoas (ideias de presente, do que gosta...) — Komi, spec 077.

Cada pessoa tem anotações de quatro tipos — ``presente`` (ideia de presente), ``gosta``,
``nao_gosta`` e ``nota`` (livre) — e cada uma pertence a um espaço (``personal`` ou ``work``).

A IA pode **sugerir** anotações a partir da Memória da pessoa. Uma sugestão nasce com
``status = 'sugerida'`` e ``source = 'ia'`` (guardando os backlinks de origem) e **nunca**
vira anotação ativa sem o dono aceitar. Se for descartada, o texto fica guardado só para a IA
não sugerir a mesma coisa de novo.

Usage:
    >>> from agents.komi.tools_notes import add_person_note
    >>> add_person_note("uuid-da-bia", "gosta de orquídeas", kind="gosta")   # doctest: +SKIP
    {'status': 'ok', 'id': 1, 'message': 'Anotação salva.'}
"""

from __future__ import annotations

import json

from agents.komi import naming
from agents.komi.rows import valor
from agents.komi.tools import get_conn, run_select

KINDS = ("presente", "gosta", "nao_gosta", "nota")
STATUSES = ("ativa", "sugerida", "descartada")


def _serializar(r: dict) -> dict:
    """Converter uma linha de ``person_notes`` no formato devolvido às telas e ao Hermes.

    Args:
        r: Linha do banco.

    Returns:
        O dicionário da anotação, com ``created_at`` em ISO e ``source_refs`` como lista.
    """
    refs = r["source_refs"]
    if isinstance(refs, str):  # alguns drivers devolvem JSONB como texto
        refs = json.loads(refs)
    return {
        "id": r["id"], "person_id": r["person_id"], "kind": r["kind"], "context": r["context"],
        "text": r["text"], "source": r["source"], "source_refs": refs or [], "status": r["status"],
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
    }


def _contexto_padrao(contexto_da_pessoa: str) -> str:
    """Espaço padrão de uma anotação: ``work`` para quem é só do trabalho; senão ``personal``.

    Args:
        contexto_da_pessoa: ``personal``, ``work`` ou ``both``.

    Returns:
        ``work`` ou ``personal``.
    """
    return "work" if contexto_da_pessoa == "work" else "personal"


def add_person_note(person_id: str, text: str, kind: str = "nota", context: str | None = None) -> dict:
    """Guardar uma anotação sobre uma pessoa ("a Bia gosta de orquídeas").

    Se já existir uma anotação com o mesmo texto (ignorando caixa/acento) ativa, não duplica;
    se existir uma sugerida ou descartada, ela é aceita/reativada em vez de criar outra.

    Args:
        person_id: UUID da pessoa.
        text: O texto da anotação.
        kind: ``presente`` | ``gosta`` | ``nao_gosta`` | ``nota``.
        context: ``personal`` ou ``work``. Padrão: o espaço da pessoa (para "ambos", pessoal).

    Returns:
        ``{"status": "ok", "id": int, "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    texto = naming.clean(text)
    if not texto:
        return {"status": "error", "message": "A anotação não pode ser vazia."}
    if kind not in KINDS:
        return {"status": "error", "message": f"Tipo inválido. Use: {', '.join(KINDS)}."}
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT context FROM people WHERE id = %s AND deleted = FALSE", (person_id,))
            pessoa = cur.fetchone()
            if not pessoa:
                return {"status": "error", "message": "Pessoa não encontrada."}
            espaco = context or _contexto_padrao(valor(pessoa, 0, "context"))
            if espaco not in naming.SPACES:
                return {"status": "error", "message": "Espaço inválido. Use 'personal' ou 'work'."}

            cur.execute(
                "SELECT id, status FROM person_notes WHERE person_id = %s AND text_norm = %s AND deleted = FALSE",
                (person_id, naming.norm(texto)),
            )
            existente = cur.fetchone()
            if existente:
                nota_id, situacao = valor(existente, 0, "id"), valor(existente, 1, "status")
                if situacao == "ativa":
                    return {"status": "error", "message": "Você já tem essa anotação."}
                cur.execute("UPDATE person_notes SET status = 'ativa', kind = %s, context = %s, updated_at = NOW() WHERE id = %s",
                            (kind, espaco, nota_id))
                return {"status": "ok", "id": nota_id, "message": "Anotação salva."}

            cur.execute(
                "INSERT INTO person_notes (person_id, kind, context, text, text_norm) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (person_id, kind, espaco, texto, naming.norm(texto)),
            )
            return {"status": "ok", "id": valor(cur.fetchone(), 0, "id"), "message": "Anotação salva."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def list_person_notes(person_id: str, context: str | None = None, status: str | None = None) -> dict:
    """Listar as anotações de uma pessoa.

    Args:
        person_id: UUID da pessoa.
        context: ``personal`` ou ``work`` para ver só um lado; vazio traz tudo.
        status: ``ativa`` | ``sugerida`` | ``descartada``; vazio traz ativas e sugeridas
            (as descartadas só aparecem se pedidas).

    Returns:
        ``{"status": "ok", "notes": [...]}`` — ativas primeiro, depois as sugeridas; mais novas antes.
    """
    try:
        alvo = naming.valid_space(context)
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    if status is not None and status not in STATUSES:
        return {"status": "error", "message": f"Status inválido. Use: {', '.join(STATUSES)}."}
    filtro_ctx = "AND context = %(ctx)s" if alvo else ""
    filtro_status = "AND status = %(st)s" if status else "AND status IN ('ativa', 'sugerida')"
    try:
        linhas = run_select(
            f"""
            SELECT id, person_id, kind, context, text, source, source_refs, status, created_at
            FROM person_notes WHERE person_id = %(p)s AND deleted = FALSE {filtro_ctx} {filtro_status}
            ORDER BY (status = 'sugerida'), created_at DESC, id DESC
            """,
            {"p": person_id, "ctx": alvo, "st": status},
        )
        return {"status": "ok", "notes": [_serializar(r) for r in linhas]}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def update_person_note(note_id: int, text: str | None = None, kind: str | None = None, context: str | None = None) -> dict:
    """Editar uma anotação (atualização parcial).

    Args:
        note_id: ID da anotação.
        text: Novo texto (não pode ficar vazio).
        kind: Novo tipo.
        context: Novo espaço.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    sets: list[str] = []
    valores: list = []
    if text is not None:
        texto = naming.clean(text)
        if not texto:
            return {"status": "error", "message": "A anotação não pode ficar vazia."}
        sets += ["text = %s", "text_norm = %s"]; valores += [texto, naming.norm(texto)]
    if kind is not None:
        if kind not in KINDS:
            return {"status": "error", "message": f"Tipo inválido. Use: {', '.join(KINDS)}."}
        sets.append("kind = %s"); valores.append(kind)
    if context is not None:
        if context not in naming.SPACES:
            return {"status": "error", "message": "Espaço inválido. Use 'personal' ou 'work'."}
        sets.append("context = %s"); valores.append(context)
    if not sets:
        return {"status": "error", "message": "Nenhum campo para atualizar."}
    valores.append(note_id)
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"UPDATE person_notes SET {', '.join(sets)}, updated_at = NOW() WHERE id = %s AND deleted = FALSE", valores)
            if cur.rowcount == 0:
                return {"status": "error", "message": "Anotação não encontrada."}
        return {"status": "ok", "message": "Anotação atualizada."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def delete_person_note(note_id: int) -> dict:
    """Apagar uma anotação (soft delete — ``restore_person_note`` desfaz).

    Args:
        note_id: ID da anotação.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    return _marcar_apagada(note_id, True)


def restore_person_note(note_id: int) -> dict:
    """Desfazer a exclusão de uma anotação (o "Desfazer" da interface).

    Args:
        note_id: ID da anotação.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    return _marcar_apagada(note_id, False)


def _marcar_apagada(note_id: int, apagada: bool) -> dict:
    """Ligar/desligar o soft delete de uma anotação.

    Args:
        note_id: ID da anotação.
        apagada: ``True`` apaga; ``False`` restaura.

    Returns:
        O dicionário de status das funções públicas.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("UPDATE person_notes SET deleted = %s, updated_at = NOW() WHERE id = %s AND deleted = %s",
                        (apagada, note_id, not apagada))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Anotação não encontrada."}
        return {"status": "ok", "message": "Anotação apagada." if apagada else "Anotação restaurada."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def accept_person_note(note_id: int, text: str | None = None, kind: str | None = None) -> dict:
    """Aceitar uma anotação sugerida pela IA (opcionalmente já editando o texto/tipo).

    Args:
        note_id: ID da sugestão.
        text: Texto editado (opcional).
        kind: Tipo editado (opcional).

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}`` se a
        anotação não existir ou não estiver mais como sugerida.
    """
    if text is not None or kind is not None:
        editado = update_person_note(note_id, text=text, kind=kind)
        if editado["status"] != "ok":
            return editado
    return _mudar_status(note_id, "sugerida", "ativa", "Anotação aceita.")


def dismiss_person_note(note_id: int) -> dict:
    """Descartar uma sugestão da IA (o texto fica guardado para ela não repetir a ideia).

    Args:
        note_id: ID da sugestão.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    return _mudar_status(note_id, "sugerida", "descartada", "Sugestão descartada.")


def _mudar_status(note_id: int, de: str, para: str, mensagem: str) -> dict:
    """Mudar o status de uma anotação, só se ela estiver no status esperado.

    Args:
        note_id: ID da anotação.
        de: Status exigido.
        para: Novo status.
        mensagem: Texto de sucesso.

    Returns:
        O dicionário de status das funções públicas.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE person_notes SET status = %s, updated_at = NOW() WHERE id = %s AND status = %s AND deleted = FALSE",
                (para, note_id, de),
            )
            if cur.rowcount == 0:
                return {"status": "error", "message": f"Essa anotação não está {de}."}
        return {"status": "ok", "message": mensagem}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def save_suggestions(person_id: str, suggestions: list[dict], context: str | None = None) -> dict:
    """Guardar sugestões de anotação da IA, sem repetir o que já existe (nem o que foi descartado).

    Cada sugestão vira ``status = 'sugerida'`` e ``source = 'ia'``, com os backlinks de origem em
    ``source_refs``. Texto que já existe em QUALQUER status (ativa, sugerida ou descartada) é pulado.

    Args:
        person_id: UUID da pessoa.
        suggestions: ``[{"kind": ..., "text": ..., "refs": [...]}]``.
        context: Espaço das sugestões (padrão: o da pessoa; ``None`` em "ambos" = pessoal).

    Returns:
        ``{"status": "ok", "created": n, "skipped": m}`` ou ``{"status": "error", "message": ...}``.
    """
    criadas = puladas = 0
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT context FROM people WHERE id = %s AND deleted = FALSE", (person_id,))
            pessoa = cur.fetchone()
            if not pessoa:
                return {"status": "error", "message": "Pessoa não encontrada."}
            espaco = context if context in naming.SPACES else _contexto_padrao(valor(pessoa, 0, "context"))
            cur.execute("SELECT text_norm FROM person_notes WHERE person_id = %s AND deleted = FALSE", (person_id,))
            conhecidas = {valor(r, 0, "text_norm") for r in cur.fetchall()}
            for s in suggestions:
                texto = naming.clean(s.get("text"))
                tipo = s.get("kind") if s.get("kind") in KINDS else "nota"
                if not texto or naming.norm(texto) in conhecidas:
                    puladas += 1
                    continue
                cur.execute(
                    "INSERT INTO person_notes (person_id, kind, context, text, text_norm, source, source_refs, status) "
                    "VALUES (%s, %s, %s, %s, %s, 'ia', %s::jsonb, 'sugerida')",
                    (person_id, tipo, espaco, texto, naming.norm(texto), json.dumps(s.get("refs") or [])),
                )
                conhecidas.add(naming.norm(texto))
                criadas += 1
        return {"status": "ok", "created": criadas, "skipped": puladas}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}
