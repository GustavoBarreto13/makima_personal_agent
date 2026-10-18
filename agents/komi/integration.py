"""Contrato de integração com a Komi — o ponto único para QUALQUER agente (atual ou futuro).

A Komi é a dona da identidade das pessoas. Os outros agentes (Nami, Kaguya, Violet,
Akane, Frieren...) se ligam a ela por este módulo, em três papéis:

1. **Escrever vínculos** — "esta tarefa/transação/sessão envolve a Bia":
   ``link_people`` (acrescenta), ``sync_people`` (substitui o conjunto),
   ``unlink_all`` e ``unlink_person``. Todas usam o *cursor do chamador*, então o
   vínculo nasce e morre na MESMA transação do item (tudo-ou-nada).
2. **Resolver pessoas** — "quem é a Bia?": ``resolve_person`` (regra 0/1/2+ matches),
   ``people_for_space`` (filtro trabalho × pessoal) e o token ``@[Nome](komi:id)``
   (``parse_mentions`` / ``render_mention`` / ``plain_text``).
3. **Expor backlinks** — "o que este agente sabe desta pessoa?": o agente publica um
   *provedor* e a Komi monta a **Memória** da pessoa sem conhecer o agente.

Como integrar um agente novo (3 passos)
---------------------------------------
1. Ao criar o item, chame ``link_people(cur, "meu_tipo", item_id, person_ids)`` (ou
   ``sync_people`` ao editar). O ``entity_type`` é livre: minúsculas, números e ``_``.
2. Crie ``agents/<agente>/komi_provider.py`` com uma lista ``LINK_TYPES`` (formato abaixo).
   Nada mais: a Komi descobre o arquivo sozinha (varre ``agents/*/komi_provider.py``).
3. Pronto — a pessoa passa a mostrar os itens do agente na Memória, nos filtros por
   agente e no briefing, sem mexer na Komi nem na tela dela.

Formato de um provedor (``LINK_TYPES``)::

    LINK_TYPES = [{
        "entity_type": "task",          # o mesmo tipo gravado em person_links
        "agent": "kaguya",              # id do agente (filtros e rótulos)
        "label": "Tarefas",             # nome exibido na Memória
        "icon": "task",                 # nome do registro de ícones do Design System
        "resolve": resolve_tasks,       # (ids: list[str]) -> list[item]; ausentes = apagados
        # opcionais:
        "by_person": waiting_for,       # (person_id: str) -> list[item]; itens achados SEM person_links
        "summary_key": "tarefas",       # chave do bloco no get_person_summary (compat. com o Hermes)
        "summary": summarize_tasks,     # (person_id: str) -> dict (o bloco)
        "last_activity": last_by_person,  # (person_ids: list[str]) -> [{person_id, date, text}]; alimenta "há quanto tempo"
        "activity_kind": "tarefa",      # rótulo curto da atividade ("diário", "finanças"...)
        "on_unlink": strip_mention,     # (person_id, entity_id) -> None; limpa o que o agente guarda FORA de person_links
        "on_merge": repoint_person,     # (drop_id, keep_id, keep_name) -> int; reaponta o ID da pessoa ao mesclar
    }]

Cada ``item`` devolvido por ``resolve``/``by_person`` é um dict com: ``entity_id`` (str),
``title`` (str) e, opcionalmente, ``snippet``, ``date`` (``AAAA-MM-DD``), ``deep_link`` e
``context`` (``personal`` ou ``work`` — é isso que separa trabalho de pessoal na Memória).

Um provedor com erro NUNCA derruba a Memória: a Komi registra o problema e segue sem ele.

Usage:
    >>> from agents.komi.integration import validate_entity_type, render_mention
    >>> validate_entity_type("invoice")
    'invoice'
    >>> render_mention("Bia", "abc-123")
    '@[Bia](komi:abc-123)'
"""

from __future__ import annotations

import hashlib
import importlib
import logging
import re
from datetime import date, datetime
from pathlib import Path
from typing import Callable, Iterable

from agents.komi import naming
from agents.komi.rows import valor
from agents.komi.schema import ensure_schema

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constantes do contrato
# ─────────────────────────────────────────────────────────────────────────────

# Formato aceito para entity_type (o banco impõe o mesmo padrão em person_links).
_ENTITY_TYPE_RE = re.compile(r"^[a-z][a-z0-9_]{1,40}$")

# @[Nome](komi:id) — o nome não pode ter "]" nem quebra de linha. É o MESMO formato do
# markup da Violet (agents/journal/markup.py), que o grava e o lê.
_MENTION_RE = re.compile(r"@\[([^\]\n]{1,80})\]\(komi:([\w-]{1,64})\)")

# Campos obrigatórios de uma entrada de LINK_TYPES.
_CAMPOS_OBRIGATORIOS = ("entity_type", "agent", "label", "icon")


