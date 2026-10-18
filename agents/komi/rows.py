"""Leitura de colunas que funciona com QUALQUER tipo de cursor do psycopg2.

O contrato de integração (``agents.komi.integration``) recebe o cursor *do chamador*, e
cada agente abre o seu de um jeito: o cursor comum devolve linhas-tupla (``linha[0]``) e o
``RealDictCursor`` (usado, por exemplo, pela Violet) devolve linhas-dicionário
(``linha["id"]``). Ler por posição quebra no segundo caso — ``KeyError: 0`` — e foi um bug
real. ``valor`` lê a coluna certa nos dois.

Usage:
    >>> valor(("a", 1), 1, "n")
    1
    >>> valor({"s": "a", "n": 1}, 1, "n")
    1
"""

from __future__ import annotations

from typing import Any


def valor(linha: Any, posicao: int, nome: str) -> Any:
    """Ler uma coluna de uma linha de cursor, seja ela tupla ou dicionário.

    Args:
        linha: Linha devolvida por ``fetchone``/``fetchall`` (tupla ou ``dict``).
        posicao: Posição da coluna no ``SELECT`` (usada com cursor comum).
        nome: Nome (ou alias) da coluna no ``SELECT`` (usado com ``RealDictCursor``).

    Returns:
        O valor da coluna.
    """
    # RealDictRow é subclasse de dict, então o isinstance cobre os dois tipos de dicionário.
    return linha[nome] if isinstance(linha, dict) else linha[posicao]
