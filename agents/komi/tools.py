"""Camada de lógica única do agente Komi — identidade canônica de pessoas.

Toda a lógica de negócio de pessoas vive aqui: CRUD, resolução smart-match,
vínculos polimórficos e hub de agregação. O agente Telegram (komi_agent) e o
router FastAPI (/api/pessoas/*) são fachadas finas sobre estas funções.

Princípio de paridade de canais (FR-015): a *página visual* de cards é webapp-only;
o equivalente Telegram é o resumo conversacional de get_person_summary.

Usage:
    from agents.komi.tools import create_person, find_people, get_person_summary
"""

import uuid         # Para gerar IDs únicos de pessoas (UUID v4)
from datetime import date as _date  # Para datas importantes

import psycopg2.extras  # RealDictCursor — retorna linhas como dicts

from agents.db import get_conn as _raw_get_conn, run_select as _raw_run_select  # Helpers PostgreSQL
from agents.komi import naming  # Regras puras: normalização, espaço, aniversário
from agents.komi.rows import valor  # Lê coluna de linha tupla ou dict (cursor do chamador)
from agents.komi.schema import ensure_schema  # Aplica o schema no 1º acesso do processo


# ─────────────────────────────────────────────────────────────────────────────
# Acesso ao banco com schema garantido
# ─────────────────────────────────────────────────────────────────────────────
# O schema da Komi cresceu (spec 077) e o deploy do código acontece antes da migração
# manual. Estes dois wrappers chamam ensure_schema() antes de qualquer consulta: depois
# da 1ª vez no processo é só uma checagem de variável (nenhuma ida ao banco).

def get_conn():
    """Abrir uma conexão PostgreSQL (commit automático ao sair) com o schema garantido.

    Returns:
        O gerenciador de contexto de ``agents.db.get_conn``.
    """
    ensure_schema()
    return _raw_get_conn()


def run_select(sql: str, params=None) -> list[dict]:
    """Executar um SELECT com o schema da Komi garantido.

    Args:
        sql: Consulta SQL (placeholders ``%(nome)s`` ou ``%s``).
        params: Parâmetros da consulta.

    Returns:
        Lista de linhas como dicionários.
    """
    ensure_schema()
    return _raw_run_select(sql, params)


# ─────────────────────────────────────────────────────────────────────────────
# Helper de normalização (núcleo do smart-match)
# ─────────────────────────────────────────────────────────────────────────────

# A normalização vive em naming.norm (módulo puro, testável sem banco). O nome antigo
# `_norm` continua existindo porque o restante deste módulo e os testes o usam.
_norm = naming.norm


# Campos de texto livre que aceitam "limpar" (string vazia vira NULL no banco).
_CAMPOS_TEXTO_OPCIONAIS = ("relationship", "phone", "email", "instagram", "telegram", "city", "avatar_url", "notes")

# Campos que update_person aceita. Lista fechada de propósito: os nomes das colunas
# entram direto no SQL, então nada que venha de fora pode escolher a coluna.
_CAMPOS_EDITAVEIS = frozenset(
    _CAMPOS_TEXTO_OPCIONAIS
    + ("name", "category", "nickname", "full_name", "context",
       "birth_day", "birth_month", "birth_year", "birthday_remind_days")
)

# Categorias de reserva caso a tabela person_categories ainda não exista ou falhe.
_CATEGORIAS_PADRAO = ("familia", "amigos", "trabalho", "outros")


def _categoria_valida(cur, category: str | None) -> str:
    """Resolver a categoria de uma pessoa contra a lista configurável.

    Args:
        cur: Cursor psycopg2 ativo.
        category: Slug pedido (ex.: ``"amigos"``). Vazio ou desconhecido cai em ``"outros"``.

    Returns:
        O slug de uma categoria existente e não arquivada, ou ``"outros"``.
    """
    slug = (category or "").strip()
    if not slug:
        return "outros"
    try:
        cur.execute("SELECT 1 FROM person_categories WHERE slug = %s AND archived = FALSE", (slug,))
        return slug if cur.fetchone() else "outros"
    except Exception:  # noqa: BLE001 — tabela ausente: usa a lista de reserva
        return slug if slug in _CATEGORIAS_PADRAO else "outros"


def _conflito_de_nome(cur, person_id: str | None, name: str, nickname: str | None) -> str | None:
    """Detectar se o Nome ou o Apelido já pertence a OUTRA pessoa viva.

    O Nome, o Apelido e as "outras formas" (``person_aliases``) são todos chaves de
    resolução: ``@Bia`` precisa apontar para uma pessoa só. Um índice de banco não cobre
    colunas e tabelas diferentes, então a checagem cruzada é feita aqui.

    Args:
        cur: Cursor psycopg2 ativo (dentro da transação do chamador).
        person_id: Pessoa que está sendo editada (ignorada na checagem); ``None`` na criação.
        name: Nome de exibição pretendido.
        nickname: Apelido pretendido (ou ``None``).

    Returns:
        Mensagem de erro em pt-BR citando de quem é o nome, ou ``None`` se estiver livre.
    """
    chaves = naming.name_keys(name, nickname)
    if not chaves:
        return None
    cur.execute(
        """
        SELECT p.name AS name, k.chave AS chave FROM (
            SELECT id, name, normalizado AS chave FROM people WHERE deleted = FALSE
            UNION ALL
            SELECT id, name, nickname_norm FROM people WHERE deleted = FALSE AND nickname_norm IS NOT NULL
            UNION ALL
            SELECT p2.id, p2.name, a.normalizado
              FROM person_aliases a JOIN people p2 ON p2.id = a.person_id WHERE p2.deleted = FALSE
        ) k JOIN people p ON p.id = k.id
        WHERE k.chave = ANY(%s) AND (%s::text IS NULL OR p.id <> %s::text)
        LIMIT 1
        """,
        (chaves, person_id, person_id),
    )
    achado = cur.fetchone()
    if not achado:
        return None
    dono, chave = valor(achado, 0, "name"), valor(achado, 1, "chave")
    # Mostra o texto como a pessoa digitou (não a chave sem acento/caixa).
    digitado = {naming.norm(n): n for n in (name, nickname) if n}.get(chave, chave)
    return f"'{digitado}' já é o nome ou apelido de {dono}. Escolha outro para não confundir as duas pessoas."


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de identidade — Onda 1 / US1
# ─────────────────────────────────────────────────────────────────────────────

def _anotar_no_cursor(
    cur,
    person_id: str,
    text: str,
    kind: str = "nota",
    context: str = "personal",
    source: str = "manual",
    source_refs: list | None = None,
    status: str = "ativa",
) -> int:
    """Inserir uma anotação da pessoa no cursor do chamador (sem commit).

    Args:
        cur: Cursor psycopg2 ativo.
        person_id: UUID da pessoa dona da anotação.
        text: Texto da anotação (já aparado e não vazio).
        kind: ``presente`` | ``gosta`` | ``nao_gosta`` | ``nota``.
        context: ``personal`` ou ``work``.
        source: ``manual`` (dono/agente) ou ``ia`` (sugerida a partir da memória).
        source_refs: Backlinks que originaram a anotação (só para ``ia``).
        status: ``ativa`` | ``sugerida`` | ``descartada``.

    Returns:
        O ID da anotação criada.
    """
    import json  # noqa: PLC0415 — só este helper precisa; evita custo no import do módulo

    cur.execute(
        """
        INSERT INTO person_notes (person_id, kind, context, text, text_norm, source, source_refs, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s) RETURNING id
        """,
        (person_id, kind, context, text, naming.norm(text), source, json.dumps(source_refs or []), status),
    )
    return valor(cur.fetchone(), 0, "id")


