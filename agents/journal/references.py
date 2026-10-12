"""Referências do diário a itens de outros agentes (spec 076).

No diário, ``/akane Matrix`` vira ``[Matrix](akane:movie:<id>)``. Este módulo é o
registro dos provedores (quem busca o quê) e a resolução do texto livre que chega
pelo Hermes (o chat não tem autocomplete — o servidor resolve quando é inequívoco).

Cada agente continua dono do próprio dado: a busca de filmes vive em
``agents.akane.tools.search_local``, a de animes em ``agents.marin``, etc. Aqui só
se monta o catálogo de provedores e se normaliza o formato de saída.

Nenhum backlink é gravado nos outros agentes por enquanto; a tabela ``journal_refs``
(preenchida em ``upsert_bullet``) já deixa o caminho pronto.
"""

from __future__ import annotations

import importlib
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Callable

from agents.journal import markup

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Provider:
    key: str                 # agente (vai no token)
    aliases: tuple[str, ...]  # o que pode vir depois da "/"
    label: str               # nome exibido
    hint: str                # "filmes", "tarefas, hábitos e metas"...
    search: Callable[[str, int], list[dict]]  # -> [{entity_type, id, label, sublabel, cover_url, deep_link}]


def _lazy(module: str, fn: str, entity_type: str):
    """Busca de um agente importada só na hora (evita ciclos e custo de import)."""
    def run(q: str, limit: int) -> list[dict]:
        func = getattr(importlib.import_module(module), fn)
        return [{**r, "entity_type": entity_type} for r in func(q, limit)]
    return run


def _search_frieren(q: str, limit: int) -> list[dict]:
    from agents.frieren.goal_provider import search_items  # noqa: PLC0415
    return [
        {**r, "entity_type": "book", "deep_link": f"/books#livro/{r['id']}"}
        for r in search_items(q)[:limit]
    ]


def _search_kaguya(q: str, limit: int) -> list[dict]:
    """Tarefas (abertas e concluídas), hábitos ativos e metas — nesta ordem de prioridade
    quando o título começa com o termo; o resto vem depois."""
    from agents.db import run_select  # noqa: PLC0415
    from agents.kaguya.tools_tasks import search_tasks  # noqa: PLC0415

    termo = (q or "").strip()
    if not termo:
        return []
    out: list[dict] = []
    try:
        for t in search_tasks(termo, include_completed=True)[:limit]:
            due = t.get("due_date")
            bits = [t.get("project_name"), f"vence {due}" if due else None, "concluída" if t.get("completed_at") else None]
            out.append({
                "entity_type": "task", "id": t["id"], "label": t["title"],
                "sublabel": " · ".join(b for b in bits if b) or None, "cover_url": None,
                "deep_link": f"/tasks#tarefa/{t['id']}",
            })
    except Exception as exc:  # noqa: BLE001 — um provedor quebrado não derruba os outros
        logger.warning("refs kaguya/tarefas: %s", exc)
    try:
        for h in run_select(
            "SELECT id, name FROM habits WHERE archived_at IS NULL AND name ILIKE %(q)s ORDER BY name LIMIT %(n)s",
            {"q": f"%{termo}%", "n": limit},
        ):
            out.append({"entity_type": "habit", "id": h["id"], "label": h["name"], "sublabel": "hábito",
                        "cover_url": None, "deep_link": "/tasks#habitos"})
    except Exception as exc:  # noqa: BLE001
        logger.warning("refs kaguya/hábitos: %s", exc)
    try:
        for g in run_select(
            "SELECT id, title FROM goals WHERE status = 'active' AND title ILIKE %(q)s ORDER BY title LIMIT %(n)s",
            {"q": f"%{termo}%", "n": limit},
        ):
            out.append({"entity_type": "goal", "id": g["id"], "label": g["title"], "sublabel": "meta",
                        "cover_url": None, "deep_link": f"/tasks#metas/{g['id']}"})
    except Exception as exc:  # noqa: BLE001
        logger.warning("refs kaguya/metas: %s", exc)
    low = _norm(termo)
    out.sort(key=lambda r: (not _norm(r["label"]).startswith(low),))
    return out[:limit]


PROVIDERS: tuple[Provider, ...] = (
    Provider("kaguya", ("k", "kaguya", "tarefa"), "Kaguya", "tarefas, hábitos e metas", _search_kaguya),
    Provider("akane", ("akane", "filme"), "Akane", "filmes", _lazy("agents.akane.tools", "search_local", "movie")),
    Provider("frieren", ("frieren", "livro"), "Frieren", "livros", _search_frieren),
    Provider("marin", ("marin", "anime"), "Marin", "animes", _lazy("agents.marin.tools", "search_local", "anime")),
    Provider("mai", ("mai", "serie", "série"), "Mai", "séries", _lazy("agents.mai.tools", "search_local", "series")),
    Provider("yato", ("yato", "viagem"), "Yato", "viagens", _lazy("agents.yato.tools", "search_local", "trip")),
)
assert {p.key for p in PROVIDERS} == set(markup.REF_AGENTS)


