"""Detecção de possíveis pessoas duplicadas (função PURA, sem banco) — Komi, spec 077.

Com três campos de nome, ``@Bia`` nas conversas e vários agentes cadastrando gente, é fácil acabar
com a mesma pessoa duas vezes ("Ana" e "Ana Lima"; "Beatriz" e "Beatris"). Este módulo só
SUGERE pares — quem decide mesclar é o dono, olhando a prévia.

Sinais (do mais ao menos forte):
    - contato igual: mesmo telefone, e-mail, Instagram ou Telegram;
    - mesmo nome em campos diferentes (o Nome de uma é o Apelido da outra);
    - um nome contém o outro como palavras inteiras ("Ana" e "Ana Lima");
    - nomes parecidos (erro de digitação: "Beatriz" e "Beatris").

Usage:
    >>> from agents.komi.duplicates import candidate_pairs
    >>> a = {"id": "1", "name": "Ana"}
    >>> b = {"id": "2", "name": "Ana Lima"}
    >>> candidate_pairs([a, b])[0]["reasons"]
    ['um nome contém o outro']
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from itertools import combinations

from agents.komi import naming

# Parecido o bastante para suspeitar de erro de digitação (e não de duas pessoas diferentes).
_LIMIAR_PARECIDO = 0.82


def _chaves(p: dict) -> set[str]:
    """Reunir todos os nomes normalizados de uma pessoa (Nome, Apelido, Nome completo e outras formas).

    Args:
        p: Pessoa com ``name`` e, opcionalmente, ``nickname``, ``full_name`` e ``aliases``.

    Returns:
        Conjunto de nomes normalizados, sem vazios.
    """
    brutos = [p.get("name"), p.get("nickname"), p.get("full_name"), *(p.get("aliases") or [])]
    return {k for k in (naming.norm(x) for x in brutos) if k}


def _contato(p: dict) -> dict[str, str]:
    """Extrair os contatos de uma pessoa em forma comparável.

    Telefone vira só dígitos (os 9 últimos, para ignorar código do país); Instagram/Telegram
    perdem o ``@`` e a caixa; e-mail é comparado em minúsculas.

    Args:
        p: Pessoa com ``phone``, ``email``, ``instagram`` e/ou ``telegram``.

    Returns:
        ``{tipo: valor}`` só com os contatos preenchidos e plausíveis.
    """
    saida: dict[str, str] = {}
    digitos = re.sub(r"\D", "", p.get("phone") or "")
    if len(digitos) >= 8:
        saida["telefone"] = digitos[-9:]
    if (p.get("email") or "").strip():
        saida["e-mail"] = p["email"].strip().lower()
    for campo, rotulo in (("instagram", "Instagram"), ("telegram", "Telegram")):
        valor = naming.norm(p.get(campo)).lstrip("@")
        if valor:
            saida[rotulo] = valor
    return saida


def _parecem(a: str, b: str) -> tuple[str, float] | None:
    """Dizer se dois nomes normalizados sugerem a mesma pessoa.

    Args:
        a: Nome normalizado.
        b: Outro nome normalizado.

    Returns:
        ``(motivo, nota)`` ou ``None`` se não parecem.

    Example:
        >>> _parecem("ana", "ana lima")
        ('um nome contém o outro', 0.8)
        >>> _parecem("beatriz", "beatris")[0]
        'nomes parecidos'
        >>> _parecem("ana", "bruno") is None
        True
    """
    if a == b:
        return "mesmo nome", 0.95
    curto, longo = sorted((a, b), key=len)
    # "Ana" dentro de "Ana Lima" — como palavras inteiras, não "Ana" dentro de "Mariana".
    if len(curto) >= 3 and re.search(rf"(^|\s){re.escape(curto)}(\s|$)", longo):
        return "um nome contém o outro", 0.8
    # Erro de digitação: no máximo uma letra a mais ou a menos e bem semelhantes letra a letra
    # ("Maria" × "Mariana" diferem em 2 letras: provavelmente são pessoas diferentes).
    if len(curto) >= 5 and len(longo) - len(curto) <= 1:
        nota = SequenceMatcher(None, a, b).ratio()
        if nota >= _LIMIAR_PARECIDO:
            return "nomes parecidos", round(nota * 0.75, 2)
    return None


def candidate_pairs(people: list[dict]) -> list[dict]:
    """Sugerir pares de pessoas que podem ser a mesma.

    Args:
        people: Pessoas vivas, cada uma com ``id``, ``name`` e (opcional) ``nickname``,
            ``full_name``, ``aliases``, ``phone``, ``email``, ``instagram``, ``telegram``.

    Returns:
        ``[{"a": {id, name}, "b": {id, name}, "reasons": [...], "score": float}]`` do par mais
        provável ao menos provável. Cada par aparece uma vez.
    """
    preparadas = [(p, _chaves(p), _contato(p)) for p in people]
    pares: list[dict] = []
    for (pa, ka, ca), (pb, kb, cb) in combinations(preparadas, 2):
        motivos: list[str] = []
        nota = 0.0
        # Contato igual: o sinal mais forte (duas pessoas não costumam dividir telefone/e-mail).
        for tipo, valor in ca.items():
            if cb.get(tipo) == valor:
                motivos.append(f"mesmo {tipo}")
                nota = max(nota, 1.0)
        # Nomes: o melhor par entre todas as formas de cada uma.
        melhor: tuple[str, float] | None = None
        for x in ka:
            for y in kb:
                achado = _parecem(x, y)
                if achado and (melhor is None or achado[1] > melhor[1]):
                    melhor = achado
        if melhor:
            motivos.append(melhor[0])
            nota = max(nota, melhor[1])
        if motivos:
            pares.append({"a": {"id": pa["id"], "name": pa["name"]}, "b": {"id": pb["id"], "name": pb["name"]},
                          "reasons": motivos, "score": nota})
    pares.sort(key=lambda p: (-p["score"], p["a"]["name"], p["b"]["name"]))
    return pares
