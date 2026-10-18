"""Briefing de uma pessoa: tudo o que importa saber antes de falar com ela — Komi, spec 077.

Reúne num só lugar o que está espalhado: nomes, aniversário e datas próximas, anotações ativas
(ideias de presente, gostos), o resumo de IA da Memória (se já foi gerado), pendências entre vocês
(saldo na Nami, tarefas abertas e "aguardando" na Kaguya), há quanto tempo vocês não se falam,
relações e grupos. É a base do cartão "Briefing" do perfil e da pergunta ao Hermes
"o que eu sei da Bia?". Cada bloco é isolado: se um agente falhar, o resto do briefing sai.

Usage:
    >>> from agents.komi.briefing import get_person_briefing
    >>> get_person_briefing("uuid-da-bia")["perfil"]["name"]    # doctest: +SKIP
    'Beatriz'
"""

from __future__ import annotations

import logging
from datetime import date

from agents.komi import integration, naming
from agents.komi.tools import run_select

logger = logging.getLogger(__name__)

# Datas importantes dos próximos N dias entram no briefing.
DIAS_A_FRENTE = 60


def _proxima_ocorrencia(data: date, recorrente: bool, hoje: date) -> date | None:
    """Achar a próxima vez que uma data importante acontece, a partir de hoje.

    Args:
        data: A data guardada (o ano é só âncora quando ``recorrente``).
        recorrente: Se repete todo ano.
        hoje: Dia de referência (inclusive).

    Returns:
        A próxima ocorrência, ou ``None`` se é uma data única que já passou.

    Example:
        >>> _proxima_ocorrencia(date(2018, 6, 20), True, date(2026, 10, 18))
        datetime.date(2027, 6, 20)
        >>> _proxima_ocorrencia(date(2019, 12, 1), False, date(2026, 10, 18)) is None
        True
    """
    if recorrente:
        return naming.next_birthday(data.day, data.month, hoje)
    return data if data >= hoje else None


def get_person_briefing(person_id: str, check_stale: bool = True) -> dict:
    """Montar o briefing de uma pessoa.

    Args:
        person_id: ID da pessoa.
        check_stale: Se ``True``, diz se o resumo de IA guardado está desatualizado (consulta a
            Memória nos agentes). Passe ``False`` para uma resposta mais rápida.

    Returns:
        ``{"status": "ok", "perfil": {...}, "birthday": {...}|None, "dates": [...], "notes": {...},
        "suggestions_pending": n, "ai": {...}|None, "pending": {...}, "contact": {...},
        "relations": [...], "groups": [...]}`` ou ``{"status": "error", "message": ...}``.
    """
    from agents.komi import summaries, tools_notes, tools_relations  # noqa: PLC0415 — evita ciclo de import

    hoje = naming.today_sp()
    try:
        achado = run_select(
            """
            SELECT p.id, p.name, p.nickname, p.full_name, p.relationship, p.category, p.context, p.city,
                   p.phone, p.email, p.instagram, p.telegram, p.avatar_url,
                   p.birth_day, p.birth_month, p.birth_year, p.birthday_remind_days,
                   c.label AS category_label
            FROM people p LEFT JOIN person_categories c ON c.slug = p.category
            WHERE p.id = %(id)s AND p.deleted = FALSE
            """,
            {"id": person_id},
        )
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}
    if not achado:
        return {"status": "error", "message": "Pessoa não encontrada."}
    perfil = achado[0]

    # Aniversário: próximo dia e a idade que a pessoa completa
    aniversario = None
    if perfil["birth_day"]:
        quando = naming.next_birthday(perfil["birth_day"], perfil["birth_month"], hoje)
        aniversario = {
            "day": perfil["birth_day"], "month": perfil["birth_month"], "year": perfil["birth_year"],
            "next_date": quando.isoformat(), "in_days": (quando - hoje).days,
            "turning": (quando.year - perfil["birth_year"]) if perfil["birth_year"] else None,
        }

    def isolado(nome: str, produzir, padrao):
        """Rodar um bloco do briefing; se falhar, registrar e usar o valor padrão."""
        try:
            return produzir()
        except Exception:  # noqa: BLE001
            logger.warning("Komi: bloco '%s' do briefing falhou.", nome, exc_info=True)
            return padrao

    def datas_proximas() -> list[dict]:
        proximas = []
        for d in run_select("SELECT label, date, recurring, remind_days_before FROM person_dates WHERE person_id = %(p)s", {"p": person_id}):
            guardada = d["date"] if isinstance(d["date"], date) else date.fromisoformat(str(d["date"]))
            quando = _proxima_ocorrencia(guardada, d["recurring"], hoje)
            if quando and (quando - hoje).days <= DIAS_A_FRENTE:
                proximas.append({"label": d["label"], "date": quando.isoformat(), "in_days": (quando - hoje).days,
                                 "remind_days_before": d["remind_days_before"]})
        return sorted(proximas, key=lambda x: x["in_days"])

    def anotacoes() -> tuple[dict, int]:
        todas = tools_notes.list_person_notes(person_id)["notes"]
        agrupadas: dict[str, list[dict]] = {}
        for n in todas:
            if n["status"] == "ativa":
                agrupadas.setdefault(n["kind"], []).append({"id": n["id"], "text": n["text"], "context": n["context"]})
        return agrupadas, sum(1 for n in todas if n["status"] == "sugerida")

    def pendencias() -> dict:
        blocos = integration.summary_blocks(person_id)
        return {
            "balance": (blocos.get("financas") or {}).get("saldo", 0.0),
            "open_tasks": len((blocos.get("tarefas") or {}).get("abertas", [])),
            "waiting": (blocos.get("aguardando") or {}).get("itens", []),
        }

    def contato() -> dict:
        ultima = integration.last_activity_map([person_id]).get(person_id)
        recentes = [
            {"kind": r["kind"], "date": r["date"], "note": r["note"], "context": r["context"]}
            for r in run_select(
                """
                SELECT kind, context, note, (happened_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS date
                FROM person_interactions WHERE person_id = %(p)s AND deleted = FALSE ORDER BY happened_at DESC LIMIT 3
                """,
                {"p": person_id},
            )
        ]
        dias = (hoje - date.fromisoformat(ultima["date"])).days if ultima else None
        return {"last": ultima, "days_since": dias, "recent_interactions": recentes}

    notas, sugeridas = isolado("anotações", anotacoes, ({}, 0))
    return {
        "status": "ok",
        "perfil": perfil,
        "birthday": aniversario,
        "dates": isolado("datas", datas_proximas, []),
        "notes": notas,
        "suggestions_pending": sugeridas,
        "ai": isolado("resumo de IA", lambda: summaries.get_cached_summary(person_id, "all", check_stale=check_stale), None),
        "pending": isolado("pendências", pendencias, {"balance": 0.0, "open_tasks": 0, "waiting": []}),
        "contact": isolado("contato", contato, {"last": None, "days_since": None, "recent_interactions": []}),
        "relations": isolado("relações", lambda: tools_relations.list_relations(person_id)["relations"], []),
        "groups": isolado("grupos", lambda: tools_relations.list_person_groups(person_id)["groups"], []),
    }