# ─────────────────────────────────────────────────────────────────────────────
# 1. Escrever vínculos (no cursor do chamador, sem commit)
# ─────────────────────────────────────────────────────────────────────────────

def validate_entity_type(entity_type: str) -> str:
    """Validar o tipo de item de um vínculo.

    O tipo identifica o "dono" do item (``task``, ``transaction``, ``trip_item``...). É
    aberto de propósito — agentes novos criam o seu —, mas precisa ter um formato
    previsível (minúsculas, números e ``_``, começando por letra).

    Args:
        entity_type: Tipo informado pelo agente.

    Returns:
        O próprio tipo, validado.

    Raises:
        ValueError: Se o formato for inválido.

    Example:
        >>> validate_entity_type("trip_item")
        'trip_item'
        >>> validate_entity_type("Trip Item")
        Traceback (most recent call last):
            ...
        ValueError: entity_type inválido: 'Trip Item'. Use minúsculas, números e '_' (ex.: 'task').
    """
    if not isinstance(entity_type, str) or not _ENTITY_TYPE_RE.match(entity_type):
        raise ValueError(f"entity_type inválido: {entity_type!r}. Use minúsculas, números e '_' (ex.: 'task').")
    return entity_type


def _ids_unicos(person_ids: Iterable[str] | None) -> list[str]:
    """Normalizar uma lista de IDs de pessoa (sem vazios nem repetidos, ordem preservada).

    Args:
        person_ids: IDs vindos do agente ou da API.

    Returns:
        Lista de IDs como ``str``.
    """
    vistos: list[str] = []
    for pid in person_ids or []:
        texto = str(pid).strip()
        if texto and texto not in vistos:
            vistos.append(texto)
    return vistos


def _pessoas_vivas(cur, ids: list[str]) -> set[str]:
    """Filtrar, entre os IDs dados, só as pessoas que existem e não foram excluídas.

    Args:
        cur: Cursor psycopg2 ativo.
        ids: IDs a conferir.

    Returns:
        O conjunto dos IDs de pessoas vivas.
    """
    if not ids:
        return set()
    cur.execute("SELECT id FROM people WHERE id = ANY(%s) AND deleted = FALSE", (ids,))
    return {valor(linha, 0, "id") for linha in cur.fetchall()}


def link_people(cur, entity_type: str, entity_id: str | int, person_ids: Iterable[str] | None) -> list[str]:
    """Vincular pessoas a um item (acrescenta; nunca remove vínculos existentes).

    Idempotente: vincular de novo a mesma pessoa ao mesmo item não duplica. Pessoas que
    não existem (ou foram excluídas) são ignoradas — o item é o que importa; o chamador
    pode comparar o retorno com o que pediu para avisar o usuário.

    Args:
        cur: Cursor psycopg2 ativo, dentro da transação do chamador (sem commit aqui).
        entity_type: Tipo do item (ver ``validate_entity_type``).
        entity_id: ID do item (UUID ou inteiro — guardado como texto).
        person_ids: IDs das pessoas a vincular.

    Returns:
        Os IDs das pessoas que ficaram vinculadas (as vivas, na ordem pedida).

    Raises:
        ValueError: Se ``entity_type`` tiver formato inválido.

    Example:
        >>> with get_conn() as conn:                                  # doctest: +SKIP
        ...     with conn.cursor() as cur:
        ...         link_people(cur, "task", 42, [bia_id])
        ['<uuid da Bia>']
    """
    tipo = validate_entity_type(entity_type)
    ensure_schema()
    ids = _ids_unicos(person_ids)
    vivas = _pessoas_vivas(cur, ids)
    ligadas = [pid for pid in ids if pid in vivas]
    for pid in ligadas:
        cur.execute(
            """
            INSERT INTO person_links (person_id, entity_type, entity_id)
            VALUES (%s, %s, %s)
            ON CONFLICT (person_id, entity_type, entity_id) DO NOTHING
            """,
            (pid, tipo, str(entity_id)),
        )
    return ligadas


def sync_people(cur, entity_type: str, entity_id: str | int, person_ids: Iterable[str] | None) -> dict:
    """Fazer o conjunto de pessoas de um item ser EXATAMENTE o informado.

    Calcula a diferença: vincula quem entrou e desvincula quem saiu, preservando quem
    continua (sem apagar e recriar). É o que a Violet faz a cada edição de um bullet e o
    que ``update_task(person_ids=[...])`` precisa. Lista vazia remove todas as pessoas.

    Args:
        cur: Cursor psycopg2 ativo, na transação do chamador (sem commit aqui).
        entity_type: Tipo do item.
        entity_id: ID do item.
        person_ids: O conjunto final desejado.

    Returns:
        ``{"added": [ids...], "removed": [ids...]}`` (ambos ordenados).

    Raises:
        ValueError: Se ``entity_type`` tiver formato inválido.
    """
    tipo = validate_entity_type(entity_type)
    ensure_schema()
    desejadas = set(_pessoas_vivas(cur, _ids_unicos(person_ids)))

    cur.execute("SELECT person_id FROM person_links WHERE entity_type = %s AND entity_id = %s", (tipo, str(entity_id)))
    atuais = {valor(linha, 0, "person_id") for linha in cur.fetchall()}

    sair = atuais - desejadas
    entrar = desejadas - atuais
    if sair:
        cur.execute(
            "DELETE FROM person_links WHERE entity_type = %s AND entity_id = %s AND person_id = ANY(%s)",
            (tipo, str(entity_id), sorted(sair)),
        )
    for pid in sorted(entrar):
        cur.execute(
            "INSERT INTO person_links (person_id, entity_type, entity_id) VALUES (%s, %s, %s) "
            "ON CONFLICT (person_id, entity_type, entity_id) DO NOTHING",
            (pid, tipo, str(entity_id)),
        )
    return {"added": sorted(entrar), "removed": sorted(sair)}


