"""Exporters por domínio: leem as tabelas (read-only) e rendem MemoryDocs (spec 028).

Cada exporter recebe um cursor psycopg2 (**SOMENTE SELECT** — FR-002) e o watermark
`since` do último sync, e devolve a lista de `MemoryDoc` novos/alterados do domínio.

Datas sempre em UTC-3: as tabelas com `TIMESTAMPTZ` devem ser convertidas com
`AT TIME ZONE 'America/Sao_Paulo'` (nunca a data UTC do container — bug histórico da
Violet, ver CLAUDE.md). Tabelas com coluna `DATE` (como `journal_pages.date`) já guardam
a data local e podem ser usadas direto.

PILOTO (spec 028, fatia incremental): por enquanto só `export_diario` (Violet) está
implementado — é o **padrão a replicar** nos outros 7 domínios (tarefas, finanças,
pessoas, livros, filmes, animes, séries).
"""

from collections import defaultdict
from datetime import datetime

from agents.kurisu.memory.render import MemoryDoc


def export_diario(cur, since: "datetime | None") -> list:
    """Exporta os bullets do diário (Violet) como documentos individuais.

    Cada bullet com conteúdo vira um `MemoryDoc` (`source_type="individual"`), datado pela
    data da página do diário (`journal_pages.date` — já é DATE local UTC-3). É o domínio
    da US2 ("o que escrevi no diário sobre X?").

    Args:
        cur: Cursor psycopg2 **read-only**.
        since: Só bullets criados depois deste instante (incremental); `None` = tudo.

    Returns:
        Lista de `MemoryDoc` do domínio "diario".

    Note:
        O filtro incremental usa `journal_bullets.created_at` — pega bullets **novos**.
        Bullets editados (sem mudar `created_at`) só são re-sincronizados num passe full
        (limitação do v1; o `content_hash` no `MemoryDoc` permite ao sync detectar a
        diferença quando reprocessa o domínio inteiro).
    """
    # JOIN bullets→pages para datar cada bullet pela data local da página do diário.
    # Filtro incremental por created_at do bullet; ignora bullets vazios.
    cur.execute(
        """
        SELECT b.id, b.content, p.date
        FROM journal_bullets b
        JOIN journal_pages p ON p.id = b.page_id
        WHERE b.content <> ''
          AND (%(since)s IS NULL OR b.created_at > %(since)s)
        ORDER BY p.date, b.position
        """,
        {"since": since},
    )

    docs: list = []
    for bullet_id, content, page_date in cur.fetchall():
        # Cabeçalho com a data ajuda a citação e dá contexto temporal ao trecho recuperado.
        texto = f"Diário ({page_date.isoformat()}): {content}"
        docs.append(
            MemoryDoc(
                texto=texto,
                domain="diario",
                doc_date=page_date,
                source_ref=f"bullet:{bullet_id}",
                source_type="individual",
            )
        )
    return docs


def export_tarefas(cur, since: "datetime | None") -> list:
    """Exporta as tarefas concluídas (Kaguya) como resumos datados (1 doc por dia).

    Cada dia em que houve conclusões vira um `MemoryDoc` de **resumo** (`source_type="resumo"`)
    listando os títulos das tarefas concluídas naquele dia. É o domínio da US1 ("o que fiz
    esta semana?"). Quando uma nova tarefa é concluída num dia, o texto do resumo muda → o
    `content_hash` muda → o sync reimporta aquele dia.

    Args:
        cur: Cursor psycopg2 **read-only**.
        since: Ignorado no v1 — o resumo precisa do dia **inteiro**, então o exporter sempre
            varre todas as conclusões (o sync já faz o diff por hash). Mantido na assinatura
            por consistência com os demais exporters.

    Returns:
        Lista de `MemoryDoc` do domínio "tarefas" (um por dia de conclusão).
    """
    # Tarefas concluídas (completed_at não nulo) e vivas (deleted_at nulo).
    # A data do dia vem de completed_at convertido para UTC-3 (nunca a data UTC do servidor).
    cur.execute(
        """
        SELECT (t.completed_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, t.title
        FROM tasks t
        WHERE t.completed_at IS NOT NULL
          AND t.deleted_at IS NULL
        ORDER BY dia, t.title
        """
    )

    # Agrupa os títulos por dia de conclusão.
    por_dia: dict = defaultdict(list)
    for dia, title in cur.fetchall():
        por_dia[dia].append(title)

    docs: list = []
    for dia, titulos in por_dia.items():
        # Texto do resumo: cabeçalho com a data + bullets das tarefas do dia.
        linhas = "\n".join(f"• {t}" for t in titulos)
        texto = f"Tarefas concluídas em {dia.isoformat()}:\n{linhas}"
        docs.append(
            MemoryDoc(
                texto=texto,
                domain="tarefas",
                doc_date=dia,
                source_ref=f"tarefas-dia:{dia.isoformat()}",
                source_type="resumo",
            )
        )
    return docs


# --- Próximos exporters a implementar (fase 028 / US4) ---------------------------------
# Ainda faltam 6 dos 8 domínios. Cada novo exporter segue a mesma forma dos acima:
# uma consulta SELECT só de leitura + a montagem de objetos MemoryDoc.
# Duas variações de formato, conforme o dado:
#   - Resumos datados (ex.: finanças): agregam por período e usam source_type="resumo".
#   - Itens individuais (ex.: mídia, pessoas): 1 documento por item, source_type="individual".
# Domínios pendentes: finanças (Nami — resumo datado de gastos), pessoas (Komi — 1 doc por
# pessoa), livros (Frieren), filmes (Akane), animes (Marin) e séries (Mai).
