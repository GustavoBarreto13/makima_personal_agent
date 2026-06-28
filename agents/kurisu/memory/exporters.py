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


# --- Padrão a replicar nos demais domínios (US4) ---------------------------------------
# Cada um segue a mesma forma de export_diario: SELECT read-only + render para MemoryDoc.
# Resumos datados (tarefas concluídas, finanças) usam source_type="resumo" e agregam por
# período; itens individuais (mídia, pessoas) usam source_type="individual".
#
# def export_tarefas(cur, since): ...    # Kaguya — resumo datado de tarefas concluídas
# def export_financas(cur, since): ...   # Nami   — resumo datado de gastos
# def export_pessoas(cur, since): ...    # Komi   — 1 doc individual por pessoa
# def export_livros(cur, since): ...     # Frieren
# def export_filmes(cur, since): ...     # Akane
# def export_animes(cur, since): ...     # Marin
# def export_series(cur, since): ...     # Mai