def unlink_all(cur, entity_type: str, entity_id: str | int) -> int:
    """Remover todas as pessoas vinculadas a um item (ex.: ao apagar o item).

    Idempotente: sem vínculos, não faz nada.

    Args:
        cur: Cursor psycopg2 ativo, na transação do chamador.
        entity_type: Tipo do item.
        entity_id: ID do item.

    Returns:
        Quantos vínculos foram removidos.

    Raises:
        ValueError: Se ``entity_type`` tiver formato inválido.
    """
    tipo = validate_entity_type(entity_type)
    cur.execute("DELETE FROM person_links WHERE entity_type = %s AND entity_id = %s", (tipo, str(entity_id)))
    return cur.rowcount


def copy_links(cur, entity_type: str, from_entity_id: str | int, to_entity_id: str | int) -> int:
    """Copiar as pessoas de um item para outro item do mesmo tipo.

    Usado quando um item "nasce de outro": a próxima ocorrência de uma tarefa recorrente,
    uma tarefa duplicada, um template. Idempotente.

    Args:
        cur: Cursor psycopg2 ativo, na transação do chamador (sem commit aqui).
        entity_type: Tipo do item (o mesmo para origem e destino).
        from_entity_id: ID do item de onde copiar.
        to_entity_id: ID do item que recebe as pessoas.

    Returns:
        Quantos vínculos foram criados.

    Raises:
        ValueError: Se ``entity_type`` tiver formato inválido.
    """
    tipo = validate_entity_type(entity_type)
    cur.execute(
        """
        INSERT INTO person_links (person_id, entity_type, entity_id)
        SELECT person_id, entity_type, %s FROM person_links
        WHERE entity_type = %s AND entity_id = %s
        ON CONFLICT (person_id, entity_type, entity_id) DO NOTHING
        """,
        (str(to_entity_id), tipo, str(from_entity_id)),
    )
    return cur.rowcount


def unlink_person(cur, person_id: str, entity_type: str, entity_id: str | int) -> int:
    """Remover o vínculo de UMA pessoa com UM item (a ação "Desvincular" da Memória).

    Args:
        cur: Cursor psycopg2 ativo, na transação do chamador.
        person_id: A pessoa a desvincular.
        entity_type: Tipo do item.
        entity_id: ID do item.

    Returns:
        ``1`` se havia o vínculo e foi removido, ``0`` caso contrário.

    Raises:
        ValueError: Se ``entity_type`` tiver formato inválido.
    """
    tipo = validate_entity_type(entity_type)
    cur.execute(
        "DELETE FROM person_links WHERE person_id = %s AND entity_type = %s AND entity_id = %s",
        (person_id, tipo, str(entity_id)),
    )
    return cur.rowcount


# ─────────────────────────────────────────────────────────────────────────────
# 2. Resolver pessoas
# ─────────────────────────────────────────────────────────────────────────────

def resolve_person(texto: str, space: str | None = None) -> dict:
    """Descobrir quem é a pessoa citada num texto, com a regra de smart-match.

    Primeiro tenta o nome EXATO (Nome, Apelido, Nome completo ou outra forma, sem
    acento/caixa — ``Bia`` e ``Beatriz`` dão a mesma pessoa); se não houver, tenta por
    prefixo. A cardinalidade dirige o agente:

    - ``none``: ninguém — ofereça cadastrar.
    - ``one``: uma pessoa — use e confirme ("encontrei a Beatriz").
    - ``many``: ambíguo — pergunte qual; NUNCA vincule sem confirmação.

    Args:
        texto: O nome ou apelido citado.
        space: ``"personal"``/``"work"`` para considerar só quem vale naquele espaço
            (quem é "ambos" sempre entra); vazio considera todos.

    Returns:
        ``{"status": "ok", "match": "none"|"one"|"many", "people": [...], "person": {...}|None}``
        (``person`` só quando ``match == "one"``) ou ``{"status": "error", "message": ...}``.
    """
    from agents.komi import tools as K  # noqa: PLC0415 — evita ciclo (tools importa este módulo)

    try:
        permitidos = naming.spaces_matching(space)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    candidatas = K.find_people_exact(texto)
    if not candidatas:
        achado = K.find_people(texto)
        if achado.get("status") != "ok":
            return achado
        candidatas = achado["matches"]

    if permitidos is not None and candidatas:
        ids = [c["id"] for c in candidatas]
        validas = {r["id"] for r in K.run_select(
            "SELECT id FROM people WHERE id = ANY(%(ids)s) AND context = ANY(%(c)s)",
            {"ids": ids, "c": list(permitidos)},
        )}
        candidatas = [c for c in candidatas if c["id"] in validas]

    match = "none" if not candidatas else ("one" if len(candidatas) == 1 else "many")
    return {
        "status": "ok",
        "match": match,
        "people": candidatas,
        "person": candidatas[0] if match == "one" else None,
    }


