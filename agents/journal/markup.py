"""Marcação do texto do diário (spec 076) — motor PURO, sem banco.

O conteúdo de um bullet é texto puro, legível em qualquer canal (webapp, Telegram,
WhatsApp). Três tipos de marcação convivem nele:

- **Pessoa resolvida** (Komi): ``@[Ana Lima](komi:<uuid>)`` — mesmo formato que a
  Kaguya usa nas notas de tarefa. O ID garante o vínculo certo mesmo com homônimos.
- **Referência a outro agente**: ``[Matrix](akane:movie:123)`` —
  ``agente:tipo:id``. Vira linha em ``journal_refs`` (backlinks futuros).
- **Legado**: ``@Ana`` (pessoa sem ID) e ``#tag`` (tags aceitam hífen).

O frontend tem o espelho desta lógica em ``pages/violet/lib/markup.ts`` — as regras
precisam bater (os testes dos dois lados cobrem os mesmos casos).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Agentes que podem ser referenciados com "/" no diário. A Komi tem gatilho próprio (@).
REF_AGENTS = ("kaguya", "akane", "frieren", "marin", "mai", "yato")

# @[Nome](komi:id) — o nome não pode ter "]" nem quebra de linha.
_PERSON_TOKEN = re.compile(r"@\[([^\]\n]{1,80})\]\(komi:([\w-]{1,64})\)")
# [Rótulo](agente:tipo:id) — só agentes conhecidos, para não confundir com links Markdown.
_REF_TOKEN = re.compile(
    r"(?<!@)\[([^\]\n]{1,160})\]\((" + "|".join(REF_AGENTS) + r"):([a-z_]{1,24}):([\w-]{1,64})\)"
)
# @Nome legado: começo de palavra (e-mails não contam), letras/dígitos/_ com acento.
_LEGACY_PERSON = re.compile(r"(?<![\w@\]])@([0-9A-Za-zÀ-ÖØ-öø-ÿ_]+)")
# #tag: começa com letra/dígito, pode ter hífen no meio.
_TAG = re.compile(r"(?<![\w#&])#([0-9A-Za-zÀ-ÖØ-öø-ÿ_][0-9A-Za-zÀ-ÖØ-öø-ÿ_-]*)")


@dataclass(frozen=True)
class PersonMention:
    name: str
    person_id: str | None  # None = menção legada, sem ID


@dataclass(frozen=True)
class Reference:
    label: str
    agent: str
    entity_type: str
    entity_id: str


@dataclass(frozen=True)
class Parsed:
    people: tuple[PersonMention, ...]
    refs: tuple[Reference, ...]
    tags: tuple[str, ...]


def _blank_tokens(text: str) -> str:
    """Trocar os tokens estruturados por espaços (mesmo tamanho), para que a busca
    legada de ``@`` e ``#`` não ache nada dentro deles."""
    def blank(m: re.Match) -> str:
        return " " * len(m.group(0))
    return _REF_TOKEN.sub(blank, _PERSON_TOKEN.sub(blank, text))


def _dedup(items):
    seen = set()
    out = []
    for it in items:
        if it in seen:
            continue
        seen.add(it)
        out.append(it)
    return tuple(out)


def parse(text: str) -> Parsed:
    """Extrair pessoas, referências e tags do texto, sem duplicatas, na ordem em que aparecem."""
    text = text or ""
    people = [PersonMention(m.group(1).strip(), m.group(2)) for m in _PERSON_TOKEN.finditer(text)]
    refs = [Reference(m.group(1).strip(), m.group(2), m.group(3), m.group(4)) for m in _REF_TOKEN.finditer(text)]
    rest = _blank_tokens(text)
    people += [PersonMention(m.group(1), None) for m in _LEGACY_PERSON.finditer(rest)]
    tags = [m.group(1).rstrip("-") for m in _TAG.finditer(rest)]
    return Parsed(_dedup(people), _dedup(refs), _dedup(t for t in tags if t))


def plain_text(text: str) -> str:
    """Texto legível sem a sintaxe dos tokens: ``@[Ana](komi:1)`` → ``@Ana``,
    ``[Matrix](akane:movie:3)`` → ``Matrix``. Usado em excerpts, contagem de palavras
    e nos prompts de IA."""
    text = _PERSON_TOKEN.sub(lambda m: "@" + m.group(1), text or "")
    return _REF_TOKEN.sub(lambda m: m.group(1), text)


def word_count(text: str) -> int:
    """Palavras do texto já sem a sintaxe dos tokens."""
    return len(plain_text(text).split())


def person_token(name: str, person_id: str) -> str:
    """Montar o token de pessoa (colchetes no nome viram parênteses para não quebrar o token)."""
    clean = name.replace("[", "(").replace("]", ")").strip()
    return f"@[{clean}](komi:{person_id})"


def ref_token(label: str, agent: str, entity_type: str, entity_id: str | int) -> str:
    """Montar o token de referência a outro agente."""
    clean = label.replace("[", "(").replace("]", ")").strip()
    return f"[{clean}]({agent}:{entity_type}:{entity_id})"
