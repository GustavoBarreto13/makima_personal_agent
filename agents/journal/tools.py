"""Tools do Journal — acesso ao PostgreSQL para o diário pessoal.

Contém todas as funções que lêem e escrevem no banco de dados PostgreSQL
para o módulo de journal (diário). Usa psycopg2 síncrono — o mesmo padrão
de acesso direto ao banco das tools da Nami e da Frieren ao BigQuery.

As tabelas são criadas automaticamente na primeira importação deste módulo,
via _ensure_tables() chamada no final do arquivo.

Usage:
    from agents.journal.tools import get_or_create_page, upsert_bullet
"""

import logging  # Para registrar avisos quando o banco não está disponível na importação
import re       # Para extrair @menções e #tags do conteúdo dos bullets

import psycopg2          # Driver PostgreSQL síncrono
import psycopg2.errors   # Erros específicos do PostgreSQL (ex.: ForeignKeyViolation)
import psycopg2.extras   # Fornece RealDictCursor — retorna linhas como dicts

# Importa DATABASE_URL do config centralizado da webapp — evita duplicar a leitura de os.environ
from webapp.backend.config import DATABASE_URL as _DATABASE_URL


# ─── Conexão ─────────────────────────────────────────────────────────────────

def _get_conn():
    """Abrir uma nova conexão ao PostgreSQL usando a variável de ambiente DATABASE_URL.

    Cria uma conexão nova a cada chamada — sem pool de conexões.
    Para um app pessoal com carga baixa, isso é suficiente e mais simples
    de manter do que um pool (sem threads, sem estado global).

    Returns:
        Objeto de conexão psycopg2 pronto para uso.

    Raises:
        RuntimeError: Se DATABASE_URL não estiver definida no ambiente.
        psycopg2.OperationalError: Se a conexão falhar (banco indisponível, credenciais erradas).
    """
    # Verifica se DATABASE_URL está configurada antes de tentar conectar,
    # para dar uma mensagem de erro clara em vez de um traceback confuso
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada")
    return psycopg2.connect(_DATABASE_URL)


# ─── Criação de tabelas ───────────────────────────────────────────────────────