def people_for_space(space: str | None) -> list[str] | None:
    """IDs das pessoas visíveis em um espaço (trabalho ou pessoal).

    Quem é "ambos" aparece nos dois espaços. É o que a Kaguya usa para filtrar o seletor
    de pessoas por espaço.

    Args:
        space: ``"work"``, ``"personal"`` ou ``None``/``"all"`` (sem filtro).

    Returns:
        Lista de IDs, ou ``None`` quando não há o que filtrar (= "todas as pessoas").
        Um espaço desconhecido também devolve ``None`` (não esconde ninguém por engano).
    """
    from agents.komi import tools as K  # noqa: PLC0415

    try:
        permitidos = naming.spaces_matching(space)
    except ValueError:
        return None
    if permitidos is None:
        return None
    linhas = K.run_select(
        "SELECT id FROM people WHERE deleted = FALSE AND context = ANY(%(c)s)",
        {"c": list(permitidos)},
    )
    return [linha["id"] for linha in linhas]


def render_mention(name: str, person_id: str) -> str:
    """Montar o token de menção ``@[Nome](komi:id)``.

    O texto guarda o ID (e não só o nome), então a menção sobrevive a renomear a pessoa.

    Args:
        name: Nome para exibir (colchetes e quebras de linha são removidos).
        person_id: ID da pessoa na Komi.

    Returns:
        O token pronto para gravar no texto.

    Example:
        >>> render_mention("Bia [apelido]", "p1")
        '@[Bia apelido](komi:p1)'
    """
    limpo = re.sub(r"[\[\]\n]", "", name).strip()[:80]
    return f"@[{limpo}](komi:{person_id})"


def parse_mentions(texto: str | None) -> list[dict]:
    """Extrair as pessoas citadas por token ``@[Nome](komi:id)`` em um texto.

    Args:
        texto: Texto livre (bullet, descrição de tarefa, nota...).

    Returns:
        ``[{"id": ..., "name": ...}]`` sem repetir pessoas, na ordem em que aparecem.

    Example:
        >>> parse_mentions("almoço com @[Bia](komi:p1) e @[Bia](komi:p1)")
        [{'id': 'p1', 'name': 'Bia'}]
    """
    vistos: dict[str, dict] = {}
    for nome, pid in _MENTION_RE.findall(texto or ""):
        vistos.setdefault(pid, {"id": pid, "name": nome})
    return list(vistos.values())


def plain_text(texto: str | None) -> str:
    """Trocar os tokens de menção por ``@Nome`` (texto legível para resumos e IA).

    Args:
        texto: Texto com tokens ``@[Nome](komi:id)``.

    Returns:
        O texto sem a sintaxe dos tokens.

    Example:
        >>> plain_text("oi @[Bia](komi:p1)!")
        'oi @Bia!'
    """
    return _MENTION_RE.sub(lambda m: f"@{m.group(1)}", texto or "")


def replace_mention_id(texto: str | None, de_id: str, para_id: str, para_nome: str | None = None) -> str:
    """Reescrever o ID de uma pessoa nos tokens de um texto (usado ao mesclar pessoas).

    Args:
        texto: Texto com tokens.
        de_id: ID antigo (da pessoa que será absorvida).
        para_id: ID novo (da pessoa que permanece).
        para_nome: Se informado, também troca o nome exibido no token.

    Returns:
        O texto com os tokens apontando para ``para_id``.

    Example:
        >>> replace_mention_id("com @[Bia](komi:a)", "a", "b", "Beatriz")
        'com @[Beatriz](komi:b)'
    """
    def troca(m: re.Match) -> str:
        if m.group(2) != de_id:
            return m.group(0)
        return render_mention(para_nome or m.group(1), para_id)

    return _MENTION_RE.sub(troca, texto or "")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Provedores de backlinks (a Memória da pessoa)
# ─────────────────────────────────────────────────────────────────────────────

# Provedores registrados por código (testes e agentes que preferem registrar em vez de
# criar o arquivo komi_provider.py). Chave = entity_type.
_registrados: dict[str, dict] = {}

