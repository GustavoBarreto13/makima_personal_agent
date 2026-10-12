"""Tools da Violet pensadas para o chat (Hermes: Telegram/WhatsApp/Discord) — spec 076.

No webapp há autocomplete; no chat, não. Estas tools fazem o trabalho do lado do servidor:
``escrever_no_diario`` resolve ``@Nome`` e ``/akane Título`` do texto livre em tokens quando
é inequívoco e devolve o que ficou ambíguo para o agente perguntar.

Expostas pelo domínio MCP ``journal`` (``agents/journal/toolset.py``).
"""

from __future__ import annotations

from datetime import date as _date
from typing import Optional

from agents.journal import references, values
from agents.journal import tools as T
from agents.journal.emotion_patterns import get_emotion_patterns as _patterns
from agents.journal.reflect import get_reflect as _reflect
from agents.journal.strength import get_writing_strength as _strength


def _find_exact_person(name: str) -> list[dict]:
    try:
        from agents.komi.tools import find_people_exact  # noqa: PLC0415
        return find_people_exact(name)
    except Exception:  # noqa: BLE001
        return []


def escrever_no_diario(texto: str, date: Optional[str] = None, kind: str = "bullet") -> dict:
    """Acrescentar uma linha ao diário do dia, resolvendo @pessoas e /referências.

    Use para registrar o que o usuário contou. ``@Ana`` vira a pessoa da Komi (se houver
    exatamente uma com esse nome/apelido) e ``/akane Matrix`` vira o filme da Akane (se houver
    exatamente um com esse título). Aliases: /k (Kaguya: tarefas, hábitos, metas), /akane
    (filmes), /frieren (livros), /marin (animes), /mai (séries), /yato (viagens).

    Args:
        texto: O texto do bullet, como o usuário disse.
        date: Dia (YYYY-MM-DD); padrão = hoje (America/Sao_Paulo).
        kind: bullet | highlight | idea | wisdom | note | dream.

    Returns:
        ``{"status": "ok", "bullet": {...}, "content": str, "ambiguous": [...]}`` — se
        ``ambiguous`` não estiver vazio, pergunte ao usuário qual item/pessoa ele quis dizer e
        use ``buscar_referencias``/``sugerir_pessoas`` + ``upsert_bullet`` (mesma position) para corrigir.
    """
    if not (texto or "").strip():
        return {"status": "error", "message": "texto vazio"}
    day = date or T._today_sp().isoformat()
    page = T.ensure_page(day)
    if page.get("error"):
        return {"status": "error", "message": page["error"]}
    resolved = references.resolve_free_text(texto.strip(), _find_exact_person)
    positions = [b["position"] for b in page["bullets"]]
    position = (max(positions) + 1000) if positions else 0
    result = T.upsert_bullet(page["page"]["id"], position, resolved["content"], kind)
    if result.get("status") != "ok":
        return result
    return {"status": "ok", "bullet": result["bullet"], "content": resolved["content"],
            "ambiguous": resolved["ambiguous"], "date": day}


def buscar_referencias(agente: str, consulta: str) -> dict:
    """Buscar itens de outro agente para citar no diário (``/k``, ``/akane``, ``/frieren``,
    ``/marin``, ``/mai``, ``/yato``). Cada resultado traz o ``token`` pronto para pôr no texto."""
    return references.search(agente, consulta, limit=8)


def sugerir_pessoas(consulta: str) -> dict:
    """Pessoas da Komi por prefixo do nome ou apelido — use o token ``@[Nome](komi:<id>)`` no texto."""
    try:
        from agents.komi.tools import suggest_people  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        return {"status": "error", "message": "Komi indisponível"}
    r = suggest_people(consulta, limit=8)
    for p in r.get("people", []):
        p["token"] = f"@[{p['name']}](komi:{p['id']})"
    return r


def definir_fonte_do_dia(fonte: str, date: Optional[str] = None) -> dict:
    """Fonte de um dia no diário: ``normal``, ``roteiro`` ou ``cursiva``."""
    return T.set_page_font(date or T._today_sp().isoformat(), fonte)


def forca_da_escrita(meta_semanal: int = 5) -> dict:
    """Força da escrita (mesmo motor dos hábitos da Kaguya): consistência 0–100, tendência e
    dias escritos nas últimas 2 semanas. ``meta_semanal`` = dias por semana (1–7)."""
    r = _strength(meta_semanal, days=14)
    r.pop("series", None)
    return r


def refletir(date: Optional[str] = None) -> dict:
    """O Refletir do dia: pergunta do dia, gema e ideia do dia, metas em foco, ontem, a semana,
    um ano atrás e uma lembrança aleatória (Memory lane)."""
    return _reflect(_date.fromisoformat(date) if date else T._today_sp())


def listar_cartas(status: Optional[str] = None, pessoa_id: Optional[str] = None, busca: Optional[str] = None) -> list:
    """Todas as cartas (rascunho/lacrada), filtráveis por pessoa da Komi ou texto."""
    return T.list_all_letters(status=status, person_id=pessoa_id, q=busca, limit=30)


def ler_carta(carta_id: int) -> dict:
    """Uma carta completa, com o dia e as pessoas vinculadas."""
    return T.get_letter(carta_id)


def listar_registros_emocionais(desde: Optional[str] = None, ate: Optional[str] = None, busca: Optional[str] = None) -> list:
    """Registros emocionais (TCC) de um período (YYYY-MM-DD), do mais recente para o mais antigo."""
    return T.list_all_emotion_logs(since=desde, until=ate, q=busca, limit=60)


def padroes_emocionais(desde: Optional[str] = None, ate: Optional[str] = None) -> dict:
    """O que está acontecendo com as emoções: gatilhos, horários, tendências, eficácia da
    reavaliação e mudanças contra o período anterior (padrão: últimos 30 dias)."""
    return _patterns(desde, ate)


def resumo_dos_valores() -> dict:
    """Resumo da Avaliação dos Valores (áreas que importam, alertas, compromissos e check-ins)."""
    texto = values.values_context_for_counsel()
    return {"status": "ok", "resumo": texto or "A Avaliação dos Valores ainda não foi feita (webapp: /journal#valores)."}


def checkin_de_valores(area: str, acao: int, satisfacao: int) -> dict:
    """Check-in semanal de uma área de valor (sobre a semana que passou): ação e satisfação de 1 a 10.

    Áreas: familia, intimidade, parentalidade, amizades, carreira, educacao, lazer,
    espiritualidade, comunidade, saude, ambiente, arte.
    """
    return values.checkin(area, acao, satisfacao)


def compromissos_de_valores() -> dict:
    """Ações compromissadas da última Avaliação dos Valores."""
    cur = values.get_current().get("assessment") or {}
    return {"status": "ok", "commitments": cur.get("commitments") or []}


CHAT_TOOLS = [
    escrever_no_diario,
    buscar_referencias,
    sugerir_pessoas,
    definir_fonte_do_dia,
    forca_da_escrita,
    refletir,
    listar_cartas,
    ler_carta,
    listar_registros_emocionais,
    padroes_emocionais,
    resumo_dos_valores,
    checkin_de_valores,
    compromissos_de_valores,
]