def _inserir_pessoa(
    cur,
    name: str,
    relationship: str,
    category: str,
    phone: str,
    email: str,
    instagram: str,
    telegram: str,
    city: str,
    avatar_url: str,
    notes: str,
    nickname: str,
    full_name: str,
    context: str,
    birth_day: int | None,
    birth_month: int | None,
    birth_year: int | None,
    birthday_remind_days: int | None,
) -> dict:
    """Validar e inserir uma pessoa no cursor recebido (base de create_person*).

    Args:
        cur: Cursor psycopg2 ativo (a transação é do chamador; não há commit aqui).
        Demais parâmetros: os mesmos de ``create_person``.

    Returns:
        ``{"status": "ok", "id": <uuid>}`` ou ``{"status": "error", "message": ...}``.
    """
    nome = naming.clean(name)
    if not nome:
        return {"status": "error", "message": "O nome não pode ser vazio."}

    # Valida tudo ANTES de tocar no banco: erro de formulário nunca deixa lixo.
    try:
        ctx = naming.valid_context(context)
        dia, mes, ano = naming.validate_birth(birth_day, birth_month, birth_year)
        lembrete = _lembrete_valido(birthday_remind_days)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    apelido = naming.clean(nickname)
    # Apelido igual ao nome não acrescenta nada: guarda só o nome.
    if apelido and naming.norm(apelido) == naming.norm(nome):
        apelido = None
    completo = naming.clean(full_name)

    conflito = _conflito_de_nome(cur, None, nome, apelido)
    if conflito:
        return {"status": "error", "message": conflito}

    person_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO people
            (id, name, normalizado, nickname, nickname_norm, full_name, full_name_norm,
             relationship, category, context, phone, email, instagram, telegram, city, avatar_url,
             birth_day, birth_month, birth_year, birthday_remind_days)
        VALUES
            (%(id)s, %(name)s, %(normalizado)s, %(nickname)s, %(nickname_norm)s, %(full_name)s, %(full_name_norm)s,
             %(relationship)s, %(category)s, %(context)s, %(phone)s, %(email)s, %(instagram)s, %(telegram)s,
             %(city)s, %(avatar_url)s, %(birth_day)s, %(birth_month)s, %(birth_year)s, %(lembrete)s)
        """,
        {
            "id": person_id,
            "name": nome,
            "normalizado": naming.norm(nome),
            "nickname": apelido,
            "nickname_norm": naming.norm(apelido) or None,
            "full_name": completo,
            "full_name_norm": naming.norm(completo) or None,
            "relationship": naming.clean(relationship),
            "category": _categoria_valida(cur, category),
            "context": ctx,
            "phone": naming.clean(phone),
            "email": naming.clean(email),
            "instagram": naming.clean(instagram),
            "telegram": naming.clean(telegram),
            "city": naming.clean(city),
            "avatar_url": naming.clean(avatar_url),
            "birth_day": dia,
            "birth_month": mes,
            "birth_year": ano,
            "lembrete": lembrete,
        },
    )

    # `notes` é o jeito antigo de guardar observações. Agora vira uma anotação da pessoa
    # (aparece na aba Anotações); no espaço trabalho a anotação nasce como de trabalho.
    texto_nota = naming.clean(notes)
    if texto_nota:
        _anotar_no_cursor(cur, person_id, texto_nota, context="work" if ctx == "work" else "personal")
    return {"status": "ok", "id": person_id}


def _lembrete_valido(dias: int | None) -> int | None:
    """Validar o lembrete (em dias antes) de um aniversário ou data importante.

    Args:
        dias: Quantos dias antes avisar (0 = no dia). ``None`` = sem lembrete.

    Returns:
        O valor validado.

    Raises:
        ValueError: Se não for um inteiro entre 0 e 365.
    """
    if dias is None:
        return None
    try:
        valor = int(dias)
    except (TypeError, ValueError):
        raise ValueError("O lembrete deve ser um número de dias (0 a 365).") from None
    if not 0 <= valor <= 365:
        raise ValueError("O lembrete deve ser um número de dias (0 a 365).")
    return valor


def _erro_de_unicidade(e: Exception, nome: str) -> dict:
    """Traduzir uma violação de índice único do PostgreSQL em mensagem do usuário.

    Args:
        e: Exceção levantada pelo driver.
        nome: Nome que estava sendo gravado (para citar na mensagem).

    Returns:
        ``{"status": "error", "message": ...}`` — a mensagem crua do banco só aparece
        quando o erro não é de unicidade.
    """
    msg = str(e)
    if "idx_people_normalizado_vivo" in msg or "idx_people_nickname_vivo" in msg or "unique" in msg.lower():
        return {"status": "error", "message": f"Já existe uma pessoa viva com o nome ou apelido '{nome}' (ou variação sem acento/caixa)."}
    return {"status": "error", "message": msg}


def create_person(
    name: str,
    relationship: str = "",
    category: str = "outros",
    phone: str = "",
    email: str = "",
    instagram: str = "",
    telegram: str = "",
    city: str = "",
    avatar_url: str = "",
    notes: str = "",
    nickname: str = "",
    full_name: str = "",
    context: str = "personal",
    birth_day: int | None = None,
    birth_month: int | None = None,
    birth_year: int | None = None,
    birthday_remind_days: int | None = 1,
) -> dict:
    """Criar uma nova pessoa no cadastro canônico.

    Gera um UUID, valida os nomes (o Nome e o Apelido não podem ser de outra pessoa viva)
    e insere em ``people``. Em qualquer agente, o Nome e o Apelido servem para
    referenciar a pessoa.

    Args:
        name: Nome — o que o dono escolhe e aparece em todo lugar (obrigatório).
        relationship: Como a pessoa se relaciona com o dono ("mãe", "colega de equipe"...), texto livre.
        category: Relacionamento da lista configurável ("familia", "amigos", "trabalho", "outros"...).
            Desconhecido cai em "outros".
        phone: Telefone de contato.
        email: E-mail de contato.
        instagram: Handle do Instagram.
        telegram: Handle do Telegram.
        city: Cidade.
        avatar_url: URL do avatar; a UI usa iniciais quando ausente.
        notes: Observação inicial; vira uma anotação da pessoa.
        nickname: Apelido ("Bia"). Também resolve a pessoa nos outros agentes.
        full_name: Nome completo ("Beatriz Silva Souza").
        context: Espaço da pessoa: "personal" (pessoal), "work" (trabalho) ou "both" (ambos).
        birth_day: Dia do aniversário (junto com ``birth_month``).
        birth_month: Mês do aniversário.
        birth_year: Ano de nascimento (opcional; a idade só aparece com ele).
        birthday_remind_days: Dias antes para lembrar o aniversário (0 = no dia; ``None`` = sem lembrete).

    Returns:
        ``{"status": "ok", "id": <uuid>, "message": "..."}`` ou ``{"status": "error", "message": ...}``.

    Example:
        >>> create_person("Beatriz", nickname="Bia", birth_day=15, birth_month=5)  # doctest: +SKIP
        {'status': 'ok', 'id': '...', 'message': 'Beatriz cadastrada com sucesso.'}
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                resultado = _inserir_pessoa(
                    cur, name, relationship, category, phone, email, instagram, telegram, city,
                    avatar_url, notes, nickname, full_name, context,
                    birth_day, birth_month, birth_year, birthday_remind_days,
                )
        if resultado["status"] == "ok":
            _marcar_calendario_sujo(birth_day is not None)
            resultado["message"] = f"{naming.clean(name)} cadastrada com sucesso."
        return resultado
    except Exception as e:  # noqa: BLE001 — traduz unicidade; o resto vira mensagem de erro
        return _erro_de_unicidade(e, naming.clean(name) or "")