# Cache dos provedores descobertos em disco (varrer e importar uma vez por processo).
_cache_descobertos: dict[str, dict] | None = None


def _validar_spec(spec: dict, origem: str) -> dict:
    """Conferir se uma entrada de ``LINK_TYPES`` tem o formato do contrato.

    Args:
        spec: A entrada a validar.
        origem: De onde veio (módulo ou "registro"), para a mensagem de erro.

    Returns:
        A própria entrada, validada.

    Raises:
        ValueError: Se faltar campo obrigatório, o tipo for inválido ou não houver
            ``resolve`` nem ``by_person``.
    """
    faltando = [c for c in _CAMPOS_OBRIGATORIOS if not spec.get(c)]
    if faltando:
        raise ValueError(f"{origem}: provedor sem {', '.join(faltando)}.")
    validate_entity_type(spec["entity_type"])
    if not callable(spec.get("resolve")) and not callable(spec.get("by_person")):
        raise ValueError(f"{origem}: o provedor '{spec['entity_type']}' precisa de resolve ou by_person.")
    if spec.get("summary") and not spec.get("summary_key"):
        raise ValueError(f"{origem}: o provedor '{spec['entity_type']}' tem summary mas não summary_key.")
    for gancho in ("last_activity", "on_unlink", "on_merge"):
        if spec.get(gancho) is not None and not callable(spec[gancho]):
            raise ValueError(f"{origem}: '{gancho}' do provedor '{spec['entity_type']}' precisa ser uma função.")
    return spec


def register_link_type(spec: dict) -> None:
    """Registrar um provedor por código (alternativa ao arquivo ``komi_provider.py``).

    Args:
        spec: Entrada no formato de ``LINK_TYPES`` (ver a docstring do módulo).

    Raises:
        ValueError: Se a entrada não seguir o contrato.
    """
    _registrados[spec["entity_type"]] = _validar_spec(spec, "register_link_type")


def reset_providers() -> None:
    """Esquecer provedores registrados e o cache de descoberta (testes)."""
    global _cache_descobertos
    _registrados.clear()
    _cache_descobertos = None


def _descobrir_em_disco() -> dict[str, dict]:
    """Varrer ``agents/*/komi_provider.py`` e carregar a lista ``LINK_TYPES`` de cada um.

    Só importa os módulos que existem no disco (varre pastas, sem importar o pacote do
    agente à toa). Um módulo quebrado é registrado no log e ignorado.

    Returns:
        ``{entity_type: spec}`` de todos os agentes que publicaram um provedor.
    """
    achados: dict[str, dict] = {}
    raiz = Path(__file__).resolve().parent.parent  # .../agents
    for pasta in sorted(raiz.iterdir()):
        if not (pasta / "komi_provider.py").is_file():
            continue
        modulo = f"agents.{pasta.name}.komi_provider"
        try:
            for spec in importlib.import_module(modulo).LINK_TYPES:
                achados[spec["entity_type"]] = _validar_spec(spec, modulo)
        except Exception:  # noqa: BLE001 — um agente quebrado não derruba os outros
            logger.warning("Komi: provedor %s ignorado (erro ao carregar).", modulo, exc_info=True)
    return achados


def providers() -> dict[str, dict]:
    """Listar todos os provedores ativos (descobertos em disco + registrados por código).

    Returns:
        ``{entity_type: spec}``. Os registrados por código vencem os de disco.
    """
    global _cache_descobertos
    if _cache_descobertos is None:
        _cache_descobertos = _descobrir_em_disco()
    return {**_cache_descobertos, **_registrados}


def _texto_data(valor) -> str | None:
    """Converter uma data/hora em ``AAAA-MM-DD`` (ou ``None``).

    Args:
        valor: ``date``, ``datetime`` ou texto ISO.

    Returns:
        O dia em ``AAAA-MM-DD``.
    """
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.date().isoformat()
    if isinstance(valor, date):
        return valor.isoformat()
    return str(valor)[:10]


def _completar_item(spec: dict, bruto: dict) -> dict:
    """Completar um item devolvido por um provedor com os campos fixos do contrato.

    Args:
        spec: O provedor que gerou o item.
        bruto: O item como o provedor devolveu.

    Returns:
        O item normalizado: ``entity_type, entity_id, agent, label, icon, title, snippet,
        date, deep_link, context``.
    """
    contexto = bruto.get("context")
    return {
        "entity_type": bruto.get("entity_type") or spec["entity_type"],
        "entity_id": str(bruto.get("entity_id", "")),
        "agent": spec["agent"],
        "label": spec["label"],
        "icon": spec["icon"],
        "title": (bruto.get("title") or "(sem título)").strip(),
        "snippet": (bruto.get("snippet") or None),
        "date": _texto_data(bruto.get("date")),
        "deep_link": bruto.get("deep_link") or None,
        # Contexto desconhecido cai em pessoal: nunca some um item por causa dele.
        "context": contexto if contexto in naming.SPACES else "personal",
    }


