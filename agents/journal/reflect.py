"""Refletir — o stream de seções do diário (spec 076), no modelo do Journalistic.

Uma chamada (``get_reflect``) devolve todas as seções; o front mostra as que estiverem ligadas
nas preferências. As escolhas "aleatórias" usam uma semente pela DATA: trocam a cada dia e
não mudam ao recarregar; ``reroll`` muda a semente (o dado do Memory lane, "outra pergunta").

Seções:
    prompt      — pergunta do dia (respondível: vira bullet ``note`` citando a pergunta)
    gem         — Gema do dia (um bullet ``wisdom``)
    idea        — Ideia do dia (um bullet ``idea``)
    focus       — até 5 metas ativas da Kaguya
    yesterday   — a entrada de ontem (ou None → atalho "escrever sobre ontem")
    week        — a semana: destaques, pessoas e tags novas, sabedoria, ideias, referências
    pins        — linha do tempo de 30 dias por tag/pessoa fixada
    year_ago    — o dia exato de um ano atrás (só com mais de 365 dias de diário)
    memory_lane — um dia aleatório do passado (precisa de 10+ dias escritos)
"""

from __future__ import annotations

import logging
import random
from datetime import date, timedelta

from agents.db import run_select
from agents.journal import markup

logger = logging.getLogger(__name__)

PROMPTS: tuple[str, ...] = (
    "O que ficou de mais valioso no seu dia de hoje?",
    "Qual foi o momento em que você se sentiu mais vivo?",
    "O que você deixou para amanhã que poderia ter feito hoje?",
    "Existe algo que você notou hoje mas não registrou ainda?",
    "O que você fez hoje que o você de um ano atrás admiraria?",
    "Em que momento você agiu contra o que diz valorizar?",
    "O que está ocupando espaço demais na sua cabeça?",
    "De que conversa você ainda está fugindo?",
    "O que te deu energia hoje? E o que drenou?",
    "Que pequena vitória passou sem você comemorar?",
    "Se hoje se repetisse por um ano, onde você estaria?",
    "O que você aprendeu hoje — sobre o mundo ou sobre você?",
    "Pelo que você é grato hoje, de verdade, sem clichê?",
    "Qual decisão você está adiando e por quê?",
    "Quem merece ouvir um obrigado seu esta semana?",
    "O que você faria diferente se ninguém estivesse olhando?",
    "Qual hábito está te construindo — e qual está te sabotando?",
    "Que história você contou para si mesmo hoje que talvez não seja verdade?",
    "O que você quer lembrar deste dia daqui a dez anos?",
    "Onde você foi duro demais consigo hoje? E onde foi mole demais?",
    "Qual o próximo passo pequeno e concreto para o que mais importa?",
    "O que você evitou sentir hoje?",
    "Em que você gastou tempo que não gostaria de ter gasto?",
    "O que te surpreendeu hoje?",
)

SECTIONS = ("prompt", "gem", "idea", "focus", "yesterday", "week", "pins", "year_ago", "memory_lane")


def _rng(day: date, section: str, reroll: int = 0) -> random.Random:
    return random.Random(f"{day.isoformat()}:{section}:{reroll}")


def pick_prompt(day: date, reroll: int = 0) -> dict:
    """Pergunta do dia — determinística por data (e ``reroll``)."""
    idx = _rng(day, "prompt", reroll).randrange(len(PROMPTS))
    return {"index": idx, "text": PROMPTS[idx]}


def _bullet_rows(kind: str) -> list[dict]:
    return run_select(
        """
        SELECT b.id, b.content, p.date::text AS date, p.font
        FROM journal_bullets b JOIN journal_pages p ON p.id = b.page_id
        WHERE b.kind = %(k)s AND btrim(b.content) <> ''
        ORDER BY b.id
        """,
        {"k": kind},
    )


def _pick(rows: list, day: date, section: str, reroll: int):
    if not rows:
        return None
    return rows[_rng(day, section, reroll).randrange(len(rows))]