def _ensure_tables() -> None:
    """Criar todas as tabelas do journal se ainda não existirem.

    Chamada automaticamente na importação do módulo.
    Usa CREATE TABLE IF NOT EXISTS — seguro para rodar múltiplas vezes sem efeito colateral.
    Também insere o tipo padrão 'personal' se a tabela journal_types estiver vazia.

    O schema completo:
    - journal_types: tipos de diário (pessoal, profissional, viagem, etc.)
    - journal_pages: uma página por (tipo, data), com restrição UNIQUE; campo dream
    - journal_bullets: linhas/bullets de cada página, com busca full-text; campo kind
    - journal_mentions: @pessoas e #tags extraídas automaticamente dos bullets
    """
    # Conecta ao banco para criar as tabelas
    conn = _get_conn()
    try:
        # autocommit=False por padrão — usamos commit() explícito ao final
        with conn.cursor() as cur:

            # ── Tabela de tipos de diário ─────────────────────────────────────
            # Cada tipo tem nome, ícone emoji e cor hex para identificação visual
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_types (
                    id    SERIAL PRIMARY KEY,
                    name  TEXT NOT NULL,
                    icon  TEXT NOT NULL,
                    color TEXT NOT NULL
                )
            """)

            # Insere o tipo padrão 'personal' apenas se a tabela estiver vazia.
            # Isso evita duplicatas em restarts do servidor.
            cur.execute("""
                INSERT INTO journal_types (name, icon, color)
                SELECT 'personal', '📔', '#a78bfa'
                WHERE NOT EXISTS (SELECT 1 FROM journal_types)
            """)

            # ── Tabela de páginas do diário ───────────────────────────────────
            # Uma página representa um dia de escrita em um determinado tipo de diário.
            # A restrição UNIQUE (type_id, date) garante que não existam duas páginas
            # para o mesmo (tipo, dia) — mesmo que o usuário tente criar duas vezes.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_pages (
                    id         SERIAL PRIMARY KEY,
                    type_id    INT REFERENCES journal_types(id) DEFAULT 1,
                    date       DATE NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE (type_id, date)
                )
            """)

            # ── Extensão T005: campo dream em journal_pages ───────────────────
            # ADD COLUMN IF NOT EXISTS é idempotente — seguro para re-executar em banco já existente.
            # NULL para entries antigas (sem sonho registrado); preenchido via set_dream().
            cur.execute("""
                ALTER TABLE journal_pages
                    ADD COLUMN IF NOT EXISTS dream TEXT
            """)

            # ── Tabela de bullets (linhas do diário) ──────────────────────────
            # Cada bullet é uma linha de texto dentro de uma página.
            # ON DELETE CASCADE: ao deletar a página, todos os bullets são deletados.
            # UNIQUE (page_id, position): garante que não existam duas linhas na mesma
            # posição da mesma página — necessário para o ON CONFLICT do upsert_bullet.
            # search_vec é uma coluna TSVECTOR gerada automaticamente pelo PostgreSQL
            # para busca full-text em português — sem precisar manter manualmente.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_bullets (
                    id         SERIAL PRIMARY KEY,
                    page_id    INT REFERENCES journal_pages(id) ON DELETE CASCADE,
                    content    TEXT NOT NULL DEFAULT '',
                    position   INT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    search_vec TSVECTOR GENERATED ALWAYS AS (
                        to_tsvector('portuguese', content)
                    ) STORED,
                    UNIQUE (page_id, position)
                )
            """)

            # ── Extensão T005: campo kind em journal_bullets ──────────────────
            # DEFAULT 'bullet' garante retrocompatibilidade com bullets existentes sem kind.
            cur.execute("""
                ALTER TABLE journal_bullets
                    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'bullet'
            """)

            # Adiciona CHECK constraint para kind, se ainda não existir.
            # Verificamos em information_schema antes de criar — ADD CONSTRAINT falha
            # se a constraint já existir, ao contrário de ADD COLUMN IF NOT EXISTS.
            cur.execute("""
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'journal_bullets_kind_check'
                  AND table_name = 'journal_bullets'
            """)
            if cur.fetchone() is None:
                # Constraint não existe — cria agora
                cur.execute("""
                    ALTER TABLE journal_bullets
                        ADD CONSTRAINT journal_bullets_kind_check
                        CHECK (kind IN ('bullet','highlight','dream','idea','wisdom','note'))
                """)

            # Índice GIN para tornar buscas full-text rápidas mesmo com muitos bullets.
            # GIN (Generalized Inverted Index) é o tipo recomendado pelo PostgreSQL para TSVECTOR.
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_bullets_search
                ON journal_bullets USING GIN (search_vec)
            """)

            # ── Tabela de menções ─────────────────────────────────────────────
            # Armazena @pessoas e #tags extraídas do conteúdo dos bullets.
            # ON DELETE CASCADE: ao deletar o bullet, as menções são deletadas.
            # kind só pode ser 'person' ou 'tag' — CHECK garante isso no banco.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_mentions (
                    id        SERIAL PRIMARY KEY,
                    bullet_id INT REFERENCES journal_bullets(id) ON DELETE CASCADE,
                    kind      TEXT NOT NULL CHECK (kind IN ('person', 'tag')),
                    value     TEXT NOT NULL
                )
            """)

            # Índice para acelerar consultas de "todos os bullets que mencionam X"
            # (query mais comum: GET /mentions?kind=person&value=Fulano)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_mentions_kind_value
                ON journal_mentions (kind, value)
            """)

        # Commita todas as operações DDL acima de uma vez
        conn.commit()
    finally:
        # Fecha a conexão mesmo que tenha ocorrido exceção
        conn.close()


# ─── Helper de menções ────────────────────────────────────────────────────────