def _item_sem_provedor(entity_type: str, entity_id: str) -> dict:
    """Montar um item genérico para um vínculo cujo agente não publicou provedor.

    Garante que nada fique escondido: o vínculo aparece, só sem detalhes.

    Args:
        entity_type: Tipo gravado em ``person_links``.
        entity_id: ID do item.

    Returns:
        Um item no formato da Memória.
    """
    return {
        "entity_type": entity_type, "entity_id": str(entity_id), "agent": None,
        "label": entity_type.replace("_", " ").capitalize(), "icon": "link",
        "title": f"{entity_type.replace('_', ' ').capitalize()} {entity_id}", "snippet": None,
        "date": None, "deep_link": None, "context": "personal",
    }


def get_person_memory(person_id: str, context: str | None = None, limit: int = 300) -> dict:
    """Montar a Memória de uma pessoa: backlinks de TODOS os agentes + interações.

    Para cada tipo de vínculo em ``person_links`` pergunta ao provedor do agente pelos
    itens (``resolve``); soma os itens achados direto pela pessoa (``by_person``) e as
    interações registradas na Komi. O resultado vem ordenado do mais recente ao mais
    antigo. Provedor que falha é isolado e listado em ``unavailable``.

    Args:
        person_id: ID da pessoa.
        context: ``"personal"`` ou ``"work"`` para ver só aquele lado (quem é "ambos"
            tem os dois); vazio traz tudo.
        limit: Máximo de itens devolvidos.

    Returns:
        ``{"status": "ok", "items": [...], "counts": {agente: n}, "by_context": {...},
        "unavailable": [agentes com erro]}`` ou ``{"status": "error", "message": ...}``.
    """
    from agents.komi import tools as K  # noqa: PLC0415

    try:
        alvo = naming.valid_space(context)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    existe = K.run_select("SELECT 1 FROM people WHERE id = %(id)s", {"id": person_id})
    if not existe:
        return {"status": "error", "message": "Pessoa não encontrada."}

    todos = providers()
    itens: list[dict] = []
    indisponiveis: list[str] = []

    # 1) Vínculos gravados em person_links, agrupados por tipo.
    ligacoes = K.run_select(
        "SELECT entity_type, entity_id FROM person_links WHERE person_id = %(p)s", {"p": person_id}
    )
    por_tipo: dict[str, list[str]] = {}
    for linha in ligacoes:
        por_tipo.setdefault(linha["entity_type"], []).append(linha["entity_id"])

    for tipo, ids in por_tipo.items():
        spec = todos.get(tipo)
        if not spec or not callable(spec.get("resolve")):
            itens.extend(_item_sem_provedor(tipo, i) for i in ids)
            continue
        try:
            itens.extend(_completar_item(spec, b) for b in (spec["resolve"](ids) or []))
        except Exception:  # noqa: BLE001
            logger.warning("Komi: provedor '%s' falhou na Memória.", tipo, exc_info=True)
            indisponiveis.append(spec["agent"])

    # 2) Itens achados direto pela pessoa (ex.: tarefas "aguardando" a pessoa).
    for spec in todos.values():
        if not callable(spec.get("by_person")):
            continue
        try:
            itens.extend(_completar_item(spec, b) for b in (spec["by_person"](person_id) or []))
        except Exception:  # noqa: BLE001
            logger.warning("Komi: provedor '%s' (by_person) falhou.", spec["entity_type"], exc_info=True)
            indisponiveis.append(spec["agent"])

    # 3) Interações registradas na própria Komi.
    try:
        itens.extend(_itens_de_interacao(person_id))
    except Exception:  # noqa: BLE001 — tabela ausente: a Memória segue sem interações
        logger.warning("Komi: não foi possível ler as interações.", exc_info=True)

    por_contexto = {"personal": 0, "work": 0}
    for item in itens:
        por_contexto[item["context"]] += 1
    if alvo:
        itens = [i for i in itens if i["context"] == alvo]

    # Datas ISO (AAAA-MM-DD) ordenam corretamente como texto; os sem data vão para o fim.
    com_data = sorted((i for i in itens if i["date"]), key=lambda i: i["date"], reverse=True)
    sem_data = [i for i in itens if not i["date"]]
    itens = (com_data + sem_data)[: max(1, int(limit))]

    contagem: dict[str, int] = {}
    for item in itens:
        chave = item["agent"] or "outros"
        contagem[chave] = contagem.get(chave, 0) + 1

    return {
        "status": "ok",
        "items": itens,
        "counts": contagem,
        "by_context": por_contexto,
        "unavailable": sorted(set(indisponiveis)),
    }


_ROTULO_INTERACAO = {
    "mensagem": "Mensagem", "ligacao": "Ligação", "encontro": "Encontro", "video": "Vídeo",
    "outro": "Contato",
}