def _day_entry(d: date) -> dict | None:
    """Resumo de um dia para os cards (bullets não vazios, sonho, contagens)."""
    pages = run_select(
        "SELECT id, date::text AS date, NULLIF(btrim(dream), '') AS dream, font FROM journal_pages WHERE type_id = 1 AND date = %(d)s",
        {"d": d},
    )
    if not pages:
        return None
    page = pages[0]
    bullets = run_select(
        """SELECT id, kind, content, favorite FROM journal_bullets
           WHERE page_id = %(p)s AND btrim(content) <> '' ORDER BY position""",
        {"p": page["id"]},
    )
    emotions = run_select(
        """SELECT e.name, l.intensity FROM journal_emotion_logs l JOIN journal_emotions e ON e.id = l.emotion_id
           WHERE l.page_id = %(p)s ORDER BY l.created_at""",
        {"p": page["id"]},
    )
    letters = run_select("SELECT COUNT(*) AS n FROM journal_letters WHERE page_id = %(p)s", {"p": page["id"]})
    if not bullets and not page["dream"] and not emotions and not letters[0]["n"]:
        return None
    return {
        "date": page["date"], "font": page["font"], "dream": page["dream"],
        "bullets": bullets[:8], "bullet_count": len(bullets),
        "words": sum(markup.word_count(b["content"]) for b in bullets) + markup.word_count(page["dream"] or ""),
        "emotions": emotions, "letter_count": int(letters[0]["n"]),
    }


def _content_days() -> list[date]:
    rows = run_select(
        """
        SELECT p.date FROM journal_pages p
        WHERE p.type_id = 1 AND (
            NULLIF(btrim(p.dream), '') IS NOT NULL
            OR EXISTS (SELECT 1 FROM journal_bullets b WHERE b.page_id = p.id AND btrim(b.content) <> ''))
        ORDER BY p.date
        """
    )
    return [r["date"] for r in rows]


def _focus() -> list[dict]:
    try:
        from agents.kaguya.tools_goals import list_goals  # noqa: PLC0415
        goals = list_goals()
    except Exception as exc:  # noqa: BLE001 — a Kaguya fora do ar não derruba o Refletir
        logger.warning("reflect: metas indisponíveis: %s", exc)
        return []
    goals.sort(key=lambda g: (g.get("days_remaining") is None, g.get("days_remaining") or 0))
    return [
        {"id": g["id"], "title": g["title"], "why": g.get("why"), "life_area": g.get("life_area"),
         "progress_pct": g.get("progress_pct"), "days_remaining": g.get("days_remaining"),
         "is_overdue": g.get("is_overdue"), "deep_link": f"/tasks#metas/{g['id']}"}
        for g in goals[:5]
    ]


def _week(today: date) -> dict:
    start = today - timedelta(days=6)
    params = {"a": start, "b": today}
    bullets = run_select(
        """
        SELECT b.id, b.kind, b.content, p.date::text AS date
        FROM journal_bullets b JOIN journal_pages p ON p.id = b.page_id
        WHERE p.date BETWEEN %(a)s AND %(b)s AND btrim(b.content) <> ''
          AND (b.kind IN ('highlight', 'wisdom', 'idea') OR b.favorite)
        ORDER BY p.date DESC, b.position
        """,
        params,
    )
    # Pessoas e tags NOVAS: citadas na semana e nunca antes dela.
    new_mentions = run_select(
        """
        WITH firsts AS (
            SELECT m.kind, COALESCE(m.person_id, lower(m.value)) AS k,
                   MODE() WITHIN GROUP (ORDER BY m.value) AS value, MAX(m.person_id) AS person_id,
                   MIN(p.date) AS first_date
            FROM journal_mentions m
            JOIN journal_bullets b ON b.id = m.bullet_id
            JOIN journal_pages p ON p.id = b.page_id
            GROUP BY m.kind, COALESCE(m.person_id, lower(m.value))
        )
        SELECT kind, value, person_id, first_date::text AS first_date FROM firsts
        WHERE first_date BETWEEN %(a)s AND %(b)s
        ORDER BY first_date DESC
        """,
        params,
    )
    refs = run_select(
        """
        SELECT r.agent, r.entity_type, r.entity_id, MODE() WITHIN GROUP (ORDER BY r.label) AS label,
               COUNT(*) AS count
        FROM journal_refs r JOIN journal_bullets b ON b.id = r.bullet_id
        JOIN journal_pages p ON p.id = b.page_id
        WHERE p.date BETWEEN %(a)s AND %(b)s
        GROUP BY r.agent, r.entity_type, r.entity_id
        ORDER BY count DESC
        """,
        params,
    )
    by_kind = lambda k: [b for b in bullets if b["kind"] == k]  # noqa: E731
    return {
        "since": start.isoformat(), "until": today.isoformat(),
        "highlights": by_kind("highlight"), "wisdom": by_kind("wisdom"), "ideas": by_kind("idea"),
        "favorites": [b for b in bullets if b["kind"] not in ("highlight", "wisdom", "idea")],
        "new_people": [m for m in new_mentions if m["kind"] == "person"],
        "new_tags": [m for m in new_mentions if m["kind"] == "tag"],
        "refs": [{**r, "count": int(r["count"])} for r in refs],
    }