def _parse_mentions(content: str) -> list[tuple[str, str]]:
    """Extrair @pessoas e #tags do texto de um bullet.

    Usa expressões regulares para encontrar palavras precedidas de @ ou #.
    O símbolo @ indica uma pessoa; # indica uma tag temática.
    Os símbolos são removidos do valor retornado — só a palavra fica.

    Args:
        content: Texto do bullet (ex.: "Conversei com @Ana sobre #python").

    Returns:
        Lista de tuplas (kind, value) onde kind é 'person' ou 'tag'
        e value é a palavra sem o símbolo.

    Example:
        >>> _parse_mentions("Conversei com @Ana sobre #python")
        [('person', 'Ana'), ('tag', 'python')]
    """
    # r'@(\w+)' captura sequências de word chars (letras, dígitos, _) após @
    people = [("person", m) for m in re.findall(r'@(\w+)', content)]
    # r'#(\w+)' faz o mesmo para tags iniciadas com #
    tags   = [("tag",    m) for m in re.findall(r'#(\w+)', content)]
    # Retorna pessoas primeiro, depois tags — ordem de aparição não é garantida
    return people + tags


# ─── Funções públicas ─────────────────────────────────────────────────────────

def get_or_create_page(date: str, type_id: int = 1) -> dict:
    """Buscar ou criar uma página do diário para a data informada.

    Se já existir uma página para (type_id, date), retorna ela com seus bullets.
    Se não existir, cria a página e retorna com lista de bullets vazia.

    Usa INSERT ... ON CONFLICT DO NOTHING para evitar race conditions —
    seguro para chamadas simultâneas (ex.: abertura dupla rápida no browser).

    Args:
        date: Data no formato YYYY-MM-DD (ex.: "2026-06-06").
        type_id: ID do tipo de diário (padrão: 1 = personal).

    Returns:
        Dicionário com:
        - "page": {"id": int, "date": str, "type_id": int, "dream": str|None, "num": int}
        - "bullets": [{"id": int, "kind": str, "content": str, "position": int, "created_at": str}, ...]
          ordenados por position ASC.
    """
    conn = _get_conn()
    try:
        # RealDictCursor faz com que cada linha retornada seja um dict ({coluna: valor})
        # em vez da tupla padrão — mais fácil de trabalhar
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

            # Tenta inserir a página; se já existir o par (type_id, date),
            # não faz nada (ON CONFLICT DO NOTHING) e a SELECT abaixo ainda funciona
            cur.execute("""
                INSERT INTO journal_pages (type_id, date)
                VALUES (%s, %s)
                ON CONFLICT (type_id, date) DO NOTHING
            """, (type_id, date))

            # Busca a página com dream e num (número sequencial derivado por ROW_NUMBER).
            # ROW_NUMBER() OVER (ORDER BY date) numera as entries da mais antiga (#1) à mais nova.
            # A subquery garante que o num seja consistente independente de qual entry buscamos.
            cur.execute("""
                SELECT p.id,
                       p.date::text AS date,
                       p.type_id,
                       p.dream,
                       p.created_at,
                       p.updated_at,
                       rn.num
                FROM journal_pages p
                JOIN (
                    SELECT id,
                           ROW_NUMBER() OVER (ORDER BY date) AS num
                    FROM journal_pages
                    WHERE type_id = %s
                ) rn ON rn.id = p.id
                WHERE p.type_id = %s AND p.date = %s
            """, (type_id, type_id, date))
            row = cur.fetchone()

            # Guarda contra None: só ocorre se type_id não existir em journal_types
            if row is None:
                conn.rollback()
                return {"page": None, "bullets": [], "error": "type_id não encontrado"}

            page = dict(row)
            # Converte campos datetime para string ISO
            if page.get("created_at"):
                page["created_at"] = page["created_at"].isoformat()
            if page.get("updated_at"):
                page["updated_at"] = page["updated_at"].isoformat()

            # Busca todos os bullets da página com o campo kind, ordenados por posição.
            cur.execute("""
                SELECT id, page_id, kind, content, position, created_at
                FROM journal_bullets
                WHERE page_id = %s
                ORDER BY position ASC
            """, (page["id"],))
            # Converte created_at (datetime) para string ISO antes de serializar em JSON
            bullets = [
                {**dict(r), "created_at": r["created_at"].isoformat() if r["created_at"] else None}
                for r in cur.fetchall()
            ]

        conn.commit()
        return {"page": page, "bullets": bullets}
    except psycopg2.errors.ForeignKeyViolation:
        # type_id não existe em journal_types — retorna erro amigável em vez de HTTP 500
        conn.rollback()
        return {"page": None, "bullets": [], "error": "type_id não encontrado"}
    finally:
        conn.close()


