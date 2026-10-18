"""Aniversários na Kaguya (spec 077): viram o campo da pessoa na Komi, não tarefas.

Antes (spec 026) cada aniversário era espelhado como uma tarefa ``type=birthday`` na lista
"Aniversários". Agora o aniversário é um campo de TODA pessoa na Komi, que o põe sozinho no
calendário (inclusive no espelho do Google) com lembrete e o inclui no digest matinal.

Este módulo é só a ponte para quem ainda pede um aniversário pela Kaguya (``create_task``
com ``type="birthday"``, pelo chat ou pelo Hermes): em vez de criar uma tarefa, ele grava o
dia/mês na pessoa certa da Komi e explica o que fez.

Usage:
    >>> from agents.kaguya.birthdays import person_name_from_title
    >>> person_name_from_title("Aniversário da Bia")
    'Bia'
"""

from __future__ import annotations

import re
from datetime import date

# "Aniversário de/da/do/dos/das <nome>" → <nome>. Também aceita "aniversario" sem acento.
_PREFIXO = re.compile(r"^\s*anivers[aá]rio\s+(?:d[aeo]s?\s+)?", re.IGNORECASE)


def person_name_from_title(title: str | None) -> str:
    """Tirar o nome da pessoa de um título como "Aniversário da Bia".

    Args:
        title: Título digitado para a "tarefa" de aniversário.

    Returns:
        O nome (sem o prefixo "aniversário de..."), ou o título aparado se não houver prefixo.

    Example:
        >>> person_name_from_title("aniversario do João Silva")
        'João Silva'
        >>> person_name_from_title("Bia")
        'Bia'
    """
    return _PREFIXO.sub("", title or "").strip()


def register_birthday(title: str, due_date: str | None, person_ids: list[str] | None = None) -> dict:
    """Registrar um aniversário na Komi no lugar de criar uma tarefa.

    A pessoa vem de ``person_ids`` (exatamente uma) ou do título ("Aniversário da Bia"),
    resolvida pela regra da Komi: se for ambígua ou não existir, devolve um erro que o
    agente usa para perguntar/oferecer o cadastro — nunca grava na pessoa errada. O ano da
    ``due_date`` é ignorado (é a próxima comemoração, não o ano de nascimento); um ano de
    nascimento já cadastrado é preservado.

    Args:
        title: Título pedido (usado para achar a pessoa quando não há ``person_ids``).
        due_date: Dia do aniversário em ``AAAA-MM-DD`` (só dia e mês importam).
        person_ids: IDs de pessoas da Komi (se vier, deve ter exatamente um).

    Returns:
        ``{"status": "ok", "id": None, "person_id": ..., "message": ...}`` ou
        ``{"status": "error", "message": ...}``. ``id`` é sempre ``None``: nenhuma tarefa nasce.
    """
    if not due_date:
        return {"status": "error", "message": "Informe o dia do aniversário (AAAA-MM-DD) — o ano é ignorado."}
    try:
        dia = date.fromisoformat(due_date)
    except ValueError:
        return {"status": "error", "message": f"Data inválida: '{due_date}'. Use AAAA-MM-DD."}

    from agents.komi import integration  # noqa: PLC0415 — Komi é opcional para a Kaguya
    from agents.komi import tools as komi  # noqa: PLC0415

    ids = [str(p) for p in (person_ids or []) if p]
    nome_pessoa = None
    if ids:
        if len(ids) != 1:
            return {"status": "error", "message": "Um aniversário é de uma pessoa só: informe um único person_id."}
        pessoa_id = ids[0]
    else:
        nome = person_name_from_title(title)
        if not nome:
            return {"status": "error", "message": "Diga de quem é o aniversário (ex.: 'Aniversário da Bia')."}
        achado = integration.resolve_person(nome)
        if achado.get("status") != "ok":
            return achado
        if achado["match"] == "none":
            return {"status": "error", "message": f"Não encontrei '{nome}' na Komi. Cadastre a pessoa primeiro (create_person)."}
        if achado["match"] == "many":
            nomes = ", ".join(p["name"] for p in achado["people"][:5])
            return {"status": "error", "message": f"Encontrei mais de uma pessoa para '{nome}': {nomes}. Qual delas?"}
        pessoa_id = achado["person"]["id"]
        nome_pessoa = achado["person"]["name"]

    resultado = komi.update_person(pessoa_id, birth_day=dia.day, birth_month=dia.month)
    if resultado.get("status") != "ok":
        return resultado
    quem = nome_pessoa or "a pessoa"
    return {
        "status": "ok",
        "id": None,
        "person_id": pessoa_id,
        "message": (
            f"Aniversário de {quem} registrado na Komi ({dia.day:02d}/{dia.month:02d}). "
            "Ele aparece no calendário com lembrete; nenhuma tarefa foi criada."
        ),
    }
