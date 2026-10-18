"""Resumo por IA da Memória de uma pessoa (Komi, spec 077) — a IA mora na Kurisu.

A Komi guarda a Memória (backlinks de todos os agentes + interações) e as anotações; aqui a
Kurisu lê tudo isso e devolve:
    - um **resumo** curto;
    - **pontos importantes** e **pendências**, cada um citando de onde saiu;
    - **sugestões de anotação** (ideias de presente, do que a pessoa gosta ou não...), que entram
      como ``sugerida`` e só viram anotação ativa se o dono aceitar.

Honestidade das citações: o modelo cita as fontes por NÚMERO ([1], [2]...), mas quem decide qual
é a fonte somos nós. Ponto, pendência ou sugestão sem nenhuma fonte válida é descartado — o
resumo nunca afirma algo que a Memória não sustenta. O resultado é guardado
(``person_memory_summaries``) com a impressão digital da Memória usada: se a Memória mudar, a
tela mostra "desatualizado" em vez de regerar sozinha.

Se a IA falhar, NADA é gravado.

Usage:
    >>> from agents.kurisu.person_summary import gerar_resumo
    >>> gerar_resumo("uuid-da-bia")["summary"]["resumo"]      # doctest: +SKIP
    'A Bia é uma amiga próxima...'
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Callable, Optional

from agents.komi import integration, naming, summaries, tools_notes
from agents.komi.tools import run_select
from agents.kurisu import violet_ai
from agents.kurisu.models import KOMI_MODEL

logger = logging.getLogger("kurisu.person_summary")

# Limites do que a IA devolve (o servidor corta o excesso).
LIMITES = {"pontos": 8, "pendencias": 6, "sugestoes": 8}

# Quanto de cada trecho entra no prompt (o modelo não precisa do texto inteiro).
_MAX_TRECHO = 220

_TIPOS_NOTA = ["presente", "gosta", "nao_gosta", "nota"]

_ITEM_FONTE = {"type": "ARRAY", "items": {"type": "INTEGER"}}
SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "resumo": {"type": "STRING"},
        "pontos": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {"texto": {"type": "STRING"}, "fontes": _ITEM_FONTE},
                                              "required": ["texto", "fontes"]}},
        "pendencias": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {"texto": {"type": "STRING"}, "fontes": _ITEM_FONTE},
                                                  "required": ["texto", "fontes"]}},
        "sugestoes": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "tipo": {"type": "STRING", "enum": _TIPOS_NOTA}, "texto": {"type": "STRING"}, "fontes": _ITEM_FONTE},
            "required": ["tipo", "texto", "fontes"]}},
    },
    "required": ["resumo", "pontos", "pendencias", "sugestoes"],
}

_ROTULO_CONTEXTO = {"all": "tudo (pessoal e trabalho)", "personal": "só a vida pessoal", "work": "só o trabalho"}


def montar_prompt(pessoa: dict, itens: list[dict], notas: list[dict], hoje: date, contexto: str) -> str:
    """Montar o prompt do resumo (função pura).

    Args:
        pessoa: ``{name, nickname, relationship, birth_day, birth_month}`` da pessoa.
        itens: Itens da Memória (numerados de 1 a N no prompt).
        notas: Anotações ATIVAS (para a IA não repetir o que o dono já sabe).
        hoje: Data de referência.
        contexto: ``all`` | ``personal`` | ``work``.

    Returns:
        O texto do prompt.
    """
    apelido = f" (apelido: {pessoa['nickname']})" if pessoa.get("nickname") else ""
    relacao = f"Relação: {pessoa['relationship']}.\n" if pessoa.get("relationship") else ""
    linhas = []
    for n, i in enumerate(itens, start=1):
        trecho = f" — {i['snippet'][:_MAX_TRECHO]}" if i.get("snippet") else ""
        linhas.append(f"[{n}] {i['label']} · {i.get('date') or 's/d'} · {'trabalho' if i['context'] == 'work' else 'pessoal'} — {i['title']}{trecho}")
    ja_sabe = "\n".join(f"- ({n['kind']}) {n['text']}" for n in notas) or "(nenhuma)"
    return (
        "Você ajuda o dono de um sistema pessoal a lembrar o que sabe sobre uma pessoa, a partir de registros "
        "de vários lugares (diário, tarefas, finanças, filmes, livros, interações).\n"
        f"Hoje é {hoje.isoformat()}. Escopo pedido: {_ROTULO_CONTEXTO[contexto]}.\n\n"
        f"PESSOA: {pessoa['name']}{apelido}.\n{relacao}\n"
        f"REGISTROS (numerados; cite SEMPRE pelo número):\n" + "\n".join(linhas) + "\n\n"
        f"O QUE O DONO JÁ ANOTOU (não repita):\n{ja_sabe}\n\n"
        "TAREFA — responda em português do Brasil, em JSON:\n"
        "- 'resumo': 2 a 4 frases sobre quem é essa pessoa para o dono e o que tem acontecido entre eles.\n"
        f"- 'pontos': até {LIMITES['pontos']} fatos importantes para lembrar antes de falar com ela.\n"
        f"- 'pendencias': até {LIMITES['pendencias']} coisas em aberto (algo prometido, esperado, devido, combinado).\n"
        f"- 'sugestoes': até {LIMITES['sugestoes']} anotações concretas sobre a pessoa — ideia de presente, algo que ela "
        "gosta ou não gosta, um fato útil —, SÓ se algum registro sustentar.\n"
        "REGRAS: use apenas o que está nos registros; cada ponto, pendência e sugestão deve trazer em 'fontes' os "
        "números dos registros que o sustentam (ao menos um); não invente nem deduza sentimentos, saúde ou "
        "intenções; não repita o que o dono já anotou; se não houver nada para uma lista, devolva a lista vazia."
    )


def _fontes(indices, itens: list[dict]) -> list[dict]:
    """Transformar os números citados pela IA nas fontes reais, descartando os inválidos.

    Args:
        indices: Números (1 a N) que o modelo citou.
        itens: Os itens da Memória, na mesma ordem do prompt.

    Returns:
        Uma fonte por número válido e não repetido: ``entity_type, entity_id, agent, title, date, deep_link, context``.
    """
    saida: list[dict] = []
    vistos: set[int] = set()
    for n in indices or []:
        if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= len(itens) or n in vistos:
            continue
        vistos.add(n)
        i = itens[n - 1]
        saida.append({k: i.get(k) for k in ("entity_type", "entity_id", "agent", "title", "date", "deep_link", "context")})
    return saida


def normalizar(resposta: dict, itens: list[dict]) -> dict:
    """Validar a resposta da IA contra a Memória (função pura).

    Descarta ponto/pendência/sugestão sem texto ou sem NENHUMA fonte válida, repetidos e o que
    passa do limite. Isso é o que garante que o resumo só afirma o que a Memória sustenta.

    Args:
        resposta: O JSON devolvido pelo modelo.
        itens: Os itens da Memória usados no prompt (mesma ordem).

    Returns:
        ``{"resumo": str, "pontos": [{texto, fontes}], "pendencias": [...], "sugestoes": [{tipo, texto, fontes}]}``.
    """
    def limpar(lista: list, limite: int, com_tipo: bool = False) -> list[dict]:
        vistos: set[str] = set()
        saida: list[dict] = []
        for bruto in lista or []:
            texto = naming.clean(bruto.get("texto")) if isinstance(bruto, dict) else None
            fontes = _fontes(bruto.get("fontes"), itens) if isinstance(bruto, dict) else []
            if not texto or not fontes or naming.norm(texto) in vistos:
                continue
            vistos.add(naming.norm(texto))
            item = {"texto": texto, "fontes": fontes}
            if com_tipo:
                item["tipo"] = bruto.get("tipo") if bruto.get("tipo") in _TIPOS_NOTA else "nota"
            saida.append(item)
            if len(saida) >= limite:
                break
        return saida

    return {
        "resumo": naming.clean(resposta.get("resumo")) or "",
        "pontos": limpar(resposta.get("pontos"), LIMITES["pontos"]),
        "pendencias": limpar(resposta.get("pendencias"), LIMITES["pendencias"]),
        "sugestoes": limpar(resposta.get("sugestoes"), LIMITES["sugestoes"], com_tipo=True),
    }


def _contexto_da_sugestao(fontes: list[dict]) -> str:
    """Escolher o espaço de uma sugestão de anotação pelo das suas fontes (maioria; empate = pessoal).

    Args:
        fontes: As fontes da sugestão.

    Returns:
        ``work`` se a maioria das fontes é de trabalho; senão ``personal``.
    """
    trabalho = sum(1 for f in fontes if f.get("context") == "work")
    return "work" if trabalho * 2 > len(fontes) else "personal"


def gerar_resumo(
    person_id: str,
    context: str = "all",
    force: bool = False,
    llm: Optional[Callable] = None,
) -> dict:
    """Gerar (ou devolver do cache) o resumo de IA da Memória de uma pessoa.

    Args:
        person_id: ID da pessoa.
        context: ``all`` | ``personal`` | ``work`` — quais registros entram.
        force: Regera mesmo que a Memória não tenha mudado.
        llm: Função de IA (padrão: ``violet_ai.gemini_json``); os testes passam uma falsa.

    Returns:
        ``{"status": "ok", "summary": {...}, "stale": False, "cached": bool, "generated_at": ISO,
        "suggestions_created": n}``; ``{"status": "ok", "empty": True, ...}`` se não há o que resumir;
        ou ``{"status": "error", "message": ...}`` (nada é gravado se a IA falhar).
    """
    if context not in summaries.CONTEXTOS:
        return {"status": "error", "message": "Espaço inválido. Use 'all', 'personal' ou 'work'."}
    pessoa = run_select(
        "SELECT id, name, nickname, relationship, birth_day, birth_month FROM people WHERE id = %(id)s AND deleted = FALSE",
        {"id": person_id},
    )
    if not pessoa:
        return {"status": "error", "message": "Pessoa não encontrada."}

    memoria = summaries.memory_for_ai(person_id, context)
    if memoria.get("status") != "ok":
        return memoria
    itens = memoria["items"]
    espaco_notas = None if context == "all" else context
    notas = tools_notes.list_person_notes(person_id, context=espaco_notas, status="ativa").get("notes", [])
    if not itens and not notas:
        return {"status": "ok", "empty": True, "message": "Ainda não há nada na memória dessa pessoa para resumir."}

    impressao = integration.memory_fingerprint(itens)
    guardado = summaries.get_cached_summary(person_id, context, check_stale=False)
    if guardado and not force and guardado["source_hash"] == impressao:
        return {"status": "ok", "summary": guardado["summary"], "stale": False, "cached": True,
                "generated_at": guardado["generated_at"], "suggestions_created": 0}

    usage = violet_ai.novo_usage()
    prompt = montar_prompt(pessoa[0], itens, notas, naming.today_sp(), context)
    try:
        resposta = (llm or violet_ai.gemini_json)(prompt, SCHEMA, usage=usage, temperature=0.3, model=KOMI_MODEL)
    except violet_ai.VioletAIError as e:
        return {"status": "error", "message": str(e)}

    resumo = normalizar(resposta, itens)
    summaries.save_summary(person_id, context, resumo, impressao)

    # Sugestões de anotação: entram como "sugerida" (nunca ativa) e com as fontes de origem
    criadas = 0
    por_espaco: dict[str, list[dict]] = {}
    for s in resumo["sugestoes"]:
        refs = [{k: f.get(k) for k in ("entity_type", "entity_id", "agent", "title", "deep_link")} for f in s["fontes"]]
        por_espaco.setdefault(_contexto_da_sugestao(s["fontes"]), []).append({"kind": s["tipo"], "text": s["texto"], "refs": refs})
    for espaco, lista in por_espaco.items():
        r = tools_notes.save_suggestions(person_id, lista, context=espaco)
        criadas += r.get("created", 0) if r.get("status") == "ok" else 0

    gravado = summaries.get_cached_summary(person_id, context, check_stale=False)
    return {"status": "ok", "summary": resumo, "stale": False, "cached": False,
            "generated_at": gravado["generated_at"] if gravado else None,
            "suggestions_created": criadas, "usage": usage}


def resumo_da_pessoa(person_id: str, context: str = "all") -> dict:
    """Ler o resumo guardado (sem chamar a IA), dizendo se ficou desatualizado.

    Args:
        person_id: ID da pessoa.
        context: ``all`` | ``personal`` | ``work``.

    Returns:
        ``{"status": "ok", "summary": {...}|None, "stale": bool|None, "generated_at": ISO|None}``.
    """
    if context not in summaries.CONTEXTOS:
        return {"status": "error", "message": "Espaço inválido. Use 'all', 'personal' ou 'work'."}
    try:
        guardado = summaries.get_cached_summary(person_id, context)
    except Exception as e:  # noqa: BLE001
        logger.warning("person_summary: falha ao ler o resumo guardado: %s", e)
        return {"status": "error", "message": str(e)}
    if not guardado:
        return {"status": "ok", "summary": None, "stale": None, "generated_at": None}
    return {"status": "ok", "summary": guardado["summary"], "stale": guardado["stale"], "generated_at": guardado["generated_at"]}