def _itens_de_interacao(person_id: str) -> list[dict]:
    """Ler as interações da pessoa como itens da Memória.

    Args:
        person_id: ID da pessoa.

    Returns:
        Itens ``entity_type='interaction'`` do agente ``komi``.
    """
    from agents.komi import tools as K  # noqa: PLC0415

    linhas = K.run_select(
        """
        SELECT id, kind, context, note,
               (happened_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia
        FROM person_interactions WHERE person_id = %(p)s AND deleted = FALSE
        ORDER BY happened_at DESC
        """,
        {"p": person_id},
    )
    return [
        {
            "entity_type": "interaction", "entity_id": str(r["id"]), "agent": "komi",
            "label": "Interações", "icon": "phone",
            "title": _ROTULO_INTERACAO.get(r["kind"], "Contato"), "snippet": r["note"],
            "date": r["dia"], "deep_link": f"/people#pessoa/{person_id}",
            "context": r["context"] if r["context"] in naming.SPACES else "personal",
        }
        for r in linhas
    ]


def summary_blocks(person_id: str) -> dict[str, dict]:
    """Coletar os blocos de resumo que cada provedor publica (compatível com o Hermes).

    O ``get_person_summary`` devolve blocos por assunto (``financas``, ``tarefas``,
    ``diario``...). Em vez de a Komi consultar as tabelas dos outros agentes, cada
    provedor entrega o seu bloco via ``summary`` + ``summary_key``.

    Args:
        person_id: ID da pessoa.

    Returns:
        ``{summary_key: bloco}``. Provedor que falha fica de fora (o chamador usa o
        bloco vazio padrão).
    """
    blocos: dict[str, dict] = {}
    for spec in providers().values():
        gerar: Callable | None = spec.get("summary")
        if not callable(gerar):
            continue
        try:
            blocos[spec["summary_key"]] = gerar(person_id)
        except Exception:  # noqa: BLE001
            logger.warning("Komi: resumo do provedor '%s' falhou.", spec["entity_type"], exc_info=True)
    return blocos


def last_activity_map(person_ids: list[str]) -> dict[str, dict]:
    """Descobrir, para cada pessoa, a atividade mais recente em QUALQUER agente.

    Cada provedor com ``last_activity`` informa a última coisa que fez com cada pessoa; a
    Komi soma as próprias interações registradas e fica com a mais recente de cada uma.
    É o que alimenta "sem contato há N dias" no Início. Provedor que falha é ignorado.

    Args:
        person_ids: IDs das pessoas a consultar.

    Returns:
        ``{person_id: {"date": "AAAA-MM-DD", "kind": "diário"|"interação"|..., "text": str}}``
        — só as pessoas que têm alguma atividade.
    """
    from agents.komi import tools as K  # noqa: PLC0415

    ids = _ids_unicos(person_ids)
    if not ids:
        return {}
    melhor: dict[str, dict] = {}

    def candidato(pid: str, data, tipo: str, texto: str | None) -> None:
        dia = _texto_data(data)
        if dia and (pid not in melhor or dia > melhor[pid]["date"]):
            melhor[pid] = {"date": dia, "kind": tipo, "text": texto or ""}

    for spec in providers().values():
        buscar = spec.get("last_activity")
        if not callable(buscar):
            continue
        try:
            for linha in buscar(ids) or []:
                candidato(linha["person_id"], linha.get("date"), spec.get("activity_kind") or spec["label"].lower(), linha.get("text"))
        except Exception:  # noqa: BLE001
            logger.warning("Komi: last_activity do provedor '%s' falhou.", spec["entity_type"], exc_info=True)

    try:
        for r in K.run_select(
            """
            SELECT person_id, (happened_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia, kind, note
            FROM person_interactions WHERE person_id = ANY(%(ids)s) AND deleted = FALSE
            ORDER BY happened_at DESC
            """,
            {"ids": ids},
        ):
            candidato(r["person_id"], r["dia"], "interação", r["note"] or _ROTULO_INTERACAO.get(r["kind"], "Contato"))
    except Exception:  # noqa: BLE001
        logger.warning("Komi: não foi possível ler as interações para a última atividade.", exc_info=True)
    return melhor