def create_person_on_cursor(
    cur,
    name: str,
    relationship: str = "",
    category: str = "outros",
    phone: str = "",
    email: str = "",
    instagram: str = "",
    telegram: str = "",
    city: str = "",
    avatar_url: str = "",
    notes: str = "",
    nickname: str = "",
    full_name: str = "",
    context: str = "personal",
    birth_day: int | None = None,
    birth_month: int | None = None,
    birth_year: int | None = None,
    birthday_remind_days: int | None = 1,
) -> dict:
    """Inserir pessoa usando um cursor já aberto (sem abrir conexão própria).

    Versão transacional de ``create_person`` — opera no cursor do chamador sem commitar.
    Permite criar uma pessoa e vinculá-la a um item na mesma transação (tudo-ou-nada).

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação do chamador).
        Demais parâmetros: idênticos a ``create_person``.

    Returns:
        ``{"status": "ok", "id": <uuid>}`` ou ``{"status": "error", "message": ...}``.
        Em caso de erro o chamador deve abortar a transação.
    """
    ensure_schema()  # o cursor é do chamador: garante o schema antes de usá-lo
    try:
        return _inserir_pessoa(
            cur, name, relationship, category, phone, email, instagram, telegram, city,
            avatar_url, notes, nickname, full_name, context,
            birth_day, birth_month, birth_year, birthday_remind_days,
        )
    except Exception as e:  # noqa: BLE001
        return _erro_de_unicidade(e, naming.clean(name) or "")


def _marcar_calendario_sujo(mudou: bool) -> None:
    """Avisar o espelho do Google Calendar que os aniversários/datas podem ter mudado.

    Best-effort: qualquer falha é ignorada (o cadastro nunca depende do espelho).

    Args:
        mudou: Só dispara se algo que aparece no calendário foi alterado.
    """
    if not mudou:
        return
    try:
        from agents.kaguya import gcal_mirror as _gm  # noqa: PLC0415 — evita ciclo de import
        _gm.mark_dirty("komi")
    except Exception:  # noqa: BLE001
        pass