def set_dream(page_id: int, text: str) -> dict:
    """Atualizar o campo dream de uma entry (journal_pages).

    Args:
        page_id: ID da página.
        text: Texto do sonho (string vazia ou None limpa o campo).

    Returns:
        {"status": "ok"} ou {"status": "error", "message": ...}
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Salva NULL se texto vazio, para manter consistência com IS NOT NULL nas queries
            dream_value = text if text else None
            cur.execute(
                "UPDATE journal_pages SET dream = %s WHERE id = %s",
                (dream_value, page_id),
            )
            if cur.rowcount == 0:
                conn.rollback()
                return {"status": "error", "message": "page não encontrada"}
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


def list_entries(query: str = '') -> list:
    """Listar entries resumidas para o arquivo do diário (Journal screen).

    Retorna cada entry com excerpt, contadores e flags, ordenada por data DESC.

    Args:
        query: Texto de busca opcional — filtra por full-text search no conteúdo dos bullets.

    Returns:
        Lista de dicts: {date, num, excerpt, bullet_count, has_highlight, has_dream}
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if query:
                # Filtra entries que têm pelo menos um bullet correspondendo à busca
                cur.execute("""
                    SELECT p.date::text AS date,
                           ROW_NUMBER() OVER (ORDER BY p.date) AS num,
                           (SELECT content FROM journal_bullets WHERE page_id = p.id ORDER BY position LIMIT 1) AS excerpt,
                           COUNT(b.id) AS bullet_count,
                           BOOL_OR(b.kind = 'highlight') AS has_highlight,
                           p.dream IS NOT NULL AS has_dream
                    FROM journal_pages p
                    LEFT JOIN journal_bullets b ON b.page_id = p.id
                    WHERE EXISTS (
                        SELECT 1 FROM journal_bullets jb
                        WHERE jb.page_id = p.id
                          AND jb.search_vec @@ plainto_tsquery('portuguese', %s)
                    )
                    GROUP BY p.id, p.date, p.dream
                    ORDER BY p.date DESC
                """, (query,))
            else:
                cur.execute("""
                    SELECT p.date::text AS date,
                           ROW_NUMBER() OVER (ORDER BY p.date) AS num,
                           (SELECT content FROM journal_bullets WHERE page_id = p.id ORDER BY position LIMIT 1) AS excerpt,
                           COUNT(b.id) AS bullet_count,
                           BOOL_OR(b.kind = 'highlight') AS has_highlight,
                           p.dream IS NOT NULL AS has_dream
                    FROM journal_pages p
                    LEFT JOIN journal_bullets b ON b.page_id = p.id
                    GROUP BY p.id, p.date, p.dream
                    ORDER BY p.date DESC
                """)
            rows = cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            # Trunca excerpt em 150 chars para o card do arquivo
            excerpt = d.get("excerpt") or ""
            d["excerpt"] = excerpt[:150]
            result.append(d)
        return result
    finally:
        conn.close()


def list_collection(kind: str) -> list:
    """Listar todos os bullets de um tipo específico.

    Args:
        kind: Tipo do bullet — highlight, dream, idea, wisdom, note.

    Returns:
        Lista de dicts: {id, kind, content, created_at, date, entry_num}
        Ordenada por data DESC.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT b.id, b.kind, b.content,
                       b.created_at,
                       p.date::text AS date,
                       ROW_NUMBER() OVER (ORDER BY p.date) AS entry_num
                FROM journal_bullets b
                JOIN journal_pages p ON p.id = b.page_id
                WHERE b.kind = %s
                ORDER BY b.created_at DESC
            """, (kind,))
            rows = cur.fetchall()
        return [
            {**dict(r), "created_at": r["created_at"].isoformat() if r["created_at"] else None}
            for r in rows
        ]
    finally:
        conn.close()