def run_merge_hooks(drop_id: str, keep_id: str, keep_name: str) -> tuple[dict[str, int], list[str]]:
    """Pedir aos agentes que reapontem o ID de uma pessoa mesclada (gancho ``on_merge``).

    Alguns agentes guardam o ID da pessoa FORA de ``person_links`` — tokens ``@[Nome](komi:id)``
    em textos, o "aguardando" da Kaguya. Ao mesclar, cada um troca ``drop_id`` por ``keep_id`` com a
    própria transação. Os ganchos devem ser idempotentes (rodar de novo não faz mal).

    Args:
        drop_id: ID da pessoa absorvida.
        keep_id: ID da pessoa que fica.
        keep_name: Nome da pessoa que fica (para reescrever o texto dos tokens).

    Returns:
        ``({agente: quantos itens mudaram}, [avisos])`` — ``avisos`` cita os agentes cujo gancho falhou.
    """
    mudancas: dict[str, int] = {}
    avisos: list[str] = []
    for spec in providers().values():
        gancho = spec.get("on_merge")
        if not callable(gancho):
            continue
        try:
            mudou = int(gancho(drop_id, keep_id, keep_name) or 0)
            if mudou:
                mudancas[spec["agent"]] = mudancas.get(spec["agent"], 0) + mudou
        except Exception:  # noqa: BLE001 — um agente com problema não impede a mescla
            logger.warning("Komi: on_merge do provedor '%s' falhou.", spec["entity_type"], exc_info=True)
            avisos.append(f"Não consegui atualizar {spec['label']} ({spec['agent']}); alguns links dela podem ficar apontando para a pessoa mesclada.")
    return mudancas, avisos


def link_item(person_id: str, entity_type: str, entity_id: str | int) -> dict:
    """Vincular UMA pessoa a UM item já existente (o "Desfazer" do desvincular).

    Confere com o provedor do agente que o item existe, para a API nunca criar vínculo com lixo.

    Args:
        person_id: A pessoa.
        entity_type: Tipo do item.
        entity_id: ID do item.

    Returns:
        ``{"status": "ok", "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    from agents.komi.tools import get_conn  # noqa: PLC0415

    try:
        tipo = validate_entity_type(entity_type)
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    spec = providers().get(tipo)
    if spec is None or not callable(spec.get("resolve")):
        return {"status": "error", "message": "Esse tipo de item não pode ser vinculado por aqui."}
    try:
        if not spec["resolve"]([str(entity_id)]):
            return {"status": "error", "message": "Item não encontrado."}
        with get_conn() as conn, conn.cursor() as cur:
            ligadas = link_people(cur, tipo, entity_id, [person_id])
        if not ligadas:
            return {"status": "error", "message": "Pessoa não encontrada."}
        return {"status": "ok", "message": "Vínculo restaurado."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def unlink_item(person_id: str, entity_type: str, entity_id: str | int) -> dict:
    """Desvincular uma pessoa de um item (a ação "Desvincular" da Memória).

    Se o agente do item guarda a pessoa FORA de ``person_links`` (o token ``@[Nome](komi:id)`` num
    bullet do diário, o "aguardando" de uma tarefa), o gancho ``on_unlink`` do provedor limpa isso
    também — senão o vínculo seria recriado na próxima edição do texto.

    Args:
        person_id: A pessoa.
        entity_type: Tipo do item.
        entity_id: ID do item.

    Returns:
        ``{"status": "ok", "removed": 0|1, "undoable": bool}`` ou ``{"status": "error", "message": ...}``.
        ``undoable`` é ``True`` quando basta ``link_item`` para desfazer (sem gancho do agente).
    """
    from agents.komi.tools import get_conn  # noqa: PLC0415

    try:
        tipo = validate_entity_type(entity_type)
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    spec = providers().get(tipo) or {}
    gancho = spec.get("on_unlink")
    mudou = False
    try:
        if callable(gancho):
            mudou = bool(gancho(person_id, str(entity_id)))
        with get_conn() as conn, conn.cursor() as cur:
            removidos = unlink_person(cur, person_id, tipo, entity_id)
    except Exception as e:  # noqa: BLE001
        logger.warning("Komi: não foi possível desvincular.", exc_info=True)
        return {"status": "error", "message": str(e)}
    if not removidos and not mudou:
        return {"status": "error", "message": "Esse vínculo não existe."}
    return {"status": "ok", "removed": 1, "undoable": not callable(gancho)}


def memory_fingerprint(items: list[dict]) -> str:
    """Calcular uma "impressão digital" da Memória de uma pessoa.

    Serve para saber se o resumo de IA guardado ficou velho: se os itens da Memória mudaram
    (ou apareceu/sumiu algum), a impressão digital muda — sem precisar chamar a IA para descobrir.

    Args:
        items: Os itens da Memória (``get_person_memory()["items"]``).

    Returns:
        Um hash SHA-256 em hexadecimal, independente da ordem dos itens.

    Example:
        >>> a = {"entity_type": "task", "entity_id": "1", "title": "t", "snippet": None, "date": "2026-10-01"}
        >>> memory_fingerprint([a]) == memory_fingerprint([dict(a)])
        True
        >>> memory_fingerprint([a]) == memory_fingerprint([{**a, "title": "outro"}])
        False
    """
    linhas = sorted(
        f"{i['entity_type']}|{i['entity_id']}|{i.get('title') or ''}|{i.get('snippet') or ''}|{i.get('date') or ''}"
        for i in items
    )
    return hashlib.sha256("\n".join(linhas).encode("utf-8")).hexdigest()