def pin_timeline(pin: str, today: date, days: int = 30) -> dict | None:
    """Linha do tempo de 30 dias de uma tag (``tag:viagem``) ou pessoa (``person:<id>``).

    Returns:
        ``{"pin", "kind", "label", "days": [{"date", "count"}], "total"}`` ou None se inválido.
    """
    kind, _, value = (pin or "").partition(":")
    if kind not in ("tag", "person") or not value:
        return None
    start = today - timedelta(days=days - 1)
    if kind == "tag":
        cond, label_sql = "m.kind = 'tag' AND lower(m.value) = lower(%(v)s)", "%(v)s"
    else:
        cond, label_sql = "m.kind = 'person' AND m.person_id = %(v)s", "MODE() WITHIN GROUP (ORDER BY m.value)"
    rows = run_select(
        f"""
        SELECT p.date, COUNT(DISTINCT b.id) AS n, {label_sql} AS label
        FROM journal_mentions m JOIN journal_bullets b ON b.id = m.bullet_id
        JOIN journal_pages p ON p.id = b.page_id
        WHERE {cond} AND p.date BETWEEN %(a)s AND %(b)s
        GROUP BY p.date
        """,
        {"v": value, "a": start, "b": today},
    )
    counts = {r["date"]: int(r["n"]) for r in rows}
    label = rows[0]["label"] if rows else value
    if kind == "person" and not rows:
        try:
            name = run_select("SELECT name FROM people WHERE id = %(v)s", {"v": value})
            label = name[0]["name"] if name else value
        except Exception:  # noqa: BLE001
            pass
    series = [{"date": (start + timedelta(days=i)).isoformat(), "count": counts.get(start + timedelta(days=i), 0)}
              for i in range(days)]
    return {"pin": pin, "kind": kind, "value": value, "label": label, "days": series,
            "total": sum(counts.values())}


def get_reflect(today: date, pins: list[str] | None = None, reroll: dict | None = None) -> dict:
    """Todas as seções do Refletir para ``today``.

    Args:
        today: Hoje (America/Sao_Paulo — quem chama resolve).
        pins: ``["tag:viagem", "person:<id>"]`` fixados nas preferências.
        reroll: ``{"prompt": n, "gem": n, "idea": n, "memory_lane": n}`` — muda a semente da seção.

    Returns:
        ``{"date", "prompt", "gem", "idea", "focus", "yesterday", "week", "pins",
        "year_ago", "memory_lane", "stats": {"days_written", "first_date"}}``.
    """
    rr = reroll or {}
    out: dict = {"date": today.isoformat()}

    def safe(name, fn, default=None):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — uma seção quebrada não derruba o stream
            logger.warning("reflect/%s: %s", name, exc)
            return default

    out["prompt"] = pick_prompt(today, int(rr.get("prompt", 0)))
    out["gem"] = safe("gem", lambda: _pick(_bullet_rows("wisdom"), today, "gem", int(rr.get("gem", 0))))
    out["idea"] = safe("idea", lambda: _pick(_bullet_rows("idea"), today, "idea", int(rr.get("idea", 0))))
    out["focus"] = safe("focus", _focus, [])
    yesterday = today - timedelta(days=1)
    out["yesterday"] = {"date": yesterday.isoformat(), "entry": safe("yesterday", lambda: _day_entry(yesterday))}
    out["week"] = safe("week", lambda: _week(today))
    out["pins"] = [t for t in (safe("pins", lambda p=p: pin_timeline(p, today)) for p in (pins or [])[:6]) if t]

    days = safe("days", _content_days, []) or []
    out["stats"] = {"days_written": len(days), "first_date": days[0].isoformat() if days else None}

    year_ago = date(today.year - 1, today.month, min(today.day, 28 if today.month == 2 else today.day))
    out["year_ago"] = (
        {"date": year_ago.isoformat(), "entry": safe("year_ago", lambda: _day_entry(year_ago))}
        if days and (today - days[0]).days > 365 else None
    )

    past = [d for d in days if d < today]
    if len(days) >= 10 and past:
        pick = _rng(today, "memory_lane", int(rr.get("memory_lane", 0))).choice(past)
        out["memory_lane"] = {"date": pick.isoformat(), "entry": safe("memory_lane", lambda: _day_entry(pick)),
                              "days_ago": (today - pick).days}
    else:
        out["memory_lane"] = None
    return out