def _norm(s: str) -> str:
    nfd = unicodedata.normalize("NFD", (s or "").strip().lower())
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def provider_for(alias: str) -> Provider | None:
    """Achar o provedor pelo que foi digitado depois da "/" (``k``, ``akane``, ``filme``...)."""
    a = _norm(alias)
    for p in PROVIDERS:
        if a == p.key or a in (_norm(x) for x in p.aliases):
            return p
    return None


def list_providers() -> list[dict]:
    """Catálogo para o autocomplete (o que aparece ao digitar só "/")."""
    return [{"key": p.key, "aliases": list(p.aliases), "label": p.label, "hint": p.hint} for p in PROVIDERS]


def search(agent: str, query: str, limit: int = 8) -> dict:
    """Buscar itens de um agente para referenciar no diário.

    Returns:
        ``{"status": "ok", "agent", "results": [{agent, entity_type, entity_id, label, sublabel,
        cover_url, deep_link, token}]}`` ou ``{"status": "error", "message"}``.
    """
    p = provider_for(agent)
    if p is None:
        return {"status": "error", "message": f"agente desconhecido: {agent}"}
    try:
        raw = p.search((query or "").strip(), max(1, min(int(limit), 20))) if (query or "").strip() else []
    except Exception as exc:  # noqa: BLE001
        logger.warning("refs %s: %s", p.key, exc)
        return {"status": "error", "message": "não consegui buscar agora"}
    results = []
    for r in raw:
        entity_id = str(r["id"])
        results.append({
            "agent": p.key, "entity_type": r["entity_type"], "entity_id": entity_id,
            "label": r["label"], "sublabel": r.get("sublabel"), "cover_url": r.get("cover_url"),
            "deep_link": r.get("deep_link"),
            "token": markup.ref_token(r["label"], p.key, r["entity_type"], entity_id),
        })
    return {"status": "ok", "agent": p.key, "results": results}


# ─── Texto livre vindo do chat (Hermes) ──────────────────────────────────────────

# "/akane Matrix com a…" — o alias e as palavras seguintes (o título tem no máx. 8 palavras).
_SLASH = re.compile(r"(?<![\w/:])/([A-Za-zÀ-ÿ]+)((?:[ \t]+[^\s@#/\[\]]+){1,8})")
_LEGACY_AT = re.compile(r"(?<![\w@\]])@([0-9A-Za-zÀ-ÖØ-öø-ÿ_]+)((?:[ \t]+[A-ZÀ-Ö][0-9A-Za-zÀ-ÖØ-öø-ÿ_]*)?)")


def _exact_ref(p: Provider, words: list[str]) -> tuple[dict, int] | None:
    """O maior prefixo das palavras que casa EXATAMENTE (sem acento/caixa) com um único item."""
    for n in range(len(words), 0, -1):
        phrase = " ".join(words[:n]).strip(" ,.;:!?")
        if not phrase:
            continue
        try:
            hits = [r for r in p.search(phrase, 10) if _norm(r["label"]) == _norm(phrase)]
        except Exception:  # noqa: BLE001
            return None
        if len(hits) == 1:
            return hits[0], n
    return None


def resolve_free_text(content: str, find_exact_person: Callable[[str], list[dict]] | None = None) -> dict:
    """Converter ``/agente Título`` e ``@Nome`` do texto livre em tokens, quando inequívoco.

    - ``/akane Matrix`` → ``[Matrix](akane:movie:<id>)`` se exatamente um filme tem esse título.
    - ``@Ana`` / ``@Ana Lima`` → ``@[Ana Lima](komi:<id>)`` se exatamente uma pessoa (nome
      ou apelido, comparação exata) casa.
    O que não resolver fica como está e volta em ``ambiguous`` para o agente perguntar.

    Returns:
        ``{"content": str, "ambiguous": [{"kind": "ref"|"person", "text", "agent"?}]}``
    """
    ambiguous: list[dict] = []

    def ref_sub(m: re.Match) -> str:
        p = provider_for(m.group(1))
        if p is None:
            return m.group(0)
        words = m.group(2).split()
        hit = _exact_ref(p, words)
        if hit is None:
            ambiguous.append({"kind": "ref", "agent": p.key, "text": " ".join(words)})
            return m.group(0)
        item, used = hit
        rest = words[used:]
        token = markup.ref_token(item["label"], p.key, item["entity_type"], str(item["id"]))
        return " ".join([token, *rest]) if rest else token

    out = _SLASH.sub(ref_sub, content or "")

    if find_exact_person is not None:
        def person_sub(m: re.Match) -> str:
            first, second = m.group(1), m.group(2).strip()
            for name, consumed in ((f"{first} {second}", True), (first, False)) if second else ((first, False),):
                matches = find_exact_person(name)
                if len(matches) == 1:
                    token = markup.person_token(matches[0]["name"], str(matches[0]["id"]))
                    return token if consumed or not second else f"{token} {second}"
            ambiguous.append({"kind": "person", "text": first})
            return m.group(0)
        # Tokens já resolvidos não podem ser reprocessados: só trabalha fora deles.
        parts = re.split(r"(@\[[^\]\n]+\]\(komi:[\w-]+\)|\[[^\]\n]+\]\([a-z]+:[a-z_]+:[\w-]+\))", out)
        out = "".join(part if i % 2 else _LEGACY_AT.sub(person_sub, part) for i, part in enumerate(parts))

    return {"content": out, "ambiguous": ambiguous}