def list_dreams() -> list:
    """Listar todas as entries que têm campo dream não nulo.

    Returns:
        Lista de dicts: {page_id, date, entry_num, dream}
        Ordenada por data DESC.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT p.id AS page_id,
                       p.date::text AS date,
                       ROW_NUMBER() OVER (ORDER BY p.date) AS entry_num,
                       p.dream
                FROM journal_pages p
                WHERE p.dream IS NOT NULL
                ORDER BY p.date DESC
            """)
            rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_stats(year: int) -> dict:
    """Retornar estatísticas agregadas do ano para a tela Insights.

    Args:
        year: Ano de referência (ex.: 2026).

    Returns:
        Dict com entries, bullets, days_written, total_words, per_day,
        highlights, tags, mentions, dreams, highlight_rate, freq_per_week,
        words_by_month (array 12), daytime (array 12).
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Totais básicos do ano
            cur.execute("""
                SELECT
                    COUNT(DISTINCT p.id) FILTER (WHERE b.id IS NOT NULL) AS entries,
                    COUNT(b.id) AS bullets,
                    COUNT(b.id) FILTER (WHERE b.kind = 'highlight') AS highlights,
                    COUNT(DISTINCT jm_tag.value) AS tags,
                    COUNT(DISTINCT jm_per.value) AS mentions,
                    COUNT(DISTINCT p.id) FILTER (WHERE p.dream IS NOT NULL) AS dreams
                FROM journal_pages p
                LEFT JOIN journal_bullets b ON b.page_id = p.id
                LEFT JOIN journal_mentions jm_tag ON jm_tag.bullet_id = b.id AND jm_tag.kind = 'tag'
                LEFT JOIN journal_mentions jm_per ON jm_per.bullet_id = b.id AND jm_per.kind = 'person'
                WHERE EXTRACT(YEAR FROM p.date) = %s
            """, (year,))
            totals = dict(cur.fetchone() or {})

            # Palavras por dia (heatmap de palavras)
            cur.execute("""
                SELECT p.date::text AS date,
                       COALESCE(SUM(
                           array_length(string_to_array(trim(b.content), ' '), 1)
                       ), 0) +
                       COALESCE(
                           array_length(string_to_array(trim(p.dream), ' '), 1), 0
                       ) AS words
                FROM journal_pages p
                LEFT JOIN journal_bullets b ON b.page_id = p.id
                WHERE EXTRACT(YEAR FROM p.date) = %s
                  AND p.date <= CURRENT_DATE
                GROUP BY p.id, p.date, p.dream
                HAVING COALESCE(SUM(
                    array_length(string_to_array(trim(b.content), ' '), 1)
                ), 0) + COALESCE(
                    array_length(string_to_array(trim(p.dream), ' '), 1), 0
                ) > 0
            """, (year,))
            heatmap_rows = cur.fetchall()
            days_written = len(heatmap_rows)
            total_words = sum(int(r["words"]) for r in heatmap_rows)

            # Palavras por mês (array de 12 valores, Jan=0)
            words_by_month = [0] * 12
            for r in heatmap_rows:
                month_idx = int(r["date"][5:7]) - 1
                words_by_month[month_idx] += int(r["words"])

            # Distribuição de bullets por hora (12 buckets bihourly, 0h=0 ... 22h=11)
            cur.execute("""
                SELECT FLOOR(EXTRACT(HOUR FROM b.created_at AT TIME ZONE 'UTC') / 2)::int AS bucket,
                       COUNT(*) AS cnt
                FROM journal_bullets b
                JOIN journal_pages p ON p.id = b.page_id
                WHERE EXTRACT(YEAR FROM p.date) = %s
                GROUP BY bucket
            """, (year,))
            daytime = [0] * 12
            for r in cur.fetchall():
                bucket = int(r["bucket"])
                if 0 <= bucket < 12:
                    daytime[bucket] = int(r["cnt"])

        entries = int(totals.get("entries") or 0)
        bullets = int(totals.get("bullets") or 0)
        highlights = int(totals.get("highlights") or 0)
        tags = int(totals.get("tags") or 0)
        mentions = int(totals.get("mentions") or 0)
        dreams = int(totals.get("dreams") or 0)

        # Frequência por semana: dias escritos / semanas passadas no ano até hoje
        import datetime
        today = datetime.date.today()
        if today.year == year:
            day_of_year = today.timetuple().tm_yday
        else:
            day_of_year = 365
        weeks = max(day_of_year / 7, 1)

        return {
            "entries": entries,
            "bullets": bullets,
            "days_written": days_written,
            "total_words": total_words,
            "per_day": round(total_words / days_written) if days_written else 0,
            "highlights": highlights,
            "tags": tags,
            "mentions": mentions,
            "dreams": dreams,
            "highlight_rate": round(highlights / entries * 100) if entries else 0,
            "freq_per_week": round(days_written / weeks, 1),
            "words_by_month": words_by_month,
            "daytime": daytime,
        }
    finally:
        conn.close()


def upsert_bullet(page_id: int, position: int, content: str, kind: str = 'bullet') -> dict:
    """Inserir ou atualizar um bullet em uma posição específica da página.

    Se já existir um bullet com (page_id, position), atualiza o content.
    Se não existir, insere um novo bullet nessa posição.

    Após salvar o bullet, re-extrai todas as menções (@pessoas, #tags) do
    conteúdo e as substitui na tabela journal_mentions (delete + insert),
    garantindo que as menções estejam sempre sincronizadas com o texto atual.

    Args:
        page_id: ID da página onde o bullet pertence.
        position: Posição (linha) do bullet na página (esparso ×1000).
        content: Texto do bullet.
        kind: Tipo do bullet — bullet, highlight, dream, idea, wisdom, note. Default 'bullet'.

    Returns:
        Dicionário com:
        - "status": "ok"
        - "bullet": {"id": int, "kind": str, "content": str, "position": int, "created_at": str}
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

            # Upsert por (page_id, position) — atualiza content e kind se já existir.
            # RETURNING retorna os dados do bullet inserido ou atualizado em uma só query.
            cur.execute("""
                INSERT INTO journal_bullets (page_id, position, content, kind)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (page_id, position)
                DO UPDATE SET content = EXCLUDED.content, kind = EXCLUDED.kind
                RETURNING id, page_id, kind, content, position, created_at
            """, (page_id, position, content, kind))
            row = cur.fetchone()
            # Converte created_at para string ISO para serialização JSON
            bullet = {**dict(row), "created_at": row["created_at"].isoformat() if row["created_at"] else None}

            # Atualiza updated_at da página sempre que um bullet é modificado,
            # para que o heatmap e listagens de páginas recentes fiquem atualizados
            cur.execute("""
                UPDATE journal_pages SET updated_at = NOW() WHERE id = %s
            """, (page_id,))

            bullet_id = bullet["id"]

            # Remove todas as menções antigas deste bullet antes de re-inserir.
            # Fazemos delete+insert em vez de update para não precisar comparar
            # listas de menções antigas e novas — mais simples e correto.
            cur.execute("""
                DELETE FROM journal_mentions WHERE bullet_id = %s
            """, (bullet_id,))

            # Extrai as novas menções do conteúdo atualizado.
            # Deduplica com set() para evitar contagem inflada quando a mesma
            # @pessoa ou #tag aparece mais de uma vez no mesmo bullet
            # (ex.: "falei com @Ana e @Ana concordou" → insere @Ana apenas uma vez).
            mentions = list(set(_parse_mentions(content)))

            # Insere cada menção encontrada no texto
            for kind, value in mentions:
                cur.execute("""
                    INSERT INTO journal_mentions (bullet_id, kind, value)
                    VALUES (%s, %s, %s)
                """, (bullet_id, kind, value))

        conn.commit()
        return {"status": "ok", "bullet": bullet}
    except psycopg2.errors.ForeignKeyViolation:
        # page_id não existe em journal_pages — retorna erro amigável em vez de HTTP 500
        conn.rollback()
        return {"status": "error", "message": "page_id não encontrado"}
    finally:
        conn.close()


def delete_bullet(bullet_id: int) -> dict:
    """Deletar um bullet pelo ID.

    As menções associadas são removidas automaticamente pelo CASCADE
    definido na criação da tabela journal_mentions.

    Args:
        bullet_id: ID único do bullet a ser removido.

    Returns:
        Dicionário com "status": "ok".
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # DELETE simples — ON DELETE CASCADE cuida das menções
            cur.execute("""
                DELETE FROM journal_bullets WHERE id = %s
            """, (bullet_id,))

            # cur.rowcount indica quantas linhas foram afetadas pelo DELETE.
            # Se for 0, o bullet não existia — retornamos erro em vez de silenciar.
            if cur.rowcount == 0:
                conn.rollback()
                return {"status": "error", "message": "bullet não encontrado"}

        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


def list_heatmap(year: int) -> dict:
    """Retornar palavras escritas por dia para o heatmap anual.

    Conta palavras dos bullets + palavras do campo dream por dia.
    Retorna apenas dias com words > 0 e datas até hoje (sem datas futuras).

    Args:
        year: Ano de referência (ex.: 2026).

    Returns:
        Dicionário mapeando datas para contagem de palavras:
        {"2026-06-06": 87, "2026-06-07": 145, ...}
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Soma palavras de todos os bullets + palavras do campo dream da page.
            # string_to_array + array_length conta palavras separadas por espaço.
            # COALESCE protege contra NULL (bullet vazio ou page sem dream).
            cur.execute("""
                SELECT jp.date::text AS date,
                       COALESCE(SUM(
                           array_length(string_to_array(trim(jb.content), ' '), 1)
                       ), 0) +
                       COALESCE(
                           array_length(string_to_array(trim(jp.dream), ' '), 1), 0
                       ) AS words
                FROM journal_pages jp
                LEFT JOIN journal_bullets jb ON jb.page_id = jp.id
                WHERE EXTRACT(YEAR FROM jp.date) = %s
                  AND jp.date <= CURRENT_DATE
                GROUP BY jp.id, jp.date, jp.dream
                HAVING COALESCE(SUM(
                    array_length(string_to_array(trim(jb.content), ' '), 1)
                ), 0) + COALESCE(
                    array_length(string_to_array(trim(jp.dream), ' '), 1), 0
                ) > 0
                ORDER BY jp.date
            """, (year,))
            rows = cur.fetchall()

        return {row[0]: int(row[1]) for row in rows}
    finally:
        conn.close()


def list_mentions(kind: str) -> list:
    """Listar todas as menções distintas de um tipo, com contagem de ocorrências.

    Usado para exibir painéis de pessoas ou tags mais frequentes no diário.
    Retorna ordenado por contagem decrescente — as mais frequentes primeiro.

    Args:
        kind: Tipo da menção: 'person' (para @nomes) ou 'tag' (para #tags).

    Returns:
        Lista de dicionários com campos "value" e "count":
        [{"value": "Fulano", "count": 12}, {"value": "Ana", "count": 5}, ...]
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Agrupa por value (nome/tag), conta ocorrências e ordena por frequência
            cur.execute("""
                SELECT value, COUNT(*) AS count
                FROM journal_mentions
                WHERE kind = %s
                GROUP BY value
                ORDER BY count DESC
            """, (kind,))
            rows = cur.fetchall()

        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_bullets_by_mention(kind: str, value: str) -> list:
    """Buscar todos os bullets que mencionam uma pessoa ou tag específica.

    Retorna os resultados agrupados por data (página), com os bullets de
    cada data ordenados por posição. As datas são ordenadas do mais recente
    para o mais antigo.

    Args:
        kind: Tipo da menção: 'person' ou 'tag'.
        value: Valor da menção sem o símbolo (ex.: "Fulano", não "@Fulano").

    Returns:
        Lista de dicionários agrupados por data:
        [
          {"date": "2026-06-06", "bullets": [{"id": 1, "content": "..."}, ...]},
          ...
        ]
        Ordenado por date DESC (mais recente primeiro).
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # JOIN em três tabelas: mentions → bullets → pages
            # Filtra pela menção específica (kind + value) e ordena por data DESC
            cur.execute("""
                SELECT jp.date::text AS date,
                       jb.id,
                       jb.content
                FROM journal_mentions jm
                JOIN journal_bullets jb ON jb.id = jm.bullet_id
                JOIN journal_pages jp ON jp.id = jb.page_id
                WHERE jm.kind = %s AND jm.value = %s
                ORDER BY jp.date DESC, jb.position ASC
            """, (kind, value))
            rows = cur.fetchall()

        # Agrupa os bullets por data em uma estrutura hierárquica
        # Usa um dict ordenado para preservar a ordem por data DESC
        grouped: dict[str, list] = {}
        for row in rows:
            date_key = row["date"]
            if date_key not in grouped:
                grouped[date_key] = []
            grouped[date_key].append({"id": row["id"], "content": row["content"]})

        # Converte o dict para a lista de dicts esperada pelo cliente
        return [{"date": d, "bullets": bullets} for d, bullets in grouped.items()]
    finally:
        conn.close()


def search_bullets(query: str) -> list:
    """Buscar bullets por texto usando full-text search do PostgreSQL.

    Usa o índice tsvector 'portuguese' gerado automaticamente na coluna search_vec
    dos bullets. A função plainto_tsquery converte o texto livre em uma query de
    busca adequada (sem necessidade de operadores especiais do usuário).

    Args:
        query: Texto de busca em linguagem natural (ex.: "viagem São Paulo").

    Returns:
        Lista de dicionários agrupados por data:
        [
          {"date": "2026-06-06", "bullets": [{"id": 1, "content": "..."}, ...]},
          ...
        ]
        Ordenado por date DESC (mais recente primeiro).
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # search_vec @@ plainto_tsquery: o operador @@ verifica se o tsvector
            # da linha satisfaz a query. plainto_tsquery converte "viagem São Paulo"
            # em 'viag' & 'são' & 'paulo' aplicando stemming em português.
            cur.execute("""
                SELECT jp.date::text AS date,
                       jb.id,
                       jb.content
                FROM journal_bullets jb
                JOIN journal_pages jp ON jp.id = jb.page_id
                WHERE jb.search_vec @@ plainto_tsquery('portuguese', %s)
                ORDER BY jp.date DESC, jb.position ASC
            """, (query,))
            rows = cur.fetchall()

        # Agrupa os bullets por data — mesma lógica do get_bullets_by_mention
        grouped: dict[str, list] = {}
        for row in rows:
            date_key = row["date"]
            if date_key not in grouped:
                grouped[date_key] = []
            grouped[date_key].append({"id": row["id"], "content": row["content"]})

        return [{"date": d, "bullets": bullets} for d, bullets in grouped.items()]
    finally:
        conn.close()


# ─── Inicialização automática ─────────────────────────────────────────────────

# Ao importar o módulo, tenta criar as tabelas. Se o banco não estiver
# disponível ainda (ex.: ordem de inicialização dos containers ou DATABASE_URL
# ausente em ambiente de CI), apenas registra um aviso — a criação será
# tentada novamente na primeira chamada a qualquer tool.
try:
    _ensure_tables()
except Exception as exc:  # noqa: BLE001
    logging.getLogger(__name__).warning(
        "journal: não foi possível criar as tabelas ao importar o módulo: %s", exc
    )
