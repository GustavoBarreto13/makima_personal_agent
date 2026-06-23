"""Espelho de saída best-effort: sincroniza aniversários Komi ↔ Kaguya.

Propósito
---------
Toda mutação de aniversário em qualquer um dos dois lados propaga para o outro:

  Komi → Kaguya  (person_date com label ILIKE '%anivers%'):
    - push_person_date(date_id)   — criar ou atualizar a tarefa type=birthday
    - remove_person_date(task_id) — soft-delete da tarefa (scope='series')

  Kaguya → Komi  (task type='birthday'):
    - push_birthday(task_id)      — criar ou atualizar o person_date "aniversário"
    - remove_birthday(task_id)    — apagar o person_date correspondente

Anti-loop por convergência de valor
------------------------------------
Antes de escrever, cada função compara o valor salvo com o valor atual.
Se forem idênticos, retorna sem fazer nada (no-op). Isso garante que um evento
propagado (ex.: Komi→Kaguya) não dispare nova propagação de volta (Kaguya→Komi)
— o valor já está sincronizado, a comparação detecta isso e para.

Sem flags de request, sem contexto de thread — apenas comparação de valor no banco.

Feature flag
-----------
Controlado por KOMI_SYNC_ENABLED (padrão: "true"). Setado como "false" desativa
todas as chamadas sem afetar o CRUD de person_dates ou tasks.

Imports
-------
NUNCA importar agents.komi.tools ou agents.kaguya.tools_tasks no topo do módulo
(causaria ciclo de importação). Todos os imports desses módulos são LAZY — dentro
de try/except nas funções que precisam deles.

Usage:
    >>> from agents.kaguya import komi_sync
    >>> komi_sync.push_person_date(date_id=42)
    >>> komi_sync.push_birthday(task_id=99)
"""

import contextvars
import functools
import logging
import os

from agents.db import get_conn, run_select, run_dml  # noqa: F401 — run_dml usado internamente

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Guarda de reentrância — impede a recursão mútua Komi <-> Kaguya
# ---------------------------------------------------------------------------
# As duas direções do sync chamam uma à outra: push_person_date cria a tarefa
# (create_task), e create_task chama push_birthday no final; push_birthday cria
# o person_date (add_important_date), que chama push_person_date de novo. Na
# CRIAÇÃO o link ainda não existe, então a checagem "anti-loop por convergência
# de valor" não tem o que comparar — cada lado cria um registro novo e re-dispara
# o outro lado → recursão infinita (foi o que gerou centenas de duplicatas).
#
# Esta flag (isolada por contexto/thread via contextvars) marca "já estou dentro
# de um sync". Qualquer chamada de sync ANINHADA vira no-op e o ciclo se quebra;
# o lado que iniciou segue normalmente e grava o seu próprio link.
_sync_em_andamento = contextvars.ContextVar("komi_kaguya_sync_em_andamento", default=False)


