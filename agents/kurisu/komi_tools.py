"""Tools da Komi que dependem da Kurisu (IA), para o Hermes — spec 077.

Ficam fora de ``agents/komi`` (a Komi não depende da Kurisu); o registry do MCP junta estas tools ao
domínio ``komi`` (``mcp_servers/makima/registry.py``) — o mesmo arranjo das tools da Violet.

Usage:
    >>> from agents.kurisu.komi_tools import KOMI_KURISU_TOOLS
    >>> [f.__name__ for f in KOMI_KURISU_TOOLS]
    ['summarize_person_memory']
"""

from __future__ import annotations

from agents.kurisu import person_summary


def summarize_person_memory(person: str, space: str = "all", regenerate: bool = False) -> dict:
    """Resumir com IA tudo o que o sistema sabe de uma pessoa ("o que eu sei da Bia?").

    Lê a Memória da pessoa (diário, tarefas, finanças, filmes, livros, interações) e devolve um
    resumo, pontos importantes e pendências, cada um com a fonte. Também cria SUGESTÕES de
    anotação (ideias de presente, do que gosta...) que só valem depois que o usuário aceitar
    na tela — diga isso a ele. Se a Memória não mudou desde o último resumo, devolve o que já
    estava guardado (``cached: true``), sem gastar IA.

    Args:
        person: Nome, apelido ou UUID da pessoa. Se o nome for ambíguo (2+ pessoas), devolve
            ``ambiguous: true`` com as opções — pergunte qual ao usuário; NUNCA escolha por ele.
        space: ``all`` (padrão), ``personal`` ou ``work`` — quais registros entram.
        regenerate: ``true`` força gerar de novo mesmo sem mudança.

    Returns:
        ``{"status": "ok", "summary": {...}, "cached": bool, "suggestions_created": n}``, ou
        ``{"status": "ok", "empty": true}`` se não há nada para resumir, ou
        ``{"status": "ok", "ambiguous": true, "people": [...]}`` / ``{"status": "error", ...}``.
    """
    from agents.komi import integration  # noqa: PLC0415 — evita custo no import do módulo

    achado = integration.resolve_person(person)
    if achado.get("status") != "ok":
        return achado
    if achado["match"] == "none":
        return {"status": "error", "message": f"Não encontrei '{person}'. Quer cadastrar a pessoa?"}
    if achado["match"] == "many":
        return {"status": "ok", "ambiguous": True, "people": achado["people"],
                "message": "Há mais de uma pessoa com esse nome. Pergunte qual."}
    return person_summary.gerar_resumo(achado["person"]["id"], context=space, force=regenerate)


KOMI_KURISU_TOOLS = [summarize_person_memory]