def update_person(person_id: str, **campos) -> dict:
    """Atualizar campos do perfil de uma pessoa existente.

    Só altera os campos passados (atualização parcial). Recalcula as chaves de busca
    quando o Nome, o Apelido ou o Nome completo mudam, e confere que não colidem com
    os de outra pessoa. Toca ``updated_at`` sempre.

    Args:
        person_id: UUID da pessoa a editar.
        **campos: Campos a atualizar — ``name``, ``nickname``, ``full_name``, ``relationship``,
            ``category``, ``context``, ``phone``, ``email``, ``instagram``, ``telegram``, ``city``,
            ``avatar_url``, ``birth_day``, ``birth_month``, ``birth_year``,
            ``birthday_remind_days`` e ``notes`` (este último ACRESCENTA uma anotação em vez de
            substituir algo). Texto vazio limpa o campo.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    if not campos:
        return {"status": "error", "message": "Nenhum campo fornecido para atualizar."}
    desconhecidos = sorted(set(campos) - _CAMPOS_EDITAVEIS)
    if desconhecidos:
        return {"status": "error", "message": f"Campo não editável: {', '.join(desconhecidos)}."}

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT name, nickname, birth_day, birth_month, birth_year, context "
                    "FROM people WHERE id = %s AND deleted = FALSE",
                    (person_id,),
                )
                atual = cur.fetchone()
                if not atual:
                    return {"status": "error", "message": "Pessoa não encontrada ou já excluída."}
                nome_atual, apelido_atual, dia_atual, mes_atual, ano_atual, ctx_atual = atual

                sets: dict = {}  # coluna -> valor; as chaves vêm só de literais deste bloco

                # ── nomes ────────────────────────────────────────────────────────
                nome = nome_atual
                if "name" in campos:
                    nome = naming.clean(campos["name"])
                    if not nome:
                        return {"status": "error", "message": "O nome não pode ser vazio."}
                    sets["name"], sets["normalizado"] = nome, naming.norm(nome)

                apelido = naming.clean(campos["nickname"]) if "nickname" in campos else apelido_atual
                # Apelido igual ao nome (inclusive depois de renomear) é redundante.
                if apelido and naming.norm(apelido) == naming.norm(nome):
                    apelido = None
                if apelido != apelido_atual:
                    sets["nickname"], sets["nickname_norm"] = apelido, (naming.norm(apelido) or None)

                if "full_name" in campos:
                    completo = naming.clean(campos["full_name"])
                    sets["full_name"], sets["full_name_norm"] = completo, (naming.norm(completo) or None)

                if "name" in sets or "nickname" in sets:
                    conflito = _conflito_de_nome(cur, person_id, nome, apelido)
                    if conflito:
                        return {"status": "error", "message": conflito}

                # ── espaço e relacionamento ──────────────────────────────────────
                if "context" in campos:
                    try:
                        sets["context"] = naming.valid_context(campos["context"], padrao=ctx_atual)
                    except ValueError as e:
                        return {"status": "error", "message": str(e)}
                if "category" in campos:
                    pedida = naming.clean(campos["category"]) or "outros"
                    if _categoria_valida(cur, pedida) != pedida:
                        return {"status": "error", "message": f"O relacionamento '{pedida}' não existe ou está arquivado."}
                    sets["category"] = pedida

                # ── aniversário (dia/mês/ano validados JUNTOS, contra o valor atual) ─
                if any(k in campos for k in ("birth_day", "birth_month", "birth_year")):
                    try:
                        dia, mes, ano = naming.validate_birth(
                            campos.get("birth_day", dia_atual),
                            campos.get("birth_month", mes_atual),
                            campos.get("birth_year", ano_atual),
                        )
                    except ValueError as e:
                        return {"status": "error", "message": str(e)}
                    sets["birth_day"], sets["birth_month"], sets["birth_year"] = dia, mes, ano
                if "birthday_remind_days" in campos:
                    try:
                        sets["birthday_remind_days"] = _lembrete_valido(campos["birthday_remind_days"])
                    except ValueError as e:
                        return {"status": "error", "message": str(e)}

                # ── texto livre ──────────────────────────────────────────────────
                for chave in _CAMPOS_TEXTO_OPCIONAIS:
                    if chave in campos and chave != "notes":
                        sets[chave] = naming.clean(campos[chave])
                texto_nota = naming.clean(campos.get("notes"))
                if texto_nota:
                    ctx_final = sets.get("context", ctx_atual)
                    _anotar_no_cursor(cur, person_id, texto_nota, context="work" if ctx_final == "work" else "personal")

                if sets:
                    atribuicoes = ", ".join(f"{col} = %({col})s" for col in sets)
                    cur.execute(
                        f"UPDATE people SET {atribuicoes}, updated_at = NOW() WHERE id = %(person_id)s AND deleted = FALSE",
                        {**sets, "person_id": person_id},
                    )
                elif texto_nota:
                    cur.execute("UPDATE people SET updated_at = NOW() WHERE id = %s", (person_id,))
        _marcar_calendario_sujo(any(k in campos for k in ("name", "birth_day", "birth_month", "birth_year", "birthday_remind_days")))
        return {"status": "ok", "message": "Perfil atualizado com sucesso."}
    except Exception as e:  # noqa: BLE001
        return _erro_de_unicidade(e, naming.clean(campos.get("name")) or naming.clean(campos.get("nickname")) or "")


def delete_person(person_id: str) -> dict:
    """Excluir uma pessoa por soft delete (deleted = TRUE).

    Os vínculos (person_links), apelidos (person_aliases) e datas (person_dates)
    permanecem no banco para preservar histórico. A pessoa some das buscas e do grid.

    Args:
        person_id: UUID da pessoa a excluir.

    Returns:
        {"status": "ok", "message": "..."} ou {"status": "error", "message": ...}.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE people SET deleted = TRUE, updated_at = NOW() WHERE id = %s AND deleted = FALSE",
                    (person_id,),
                )
                if cur.rowcount == 0:
                    return {"status": "error", "message": "Pessoa não encontrada ou já excluída."}
        return {"status": "ok", "message": "Pessoa removida do cadastro (histórico preservado)."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def restore_person(person_id: str) -> dict:
    """Desfazer a exclusão de uma pessoa (o "Desfazer" da interface).

    Recusa se a pessoa foi MESCLADA em outra (ela já "virou" a outra) ou se o Nome/Apelido dela
    foi ocupado por outra pessoa enquanto estava na lixeira.

    Args:
        person_id: UUID da pessoa excluída.

    Returns:
        ``{"status": "ok", "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT name, nickname, deleted, merged_into FROM people WHERE id = %s", (person_id,))
                achado = cur.fetchone()
                if not achado:
                    return {"status": "error", "message": "Pessoa não encontrada."}
                nome, apelido, excluida, mesclada_em = (valor(achado, i, c) for i, c in enumerate(("name", "nickname", "deleted", "merged_into")))
                if not excluida:
                    return {"status": "error", "message": "Essa pessoa não está excluída."}
                if mesclada_em:
                    return {"status": "error", "message": "Essa pessoa foi mesclada em outra e não pode ser restaurada."}
                conflito = _conflito_de_nome(cur, person_id, nome, apelido)
                if conflito:
                    return {"status": "error", "message": conflito}
                cur.execute("UPDATE people SET deleted = FALSE, updated_at = NOW() WHERE id = %s", (person_id,))
        _marcar_calendario_sujo(True)
        return {"status": "ok", "message": "Pessoa restaurada."}
    except Exception as e:  # noqa: BLE001
        return _erro_de_unicidade(e, "")


def add_alias(person_id: str, alias: str) -> dict:
    """Adicionar um apelido a uma pessoa.

    O apelido normalizado deve ser único globalmente — um apelido aponta para
    no máximo uma pessoa. Retorna erro claro se o apelido já pertencer a outra pessoa.

    Args:
        person_id: UUID da pessoa que receberá o apelido.
        alias: Apelido a adicionar (ex.: "Aninha", "nana").

    Returns:
        {"status": "ok", "message": "..."} ou {"status": "error", "message": ...}.
    """
    if not alias or not alias.strip():
        return {"status": "error", "message": "O apelido não pode ser vazio."}

    normalizado = _norm(alias)

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Verifica se a pessoa existe e está viva
                cur.execute("SELECT 1 FROM people WHERE id = %s AND deleted = FALSE", (person_id,))
                if not cur.fetchone():
                    return {"status": "error", "message": "Pessoa não encontrada."}

                # Uma "outra forma" também resolve a pessoa nos outros agentes, então não
                # pode coincidir com o Nome/Apelido/forma de OUTRA pessoa.
                conflito = _conflito_de_nome(cur, person_id, alias, None)
                if conflito:
                    return {"status": "error", "message": conflito}

                cur.execute(
                    "INSERT INTO person_aliases (person_id, alias, normalizado) VALUES (%s, %s, %s) RETURNING id",
                    (person_id, alias.strip(), normalizado),
                )
                alias_id = cur.fetchone()[0]
        return {"status": "ok", "id": alias_id, "message": f"Apelido '{alias}' adicionado com sucesso."}
    except Exception as e:
        msg = str(e)
        if "idx_alias_normalizado" in msg or "unique" in msg.lower():
            # Descobre a qual pessoa o apelido pertence para dar uma mensagem clara
            rows = run_select(
                "SELECT p.name FROM person_aliases a JOIN people p ON p.id = a.person_id WHERE a.normalizado = %(n)s LIMIT 1",
                {"n": normalizado},
            )
            dono = rows[0]["name"] if rows else "outra pessoa"
            return {"status": "error", "message": f"O apelido '{alias}' já pertence a {dono}."}
        return {"status": "error", "message": msg}


def remove_alias(alias_id: int, person_id: str | None = None) -> dict:
    """Remover uma "outra forma de chamar" (apelido extra) de uma pessoa.

    Resolve o buraco da spec 060: um apelido errado não tinha como ser removido. Remover
    não afeta o Nome nem o Apelido principal — esses se editam em ``update_person``.

    Args:
        alias_id: ID da linha em ``person_aliases``.
        person_id: Se informado, só remove quando o apelido pertence a essa pessoa
            (evita apagar o apelido de outra por engano).

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM person_aliases WHERE id = %s AND (%s::text IS NULL OR person_id = %s::text)",
                    (alias_id, person_id, person_id),
                )
                if cur.rowcount == 0:
                    return {"status": "error", "message": "Apelido não encontrado."}
        return {"status": "ok", "message": "Apelido removido."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


# Ano-sentinela para datas informadas apenas como MM-DD (mês-dia, sem ano).
# É um ano BISSEXTO de propósito: assim 02-29 (29 de fevereiro) continua válido.
# Para aniversário o ano não importa — a recorrência é anual e a exibição troca o
# ano (ver komi/calendar_provider.py) — então 2000 é só uma âncora interna, nunca
# mostrada como "ano de nascimento".
_SENTINEL_YEAR = 2000


def _normalize_important_date(date_str: str) -> str:
    """Normalizar uma data de entrada para o formato AAAA-MM-DD do Postgres.

    Aceita os dois formatos que a interface oferece (placeholder do campo:
    "MM-DD ou AAAA-MM-DD"):
      - "AAAA-MM-DD": ano-mês-dia completo (ISO) — validado e devolvido igual.
      - "MM-DD": mês-dia sem ano — recebe o ano-sentinela bissexto (2000), já
        que para aniversário o ano não é necessário.

    Sem esta normalização o valor cru ia direto para a coluna DATE do Postgres;
    um "MM-DD" então estourava com "invalid input syntax for type date", que
    virava um HTTP 400 silencioso na tela (a UI engole o erro do save).

    Args:
        date_str: Data crua vinda do formulário ou do agente.

    Returns:
        A data normalizada no formato "AAAA-MM-DD" (sempre com zero à esquerda).

    Raises:
        ValueError: Se a string não casar com MM-DD nem AAAA-MM-DD, ou não for
            uma data de calendário válida (ex.: "02-30").

    Example:
        >>> _normalize_important_date("05-15")
        '2000-05-15'
        >>> _normalize_important_date("1998-5-9")
        '1998-05-09'
    """
    # Tira espaços nas pontas (tolera " 05-15 " digitado sem querer)
    texto = (date_str or "").strip()
    # Quebra pelos hifens para saber se veio com ano (3 partes) ou sem (2 partes)
    partes = texto.split("-")

    try:
        if len(partes) == 3:
            # AAAA-MM-DD: ano, mês e dia explícitos
            ano, mes, dia = (int(p) for p in partes)
        elif len(partes) == 2:
            # MM-DD: sem ano → usa o ano-sentinela bissexto
            mes, dia = (int(p) for p in partes)
            ano = _SENTINEL_YEAR
        else:
            # Qualquer outra forma (ex.: "15/05/2000") é inválida aqui
            raise ValueError
        # _date (datetime.date) valida o intervalo de mês/dia, rejeita datas
        # impossíveis como 02-30, e o isoformat() garante o zero-padding final.
        return _date(ano, mes, dia).isoformat()
    except (ValueError, TypeError):
        # Troca o erro técnico do Postgres por uma mensagem que o usuário entende
        raise ValueError(
            f"Data inválida: '{date_str}'. Use MM-DD (ex.: 05-15) "
            f"ou AAAA-MM-DD (ex.: 1998-05-15)."
        )


def _lembrete_da_data(dias: int | None) -> int | None:
    """Interpretar o lembrete de uma data importante vindo de formulário, API ou agente.

    ``-1`` significa "sem lembrete" (e ``None`` num UPDATE significa "não mexer"), por isso
    ele não colide com o valor ``None`` do banco nem exige um parâmetro-sentinela nas tools.

    Args:
        dias: Dias antes (0 a 365) ou ``-1`` para desligar o lembrete.

    Returns:
        O número de dias, ou ``None`` quando o lembrete deve ficar desligado.

    Raises:
        ValueError: Se não for um inteiro entre 0 e 365 (ou -1).
    """
    if dias == -1:
        return None
    return _lembrete_valido(dias)


def set_birthday(
    person_id: str,
    birth_day: int,
    birth_month: int,
    birth_year: int | None = None,
    remind_days: int | None = None,
) -> dict:
    """Definir o aniversário de uma pessoa (dia e mês; ano é opcional).

    O aniversário é um campo da pessoa — aparece sozinho no calendário (e no espelho do
    Google) com lembrete e entra no resumo da manhã. Para tirar o aniversário, use
    ``update_person(person_id, birth_day=None, birth_month=None)``.

    Args:
        person_id: UUID da pessoa.
        birth_day: Dia do mês (1 a 31).
        birth_month: Mês (1 a 12).
        birth_year: Ano de nascimento (opcional; a idade só aparece com ele). Se omitido,
            um ano já cadastrado é preservado.
        remind_days: Dias antes para lembrar (0 = no dia). Se omitido, o lembrete atual é
            preservado; ``-1`` desliga o lembrete.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.

    Example:
        >>> set_birthday("uuid...", 15, 5, 1998)      # doctest: +SKIP
        {'status': 'ok', 'message': 'Perfil atualizado com sucesso.'}
    """
    campos: dict = {"birth_day": birth_day, "birth_month": birth_month}
    if birth_year is not None:
        campos["birth_year"] = birth_year
    if remind_days is not None:
        try:
            campos["birthday_remind_days"] = _lembrete_da_data(remind_days)
        except ValueError as e:
            return {"status": "error", "message": str(e)}
    return update_person(person_id, **campos)


def add_important_date(
    person_id: str,
    label: str,
    date: str,
    recurring: bool = True,
    remind_days_before: int = 1,
) -> dict:
    """Adicionar uma data importante a uma pessoa (casamento, formatura...).

    O ANIVERSÁRIO não é uma data solta: é um campo da pessoa (``set_birthday``). Por isso,
    adicionar uma data recorrente com o rótulo exato "aniversário" grava o campo da pessoa
    — assim o chat e o Hermes continuam funcionando como sempre.

    Args:
        person_id: UUID da pessoa.
        label: Descrição da data (ex.: "casamento", "formatura").
        date: Data no formato AAAA-MM-DD ou MM-DD (sem ano).
        recurring: Se True, a data repete todo ano.
        remind_days_before: Quantos dias antes lembrar (0 = no dia; ``-1`` = sem lembrete).

    Returns:
        ``{"status": "ok", "id": int, "message": "..."}`` ou ``{"status": "error", "message": ...}``.
        Para o aniversário o ``id`` é ``None`` (não há linha em ``person_dates``).
    """
    if not label or not label.strip():
        return {"status": "error", "message": "O label não pode ser vazio."}
    if not date:
        return {"status": "error", "message": "A data é obrigatória (MM-DD ou AAAA-MM-DD)."}

    # Aceita MM-DD (sem ano) e AAAA-MM-DD — como o campo da UI promete — e converte para o
    # AAAA-MM-DD que o Postgres exige.
    try:
        date = _normalize_important_date(date)
        lembrete = _lembrete_da_data(remind_days_before)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    # O aniversário é um campo da pessoa, não uma data solta (spec 077).
    if recurring and naming.norm(label) == "aniversario":
        d = _date.fromisoformat(date)
        campos = {"birth_day": d.day, "birth_month": d.month}
        if d.year != _SENTINEL_YEAR:  # o ano-sentinela só marca "veio sem ano"
            campos["birth_year"] = d.year
        resultado = update_person(person_id, **campos)
        if resultado["status"] != "ok":
            return resultado
        return {"status": "ok", "id": None, "message": f"Aniversário ({d.day:02d}/{d.month:02d}) registrado no cadastro da pessoa."}

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM people WHERE id = %s AND deleted = FALSE", (person_id,))
                if not cur.fetchone():
                    return {"status": "error", "message": "Pessoa não encontrada."}
                cur.execute(
                    "INSERT INTO person_dates (person_id, label, date, recurring, remind_days_before) "
                    "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (person_id, label.strip(), date, recurring, lembrete),
                )
                date_id = cur.fetchone()[0]

        # Espelho Calendar Hub → Google Calendar (spec 069) — reconcilia "Komi — Pessoas"
        _marcar_calendario_sujo(True)
        return {"status": "ok", "id": date_id, "message": f"Data '{label}' ({date}) adicionada com sucesso."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def update_important_date(
    date_id: int,
    *,
    date: str | None = None,
    label: str | None = None,
    recurring: bool | None = None,
    remind_days_before: int | None = None,
) -> dict:
    """Atualizar campos de uma data importante por ID (UPDATE parcial).

    Só altera os campos passados. Permite editar rótulo, data, recorrência e lembrete de
    forma independente.

    Args:
        date_id: ID numérico da ``person_dates`` a atualizar.
        date: Nova data (AAAA-MM-DD ou MM-DD), opcional.
        label: Novo rótulo, opcional.
        recurring: Novo valor da recorrência anual, opcional.
        remind_days_before: Novo lembrete em dias antes (0 = no dia; ``-1`` desliga), opcional.

    Returns:
        ``{"status": "ok", "message": "Data atualizada."}`` ou ``{"status": "error", "message": ...}``.

    Example:
        >>> update_important_date(42, date="2026-07-10")        # doctest: +SKIP
        {'status': 'ok', 'message': 'Data atualizada.'}
    """
    if date is None and label is None and recurring is None and remind_days_before is None:
        return {"status": "error", "message": "Nenhum campo para atualizar."}

    sets: list[str] = []
    values: list = []
    try:
        if date is not None:
            sets.append("date = %s")
            values.append(_normalize_important_date(date))
        if remind_days_before is not None:
            sets.append("remind_days_before = %s")
            values.append(_lembrete_da_data(remind_days_before))
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    if label is not None:
        sets.append("label = %s")
        values.append(label)
    if recurring is not None:
        sets.append("recurring = %s")
        values.append(recurring)
    values.append(date_id)

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"UPDATE person_dates SET {', '.join(sets)} WHERE id = %s", values)
                if cur.rowcount == 0:
                    return {"status": "error", "message": "Data não encontrada."}
        _marcar_calendario_sujo(True)
        return {"status": "ok", "message": "Data atualizada."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def delete_important_date(date_id: int) -> dict:
    """Remover uma data importante por ID (DELETE físico).

    Args:
        date_id: ID numérico da ``person_dates`` a remover.

    Returns:
        ``{"status": "ok", "message": "Data removida."}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM person_dates WHERE id = %s", (date_id,))
                if cur.rowcount == 0:
                    return {"status": "error", "message": "Data não encontrada."}
        _marcar_calendario_sujo(True)
        return {"status": "ok", "message": "Data removida."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def upcoming_birthdays(days: int = 7, space: str | None = None, today: str | None = None) -> dict:
    """Listar os aniversários de hoje até daqui a N dias, com ideias de presente.

    É o que alimenta o resumo da manhã (digest) e o Hermes ("quem faz aniversário essa
    semana?"). Cada item traz as anotações ativas do tipo ``presente`` e ``gosta`` da
    pessoa, para o lembrete já vir com sugestões. O 29/02 em ano comum cai em 28/02.

    Args:
        days: Janela em dias a partir de hoje (0 = só hoje; máximo 366).
        space: ``"personal"`` ou ``"work"`` para só considerar quem vale naquele espaço
            (quem é "ambos" sempre entra); vazio considera todos.
        today: Data de referência ``AAAA-MM-DD`` (padrão: hoje em America/Sao_Paulo).

    Returns:
        ``{"status": "ok", "birthdays": [{person_id, name, nickname, date, in_days, turning,
        gift_ideas, likes}, ...]}`` ordenado do mais próximo ao mais distante, ou
        ``{"status": "error", "message": ...}``. ``turning`` é a idade que a pessoa completa
        (``None`` sem ano de nascimento).
    """
    try:
        espacos = naming.spaces_matching(space)
        hoje = _date.fromisoformat(today) if today else naming.today_sp()
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    janela = max(0, min(int(days), 366))

    filtro = "AND context = ANY(%(espacos)s)" if espacos else ""
    try:
        pessoas = run_select(
            f"""
            SELECT id, name, nickname, birth_day, birth_month, birth_year
            FROM people WHERE deleted = FALSE AND birth_day IS NOT NULL {filtro}
            """,
            {"espacos": list(espacos)} if espacos else None,
        )
        proximos = []
        for p in pessoas:
            quando = naming.next_birthday(p["birth_day"], p["birth_month"], hoje)
            faltam = (quando - hoje).days
            if faltam <= janela:
                proximos.append({
                    "person_id": p["id"], "name": p["name"], "nickname": p["nickname"],
                    "date": quando.isoformat(), "in_days": faltam,
                    "turning": (quando.year - p["birth_year"]) if p["birth_year"] else None,
                    "gift_ideas": [], "likes": [],
                })
        if proximos:
            notas = run_select(
                """
                SELECT person_id, kind, text FROM person_notes
                WHERE person_id = ANY(%(ids)s) AND deleted = FALSE AND status = 'ativa'
                  AND kind IN ('presente', 'gosta')
                ORDER BY created_at DESC
                """,
                {"ids": [p["person_id"] for p in proximos]},
            )
            por_pessoa = {p["person_id"]: p for p in proximos}
            for n in notas:
                lista = por_pessoa[n["person_id"]]["gift_ideas" if n["kind"] == "presente" else "likes"]
                if len(lista) < 3:  # poucas ideias por pessoa: é um lembrete, não um dossiê
                    lista.append(n["text"])
        proximos.sort(key=lambda p: (p["in_days"], p["name"]))
        return {"status": "ok", "birthdays": proximos}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def _like_prefixo(termo_normalizado: str) -> str:
    """Montar um padrão ``LIKE`` de prefixo, escapando os curingas digitados pelo usuário.

    Sem isto, buscar ``a_b`` casaria ``axb`` (``_`` é curinga em LIKE) e ``%`` casaria tudo.

    Args:
        termo_normalizado: Termo já normalizado por ``naming.norm``.

    Returns:
        O padrão para usar em ``LIKE`` (``\\`` é o escape padrão do PostgreSQL).

    Example:
        >>> _like_prefixo("a_b")
        'a\\\\_b%'
    """
    escapado = termo_normalizado.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"{escapado}%"


def list_people(space: str | None = None) -> dict:
    """Listar as pessoas vivas com a contagem de vínculos.

    Retorna dados para o diretório: nomes, relacionamento, espaço, cidade, aniversário,
    outras formas de chamar e o número de itens vinculados (``link_count``) em todos os
    domínios. Quem é "ambos" aparece nos dois espaços.

    Args:
        space: ``"personal"`` ou ``"work"`` para filtrar por espaço; vazio/``"all"`` traz todos.

    Returns:
        ``{"status": "ok", "people": [{"id", "name", "nickname", "full_name", "relationship",
        "category", "context", "city", "avatar_url", "birth_day", "birth_month", "birth_year",
        "aliases", "link_count"}, ...]}``.
    """
    try:
        espacos = naming.spaces_matching(space)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    # O filtro entra como texto fixo (sem dados do usuário); o valor vai por parâmetro.
    filtro = "AND p.context = ANY(%(espacos)s)" if espacos else ""
    try:
        rows = run_select(
            f"""
            SELECT
                p.id, p.name, p.nickname, p.full_name, p.relationship, p.category, p.context,
                p.city, p.avatar_url, p.birth_day, p.birth_month, p.birth_year,
                COUNT(pl.id) AS link_count,
                COALESCE(
                    (SELECT array_agg(a.alias ORDER BY a.alias) FROM person_aliases a WHERE a.person_id = p.id),
                    '{{}}'
                ) AS aliases
            FROM people p
            LEFT JOIN person_links pl ON pl.person_id = p.id
            WHERE p.deleted = FALSE {filtro}
            GROUP BY p.id
            ORDER BY p.name
            """,
            {"espacos": list(espacos)} if espacos else None,
        )
        return {"status": "ok", "people": rows}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def find_people(query: str) -> dict:
    """Buscar pessoas por nome, apelido, nome completo ou outra forma (smart-match).

    Casa o ``query`` normalizado (sem caixa nem acento) como PREFIXO de qualquer um dos
    nomes da pessoa. Só retorna pessoas vivas.

    A cardinalidade dirige o comportamento do agente (FR-007):
      - 0 matches → agente oferece criar a pessoa
      - 1 match  → agente usa direto (sem perguntar)
      - 2+ matches → agente pergunta qual antes de qualquer vínculo

    Args:
        query: Nome ou apelido digitado pelo usuário.

    Returns:
        ``{"status": "ok", "matches": [{"id", "name", "nickname", "relationship"}, ...]}``.
    """
    if not query or not query.strip():
        return {"status": "ok", "matches": []}

    try:
        rows = run_select(
            """
            SELECT p.id, p.name, p.nickname, p.relationship
            FROM people p
            WHERE p.deleted = FALSE AND (
                p.normalizado LIKE %(pattern)s
                OR p.nickname_norm LIKE %(pattern)s
                OR p.full_name_norm LIKE %(pattern)s
                OR EXISTS (
                    SELECT 1 FROM person_aliases a
                    WHERE a.person_id = p.id AND a.normalizado LIKE %(pattern)s
                )
            )
            ORDER BY p.name
            """,
            {"pattern": _like_prefixo(naming.norm(query))},
        )
        return {"status": "ok", "matches": rows}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def find_people_exact(name: str) -> list[dict]:
    """Pessoas vivas cujo Nome, Apelido, Nome completo ou outra forma é exatamente ``name``.

    Diferente de ``find_people`` (prefixo, para busca), aqui ``"Ana"`` não casa com
    "Ana Lima". É o critério para vincular uma ``@Menção`` sem perguntar (spec 076):
    ``@Bia`` e ``@Beatriz`` apontam para a mesma pessoa.

    Args:
        name: Texto exato (sem acento/caixa) a procurar.

    Returns:
        ``[{"id", "name"}]`` — vazio em erro (vínculo é best-effort).
    """
    chave = naming.norm(name)
    if not chave:
        return []
    try:
        return run_select(
            """
            SELECT p.id, p.name FROM people p
            WHERE p.deleted = FALSE AND (
                p.normalizado = %(n)s
                OR p.nickname_norm = %(n)s
                OR p.full_name_norm = %(n)s
                OR EXISTS (SELECT 1 FROM person_aliases a WHERE a.person_id = p.id AND a.normalizado = %(n)s)
            )
            ORDER BY p.name
            """,
            {"n": chave},
        )
    except Exception:  # noqa: BLE001
        return []


def suggest_people(query: str = "", limit: int = 8, space: str | None = None) -> dict:
    """Sugestões para o autocomplete de ``@``: prefixo no nome, apelido ou outra forma.

    Sem termo, traz as pessoas mais vinculadas. Cada sugestão traz o avatar e a forma que
    casou (``alias``: o apelido ou a outra forma — a interface mostra "(Bia)").

    Args:
        query: O que a pessoa digitou depois do ``@``.
        limit: Máximo de sugestões (1 a 20).
        space: ``"personal"`` ou ``"work"`` para só sugerir quem vale naquele espaço
            (quem é "ambos" sempre entra).

    Returns:
        ``{"status": "ok", "people": [{"id", "name", "nickname", "relationship", "avatar_url", "alias"}]}``.
    """
    limit = max(1, min(int(limit), 20))
    norm_q = naming.norm(query or "")
    try:
        espacos = naming.spaces_matching(space)
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    filtro = "AND p.context = ANY(%(espacos)s)" if espacos else ""
    base = {"espacos": list(espacos)} if espacos else {}
    try:
        if not norm_q:
            rows = run_select(
                f"""
                SELECT p.id, p.name, p.nickname, p.relationship, p.avatar_url, NULL AS alias
                FROM people p LEFT JOIN person_links pl ON pl.person_id = p.id
                WHERE p.deleted = FALSE {filtro}
                GROUP BY p.id ORDER BY COUNT(pl.id) DESC, p.name LIMIT %(n)s
                """,
                {**base, "n": limit},
            )
        else:
            rows = run_select(
                f"""
                SELECT DISTINCT ON (id) id, name, nickname, relationship, avatar_url, alias, rank FROM (
                    -- Nome: prefixo (rank 0) ou início de qualquer palavra (rank 1)
                    SELECT p.id, p.name, p.nickname, p.relationship, p.avatar_url, NULL::text AS alias,
                           CASE WHEN p.normalizado LIKE %(prefix)s THEN 0 ELSE 1 END AS rank
                    FROM people p
                    WHERE p.deleted = FALSE {filtro}
                      AND (p.normalizado LIKE %(prefix)s OR p.normalizado LIKE %(word)s)
                    UNION ALL
                    -- Apelido: prefixo (mostra o apelido como a forma que casou)
                    SELECT p.id, p.name, p.nickname, p.relationship, p.avatar_url, p.nickname AS alias, 0 AS rank
                    FROM people p
                    WHERE p.deleted = FALSE {filtro} AND p.nickname_norm LIKE %(prefix)s
                    UNION ALL
                    -- Nome completo: início de qualquer palavra (ex.: digitar o sobrenome)
                    SELECT p.id, p.name, p.nickname, p.relationship, p.avatar_url, p.full_name AS alias, 2 AS rank
                    FROM people p
                    WHERE p.deleted = FALSE {filtro}
                      AND (p.full_name_norm LIKE %(prefix)s OR p.full_name_norm LIKE %(word)s)
                    UNION ALL
                    -- Outras formas de chamar
                    SELECT p.id, p.name, p.nickname, p.relationship, p.avatar_url, a.alias, 0 AS rank
                    FROM people p JOIN person_aliases a ON a.person_id = p.id
                    WHERE p.deleted = FALSE {filtro} AND a.normalizado LIKE %(prefix)s
                ) s
                ORDER BY id, rank
                """,
                {**base, "prefix": _like_prefixo(norm_q), "word": "% " + _like_prefixo(norm_q)},
            )
            rows = sorted(rows, key=lambda r: (r["rank"], r["name"]))[:limit]
            for r in rows:
                r.pop("rank", None)
        return {"status": "ok", "people": rows}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def get_person(person_id: str) -> dict:
    """Obter perfil completo de uma pessoa (sem vínculos cross-agent).

    Retorna o perfil + todos os apelidos + próximas datas importantes.
    É a base do resumo conversacional da US1 (sem depender de vínculos).

    Args:
        person_id: UUID da pessoa.

    Returns:
        {"status": "ok", "perfil": {...}, "aliases": [...], "datas": [...]}.
    """
    try:
        rows = run_select(
            "SELECT * FROM people WHERE id = %(id)s AND deleted = FALSE",
            {"id": person_id},
        )
        if not rows:
            return {"status": "error", "message": "Pessoa não encontrada."}

        perfil = rows[0]
        # Converte timestamps para string ISO para serialização JSON
        for f in ("created_at", "updated_at"):
            if perfil.get(f) and hasattr(perfil[f], "isoformat"):
                perfil[f] = perfil[f].isoformat()

        aliases = run_select(
            "SELECT alias, normalizado FROM person_aliases WHERE person_id = %(id)s ORDER BY alias",
            {"id": person_id},
        )

        # Próximas datas: ordena pela diferença em relação a hoje (ano ignorado nos recorrentes).
        # Inclui o id (para PATCH/DELETE) e o lembrete de cada data. O aniversário NÃO está aqui:
        # é um campo do perfil (birth_day/birth_month/birth_year), spec 077.
        datas = run_select(
            """
            SELECT pd.id, pd.label, pd.date::text, pd.recurring, pd.remind_days_before
            FROM person_dates pd
            WHERE pd.person_id = %(id)s
            ORDER BY pd.date
            """,
            {"id": person_id},
        )

        return {"status": "ok", "perfil": perfil, "aliases": aliases, "datas": datas}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Helper transacional — consumido pelos outros agentes (Onda 2 / US2)
# ─────────────────────────────────────────────────────────────────────────────

def link_person_on_cursor(
    cur,
    person_id: str,
    entity_type: str,
    entity_id: str | int,
) -> None:
    """Inserir vínculo pessoa↔item usando o cursor do chamador (sem commitar).

    Fachada de compatibilidade: o contrato oficial é ``agents.komi.integration.link_people``
    (vários agentes já importam este nome, então ele continua existindo). Idempotente.

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação do chamador).
        person_id: UUID da pessoa a vincular.
        entity_type: Tipo do item ("transaction", "task", "book", "journal_bullet"...).
            Qualquer agente pode registrar o seu; ver ``integration.validate_entity_type``.
        entity_id: ID do item (UUID como str ou SERIAL int — coagido para str).

    Raises:
        ValueError: Se ``entity_type`` tiver formato inválido.

    Example:
        >>> with get_conn() as conn:                                              # doctest: +SKIP
        ...     with conn.cursor() as cur:
        ...         link_person_on_cursor(cur, "uuid...", "transaction", "tx-1")
    """
    from agents.komi import integration  # noqa: PLC0415 — import lazy: integration importa este módulo

    integration.link_people(cur, entity_type, entity_id, [person_id])


# ─────────────────────────────────────────────────────────────────────────────
# Helper transacional — remover todos os vínculos de uma entidade (fatia 025)
# ─────────────────────────────────────────────────────────────────────────────

def unlink_people_on_cursor(
    cur,
    entity_type: str,
    entity_id: str | int,
) -> None:
    """Remover todos os vínculos pessoa↔item de um item usando o cursor do chamador.

    Fachada de compatibilidade de ``agents.komi.integration.unlink_all`` (e, para trocar o
    conjunto inteiro de uma vez, prefira ``integration.sync_people``). Idempotente.

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação do chamador).
        entity_type: Tipo do item — ``"task"``, ``"transaction"``, ``"book"`` etc.
        entity_id: ID do item (UUID como str ou SERIAL int — coagido para str).

    Raises:
        ValueError: Se ``entity_type`` tiver formato inválido.
    """
    from agents.komi import integration  # noqa: PLC0415

    integration.unlink_all(cur, entity_type, entity_id)


# ─────────────────────────────────────────────────────────────────────────────
# Hub de agregação — Onda 3 / US3 (T014)
# ─────────────────────────────────────────────────────────────────────────────

# Blocos que o resumo SEMPRE devolve (o Hermes e o webapp contam com estas chaves). Quando o
# provedor do agente falha, o bloco fica vazio em vez de sumir.
_BLOCOS_PADRAO = {
    "financas": {"saldo": 0.0, "transacoes": []},
    "tarefas": {"abertas": [], "concluidas": []},
    "diario": {"contagem": 0, "trechos": []},
    "cartas": {"cartas": []},
    "livros": {"livros": []},
}


def get_person_summary(person_id: str) -> dict:
    """Retornar o resumo de uma pessoa com os blocos de todos os agentes.

    O perfil (pessoa + outras formas + datas) vem da própria Komi. Cada bloco por assunto
    (``financas``, ``tarefas``, ``diario``, ``cartas``, ``livros``, ``filmes``...) vem do
    PROVEDOR do agente dono (``agents/<agente>/komi_provider.py``) — a Komi não consulta
    mais as tabelas dos outros agentes. Agente novo com provedor entra aqui sozinho.

    Bloco vazio = ausência de dados, nunca erro: se um provedor falhar, o bloco dele fica
    no formato padrão vazio e o resto do resumo é entregue.

    Args:
        person_id: UUID da pessoa.

    Returns:
        ``{"status": "ok", "perfil": {..., "aliases": [...], "datas": [...]}, "financas": {...},
        "tarefas": {...}, "diario": {...}, "cartas": {...}, "livros": {...}, ...}``
        (mais um bloco por provedor extra) ou ``{"status": "error", "message": ...}``.
    """
    import copy  # noqa: PLC0415 — só este resumo precisa

    from agents.komi import integration  # noqa: PLC0415 — import lazy: integration importa este módulo

    # A pessoa pode estar excluída: o resumo ainda pode ser pedido pela interface.
    rows = run_select("SELECT * FROM people WHERE id = %(id)s", {"id": person_id})
    if not rows:
        return {"status": "error", "message": "Pessoa não encontrada."}

    perfil = rows[0]
    for f in ("created_at", "updated_at"):
        if perfil.get(f) and hasattr(perfil[f], "isoformat"):
            perfil[f] = perfil[f].isoformat()

    aliases = run_select(
        "SELECT alias FROM person_aliases WHERE person_id = %(id)s ORDER BY alias",
        {"id": person_id},
    )
    datas = run_select(
        "SELECT label, date::text, recurring, remind_days_before FROM person_dates WHERE person_id = %(id)s ORDER BY date",
        {"id": person_id},
    )
    perfil["aliases"] = [r["alias"] for r in aliases]
    perfil["datas"] = datas

    # Padrão vazio por cima, blocos dos provedores por baixo (os que falharam ficam no padrão).
    blocos = copy.deepcopy(_BLOCOS_PADRAO)
    blocos.update(integration.summary_blocks(person_id))
    return {"status": "ok", "perfil": perfil, **blocos}


# ─────────────────────────────────────────────────────────────────────────────
# Agregação para a Home — uma passada cross-pessoa
# ─────────────────────────────────────────────────────────────────────────────

def get_people_overview() -> dict:
    """Retornar visão agregada de todas as pessoas vivas para a Home do frontend.

    Faz uma única passada por todas as pessoas vivas, retornando para cada uma:
    - dados de perfil (id, name, relationship, category, avatar_url)
    - datas importantes (para calcular próximas datas no frontend)
    - saldo financeiro (finance_net) — positivo = te devem, negativo = você deve
    - última interação conhecida (last_interaction) — a mais recente entre as interações registradas
      na Komi e a última atividade que CADA agente informa pelo contrato (integration.last_activity_map)

    O frontend usa este endpoint para montar a Home (hero, reconectar, próximas
    datas, a-acertar) sem precisar chamar get_person_summary uma vez por pessoa.

    Cada bloco cross-agent tem seu próprio try/except — degrada silenciosamente
    se a tabela não existir (ex.: ambiente de testes sem Nami/Kaguya/Journal).

    Returns:
        {
          "status": "ok",
          "people": [
            {
              "id": str,
              "name": str,
              "relationship": str | None,
              "category": str,
              "avatar_url": str | None,
              "dates": [{"label": str, "date": str, "recurring": bool}],
              "finance_net": float,          # 0.0 se sem vínculos financeiros
              "last_interaction": {          # None se sem qualquer interação
                "date": str,               # YYYY-MM-DD
                "kind": str,               # "interação" | "diário" | "finanças" | "tarefa" | ... (vem do agente)
                "text": str
              } | None,
            },
            ...
          ]
        }
        ou {"status": "error", "message": ...}.
    """
    try:
        # ── 1. Busca todas as pessoas vivas ───────────────────────────────────
        pessoas = run_select(
            """
            SELECT id, name, nickname, full_name, relationship, category, context, city, avatar_url,
                   birth_day, birth_month, birth_year, birthday_remind_days
            FROM people
            WHERE deleted = FALSE
            ORDER BY name
            """
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

    if not pessoas:
        return {"status": "ok", "people": []}

    # Monta dict {person_id → dados} para enriquecimento incremental
    ids = [p["id"] for p in pessoas]
    data = {p["id"]: dict(p, dates=[], finance_net=0.0, last_interaction=None) for p in pessoas}

    # ── 2. Datas importantes (person_dates) ───────────────────────────────────
    # Busca todas de uma vez só — mais eficiente que N queries individuais
    try:
        datas = run_select(
            """
            SELECT person_id, label, date::text AS date, recurring, remind_days_before
            FROM person_dates
            WHERE person_id = ANY(%(ids)s)
            ORDER BY date
            """,
            {"ids": ids},
        )
        for d in datas:
            pid = d["person_id"]
            if pid in data:
                # Adiciona cada data ao array da pessoa correspondente
                data[pid]["dates"].append({
                    "label": d["label"],
                    "date": d["date"],
                    "recurring": d["recurring"],
                    "remind_days_before": d["remind_days_before"],
                })
    except Exception:
        # Se a tabela não existir, ignora — datas ficam vazias
        pass

    # ── 3. Saldo financeiro (transactions via person_links) ───────────────────
    # Soma Receita (positivo) − Despesa (negativo) por pessoa em uma query GROUP BY
    try:
        saldos = run_select(
            """
            SELECT
                pl.person_id,
                COALESCE(SUM(
                    CASE WHEN t.tipo = 'Receita' THEN t.valor ELSE -t.valor END
                ), 0) AS finance_net
            FROM person_links pl
            JOIN transactions t ON t.id = pl.entity_id AND t.deleted = FALSE
            WHERE pl.entity_type = 'transaction'
              AND pl.person_id = ANY(%(ids)s)
            GROUP BY pl.person_id
            """,
            {"ids": ids},
        )
        for row in saldos:
            pid = row["person_id"]
            if pid in data:
                data[pid]["finance_net"] = float(row["finance_net"])
    except Exception:
        # Nami não disponível — todos os saldos ficam em 0.0
        pass

    # ── 4. Última interação — de QUALQUER agente + as interações registradas na Komi ──
    # Cada agente informa a sua pela chave `last_activity` do provedor (contrato de integração);
    # a Komi não consulta mais as tabelas dos outros.
    try:
        from agents.komi import integration  # noqa: PLC0415 — import lazy: integration importa este módulo
        for pid, ultima in integration.last_activity_map(ids).items():
            if pid in data:
                data[pid]["last_interaction"] = ultima
    except Exception:  # noqa: BLE001 — sem provedores: o Início só fica sem "último contato"
        pass

    # ── 5. Monta resposta final ───────────────────────────────────────────────
    return {"status": "ok", "people": list(data.values())}