def _guarda_reentrancia(func):
    """Decorar uma função de sync para que ela não recursa em si mesma/no par.

    Se já houver um sync Komi↔Kaguya em andamento nesta pilha de chamadas, a
    função decorada retorna imediatamente (no-op). Caso contrário, marca a flag,
    executa a função e desmarca no fim (mesmo se houver exceção).

    Args:
        func: Função de sync a proteger (push_person_date, push_birthday, etc.).

    Returns:
        A função embrulhada com a guarda de reentrância.
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # Já estamos dentro de um sync? Então esta é uma chamada aninhada — aborta
        # para não entrar no ciclo Komi→Kaguya→Komi→...
        if _sync_em_andamento.get():
            return None
        # Marca o início do sync e garante a desmarcação no finally (token do
        # contextvars permite restaurar o valor anterior com segurança)
        token = _sync_em_andamento.set(True)
        try:
            return func(*args, **kwargs)
        finally:
            _sync_em_andamento.reset(token)

    return wrapper


# ---------------------------------------------------------------------------
# Gate de feature — desabilita tudo sem afetar o CRUD
# ---------------------------------------------------------------------------

def _enabled() -> bool:
    """Retorna True se o espelho Komi↔Kaguya está ativo.

    Lê em cada chamada para permitir toggle em runtime (ex.: em testes,
    setar a variável depois de importar o módulo).

    Returns:
        True se o sync deve operar; False se KOMI_SYNC_ENABLED=false.
    """
    # "false" (qualquer caixa) desativa; qualquer outro valor mantém ativo
    return os.environ.get("KOMI_SYNC_ENABLED", "true").lower() != "false"


# ---------------------------------------------------------------------------
# Helper: derivar o título da tarefa a partir do label do person_date
# ---------------------------------------------------------------------------

def _derive_task_title(person_name: str, label: str) -> str:
    """Deriva o título da tarefa Kaguya a partir do nome da pessoa e do label do person_date.

    Regras (spec 026 §Constraints):
    - Label base (só "aniversário"/"aniversario"): "Aniversário de {nome}"
    - Label com complemento (ex.: "aniversário de namoro"): "{label capitalizado} de {nome}"

    Args:
        person_name: Nome da pessoa (ex.: "João Silva").
        label: Label do person_date (ex.: "aniversário", "aniversário de namoro").

    Returns:
        Título da tarefa (ex.: "Aniversário de João Silva").

    Example:
        >>> _derive_task_title("João", "aniversário")
        "Aniversário de João"
        >>> _derive_task_title("João", "aniversário de namoro")
        "Aniversário de namoro de João"
    """
    label_lower = label.strip().lower()

    # Label canônico simples → título padrão capitalizado
    if label_lower in ("aniversário", "aniversario"):
        return f"Aniversário de {person_name}"

    # Label com complemento → capitaliza a primeira letra do label e anexa o nome
    label_cap = label.strip()[0].upper() + label.strip()[1:] if label.strip() else label
    return f"{label_cap} de {person_name}"


# ---------------------------------------------------------------------------
# Komi → Kaguya: push de person_date (criar ou atualizar a tarefa birthday)
# ---------------------------------------------------------------------------

@_guarda_reentrancia
def push_person_date(date_id: int) -> None:
    """Criar ou atualizar a tarefa type=birthday correspondente a um person_date.

    Fluxo:
    1. Checa KOMI_SYNC_ENABLED — no-op se desabilitado.
    2. Carrega o person_date (com nome da pessoa) do banco.
    3. Se o label não contém 'anivers' — no-op (não é aniversário).
    4. Verifica se já existe link em birthday_sync_links.
       - Existe (atualização): compara title e due_date da tarefa atual com os esperados.
         Se idênticos → no-op (anti-loop por convergência). Se diferente → atualiza a tarefa.
       - Não existe (criação): cria tarefa type=birthday na lista "Aniversários" e grava o link.

    Nunca levanta exceção — qualquer falha é silenciada (best-effort).

    Args:
        date_id: ID do person_date a sincronizar.
    """
    # Guard: feature flag desabilitada
    if not _enabled():
        return

    try:
        # 1. Carrega o person_date com o nome da pessoa
        rows = run_select(
            """
            SELECT pd.id, pd.label, pd.date::text, pd.recurring, pd.person_id, p.name
            FROM person_dates pd
            JOIN people p ON p.id = pd.person_id AND p.deleted = FALSE
            WHERE pd.id = %(date_id)s
            """,
            {"date_id": date_id},
        )
        if not rows:
            return  # person_date não encontrado ou pessoa excluída

        pd_row = rows[0]
        label = pd_row["label"] or ""

        # 2. Verifica se é aniversário (label contém 'anivers' — cobre todas as variantes)
        if "anivers" not in label.lower():
            return  # não é aniversário — fora do escopo do sync

        person_id = pd_row["person_id"]
        person_name = pd_row["name"]
        due_date = pd_row["date"]  # já é string YYYY-MM-DD (::text no SQL)
        title_esperado = _derive_task_title(person_name, label)

        # 3. Verifica se já existe link (anti-loop + idempotência)
        link_rows = run_select(
            "SELECT task_id FROM birthday_sync_links WHERE person_date_id = %(pd_id)s",
            {"pd_id": date_id},
        )

        if link_rows:
            # Link existe → atualização (com anti-loop por convergência de valor)
            task_id = link_rows[0]["task_id"]

            # Carrega título e due_date atuais da tarefa
            task_rows = run_select(
                "SELECT title, due_date::text FROM tasks WHERE id = %(tid)s AND deleted_at IS NULL",
                {"tid": task_id},
            )
            if not task_rows:
                # Tarefa foi soft-deletada permanentemente — remove o link órfão e recria
                run_dml(
                    "DELETE FROM birthday_sync_links WHERE person_date_id = %s",
                    (date_id,),
                )
                # Recai na criação (chamada recursiva simulada via flag)
                link_rows = []
            else:
                task_atual = task_rows[0]
                # Anti-loop: compara valor atual com esperado — se iguais, não escreve nada
                if task_atual["title"] == title_esperado and task_atual["due_date"] == due_date:
                    return  # convergência — já está sincronizado, sem write extra

                # Valores diferentes → propaga a mudança para a tarefa Kaguya
                from agents.kaguya.tools_tasks import update_task  # lazy import — evita ciclo
                update_task(task_id, title=title_esperado, due_date=due_date)
                # Atualiza a recorrência anual ancorada na nova data
                run_dml(
                    "UPDATE task_recurrences SET anchor_date = %s WHERE task_id = %s",
                    (due_date, task_id),
                )
                return

        if not link_rows:
            # Link não existe → criação: cria tarefa na lista "Aniversários" e grava o link
            from agents.kaguya import recurrence as rec_engine  # lazy — evita ciclo
            from agents.kaguya.tools_tasks import create_task, _get_birthdays_list_id  # lazy

            # Obtém o project_id da lista "Aniversários" (cria se não existir)
            with get_conn() as conn:
                with conn.cursor() as cur:
                    list_id = _get_birthdays_list_id(cur)

            # Cria a tarefa type=birthday com recorrência anual automática
            result = create_task(
                title=title_esperado,
                type="birthday",
                due_date=due_date,
                project_id=list_id,
                person_ids=[str(person_id)],
            )
            if result.get("status") != "ok":
                return  # criação falhou — silencioso (best-effort)

            new_task_id = result["id"]

            # Grava o par em birthday_sync_links (idempotente via ON CONFLICT DO UPDATE)
            run_dml(
                """
                INSERT INTO birthday_sync_links (person_date_id, task_id, komi_label)
                VALUES (%s, %s, %s)
                ON CONFLICT (person_date_id) DO UPDATE
                    SET task_id = EXCLUDED.task_id, komi_label = EXCLUDED.komi_label
                """,
                (date_id, new_task_id, label),
            )

    except Exception:
        # Best-effort: silencia qualquer exceção para nunca bloquear o CRUD principal
        pass


# ---------------------------------------------------------------------------
# Komi → Kaguya: remoção de person_date (soft-delete da tarefa birthday)
# ---------------------------------------------------------------------------

@_guarda_reentrancia
def remove_person_date(task_id: int) -> None:
    """Soft-delete a tarefa type=birthday correspondente ao person_date excluído.

    Chamado por delete_important_date com o task_id lido ANTES do DELETE do
    person_date (o CASCADE remove o link junto com a person_date, por isso
    o caller lê o task_id antes de deletar).

    O soft-delete usa scope='series' para encerrar a série de recorrência inteira.
    O link em birthday_sync_links já foi removido pelo CASCADE no banco.

    Nunca levanta exceção — best-effort.

    Args:
        task_id: ID da tarefa a soft-deletar.
    """
    # Guard: feature flag desabilitada
    if not _enabled():
        return

    try:
        # Lazy import para evitar ciclo agents.kaguya → agents.kaguya (OK, mesmo pacote,
        # mas evitamos import circular por cautela com outras dependências)
        from agents.kaguya.tools_tasks import delete_task  # lazy
        # scope='series': encerra a série de recorrência inteira (não gera próxima ocorrência)
        delete_task(task_id, scope="series")
    except Exception:
        # Best-effort: silencia qualquer exceção
        pass


# ---------------------------------------------------------------------------
# Kaguya → Komi: push de task birthday (criar ou atualizar o person_date)
# ---------------------------------------------------------------------------

@_guarda_reentrancia
def push_birthday(task_id: int) -> None:
    """Criar ou atualizar o person_date "aniversário" correspondente a uma task type=birthday.

    Fluxo:
    1. Checa KOMI_SYNC_ENABLED — no-op se desabilitado.
    2. Carrega a tarefa com o seu assignee (via person_links).
    3. Se a tarefa não for type=birthday, não tiver due_date ou não tiver assignee — no-op.
    4. Verifica link em birthday_sync_links.
       - Existe: compara due_date com person_dates.date. Se igual → no-op (anti-loop).
         Se diferente → atualiza o person_date.
       - Não existe: cria person_date "aniversário" na Komi e grava o link.

    Nunca levanta exceção — best-effort.

    Args:
        task_id: ID da tarefa a sincronizar.
    """
    # Guard: feature flag desabilitada
    if not _enabled():
        return

    try:
        # 1. Carrega a tarefa com o assignee (person_links JOIN people)
        rows = run_select(
            """
            SELECT t.id, t.title, t.due_date::text, t.type, t.deleted_at,
                   pl.person_id, p.name
            FROM tasks t
            LEFT JOIN person_links pl
                ON pl.entity_type = 'task' AND pl.entity_id::int = t.id
            LEFT JOIN people p
                ON p.id = pl.person_id AND p.deleted = FALSE
            WHERE t.id = %(task_id)s
            LIMIT 1
            """,
            {"task_id": task_id},
        )
        if not rows:
            return  # tarefa não encontrada

        task = rows[0]

        # 2. Filtros: só sincroniza tarefas type=birthday com due_date e com assignee
        if task["type"] != "birthday":
            return
        if not task["due_date"]:
            return  # sem data — impossível criar um person_date sem data
        if not task["person_id"]:
            # Sem assignee válido — loga e sai silenciosamente
            logger.debug("push_birthday: task %s sem assignee válido — ignorando", task_id)
            return

        person_id = task["person_id"]
        due_date = task["due_date"]  # string YYYY-MM-DD

        # 3. Verifica se já existe link (anti-loop + idempotência)
        link_rows = run_select(
            "SELECT person_date_id FROM birthday_sync_links WHERE task_id = %(tid)s",
            {"tid": task_id},
        )

        if link_rows:
            # Link existe → atualização com anti-loop por convergência de valor
            person_date_id = link_rows[0]["person_date_id"]

            # Carrega o person_date atual para comparar
            pd_rows = run_select(
                "SELECT date::text FROM person_dates WHERE id = %(pd_id)s",
                {"pd_id": person_date_id},
            )
            if not pd_rows:
                # person_date sumiu — remove o link e recai na criação
                run_dml(
                    "DELETE FROM birthday_sync_links WHERE task_id = %s",
                    (task_id,),
                )
                link_rows = []  # forçar criação abaixo
            else:
                current_date = pd_rows[0]["date"]
                # Anti-loop: se a data já está igual, não escreve nada
                if current_date == due_date:
                    return  # convergência — já sincronizado

                # Datas diferentes → propaga a mudança para a Komi
                from agents.komi.tools import update_important_date  # lazy
                update_important_date(person_date_id, date=due_date)
                return

        if not link_rows:
            # Link não existe → criação: cria person_date "aniversário" na Komi
            from agents.komi.tools import add_important_date  # lazy

            result = add_important_date(
                person_id=str(person_id),
                label="aniversário",
                date=due_date,
                recurring=True,
            )
            if result.get("status") != "ok" or "id" not in result:
                return  # criação falhou — silencioso

            new_date_id = result["id"]

            # Grava o par em birthday_sync_links (idempotente via ON CONFLICT DO UPDATE)
            run_dml(
                """
                INSERT INTO birthday_sync_links (person_date_id, task_id, komi_label)
                VALUES (%s, %s, %s)
                ON CONFLICT (task_id) DO UPDATE
                    SET person_date_id = EXCLUDED.person_date_id, komi_label = EXCLUDED.komi_label
                """,
                (new_date_id, task_id, "aniversário"),
            )

    except Exception:
        # Best-effort: silencia qualquer exceção para nunca bloquear o CRUD principal
        pass


# ---------------------------------------------------------------------------
# Kaguya → Komi: remoção de task birthday (apagar o person_date correspondente)
# ---------------------------------------------------------------------------

@_guarda_reentrancia
def remove_birthday(task_id: int) -> None:
    """Apagar o person_date correspondente à task type=birthday soft-deletada com scope='series'.

    Busca o person_date_id no birthday_sync_links, chama delete_important_date,
    que por sua vez apaga a linha e, via CASCADE, o link também é removido.

    Chamado apenas quando scope='series' (encerra a série inteira). Para scope='this'
    (só esta ocorrência), o person_date é preservado — a série continua.

    Nunca levanta exceção — best-effort.

    Args:
        task_id: ID da tarefa cujo person_date deve ser removido.
    """
    # Guard: feature flag desabilitada
    if not _enabled():
        return

    try:
        # Busca o person_date_id associado a esta tarefa
        link_rows = run_select(
            "SELECT person_date_id FROM birthday_sync_links WHERE task_id = %(tid)s",
            {"tid": task_id},
        )
        if not link_rows:
            return  # sem link — nada a fazer

        person_date_id = link_rows[0]["person_date_id"]

        # Apaga o person_date (o CASCADE remove o link junto com ele)
        from agents.komi.tools import delete_important_date  # lazy
        delete_important_date(person_date_id)

    except Exception:
        # Best-effort: silencia qualquer exceção
        pass
