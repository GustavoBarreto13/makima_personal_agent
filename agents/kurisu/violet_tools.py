"""Tools da Violet que dependem da Kurisu (IA + RAG), para o Hermes — spec 076.

Ficam fora de ``agents/journal`` (que não depende da Kurisu); o registry do MCP junta estas
tools ao domínio ``journal`` (``mcp_servers/makima/registry.py``).
"""

from __future__ import annotations

from typing import Optional

from agents.kurisu import counsel, emotion_analysis, weekly_review


def conselho_do_dia(date: Optional[str] = None) -> dict:
    """Conselho do Dia já gerado (sem gerar). ``date`` = YYYY-MM-DD; padrão hoje."""
    from agents.journal.tools import _today_sp  # noqa: PLC0415
    c = counsel.get_conselho(date or _today_sp().isoformat())
    return {"status": "ok", "counsel": c} if c else {"status": "ok", "counsel": None,
                                                      "message": "Ainda não há conselho para esse dia."}


def gerar_conselho_do_dia(date: Optional[str] = None) -> dict:
    """Gerar (ou regerar) o Conselho do Dia — chamada longa (até ~90s). Responda com o texto
    (``essay_md``) e as ações; as referências [N] estão em ``sources``."""
    from agents.journal.tools import _today_sp  # noqa: PLC0415
    return counsel.gerar_conselho(date or _today_sp().isoformat())


def revisao_da_semana(semana: Optional[str] = None) -> dict:
    """Revisão semanal já gerada (qualquer data da semana; padrão: a mais recente)."""
    r = weekly_review.get_revisao_semanal(semana)
    return {"status": "ok", "review": r} if r else {"status": "ok", "review": None,
                                                     "message": "Ainda não há revisão para essa semana."}


def gerar_revisao_da_semana(semana: Optional[str] = None) -> dict:
    """Gerar (ou regerar) a revisão semanal do diário — chamada longa."""
    return weekly_review.gerar_revisao_semanal(semana)


def leitura_emocional(desde: Optional[str] = None, ate: Optional[str] = None) -> dict:
    """Leitura da Violet sobre os registros emocionais do período (gera se ainda não houver)."""
    a = emotion_analysis.get_analise_emocoes(desde, ate)
    if a:
        return {"status": "ok", "analysis": a}
    return emotion_analysis.analisar_emocoes(desde, ate)


VIOLET_KURISU_TOOLS = [
    conselho_do_dia,
    gerar_conselho_do_dia,
    revisao_da_semana,
    gerar_revisao_da_semana,
    leitura_emocional,
]
