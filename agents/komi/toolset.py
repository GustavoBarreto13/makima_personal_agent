"""Lista de tools públicas da Komi, para exposição via MCP (mcp_servers/makima).

Reaproveitada por ``agents/komi/agent.py`` (o agente ADK legado) e por ``mcp_servers/makima/registry.py``
(Hermes). Spec 064 (E6) extraiu a lista; a spec 077 a ampliou com tudo o que antes só existia no
webapp: aniversário como campo, interações, anotações, Memória, briefing, relações, grupos,
relacionamentos configuráveis e mesclar pessoas.

Os grupos de pessoas têm nomes próprios (``create_people_group``...) para não se confundirem com os
grupos de listas da Kaguya, que o Hermes enxerga ao mesmo tempo.
"""

from agents.komi.briefing import get_person_briefing
from agents.komi.integration import get_person_memory, resolve_person
from agents.komi.tools import (
    add_alias,
    add_important_date,
    create_person,
    delete_important_date,
    delete_person,
    find_people,
    get_person,
    get_person_summary,
    list_people,
    remove_alias,
    restore_person,
    set_birthday,
    update_important_date,
    update_person,
    upcoming_birthdays,
)
from agents.komi.tools_categories import create_category, list_categories
from agents.komi.tools_interactions import list_interactions, log_interaction
from agents.komi.tools_merge import find_duplicates, merge_people, preview_merge
from agents.komi.tools_notes import add_person_note, list_person_notes
from agents.komi.tools_relations import (
    add_to_group,
    create_group,
    list_groups,
    list_relation_kinds,
    list_relations,
    relate_people,
    remove_from_group,
)


def create_people_group(name: str) -> dict:
    """Criar um grupo de PESSOAS ("turma da faculdade") — não confundir com grupos de listas da Kaguya.

    Args:
        name: Nome do grupo (único ignorando caixa e acento).

    Returns:
        ``{"status": "ok", "id": int, "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    return create_group(name)


def list_people_groups() -> dict:
    """Listar os grupos de PESSOAS com a quantidade de pessoas em cada um.

    Returns:
        ``{"status": "ok", "groups": [{id, name, member_count}, ...]}``.
    """
    return list_groups()


def add_person_to_group(group_id: int, person_id: str) -> dict:
    """Colocar uma pessoa num grupo de pessoas (idempotente).

    Args:
        group_id: ID do grupo (de ``list_people_groups``).
        person_id: UUID da pessoa (de ``resolve_person``).

    Returns:
        ``{"status": "ok", "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    return add_to_group(group_id, person_id)


def remove_person_from_group(group_id: int, person_id: str) -> dict:
    """Tirar uma pessoa de um grupo de pessoas.

    Args:
        group_id: ID do grupo.
        person_id: UUID da pessoa.

    Returns:
        ``{"status": "ok", "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    return remove_from_group(group_id, person_id)


def relate_person(person_id: str, other_id: str, kind: str) -> dict:
    """Registrar que ``other_id`` É ``kind`` de ``person_id`` (ex.: o João é 'filho' da Ana).

    Os tipos vêm de ``list_relation_kinds`` (irmao, pai_mae, filho, conjuge, amigo, colega, chefe...).
    A relação inversa já fica implícita.

    Args:
        person_id: UUID da pessoa de referência (a Ana).
        other_id: UUID da outra pessoa (o João).
        kind: Slug do tipo — o que a OUTRA pessoa é da de referência.

    Returns:
        ``{"status": "ok", "created": bool}`` ou ``{"status": "error", "message": ...}``.
    """
    return relate_people(other_id, person_id, kind)


TOOLS = [
    # cadastro e busca
    create_person,
    update_person,
    delete_person,
    restore_person,
    add_alias,
    remove_alias,
    list_people,
    find_people,
    resolve_person,
    get_person,
    get_person_summary,
    # aniversário e datas
    set_birthday,
    upcoming_birthdays,
    add_important_date,
    update_important_date,
    delete_important_date,
    # interações, anotações, memória e briefing
    log_interaction,
    list_interactions,
    add_person_note,
    list_person_notes,
    get_person_memory,
    get_person_briefing,
    # relações, grupos e relacionamentos
    list_relation_kinds,
    relate_person,
    list_relations,
    create_people_group,
    list_people_groups,
    add_person_to_group,
    remove_person_from_group,
    list_categories,
    create_category,
    # duplicatas e mesclar
    find_duplicates,
    preview_merge,
    merge_people,
]
