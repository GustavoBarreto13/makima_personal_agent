"""Peças comuns da IA da Violet (spec 076): Gemini, RAG amplo e citações honestas.

Usado pelo Conselho do Dia (``counsel.py``), pela Revisão semanal (``weekly_review.py``) e
pela leitura emocional (``emotion_analysis.py``). A Kurisu é a dona do RAG; a Violet só
empresta a voz (persona nos prompts).

Princípios:
    - **Recuperação ampla**: várias consultas, vários trechos por consulta, no máximo
      ``MAX_PER_PAGE`` trechos da mesma nota e até ``MAX_TRECHOS`` no total — o texto final
      tem que cruzar notas, não pinçar uma.
    - **Não repetir**: notas já citadas nos últimos dias vão para o fim da fila
      (``penalizar_repetidas``) — só voltam se nada novo cobrir o tema.
    - **Citação honesta no servidor**: o modelo escreve ``[N]``; quem decide qual fonte é o
      ``N`` somos nós (``normalizar_citacoes``) — índice inválido some do texto.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Callable, Optional

from agents.kurisu.models import VIOLET_MODEL

logger = logging.getLogger("kurisu.violet_ai")

MAX_TRECHOS = 25
MAX_PER_PAGE = 2
TOP_N_POR_QUERY = 8
TOP_K_POR_QUERY = 15
MIN_TRECHOS_WIKI = 4
WEB_ENABLED = os.environ.get("VIOLET_COUNSEL_WEB_ENABLED", "true").strip().lower() != "false"


class VioletAIError(Exception):
    """Falha de IA — quem chama devolve ``status: error`` sem gravar nada."""


# ─── Tokens ────────────────────────────────────────────────────────────────────

def novo_usage() -> dict:
    return {"in": 0, "out": 0}


def acumular_usage(acc: Optional[dict], resp) -> None:
    if acc is None:
        return
    usage = getattr(resp, "usage_metadata", None)
    if not usage:
        return
    acc["in"] += getattr(usage, "prompt_token_count", 0) or 0
    acc["out"] += getattr(usage, "candidates_token_count", 0) or 0


# ─── Gemini ────────────────────────────────────────────────────────────────────

def _client():
    from google import genai  # noqa: PLC0415 — import lazy
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise VioletAIError("GEMINI_API_KEY não configurada")
    return genai.Client(api_key=api_key)


def gemini_json(prompt: str, schema: dict, usage: Optional[dict] = None, temperature: float | None = None) -> dict:
    """Chamada one-shot com JSON validado contra ``schema``."""
    try:
        config = {"response_mime_type": "application/json", "response_schema": schema}
        if temperature is not None:
            config["temperature"] = temperature
        resp = _client().models.generate_content(model=VIOLET_MODEL, contents=prompt, config=config)
        acumular_usage(usage, resp)
        return json.loads(resp.text)
    except VioletAIError:
        raise
    except Exception as exc:  # noqa: BLE001 — rede, quota, JSON inválido
        logger.warning("violet_ai: falha no Gemini: %s", exc)
        raise VioletAIError("Não consegui falar com a IA agora. Tente novamente em instantes.") from exc


def gemini_web(prompt: str, usage: Optional[dict] = None) -> Optional[str]:
    """Chamada com ``google_search`` (sem schema — as duas coisas não convivem). Best-effort."""
    if not WEB_ENABLED:
        return None
    try:
        resp = _client().models.generate_content(
            model=VIOLET_MODEL, contents=prompt, config={"tools": [{"google_search": {}}]},
        )
        acumular_usage(usage, resp)
        return resp.text
    except Exception as exc:  # noqa: BLE001
        logger.warning("violet_ai: busca web falhou: %s", exc)
        return None


# ─── RAG amplo ─────────────────────────────────────────────────────────────────

def _pagina(t: dict) -> str:
    """Identidade da NOTA de um trecho (vários trechos podem vir da mesma nota)."""
    return (t.get("fonte") or t.get("uri") or "").strip().lower()


def merge_trechos(listas: list[list[dict]], max_total: int = MAX_TRECHOS, max_per_page: int = MAX_PER_PAGE) -> list[dict]:
    """Mesclar listas de trechos: sem uri repetida, no máx. ``max_per_page`` por nota, intercalando
    as consultas (o 1º de cada consulta, depois o 2º de cada…) para diversificar os temas."""
    vistos: set = set()
    por_pagina: dict[str, int] = {}
    out: list[dict] = []
    profundidade = max((len(l) for l in listas), default=0)
    for i in range(profundidade):
        for lista in listas:
            if i >= len(lista):
                continue
            t = lista[i]
            uri = t.get("uri")
            if uri and uri in vistos:
                continue
            pg = _pagina(t)
            if pg and por_pagina.get(pg, 0) >= max_per_page:
                continue
            if uri:
                vistos.add(uri)
            if pg:
                por_pagina[pg] = por_pagina.get(pg, 0) + 1
            out.append(t)
            if len(out) >= max_total:
                return out
    return out


def penalizar_repetidas(trechos: list[dict], citadas_recentes: set[str]) -> list[dict]:
    """Notas citadas recentemente vão para o fim (ordem estável). ``citadas_recentes`` tem uris
    ou nomes de nota (comparação pela nota, sem caixa)."""
    rec = {c.strip().lower() for c in citadas_recentes if c}
    def repetida(t):
        return (t.get("uri") or "").strip().lower() in rec or _pagina(t) in rec
    return [t for t in trechos if not repetida(t)] + [t for t in trechos if repetida(t)]


def consultar(fn: Callable[[str], dict], queries: list[str]) -> list[list[dict]]:
    listas = []
    for q in queries:
        try:
            r = fn(q)
        except Exception as exc:  # noqa: BLE001 — uma consulta quebrada não derruba as outras
            logger.warning("violet_ai: consulta '%s' falhou: %s", q, exc)
            continue
        if r.get("status") == "ok":
            listas.append(r.get("trechos") or [])
    return listas


def recuperar_amplo(queries: list[str], citadas_recentes: set[str] | None = None) -> list[dict]:
    """Wiki primeiro (várias consultas, vários trechos cada); completa com a base combinada
    se a wiki render pouco. Notas citadas recentemente vão para o fim."""
    from agents.kurisu.tools import buscar_na_base, buscar_na_wiki  # noqa: PLC0415

    queries = [q for q in queries if q and q.strip()][:8]
    wiki = merge_trechos(consultar(lambda q: buscar_na_wiki(q, top_n=TOP_N_POR_QUERY, top_k=TOP_K_POR_QUERY), queries))
    trechos = wiki
    if len(wiki) < MIN_TRECHOS_WIKI:
        extra = merge_trechos(consultar(buscar_na_base, queries[:3]))
        trechos = merge_trechos([wiki, extra])
    return penalizar_repetidas(trechos, citadas_recentes or set())[:MAX_TRECHOS]


def bloco_trechos(trechos: list[dict], max_chars: int = 1400) -> str:
    """Trechos numerados [1..N] para o prompt."""
    if not trechos:
        return "(nenhum trecho relevante encontrado na base de conhecimento pessoal)"
    return "\n\n".join(
        f"[{i + 1}] nota: {titulo_da_fonte(t.get('fonte') or '')}\n{(t.get('texto') or '')[:max_chars]}"
        for i, t in enumerate(trechos)
    )


# ─── Citações ──────────────────────────────────────────────────────────────────

def titulo_da_fonte(fonte: str) -> str:
    """``ansiedade-e-controle.md`` → ``Ansiedade e controle``."""
    base = os.path.basename(fonte or "").rsplit(".", 1)[0]
    base = re.sub(r"[-_]+", " ", base).strip()
    return base[:1].upper() + base[1:] if base else (fonte or "nota")


_CIT = re.compile(r"\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]")


def normalizar_citacoes(texto: str, trechos: list[dict]) -> tuple[str, list[dict]]:
    """Validar as citações ``[N]`` / ``[N, M]`` do texto contra os trechos realmente recuperados.

    Índices inválidos são removidos do texto. A lista de fontes traz só as citadas, sem
    repetir a mesma nota; cada citação no texto passa a apontar para o número da FONTE
    (``[1]``…), não do trecho — dois trechos da mesma nota viram a mesma referência.

    Returns:
        ``(texto_limpo, [{"n", "fonte", "uri", "titulo"}])``.
    """
    fontes: list[dict] = []
    por_nota: dict[str, int] = {}

    def ref_de(idx: int) -> int | None:
        if not (1 <= idx <= len(trechos)):
            return None
        t = trechos[idx - 1]
        chave = _pagina(t) or f"#{idx}"
        if chave not in por_nota:
            por_nota[chave] = len(fontes) + 1
            fontes.append({"n": len(fontes) + 1, "fonte": t.get("fonte") or "", "uri": t.get("uri") or "",
                           "titulo": titulo_da_fonte(t.get("fonte") or "")})
        return por_nota[chave]

    def sub(m: re.Match) -> str:
        refs = []
        for parte in m.group(1).split(","):
            r = ref_de(int(parte.strip()))
            if r is not None and r not in refs:
                refs.append(r)
        return "[" + ", ".join(str(r) for r in refs) + "]" if refs else ""

    limpo = _CIT.sub(sub, texto or "")
    limpo = re.sub(r"[ \t]+([.,;:!?])", r"\1", limpo)
    limpo = re.sub(r"[ \t]{2,}", " ", limpo)
    return limpo.strip(), fontes


# ─── Tom ───────────────────────────────────────────────────────────────────────

TOM_VIOLET = """Você é Violet, a companheira de escrita do diário pessoal do usuário. Você é FRANCA.
- Acolha o que é sentimento legítimo, mas NÃO passe a mão na cabeça: quando o que a pessoa faz vai
  contra os objetivos e valores que ela mesma declarou (metas da Kaguya, valores, compromissos,
  hábitos), diga isso sem rodeios.
- Para cada confronto: nomeie o comportamento, a consequência e a meta/valor concreto que ele fere,
  e termine com uma exigência clara.
- A dureza é proporcional à evidência. Nunca invente fato, progresso ou piora que os dados não mostram.
  Dureza não é humilhação: nada de xingamento, sarcasmo ou desprezo.
- Sem elogio vazio, sem clichê motivacional, sem "amanhã é outro dia" quando não está tudo bem.
- Quando a pessoa foi bem, reconheça com evidência e diga como manter.
- Escreva em português do Brasil, segunda pessoa ("você"), parágrafos curtos e densos."""
