"""Interações com pessoas ("falei com a Bia ontem") — Komi, spec 077.

Uma interação é um contato registrado: mensagem, ligação, encontro, videochamada ou outro.
Elas alimentam o "sem contato há N dias" do Início, o mapa de calor das estatísticas e a
Memória da pessoa. Cada interação tem um espaço (``personal`` ou ``work``), para quem é "ambos"
separar o papo de trabalho do pessoal.

Usage:
    >>> from agents.komi.tools_interactions import log_interaction
    >>> log_interaction("uuid-da-bia", kind="ligacao", happened_at="2026-10-17", note="combinar viagem")  # doctest: +SKIP
    {'status': 'ok', 'id': 1, 'message': 'Interação registrada.'}
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from agents.komi import naming
from agents.komi.tools import get_conn, run_select

# Tipos de interação aceitos (o banco impõe a mesma lista).
KINDS = ("mensagem", "ligacao", "encontro", "video", "outro")

_SP = ZoneInfo("America/Sao_Paulo")


def _parse_quando(valor: str | datetime | date | None) -> datetime:
    """Interpretar "quando aconteceu" como um instante no fuso de São Paulo.

    Aceita ``None`` (agora), uma data ``AAAA-MM-DD`` (assume 12:00 do dia, já que o dia é o que
    importa) ou um instante ISO (``2026-10-05T14:30``; sem fuso = São Paulo).

    Args:
        valor: O que o usuário/agente informou.

    Returns:
        Um ``datetime`` com fuso.

    Raises:
        ValueError: Se o texto não for uma data/hora válida ou estiver no futuro.

    Example:
        >>> _parse_quando("2026-10-05").isoformat()
        '2026-10-05T12:00:00-03:00'
    """
    agora = datetime.now(_SP)
    if valor is None or valor == "":
        return agora
    if isinstance(valor, datetime):
        quando = valor
    elif isinstance(valor, date):
        quando = datetime.combine(valor, time(12, 0))
    else:
        texto = str(valor).strip()
        try:
            quando = datetime.combine(date.fromisoformat(texto), time(12, 0)) if len(texto) == 10 else datetime.fromisoformat(texto)
        except ValueError:
            raise ValueError(f"Data/hora inválida: '{valor}'. Use AAAA-MM-DD ou AAAA-MM-DDTHH:MM.") from None
    if quando.tzinfo is None:
        quando = quando.replace(tzinfo=_SP)
    # Tolerância de 5 min para relógios levemente adiantados; interação é algo que JÁ aconteceu.
    if quando > agora + timedelta(minutes=5):
        raise ValueError("Essa interação está no futuro. Registre depois que acontecer.")
    return quando.astimezone(_SP)


def _contexto_padrao(contexto_da_pessoa: str) -> str:
    """Escolher o espaço de uma interação quando o usuário não disse.

    Args:
        contexto_da_pessoa: ``personal``, ``work`` ou ``both``.

    Returns:
        ``work`` para quem é só do trabalho; ``personal`` nos demais casos ("ambos" assume
        pessoal — o usuário marca ``work`` quando o contato foi profissional).
    """
    return "work" if contexto_da_pessoa == "work" else "personal"


def _serializar(r: dict) -> dict:
    """Converter uma linha de ``person_interactions`` no formato devolvido às telas e ao Hermes.

    Args:
        r: Linha com ``id, person_id, kind, context, note, happened_at, created_at``.

    Returns:
        O dicionário com ``happened_at`` em ISO (São Paulo) e ``date`` (dia local).
    """
    quando = r["happened_at"].astimezone(_SP)
    return {
        "id": r["id"], "person_id": r["person_id"], "kind": r["kind"], "context": r["context"],
        "note": r["note"], "happened_at": quando.isoformat(), "date": quando.date().isoformat(),
    }


def log_interaction(
    person_id: str,
    kind: str = "outro",
    happened_at: str | None = None,
    note: str | None = None,
    context: str | None = None,
) -> dict:
    """Registrar uma interação com uma pessoa ("liguei pra Bia ontem").

    Args:
        person_id: UUID da pessoa.
        kind: ``mensagem`` | ``ligacao`` | ``encontro`` | ``video`` | ``outro``.
        happened_at: Quando foi: ``AAAA-MM-DD`` ou ``AAAA-MM-DDTHH:MM`` (padrão: agora, fuso de SP).
        note: Observação curta (opcional).
        context: ``personal`` ou ``work``. Padrão: o espaço da pessoa (para "ambos", pessoal).

    Returns:
        ``{"status": "ok", "id": int, "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    if kind not in KINDS:
        return {"status": "error", "message": f"Tipo inválido. Use: {', '.join(KINDS)}."}
    try:
        quando = _parse_quando(happened_at)
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT context FROM people WHERE id = %s AND deleted = FALSE", (person_id,))
            pessoa = cur.fetchone()
            if not pessoa:
                return {"status": "error", "message": "Pessoa não encontrada."}
            espaco = context or _contexto_padrao(pessoa[0])
            if espaco not in naming.SPACES:
                return {"status": "error", "message": "Espaço inválido. Use 'personal' ou 'work'."}
            cur.execute(
                "INSERT INTO person_interactions (person_id, kind, context, happened_at, note) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (person_id, kind, espaco, quando, naming.clean(note)),
            )
            novo_id = cur.fetchone()[0]
        return {"status": "ok", "id": novo_id, "message": "Interação registrada."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def list_interactions(person_id: str, limit: int = 50, context: str | None = None) -> dict:
    """Listar as interações de uma pessoa, da mais recente para a mais antiga.

    Args:
        person_id: UUID da pessoa.
        limit: Máximo de interações (1 a 500).
        context: ``personal`` ou ``work`` para ver só um lado; vazio traz tudo.

    Returns:
        ``{"status": "ok", "interactions": [{id, kind, context, note, happened_at, date}, ...]}``.
    """
    try:
        alvo = naming.valid_space(context)
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    filtro = "AND context = %(ctx)s" if alvo else ""
    try:
        linhas = run_select(
            f"""
            SELECT id, person_id, kind, context, note, happened_at
            FROM person_interactions WHERE person_id = %(p)s AND deleted = FALSE {filtro}
            ORDER BY happened_at DESC LIMIT %(n)s
            """,
            {"p": person_id, "ctx": alvo, "n": max(1, min(int(limit), 500))},
        )
        return {"status": "ok", "interactions": [_serializar(r) for r in linhas]}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def update_interaction(
    interaction_id: int,
    kind: str | None = None,
    happened_at: str | None = None,
    note: str | None = None,
    context: str | None = None,
) -> dict:
    """Corrigir uma interação (atualização parcial: só o que for informado muda).

    Args:
        interaction_id: ID da interação.
        kind: Novo tipo (opcional).
        happened_at: Nova data/hora (opcional; mesmas regras de ``log_interaction``).
        note: Nova observação; texto vazio ``""`` apaga a observação (``None`` = não mexer).
        context: Novo espaço (opcional).

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    sets: list[str] = []
    valores: list = []
    if kind is not None:
        if kind not in KINDS:
            return {"status": "error", "message": f"Tipo inválido. Use: {', '.join(KINDS)}."}
        sets.append("kind = %s"); valores.append(kind)
    if happened_at is not None:
        try:
            sets.append("happened_at = %s"); valores.append(_parse_quando(happened_at))
        except ValueError as e:
            return {"status": "error", "message": str(e)}
    if note is not None:
        sets.append("note = %s"); valores.append(naming.clean(note))
    if context is not None:
        if context not in naming.SPACES:
            return {"status": "error", "message": "Espaço inválido. Use 'personal' ou 'work'."}
        sets.append("context = %s"); valores.append(context)
    if not sets:
        return {"status": "error", "message": "Nenhum campo para atualizar."}
    valores.append(interaction_id)
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"UPDATE person_interactions SET {', '.join(sets)} WHERE id = %s AND deleted = FALSE", valores)
            if cur.rowcount == 0:
                return {"status": "error", "message": "Interação não encontrada."}
        return {"status": "ok", "message": "Interação atualizada."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def delete_interaction(interaction_id: int) -> dict:
    """Apagar uma interação (soft delete — dá para restaurar com ``restore_interaction``).

    Args:
        interaction_id: ID da interação.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    return _marcar_apagada(interaction_id, True)


def restore_interaction(interaction_id: int) -> dict:
    """Desfazer a exclusão de uma interação (o "Desfazer" da interface).

    Args:
        interaction_id: ID da interação.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    return _marcar_apagada(interaction_id, False)


def _marcar_apagada(interaction_id: int, apagada: bool) -> dict:
    """Ligar/desligar o soft delete de uma interação.

    Args:
        interaction_id: ID da interação.
        apagada: ``True`` apaga; ``False`` restaura.

    Returns:
        O dicionário de status das funções públicas.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE person_interactions SET deleted = %s WHERE id = %s AND deleted = %s",
                (apagada, interaction_id, not apagada),
            )
            if cur.rowcount == 0:
                return {"status": "error", "message": "Interação não encontrada."}
        return {"status": "ok", "message": "Interação apagada." if apagada else "Interação restaurada."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}
