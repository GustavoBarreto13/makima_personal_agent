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

            # ── Extensão Feature 007: campo favorite em journal_bullets ──────
            # Favorito é um estado booleano ortogonal ao tipo (kind) do bullet.
            # DEFAULT FALSE garante que todos os bullets existentes nascem não-favoritos (FR-001).
            # ADD COLUMN IF NOT EXISTS é idempotente — re-executa sem erro se a coluna já existir.
            # O ON DELETE CASCADE em page_id já cuida de remover o favorito quando o bullet
            # é excluído, pois favorite é uma coluna da própria linha (FR-006).
            cur.execute("""
                ALTER TABLE journal_bullets
                    ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT FALSE
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

            # ── Tabela de emoções (vocabulário) — Feature 006 ─────────────────
            # Guarda os nomes de emoção que o usuário pode escolher num registro.
            # "is_predefined = TRUE" marca as 8 emoções base da TCC (terapia
            # cognitivo-comportamental); "FALSE" marca emoções criadas pelo
            # próprio usuário (custom). Separar o vocabulário em tabela própria
            # permite deduplicar nomes e agregar estatísticas de forma consistente.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_emotions (
                    id            SERIAL PRIMARY KEY,
                    name          TEXT NOT NULL,
                    is_predefined BOOLEAN NOT NULL DEFAULT FALSE
                )
            """)

            # Índice ÚNICO sobre LOWER(name): garante que não existam duas emoções
            # com o mesmo nome ignorando maiúsculas/minúsculas
            # (ex.: "frustração" e "Frustração" são tratadas como a mesma emoção).
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_emotions_name_lower
                ON journal_emotions (LOWER(name))
            """)

            # Seed das 8 emoções base da TCC — inserido apenas se a tabela estiver
            # vazia (mesmo padrão do seed de journal_types). Evita duplicatas em
            # restarts do servidor. VALUES + WHERE NOT EXISTS faz a inserção
            # condicional em uma única query.
            cur.execute("""
                INSERT INTO journal_emotions (name, is_predefined)
                SELECT v.name, TRUE
                FROM (VALUES ('alegria'),('tristeza'),('raiva'),('medo'),
                             ('ansiedade'),('culpa'),('vergonha'),('nojo')) AS v(name)
                WHERE NOT EXISTS (SELECT 1 FROM journal_emotions)
            """)

            # ── Tabela de registros emocionais (TCC) — Feature 006 ────────────
            # Cada linha é um "Registro de Pensamentos" da TCC, ancorado em um dia
            # (page_id). ON DELETE CASCADE: apagar a página apaga seus registros.
            # Apenas emotion_id e intensity são obrigatórios; os demais campos são
            # opcionais e podem ser preenchidos depois (preenchimento progressivo).
            # As duas intensidades são limitadas a 0–10 por CHECK no banco —
            # uma defesa extra além da validação na interface.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_emotion_logs (
                    id                    SERIAL PRIMARY KEY,
                    page_id               INT REFERENCES journal_pages(id) ON DELETE CASCADE,
                    emotion_id            INT REFERENCES journal_emotions(id),
                    intensity             SMALLINT NOT NULL CHECK (intensity BETWEEN 0 AND 10),
                    situation             TEXT,
                    automatic_thought     TEXT,
                    adaptive_response     TEXT,
                    reappraised_intensity SMALLINT CHECK (reappraised_intensity BETWEEN 0 AND 10),
                    created_at            TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            # Índice por page_id — acelera a consulta "registros deste dia",
            # que é feita toda vez que a tela Escrever abre uma página.
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_emotion_logs_page
                ON journal_emotion_logs (page_id)
            """)

            # ── Tabela de cartas (Cartas) ─────────────────────────────────────
            # Cada linha é uma "carta" escrita pelo usuário num dia (page_id):
            # uma carta para alguém, algo ou qualquer coisa. É um registro
            # expressivo livre (diferente do Registro Emocional, que é
            # estruturado pela TCC). Assim como as emoções, as cartas são
            # ORTOGONAIS aos bullets — não contam palavras nem afetam
            # heatmap/coleções/busca.
            #
            # Campos:
            #   recipient  → "para quem/o quê" (texto livre; obrigatório)
            #   title      → título opcional da carta
            #   body       → corpo da carta (obrigatório)
            #   status     → 'draft' (rascunho, editável) ou 'sealed' (lacrada,
            #                imutável — fica como registro fechado)
            #   sealed_at  → momento em que foi lacrada (NULL enquanto rascunho)
            # ON DELETE CASCADE: apagar a página (dia) apaga suas cartas.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_letters (
                    id         SERIAL PRIMARY KEY,
                    page_id    INT REFERENCES journal_pages(id) ON DELETE CASCADE,
                    recipient  TEXT NOT NULL,
                    title      TEXT,
                    body       TEXT NOT NULL,
                    status     TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','sealed')),
                    sealed_at  TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            # Índice por page_id — acelera "cartas deste dia", consultada toda
            # vez que a tela Escrever abre uma página.
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_letters_page
                ON journal_letters (page_id)
            """)

            # ── Migração: liberar 'journal_letter' no CHECK de person_links ────
            # As cartas podem ser vinculadas a pessoas da Komi (entity_type
            # 'journal_letter'). A tabela person_links é da Komi e tem um CHECK
            # que lista os entity_type permitidos; sem 'journal_letter' lá, o
            # INSERT do vínculo seria rejeitado e derrubaria a transação inteira
            # da carta. Aqui ampliamos o CHECK de forma idempotente (drop + add),
            # rodando no import deste módulo (no startup da webapp) — assim o
            # recurso funciona após um simples redeploy, sem re-rodar manualmente
            # o setup_schemas.py. Guardado por uma checagem de existência da
            # tabela: se a Komi ainda não foi instalada, simplesmente pulamos.
            cur.execute("""
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'person_links'
            """)
            if cur.fetchone():
                # DROP IF EXISTS torna o bloco re-executável sem erro; o nome
                # 'person_links_entity_type_check' é o que o PostgreSQL gera
                # automaticamente para um CHECK inline na coluna entity_type.
                cur.execute(
                    "ALTER TABLE person_links "
                    "DROP CONSTRAINT IF EXISTS person_links_entity_type_check"
                )
                cur.execute("""
                    ALTER TABLE person_links
                    ADD CONSTRAINT person_links_entity_type_check
                    CHECK (entity_type IN
                        ('transaction','task','book','journal_bullet','journal_letter'))
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

            # Busca todos os bullets da página, incluindo kind e favorite, ordenados por posição.
            # O campo favorite é necessário para o frontend exibir o estado inicial de favorito
            # de cada bullet ao carregar a página (FR-001: bullets antigos recebem FALSE).
            cur.execute("""
                SELECT id, page_id, kind, content, position, created_at, favorite
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


def get_available_years() -> list:
    """Retornar os anos disponíveis no diário, do primeiro até o ano corrente.

    Busca o menor ano com registro em journal_pages e retorna um intervalo contíguo
    do ano corrente até esse primeiro ano (decrescente). Anos intermediários sem escrita
    aparecem na lista mas exibem zeros na tela — comportamento aceitável para diário pessoal.

    Se não houver nenhuma entrada registrada ainda, retorna apenas o ano corrente.

    Returns:
        Lista de inteiros em ordem decrescente, ex.: [2026, 2025, 2024].

    Example:
        >>> get_available_years()  # com primeira entrada em 2025 e hoje 2026
        [2026, 2025]
    """
    import datetime
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Busca o ano da entrada mais antiga para definir o limite inferior do intervalo
            cur.execute("SELECT MIN(EXTRACT(YEAR FROM date))::int FROM journal_pages")
            row = cur.fetchone()
            first = row[0] if row and row[0] else None
    finally:
        conn.close()

    current = datetime.date.today().year
    if first is None:
        # Sem entradas ainda — oferece apenas o ano corrente
        return [current]
    # Intervalo contíguo do ano corrente até o primeiro registro, em ordem decrescente
    return list(range(current, first - 1, -1))


def upsert_bullet(page_id: int, position: int, content: str, kind: str = 'bullet', person_ids: list[str] | None = None) -> dict:
    """Inserir ou atualizar um bullet em uma posição específica da página.

    Se já existir um bullet com (page_id, position), atualiza o content.
    Se não existir, insere um novo bullet nessa posição.

    Após salvar o bullet, re-extrai todas as menções (@pessoas, #tags) do
    conteúdo e as substitui na tabela journal_mentions (delete + insert),
    garantindo que as menções estejam sempre sincronizadas com o texto atual.

    Vínculos de pessoas (spec 014 / FR-009): se ``person_ids`` for fornecido, grava
    os vínculos em ``person_links`` na mesma transação. Adicionalmente, @menções com
    match único em ``people`` são auto-linkadas (best-effort, nunca falham o bullet).

    Args:
        page_id: ID da página onde o bullet pertence.
        position: Posição (linha) do bullet na página (esparso ×1000).
        content: Texto do bullet.
        kind: Tipo do bullet — bullet, highlight, dream, idea, wisdom, note. Default 'bullet'.
        person_ids: UUIDs de pessoas a vincular explicitamente (spec 014).

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
            # IMPORTANTE (FR-005): favorite NÃO entra no DO UPDATE SET — assim, editar o texto
            # ou o tipo do bullet nunca reseta o estado de favorito. Só o endpoint dedicado
            # PATCH /bullets/{id}/favorite pode alterar favorite (via set_favorite).
            cur.execute("""
                INSERT INTO journal_bullets (page_id, position, content, kind)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (page_id, position)
                DO UPDATE SET content = EXCLUDED.content, kind = EXCLUDED.kind
                RETURNING id, page_id, kind, content, position, created_at, favorite
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

            # Vínculos de pessoas — mesma transação (spec 014 / FR-009).
            # Import lazy para evitar ciclo agents.journal → agents.komi → agents.journal.
            try:
                from agents.komi.tools import link_person_on_cursor, find_people  # noqa: PLC0415

                # 1. Vínculos explícitos passados pelo chamador
                if person_ids:
                    for pid in person_ids:
                        link_person_on_cursor(cur, pid, "journal_bullet", bullet_id)

                # 2. Auto-link de @menções com match único na tabela people (best-effort)
                person_mentions = [v for (k, v) in mentions if k == "person"]
                for mention_name in person_mentions:
                    try:
                        result = find_people(mention_name)
                        if result.get("status") == "ok" and len(result.get("people", [])) == 1:
                            link_person_on_cursor(cur, result["people"][0]["id"], "journal_bullet", bullet_id)
                    except Exception:
                        # Auto-link é best-effort — nunca falha o bullet por não encontrar @menção
                        pass
            except Exception:
                # Se komi não estiver disponível, continua sem vincular (graceful degradation)
                pass

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


def set_favorite(bullet_id: int, favorite: bool) -> dict:
    """Definir ou remover o estado de favorito de um bullet.

    Permite favoritar (favorite=True) ou desfavoritar (favorite=False) um bullet
    diretamente pelo seu ID, sem afetar nenhum outro atributo do bullet (texto,
    tipo, posição). Projetado para ser chamado pelo endpoint PATCH dedicado, mantendo
    favorite ortogonal ao upsert_bullet (FR-005).

    Args:
        bullet_id: ID único do bullet a ser alterado.
        favorite: True para favoritar, False para desfavoritar.

    Returns:
        Dicionário com:
        - "status": "ok" e "favorite": bool — quando o bullet existe e foi atualizado.
        - "status": "error" e "message": str — quando o bullet não existe (rowcount 0).

    Example:
        >>> set_favorite(42, True)
        {"status": "ok", "favorite": True}
    """
    conn = _get_conn()
    try:
        # Usamos RealDictCursor para que o RETURNING retorne um dict, facilitando
        # a extração do valor de favorite sem indexação posicional.
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

            # UPDATE por id (não por position) — favorite é um atributo de um bullet
            # existente e identificado. RETURNING favorite confirma o valor persistido
            # sem a necessidade de um segundo SELECT.
            cur.execute("""
                UPDATE journal_bullets
                   SET favorite = %s
                 WHERE id = %s
             RETURNING favorite
            """, (favorite, bullet_id))

            row = cur.fetchone()

            # rowcount 0 significa que nenhuma linha foi afetada — bullet não existe.
            # Retornamos erro amigável em vez de silenciar (padrão de delete_bullet).
            if cur.rowcount == 0:
                conn.rollback()
                return {"status": "error", "message": "bullet não encontrado"}

        conn.commit()
        # Retorna o valor real persistido no banco (confirmação do estado)
        return {"status": "ok", "favorite": bool(row["favorite"])}
    finally:
        conn.close()


def list_favorite_days(year: int) -> list:
    """Retornar as datas que possuem ao menos um bullet favorito no ano.

    Entrega o conjunto de datas necessário para o heatmap de favoritos (spec 008,
    FR-007). Retorna apenas datas com bullet.favorite = TRUE — dias sem favorito
    não aparecem na lista.

    Args:
        year: Ano de referência (ex.: 2026).

    Returns:
        Lista de strings "YYYY-MM-DD" ordenadas ASC — datas com ao menos um
        bullet favoritado. Lista vazia [] se nenhum favorito no ano.

    Example:
        >>> list_favorite_days(2026)
        ["2026-06-10", "2026-06-12"]
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:

            # JOIN de bullets com páginas para obter a data.
            # DISTINCT evita duplicatas quando um dia tem múltiplos bullets favoritos.
            # Filtramos por ano via EXTRACT e por favorite = TRUE.
            # CAST de jp.date para text retorna "YYYY-MM-DD" pronto para JSON.
            cur.execute("""
                SELECT DISTINCT jp.date::text AS date
                  FROM journal_bullets b
                  JOIN journal_pages jp ON jp.id = b.page_id
                 WHERE EXTRACT(YEAR FROM jp.date) = %s
                   AND b.favorite = TRUE
                 ORDER BY date ASC
            """, (year,))

            # fetchall retorna lista de tuplas — extraímos só o primeiro elemento (a data)
            return [row[0] for row in cur.fetchall()]
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


# ─── Emoções (Feature 006 — Registro Emocional TCC) ────────────────────────────

# Lista de campos do registro emocional que podem ser atualizados/lidos.
# Centralizada numa constante para evitar repetição nas queries abaixo.
_EMOTION_LOG_FIELDS = (
    "intensity",
    "situation",
    "automatic_thought",
    "adaptive_response",
    "reappraised_intensity",
)


def _serialize_log(row: dict) -> dict:
    """Converter uma linha de registro emocional em dict pronto para JSON.

    Transforma o campo `created_at` (objeto datetime do banco) em string ISO,
    pois o FastAPI/JSON não serializa datetime automaticamente da forma que o
    frontend espera (string).

    Args:
        row: Linha retornada pelo cursor (já como dict via RealDictCursor).

    Returns:
        Mesmo dict, mas com `created_at` convertido para string ISO (ou None).
    """
    log = dict(row)
    # Só converte se houver valor — created_at pode ser None em casos extremos
    if log.get("created_at"):
        log["created_at"] = log["created_at"].isoformat()
    return log


def list_emotions() -> list:
    """Listar o vocabulário de emoções disponíveis (predefinidas + custom).

    As 8 emoções base da TCC vêm primeiro (is_predefined = TRUE), seguidas das
    emoções criadas pelo usuário em ordem alfabética. Essa ordem deixa as
    emoções base sempre no topo do seletor da interface.

    Returns:
        Lista de dicts: [{"id": int, "name": str, "is_predefined": bool}, ...]
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # ORDER BY is_predefined DESC: TRUE (predefinidas) antes de FALSE (custom).
            # LOWER(name): ordena alfabeticamente ignorando caixa.
            cur.execute("""
                SELECT id, name, is_predefined
                FROM journal_emotions
                ORDER BY is_predefined DESC, LOWER(name) ASC
            """)
            rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def create_emotion(name: str) -> dict:
    """Criar uma emoção custom, deduplicando por nome (ignorando maiúsculas).

    Se já existir uma emoção com o mesmo nome (comparação case-insensitive),
    retorna a existente em vez de criar uma duplicata — assim o usuário nunca
    cria "Frustração" e "frustração" como emoções separadas. A operação é,
    portanto, idempotente.

    Args:
        name: Nome da emoção (será normalizado com strip()).

    Returns:
        {"status": "ok", "emotion": {"id": int, "name": str, "is_predefined": bool}}
        ou {"status": "error", "message": str} se o nome for vazio.
    """
    # Remove espaços nas pontas — "  raiva " vira "raiva"
    clean_name = (name or "").strip()
    if not clean_name:
        return {"status": "error", "message": "nome da emoção não pode ser vazio"}

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Procura primeiro uma emoção já existente com o mesmo nome (case-insensitive).
            # Isso cobre tanto emoções base quanto custom criadas antes.
            cur.execute("""
                SELECT id, name, is_predefined
                FROM journal_emotions
                WHERE LOWER(name) = LOWER(%s)
            """, (clean_name,))
            existing = cur.fetchone()
            if existing:
                # Já existe — retorna a existente, sem criar duplicata
                return {"status": "ok", "emotion": dict(existing)}

            # Não existe — insere como custom (is_predefined = FALSE por default)
            cur.execute("""
                INSERT INTO journal_emotions (name, is_predefined)
                VALUES (%s, FALSE)
                RETURNING id, name, is_predefined
            """, (clean_name,))
            created = cur.fetchone()
        conn.commit()
        return {"status": "ok", "emotion": dict(created)}
    finally:
        conn.close()


def list_emotion_logs(page_id: int) -> list:
    """Listar os registros emocionais de um dia (página).

    Faz JOIN com journal_emotions para incluir o nome da emoção (emotion_name),
    poupando o frontend de uma segunda consulta. Ordena por created_at ASC para
    exibir os registros na ordem em que foram criados ao longo do dia.

    Args:
        page_id: ID da página (dia) cujos registros queremos.

    Returns:
        Lista de dicts com todos os campos do registro + emotion_name,
        ordenada por created_at ASC. created_at já vem como string ISO.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT l.id, l.page_id, l.emotion_id,
                       e.name AS emotion_name,
                       l.intensity, l.situation, l.automatic_thought,
                       l.adaptive_response, l.reappraised_intensity,
                       l.created_at
                FROM journal_emotion_logs l
                JOIN journal_emotions e ON e.id = l.emotion_id
                WHERE l.page_id = %s
                ORDER BY l.created_at ASC
            """, (page_id,))
            rows = cur.fetchall()
        return [_serialize_log(r) for r in rows]
    finally:
        conn.close()


def create_emotion_log(
    page_id: int,
    emotion_id: int,
    intensity: int,
    situation: str | None = None,
    automatic_thought: str | None = None,
    adaptive_response: str | None = None,
    reappraised_intensity: int | None = None,
) -> dict:
    """Criar um registro emocional (Registro de Pensamentos da TCC) num dia.

    Apenas page_id, emotion_id e intensity são obrigatórios; os demais campos
    são opcionais e refletem as etapas seguintes do registro TCC (situação,
    pensamento automático, resposta adaptativa e reavaliação da intensidade).

    Args:
        page_id: ID da página (dia) onde o registro fica ancorado.
        emotion_id: ID da emoção escolhida (deve existir em journal_emotions).
        intensity: Intensidade inicial da emoção, 0–10.
        situation: Situação/gatilho que disparou a emoção (opcional).
        automatic_thought: Pensamento automático que surgiu (opcional).
        adaptive_response: Resposta adaptativa/reavaliação racional (opcional).
        reappraised_intensity: Intensidade após a resposta adaptativa, 0–10 (opcional).

    Returns:
        {"status": "ok", "log": {...}} com o registro criado (created_at em ISO),
        ou {"status": "error", "message": str} se page_id/emotion_id não existirem.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # INSERT com RETURNING traz o registro completo recém-criado em uma só query
            cur.execute("""
                INSERT INTO journal_emotion_logs
                    (page_id, emotion_id, intensity, situation,
                     automatic_thought, adaptive_response, reappraised_intensity)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, page_id, emotion_id, intensity, situation,
                          automatic_thought, adaptive_response,
                          reappraised_intensity, created_at
            """, (page_id, emotion_id, intensity, situation,
                  automatic_thought, adaptive_response, reappraised_intensity))
            row = cur.fetchone()

            # Busca o nome da emoção para devolver junto (mesmo shape do list_emotion_logs)
            cur.execute(
                "SELECT name FROM journal_emotions WHERE id = %s", (emotion_id,)
            )
            emo = cur.fetchone()
        conn.commit()
        log = _serialize_log(row)
        log["emotion_name"] = emo["name"] if emo else None
        return {"status": "ok", "log": log}
    except psycopg2.errors.ForeignKeyViolation:
        # page_id ou emotion_id não existem — erro amigável em vez de HTTP 500
        conn.rollback()
        return {"status": "error", "message": "page_id ou emotion_id não encontrado"}
    finally:
        conn.close()


def update_emotion_log(log_id: int, **fields) -> dict:
    """Atualizar campos de um registro emocional existente (atualização parcial).

    Permite completar o registro depois — ex.: criar só com emoção+intensidade e
    depois preencher pensamento automático e resposta adaptativa. Só os campos
    passados em **fields são atualizados; os demais permanecem como estavam.

    Campos aceitos: emotion_id, intensity, situation, automatic_thought,
    adaptive_response, reappraised_intensity.

    Args:
        log_id: ID do registro a atualizar.
        **fields: Pares campo=valor a atualizar (subconjunto dos campos válidos).

    Returns:
        {"status": "ok", "log": {...}} com o registro atualizado, ou
        {"status": "error", "message": str} se o registro não existir ou se
        nenhum campo válido for passado.
    """
    # Campos que podem ser atualizados via esta função (emotion_id + os demais)
    allowed = {"emotion_id", *_EMOTION_LOG_FIELDS}
    # Filtra apenas os campos válidos que vieram preenchidos na chamada
    updates = {k: v for k, v in fields.items() if k in allowed}

    if not updates:
        return {"status": "error", "message": "nenhum campo válido para atualizar"}

    # Monta dinamicamente a cláusula SET ("campo = %s, ...") na ordem das chaves.
    # Usamos placeholders %s — nunca interpolar valores direto (evita SQL injection).
    set_clause = ", ".join(f"{col} = %s" for col in updates)
    values = list(updates.values())
    values.append(log_id)  # último parâmetro é o WHERE id = %s

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f"""
                UPDATE journal_emotion_logs
                SET {set_clause}
                WHERE id = %s
                RETURNING id, page_id, emotion_id, intensity, situation,
                          automatic_thought, adaptive_response,
                          reappraised_intensity, created_at
            """, values)
            row = cur.fetchone()
            if row is None:
                # Nenhuma linha atualizada — o id não existe
                conn.rollback()
                return {"status": "error", "message": "registro não encontrado"}

            # Busca o nome atual da emoção para devolver no mesmo shape das outras tools
            cur.execute(
                "SELECT name FROM journal_emotions WHERE id = %s", (row["emotion_id"],)
            )
            emo = cur.fetchone()
        conn.commit()
        log = _serialize_log(row)
        log["emotion_name"] = emo["name"] if emo else None
        return {"status": "ok", "log": log}
    except psycopg2.errors.ForeignKeyViolation:
        # emotion_id atualizado para um id inexistente
        conn.rollback()
        return {"status": "error", "message": "emotion_id não encontrado"}
    finally:
        conn.close()


def delete_emotion_log(log_id: int) -> dict:
    """Deletar um registro emocional pelo ID.

    Args:
        log_id: ID do registro a remover.

    Returns:
        {"status": "ok"} se removeu, ou {"status": "error", "message": str}
        se o registro não existia.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM journal_emotion_logs WHERE id = %s", (log_id,)
            )
            # rowcount == 0 significa que nenhum registro tinha esse id
            if cur.rowcount == 0:
                conn.rollback()
                return {"status": "error", "message": "registro não encontrado"}
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


def get_emotion_stats(year: int) -> dict:
    """Agregar os registros emocionais de um ano para a aba "Emoções" dos Insights.

    Calcula no banco (não no cliente) o total de registros, a intensidade média
    geral, a emoção mais frequente, a contagem + média por emoção e a
    distribuição dos registros por mês. Usa a intensidade inicial (intensity),
    não a reavaliada, para as médias.

    Args:
        year: Ano de referência (ex.: 2026).

    Returns:
        {
          "total": int,
          "avg_intensity": float,          # 0 se não houver registros
          "top_emotion": str | None,       # emoção mais frequente
          "by_emotion": [{"name": str, "count": int, "avg_intensity": float}],  # count DESC
          "by_month": [int, ...]           # 12 posições (Jan=0 ... Dez=11)
        }
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Junta logs → pages (para filtrar por ano da data da página) e
            # logs → emotions (para o nome). Filtra pelo ano informado.
            cur.execute("""
                SELECT e.name AS name,
                       l.intensity AS intensity,
                       EXTRACT(MONTH FROM p.date)::int AS month
                FROM journal_emotion_logs l
                JOIN journal_pages p ON p.id = l.page_id
                JOIN journal_emotions e ON e.id = l.emotion_id
                WHERE EXTRACT(YEAR FROM p.date) = %s
            """, (year,))
            rows = cur.fetchall()

        total = len(rows)

        # Estado vazio: devolve tudo zerado/None — a interface mostra convite a registrar
        if total == 0:
            return {
                "total": 0,
                "avg_intensity": 0,
                "top_emotion": None,
                "by_emotion": [],
                "by_month": [0] * 12,
            }

        # Intensidade média geral (inicial) — soma / total
        avg_intensity = round(sum(int(r["intensity"]) for r in rows) / total, 1)

        # Agrega por emoção: contagem e soma de intensidade para calcular a média depois.
        # Usamos um dict {nome: {"count": n, "sum": s}} montado em Python — volume baixo.
        per_emotion: dict[str, dict] = {}
        for r in rows:
            name = r["name"]
            bucket = per_emotion.setdefault(name, {"count": 0, "sum": 0})
            bucket["count"] += 1
            bucket["sum"] += int(r["intensity"])

        # Transforma o dict em lista de dicts ordenada por contagem decrescente
        by_emotion = [
            {
                "name": name,
                "count": data["count"],
                "avg_intensity": round(data["sum"] / data["count"], 1),
            }
            for name, data in per_emotion.items()
        ]
        by_emotion.sort(key=lambda x: x["count"], reverse=True)

        # A emoção mais frequente é a primeira da lista ordenada
        top_emotion = by_emotion[0]["name"] if by_emotion else None

        # Distribuição por mês: array de 12 posições (índice 0 = Janeiro)
        by_month = [0] * 12
        for r in rows:
            # EXTRACT(MONTH ...) retorna 1–12; subtraímos 1 para virar índice 0–11
            month_idx = int(r["month"]) - 1
            if 0 <= month_idx < 12:
                by_month[month_idx] += 1

        return {
            "total": total,
            "avg_intensity": avg_intensity,
            "top_emotion": top_emotion,
            "by_emotion": by_emotion,
            "by_month": by_month,
        }
    finally:
        conn.close()


# ═════════════════════════════════════════════════════════════════════════════
# CARTAS (Cartas)
# ═════════════════════════════════════════════════════════════════════════════
#
# Uma "carta" é um texto expressivo livre que o usuário escreve para alguém, algo
# ou qualquer coisa, ancorado a um dia (page_id) — diferente do Registro Emocional,
# que é estruturado pela TCC. Cartas são ORTOGONAIS aos bullets (não contam
# palavras, não afetam heatmap/coleções/busca).
#
# Estados (campo status):
#   'draft'  → rascunho: pode ser editado livremente.
#   'sealed' → lacrada: vira registro imutável (não pode mais ser editada).
#
# Vínculo com pessoas (Komi): uma carta pode ser vinculada a pessoas cadastradas
# na Komi (entity_type 'journal_letter' em person_links), permitindo, por
# exemplo, ver "cartas que escrevi para Fulano".

# Campos textuais da carta que update_letter aceita atualizar (status/sealed_at
# são controlados por seal_letter, não por update_letter).
_LETTER_TEXT_FIELDS = ("recipient", "title", "body")


def _serialize_letter(row: dict) -> dict:
    """Converter uma linha de carta em dict pronto para JSON.

    Transforma os campos de data (created_at, updated_at, sealed_at), que vêm do
    banco como objetos datetime, em strings ISO — o JSON do FastAPI não serializa
    datetime no formato que o frontend espera.

    Args:
        row: Linha retornada pelo cursor (já como dict via RealDictCursor).

    Returns:
        Mesmo dict, com os três campos de data convertidos para string ISO (ou None).
    """
    letter = dict(row)
    # Percorre os três timestamps e converte cada um que estiver preenchido
    for field in ("created_at", "updated_at", "sealed_at"):
        if letter.get(field):
            letter[field] = letter[field].isoformat()
    return letter


def _fetch_letter_people(letter_id: int) -> list:
    """Buscar as pessoas (Komi) vinculadas a uma carta, em conexão própria.

    Usado após criar/atualizar uma carta para devolver os chips de pessoas no
    mesmo shape do list_letters. É best-effort: se a tabela person_links/people
    não existir (Komi não instalada) ou a query falhar, retorna lista vazia em
    vez de derrubar a operação principal (a carta já foi salva e commitada).

    Args:
        letter_id: ID da carta cujos vínculos queremos.

    Returns:
        Lista de dicts [{"id": str, "name": str}, ...] (vazia em caso de erro).
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT pe.id, pe.name
                FROM person_links pl
                JOIN people pe ON pe.id = pl.person_id
                WHERE pl.entity_type = 'journal_letter'
                  AND pl.entity_id = %s
                  AND pe.deleted = FALSE
                ORDER BY pe.name
            """, (str(letter_id),))
            return [dict(r) for r in cur.fetchall()]
    except Exception:  # noqa: BLE001
        # Komi ausente ou erro de leitura — vínculos são opcionais, nunca falham a carta
        return []
    finally:
        conn.close()


def list_letters(page_id: int) -> list:
    """Listar as cartas de um dia (página), com as pessoas vinculadas.

    Usa LEFT JOIN com person_links + people para já trazer, em uma única query,
    as pessoas (Komi) vinculadas a cada carta agregadas como JSON. Cartas sem
    vínculo retornam `people: []`. Ordena por created_at ASC (ordem de escrita).

    Args:
        page_id: ID da página (dia) cujas cartas queremos.

    Returns:
        Lista de dicts: cada carta com todos os campos + `people: [{id, name}]`.
        Os timestamps já vêm como strings ISO.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # json_agg + FILTER monta o array de pessoas; COALESCE garante '[]'
            # quando a carta não tem nenhum vínculo (senão json_agg traria [null]).
            # entity_id é TEXT em person_links, por isso o cast l.id::text.
            cur.execute("""
                SELECT l.id, l.page_id, l.recipient, l.title, l.body,
                       l.status, l.sealed_at, l.created_at, l.updated_at,
                       COALESCE(
                         json_agg(json_build_object('id', pe.id, 'name', pe.name))
                         FILTER (WHERE pe.id IS NOT NULL),
                         '[]'
                       ) AS people
                FROM journal_letters l
                LEFT JOIN person_links pl
                       ON pl.entity_type = 'journal_letter'
                      AND pl.entity_id = l.id::text
                LEFT JOIN people pe
                       ON pe.id = pl.person_id AND pe.deleted = FALSE
                WHERE l.page_id = %s
                GROUP BY l.id
                ORDER BY l.created_at ASC
            """, (page_id,))
            rows = cur.fetchall()
        return [_serialize_letter(r) for r in rows]
    finally:
        conn.close()


def create_letter(
    page_id: int,
    recipient: str,
    body: str,
    title: str | None = None,
    status: str = "draft",
    person_ids: list[str] | None = None,
) -> dict:
    """Criar uma carta num dia (página), opcionalmente já lacrada e vinculada.

    Apenas page_id, recipient e body são obrigatórios. Se `status='sealed'`, a
    carta já nasce lacrada (sealed_at = NOW()). Se `person_ids` for fornecido, os
    vínculos com pessoas da Komi são gravados na MESMA transação (atômico).

    Args:
        page_id: ID da página (dia) onde a carta fica ancorada.
        recipient: "Para quem/o quê" (texto livre).
        body: Corpo da carta.
        title: Título opcional da carta.
        status: 'draft' (rascunho) ou 'sealed' (lacrada). Default 'draft'.
        person_ids: UUIDs de pessoas da Komi a vincular (opcional).

    Returns:
        {"status": "ok", "letter": {...}} com a carta criada (people incluído),
        ou {"status": "error", "message": str} se status for inválido ou page_id
        não existir.
    """
    # Validação defensiva do status (o CHECK do banco também protege, mas damos
    # uma mensagem amigável em vez de deixar estourar um erro de constraint)
    if status not in ("draft", "sealed"):
        return {"status": "error", "message": "status deve ser 'draft' ou 'sealed'"}

    # Carta lacrada na criação já recebe o carimbo de quando foi lacrada
    sealed_sql = "NOW()" if status == "sealed" else "NULL"

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # INSERT com RETURNING traz a carta completa recém-criada numa só query.
            # sealed_at é injetado como literal SQL (NOW()/NULL), nunca como dado do usuário.
            cur.execute(f"""
                INSERT INTO journal_letters
                    (page_id, recipient, title, body, status, sealed_at)
                VALUES (%s, %s, %s, %s, %s, {sealed_sql})
                RETURNING id, page_id, recipient, title, body,
                          status, sealed_at, created_at, updated_at
            """, (page_id, recipient, title, body, status))
            row = cur.fetchone()
            letter_id = row["id"]

            # Vínculos com pessoas da Komi — mesma transação (atômico).
            # Import lazy para evitar ciclo agents.journal → agents.komi → agents.journal.
            if person_ids:
                from agents.komi.tools import link_person_on_cursor  # noqa: PLC0415
                for pid in person_ids:
                    link_person_on_cursor(cur, pid, "journal_letter", letter_id)
        conn.commit()
        letter = _serialize_letter(row)
        # people é lido após o commit (conexão própria) — não falha a carta se a Komi sumir
        letter["people"] = _fetch_letter_people(letter_id)
        return {"status": "ok", "letter": letter}
    except psycopg2.errors.ForeignKeyViolation:
        # page_id não existe — erro amigável em vez de HTTP 500
        conn.rollback()
        return {"status": "error", "message": "page_id não encontrado"}
    finally:
        conn.close()


def update_letter(letter_id: int, person_ids: list[str] | None = None, **fields) -> dict:
    """Atualizar os campos textuais de uma carta (atualização parcial).

    Só pode atualizar cartas em rascunho — uma carta lacrada ('sealed') é
    imutável e qualquer tentativa de editá-la retorna erro. Apenas os campos
    textuais passados em **fields (recipient, title, body) são atualizados; os
    demais permanecem. Atualiza updated_at = NOW().

    Se `person_ids` for fornecido (mesmo que lista vazia), os vínculos com
    pessoas são REGRAVADOS na mesma transação (remove todos os antigos e insere
    os novos) — assim a edição reflete exatamente a seleção atual da interface.
    Se `person_ids` for None, os vínculos existentes são preservados.

    Args:
        letter_id: ID da carta a atualizar.
        person_ids: Nova lista de UUIDs de pessoas (None = não mexer nos vínculos).
        **fields: Campos textuais a atualizar (subconjunto de recipient/title/body).

    Returns:
        {"status": "ok", "letter": {...}} com a carta atualizada, ou
        {"status": "error", "message": str} se a carta não existir, estiver
        lacrada, ou se nada de válido for enviado.
    """
    # Filtra apenas os campos textuais permitidos que vieram na chamada
    updates = {k: v for k, v in fields.items() if k in _LETTER_TEXT_FIELDS}

    # Sem campos de texto E sem person_ids = nada a fazer
    if not updates and person_ids is None:
        return {"status": "error", "message": "nenhum campo válido para atualizar"}

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Trava a linha e confere o status atual antes de qualquer escrita.
            # FOR UPDATE evita corrida com um seal_letter concorrente.
            cur.execute(
                "SELECT status FROM journal_letters WHERE id = %s FOR UPDATE",
                (letter_id,),
            )
            current = cur.fetchone()
            if current is None:
                conn.rollback()
                return {"status": "error", "message": "carta não encontrada"}
            if current["status"] == "sealed":
                conn.rollback()
                return {"status": "error", "message": "carta lacrada não pode ser editada"}

            # Atualiza os campos textuais (se houver) + updated_at.
            # Se vierem só person_ids, ainda assim tocamos updated_at para refletir a edição.
            set_parts = [f"{col} = %s" for col in updates]
            set_parts.append("updated_at = NOW()")
            values = list(updates.values())
            values.append(letter_id)  # WHERE id = %s
            cur.execute(f"""
                UPDATE journal_letters
                SET {", ".join(set_parts)}
                WHERE id = %s
                RETURNING id, page_id, recipient, title, body,
                          status, sealed_at, created_at, updated_at
            """, values)
            row = cur.fetchone()

            # Regrava vínculos se person_ids foi explicitamente fornecido.
            # Import lazy para evitar ciclo de import com a Komi.
            if person_ids is not None:
                from agents.komi.tools import (  # noqa: PLC0415
                    link_person_on_cursor,
                    unlink_people_on_cursor,
                )
                # Remove todos os vínculos atuais da carta e insere os novos —
                # mesmo padrão "delete + insert" usado nas menções dos bullets.
                unlink_people_on_cursor(cur, "journal_letter", letter_id)
                for pid in person_ids:
                    link_person_on_cursor(cur, pid, "journal_letter", letter_id)
        conn.commit()
        letter = _serialize_letter(row)
        letter["people"] = _fetch_letter_people(letter_id)
        return {"status": "ok", "letter": letter}
    finally:
        conn.close()


def seal_letter(letter_id: int) -> dict:
    """Lacrar uma carta (rascunho → lacrada): torna-a um registro imutável.

    Só lacra cartas que ainda estão em rascunho. A condição status='draft' no
    WHERE garante idempotência segura: tentar lacrar uma carta já lacrada (ou
    inexistente) não altera nada e retorna erro.

    Args:
        letter_id: ID da carta a lacrar.

    Returns:
        {"status": "ok", "letter": {...}} com a carta lacrada (status='sealed',
        sealed_at preenchido), ou {"status": "error", "message": str} se a carta
        não existir ou já estiver lacrada.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                UPDATE journal_letters
                SET status = 'sealed', sealed_at = NOW(), updated_at = NOW()
                WHERE id = %s AND status = 'draft'
                RETURNING id, page_id, recipient, title, body,
                          status, sealed_at, created_at, updated_at
            """, (letter_id,))
            row = cur.fetchone()
            if row is None:
                # Nenhuma linha afetada — id inexistente ou já lacrada
                conn.rollback()
                return {"status": "error", "message": "carta não encontrada ou já lacrada"}
        conn.commit()
        letter = _serialize_letter(row)
        letter["people"] = _fetch_letter_people(letter_id)
        return {"status": "ok", "letter": letter}
    finally:
        conn.close()


def delete_letter(letter_id: int) -> dict:
    """Deletar uma carta pelo ID (permitido mesmo lacrada — "rasgar a carta").

    Os vínculos com pessoas (person_links) NÃO têm FK para journal_letters — a
    coluna entity_id é polimórfica (TEXT), sem chave estrangeira — então não há
    CASCADE automático. Por isso removemos os vínculos explicitamente na mesma
    transação, evitando linhas órfãs em person_links. A interface exige
    confirmação antes de chamar esta função.

    Args:
        letter_id: ID da carta a remover.

    Returns:
        {"status": "ok"} se removeu, ou {"status": "error", "message": str}
        se a carta não existia.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM journal_letters WHERE id = %s", (letter_id,))
            # rowcount == 0 significa que nenhuma carta tinha esse id
            if cur.rowcount == 0:
                conn.rollback()
                return {"status": "error", "message": "carta não encontrada"}

            # Remove os vínculos pessoa↔carta na mesma transação (best-effort:
            # se a Komi não estiver instalada, simplesmente não há o que limpar).
            try:
                from agents.komi.tools import unlink_people_on_cursor  # noqa: PLC0415
                unlink_people_on_cursor(cur, "journal_letter", letter_id)
            except Exception:  # noqa: BLE001
                # Komi ausente — sem vínculos para remover; não falha a exclusão
                pass
        conn.commit()
        return {"status": "ok"}
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
