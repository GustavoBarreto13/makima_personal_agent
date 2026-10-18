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

from agents.journal import markup  # Spec 076 — tokens de pessoa/referência e tags (motor puro)


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

            # (Spec 077) O CHECK fixo de entity_type em person_links SAIU: a Komi agora aceita qualquer
            # tipo no formato certo (agents/komi/integration.py), então não é mais preciso alargar a
            # lista aqui para 'journal_letter'. O schema da Komi cuida disso em ensure_schema().

            # ── Spec 076 — fonte por dia e por carta ──────────────────────────
            # NULL no dia = usa a fonte padrão das preferências; a carta sempre tem a sua.
            cur.execute("ALTER TABLE journal_pages ADD COLUMN IF NOT EXISTS font TEXT")
            cur.execute("ALTER TABLE journal_letters ADD COLUMN IF NOT EXISTS font TEXT NOT NULL DEFAULT 'normal'")
            for table, nullable in (("journal_pages", True), ("journal_letters", False)):
                cur.execute(
                    "SELECT 1 FROM information_schema.table_constraints "
                    "WHERE constraint_name = %s AND table_name = %s",
                    (f"{table}_font_check", table),
                )
                if cur.fetchone() is None:
                    cond = "font IS NULL OR " if nullable else ""
                    cur.execute(
                        f"ALTER TABLE {table} ADD CONSTRAINT {table}_font_check "
                        f"CHECK ({cond}font IN ('normal','roteiro','cursiva'))"
                    )

            # ── Spec 076 — menção resolvida guarda o ID da pessoa na Komi ─────
            cur.execute("ALTER TABLE journal_mentions ADD COLUMN IF NOT EXISTS person_id TEXT")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_mentions_person ON journal_mentions (person_id)")

            # ── Spec 076 — referências a itens de outros agentes ──────────────
            # Uma linha por token [Rótulo](agente:tipo:id) no bullet; base dos backlinks futuros.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_refs (
                    id          SERIAL PRIMARY KEY,
                    bullet_id   INT NOT NULL REFERENCES journal_bullets(id) ON DELETE CASCADE,
                    agent       TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id   TEXT NOT NULL,
                    label       TEXT NOT NULL,
                    UNIQUE (bullet_id, agent, entity_type, entity_id)
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_journal_refs_target ON journal_refs (agent, entity_type, entity_id)")

            # ── Spec 076 — distorções cognitivas por registro emocional ───────
            # Rótulos curtos (catastrofizacao, leitura_mental...) gravados best-effort pela IA.
            cur.execute("ALTER TABLE journal_emotion_logs ADD COLUMN IF NOT EXISTS distortions TEXT[]")

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
    # Spec 076: as regras vivem em markup.py (tokens @[Nome](komi:id), @legado e #tags com hífen).
    parsed = markup.parse(content)
    return [("person", p.name) for p in parsed.people] + [("tag", t) for t in parsed.tags]


# ─── "Dia com conteúdo" (spec 076) ────────────────────────────────────────────
#
# Uma página só conta (Arquivo, número do dia, heatmap, força) quando tem algo escrito:
# bullet não vazio, sonho não vazio, registro emocional ou carta. Visitar uma data não
# conta mais — e o número #N do dia é calculado só sobre esses dias.
_HAS_CONTENT_SQL = """(
    EXISTS (SELECT 1 FROM journal_bullets xb WHERE xb.page_id = {p}.id AND btrim(xb.content) <> '')
    OR NULLIF(btrim({p}.dream), '') IS NOT NULL
    OR EXISTS (SELECT 1 FROM journal_emotion_logs xe WHERE xe.page_id = {p}.id)
    OR EXISTS (SELECT 1 FROM journal_letters xl WHERE xl.page_id = {p}.id)
)"""


def _has_content(alias: str = "p") -> str:
    return _HAS_CONTENT_SQL.format(p=alias)


# CTE com o número estável de cada dia com conteúdo (#1 = o mais antigo).
_NUMBERED_DAYS_CTE = f"""numbered AS (
    SELECT p.id, ROW_NUMBER() OVER (ORDER BY p.date) AS num
    FROM journal_pages p
    WHERE p.type_id = %(type_id)s AND {_HAS_CONTENT_SQL.format(p='p')}
)"""

# Palavras de um texto em SQL (aproximação: separa por espaço em branco).
_WORDS_SQL = "COALESCE(array_length(regexp_split_to_array(NULLIF(btrim({col}), ''), '\\s+'), 1), 0)"

FONTS = ("normal", "roteiro", "cursiva")


def _today_sp():
    """Hoje em America/Sao_Paulo (o servidor roda em UTC)."""
    import datetime as _dt  # noqa: PLC0415
    from zoneinfo import ZoneInfo  # noqa: PLC0415
    return _dt.datetime.now(ZoneInfo("America/Sao_Paulo")).date()


# ─── Funções públicas ─────────────────────────────────────────────────────────

def _serialize_page(row: dict) -> dict:
    page = dict(row)
    for f in ("created_at", "updated_at"):
        if page.get(f):
            page[f] = page[f].isoformat()
    page["num"] = int(page["num"]) if page.get("num") is not None else None
    return page


def _load_page(cur, date: str, type_id: int) -> dict | None:
    """Ler a página do dia (ou None) com o número estável do dia (#N).

    #N = 1 + dias com conteúdo antes desta data — então é o mesmo número que o Arquivo
    mostra, e um dia ainda vazio já exibe o número que vai ganhar ao receber conteúdo.
    """
    cur.execute(f"""
        SELECT p.id, p.date::text AS date, p.type_id, p.dream, p.font,
               p.created_at, p.updated_at,
               1 + (SELECT COUNT(*) FROM journal_pages q
                    WHERE q.type_id = p.type_id AND q.date < p.date AND {_has_content('q')}) AS num
        FROM journal_pages p
        WHERE p.type_id = %s AND p.date = %s
    """, (type_id, date))
    row = cur.fetchone()
    return _serialize_page(row) if row else None


def _load_bullets(cur, page_id: int) -> list:
    cur.execute("""
        SELECT id, page_id, kind, content, position, created_at, favorite
        FROM journal_bullets
        WHERE page_id = %s
        ORDER BY position ASC
    """, (page_id,))
    return [
        {**dict(r), "created_at": r["created_at"].isoformat() if r["created_at"] else None}
        for r in cur.fetchall()
    ]


def ensure_page_on_cursor(cur, date: str, type_id: int = 1) -> int:
    """Criar (se preciso) a página do dia dentro da transação do chamador e devolver o id."""
    cur.execute("""
        INSERT INTO journal_pages (type_id, date) VALUES (%s, %s)
        ON CONFLICT (type_id, date) DO UPDATE SET updated_at = journal_pages.updated_at
        RETURNING id
    """, (type_id, date))
    row = cur.fetchone()
    return row["id"] if isinstance(row, dict) else row[0]


def ensure_page(date: str, type_id: int = 1) -> dict:
    """Criar (se preciso) a página do dia e devolvê-la — chamado no primeiro write do webapp.

    Returns:
        ``{"page": {...}, "bullets": [...]}`` (mesmo shape de ``get_page``) ou ``{"error"}``.
    """
    return get_or_create_page(date, type_id)


def get_page(date: str, type_id: int = 1) -> dict:
    """Ler o dia SEM criar nada (spec 076 — visitar uma data não cria página vazia).

    Returns:
        ``{"page": {...}, "bullets": [...]}``. Quando o dia ainda não existe, ``page`` é uma
        página "virtual" com ``id: None`` (mesmo shape), e ``bullets`` é ``[]``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            page = _load_page(cur, date, type_id)
            if page is None:
                cur.execute(
                    f"""SELECT 1 + COUNT(*) AS num FROM journal_pages q
                        WHERE q.type_id = %s AND q.date < %s AND {_has_content('q')}""",
                    (type_id, date),
                )
                num = int(cur.fetchone()["num"])
                page = {"id": None, "date": date, "type_id": type_id, "dream": None, "font": None,
                        "created_at": None, "updated_at": None, "num": num}
                return {"page": page, "bullets": []}
            return {"page": page, "bullets": _load_bullets(cur, page["id"])}
    finally:
        conn.close()


def get_or_create_page(date: str, type_id: int = 1) -> dict:
    """Buscar ou criar a página do diário para a data informada.

    Mantida para os canais de escrita (Hermes/Telegram e o primeiro write no webapp): só
    chame quando for escrever algo — para só ler, use ``get_page``.

    Args:
        date: Data no formato YYYY-MM-DD (ex.: "2026-06-06").
        type_id: ID do tipo de diário (padrão: 1 = personal).

    Returns:
        ``{"page": {"id", "date", "type_id", "dream", "font", "num", ...}, "bullets": [...]}``
        com os bullets ordenados por ``position``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            ensure_page_on_cursor(cur, date, type_id)
            page = _load_page(cur, date, type_id)
            if page is None:
                conn.rollback()
                return {"page": None, "bullets": [], "error": "type_id não encontrado"}
            bullets = _load_bullets(cur, page["id"])
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
            # Sonho só de espaços conta como vazio (senão o Arquivo marcava "sonho" à toa)
            dream_value = text.strip() if text and text.strip() else None
            cur.execute(
                "UPDATE journal_pages SET dream = %s, updated_at = NOW() WHERE id = %s",
                (dream_value, page_id),
            )
            if cur.rowcount == 0:
                conn.rollback()
                return {"status": "error", "message": "page não encontrada"}
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


def set_page_font(date: str, font: str | None, type_id: int = 1) -> dict:
    """Definir a fonte de um dia (``normal`` | ``roteiro`` | ``cursiva``; None = padrão).

    Cria a página se preciso (escolher a fonte antes de escrever é um caso comum).

    Returns:
        ``{"status": "ok", "page_id", "font"}`` ou ``{"status": "error", "message"}``.
    """
    if font is not None and font not in FONTS:
        return {"status": "error", "message": f"fonte deve ser uma de {', '.join(FONTS)}"}
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            page_id = ensure_page_on_cursor(cur, date, type_id)
            cur.execute("UPDATE journal_pages SET font = %s WHERE id = %s", (font, page_id))
        conn.commit()
        return {"status": "ok", "page_id": page_id, "font": font}
    except psycopg2.errors.ForeignKeyViolation:
        conn.rollback()
        return {"status": "error", "message": "type_id não encontrado"}
    finally:
        conn.close()


def list_entries(query: str = '', limit: int | None = None, before: str | None = None, type_id: int = 1) -> list:
    """Listar os dias com conteúdo para o Arquivo (spec 076 — antes listava toda página visitada).

    Args:
        query: Busca full-text opcional (bullets e sonho).
        limit: Máximo de dias (None = todos).
        before: Só dias anteriores a esta data (paginação: passe a data do último card).
        type_id: Tipo de diário.

    Returns:
        ``[{date, num, excerpt, font, bullet_count, word_count, emotion_count, letter_count,
        has_highlight, has_dream, has_favorite, has_counsel}]`` em ordem de data DESC.
        ``num`` é estável (não muda com a busca).
    """
    params: dict = {"type_id": type_id, "q": query or None, "before": before, "limit": limit}
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # journal_counsel é da Kurisu (spec 061) e pode não existir — testa antes.
            cur.execute("SELECT to_regclass('journal_counsel') IS NOT NULL AS ok")
            counsel_sql = (
                "EXISTS (SELECT 1 FROM journal_counsel c WHERE c.page_id = p.id)"
                if cur.fetchone()["ok"] else "FALSE"
            )
            cur.execute(f"""
                WITH {_NUMBERED_DAYS_CTE}
                SELECT p.date::text AS date, n.num, p.font,
                       NULLIF(btrim(p.dream), '') IS NOT NULL AS has_dream,
                       (SELECT b.content FROM journal_bullets b
                         WHERE b.page_id = p.id AND btrim(b.content) <> ''
                         ORDER BY b.position LIMIT 1) AS first_bullet,
                       NULLIF(btrim(p.dream), '') AS dream_text,
                       (SELECT COALESCE(NULLIF(btrim(l.title), ''), 'Carta para ' || l.recipient)
                          FROM journal_letters l WHERE l.page_id = p.id ORDER BY l.created_at LIMIT 1) AS first_letter,
                       (SELECT COUNT(*) FROM journal_bullets b WHERE b.page_id = p.id AND btrim(b.content) <> '') AS bullet_count,
                       (SELECT COALESCE(SUM({_WORDS_SQL.format(col='b.content')}), 0)
                          FROM journal_bullets b WHERE b.page_id = p.id) + {_WORDS_SQL.format(col='p.dream')} AS word_count,
                       (SELECT COUNT(*) FROM journal_emotion_logs e WHERE e.page_id = p.id) AS emotion_count,
                       (SELECT COUNT(*) FROM journal_letters l WHERE l.page_id = p.id) AS letter_count,
                       EXISTS (SELECT 1 FROM journal_bullets b WHERE b.page_id = p.id AND b.kind = 'highlight'
                               AND btrim(b.content) <> '') AS has_highlight,
                       EXISTS (SELECT 1 FROM journal_bullets b WHERE b.page_id = p.id AND b.favorite) AS has_favorite,
                       {counsel_sql} AS has_counsel
                FROM journal_pages p
                JOIN numbered n ON n.id = p.id
                WHERE (%(before)s::date IS NULL OR p.date < %(before)s::date)
                  AND (%(q)s::text IS NULL
                       OR EXISTS (SELECT 1 FROM journal_bullets jb WHERE jb.page_id = p.id
                                  AND jb.search_vec @@ plainto_tsquery('portuguese', %(q)s))
                       OR to_tsvector('portuguese', COALESCE(p.dream, '')) @@ plainto_tsquery('portuguese', %(q)s))
                ORDER BY p.date DESC
                LIMIT %(limit)s
            """, params)
            rows = cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            first_bullet = d.pop("first_bullet", None)
            dream_text = d.pop("dream_text", None)
            first_letter = d.pop("first_letter", None)
            d["excerpt"] = (first_bullet or dream_text or first_letter or "")[:240]
            d["excerpt_kind"] = "bullet" if first_bullet else "dream" if dream_text else "letter" if first_letter else None
            for k in ("num", "bullet_count", "word_count", "emotion_count", "letter_count"):
                d[k] = int(d[k] or 0)
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
            # entry_num = número estável do dia (spec 076 — antes numerava os bullets do tipo).
            cur.execute(f"""
                WITH {_NUMBERED_DAYS_CTE}
                SELECT b.id, b.kind, b.content, b.favorite,
                       b.created_at,
                       p.date::text AS date, p.font,
                       n.num AS entry_num
                FROM journal_bullets b
                JOIN journal_pages p ON p.id = b.page_id
                LEFT JOIN numbered n ON n.id = p.id
                WHERE b.kind = %(kind)s AND btrim(b.content) <> ''
                ORDER BY p.date DESC, b.position
            """, {"kind": kind, "type_id": 1})
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
            cur.execute(f"""
                WITH {_NUMBERED_DAYS_CTE}
                SELECT p.id AS page_id,
                       p.date::text AS date, p.font,
                       n.num AS entry_num,
                       p.dream
                FROM journal_pages p
                JOIN numbered n ON n.id = p.id
                WHERE NULLIF(btrim(p.dream), '') IS NOT NULL
                ORDER BY p.date DESC
            """, {"type_id": 1})
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
                    COUNT(DISTINCT p.id) FILTER (WHERE NULLIF(btrim(p.dream), '') IS NOT NULL) AS dreams,
                    COUNT(DISTINCT p.id) FILTER (WHERE b.kind = 'highlight' AND btrim(b.content) <> '') AS highlight_days
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
                  AND p.date <= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
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
                SELECT FLOOR(EXTRACT(HOUR FROM b.created_at AT TIME ZONE 'America/Sao_Paulo') / 2)::int AS bucket,
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
        today = _today_sp()
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
            # % dos dias escritos que tiveram ao menos um destaque (spec 076 — antes era
            # destaques/entradas, que passa de 100% e ainda era multiplicado de novo no front).
            "highlight_rate": round(int(totals.get("highlight_days") or 0) / days_written * 100) if days_written else 0,
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

    current = _today_sp().year
    if first is None:
        # Sem entradas ainda — oferece apenas o ano corrente
        return [current]
    # Intervalo contíguo do ano corrente até o primeiro registro, em ordem decrescente
    return list(range(current, first - 1, -1))


def _sync_bullet_links_on_cursor(cur, bullet_id: int, content: str, person_ids: list[str] | None = None) -> None:
    """Regravar menções, referências e vínculos com a Komi de um bullet (spec 076).

    - ``journal_mentions``: delete + insert; a menção guarda ``person_id`` quando resolvida.
    - ``journal_refs``: delete + insert dos tokens ``[Rótulo](agente:tipo:id)``.
    - ``person_links`` (Komi): o conjunto final é EXATAMENTE as pessoas citadas agora —
      tokens ``@[Nome](komi:id)``, ``person_ids`` explícitos e ``@Nome`` legado com match
      exato e único (nome ou apelido). Editar o texto remove o vínculo de quem saiu.

    A parte da Komi roda num SAVEPOINT: se a Komi não estiver instalada (ou falhar), o
    bullet é salvo do mesmo jeito.
    """
    parsed = markup.parse(content)

    cur.execute("DELETE FROM journal_mentions WHERE bullet_id = %s", (bullet_id,))
    cur.execute("DELETE FROM journal_refs WHERE bullet_id = %s", (bullet_id,))

    resolved: dict[str, str] = {}  # nome citado (legado) → person_id
    find_exact = None
    try:
        from agents.komi.tools import find_people_exact as find_exact  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        pass
    for p in parsed.people:
        if p.person_id is None and find_exact is not None:
            hits = find_exact(p.name)
            if len(hits) == 1:
                resolved[p.name] = str(hits[0]["id"])

    for p in parsed.people:
        cur.execute(
            "INSERT INTO journal_mentions (bullet_id, kind, value, person_id) VALUES (%s, 'person', %s, %s)",
            (bullet_id, p.name, p.person_id or resolved.get(p.name)),
        )
    for tag in parsed.tags:
        cur.execute(
            "INSERT INTO journal_mentions (bullet_id, kind, value) VALUES (%s, 'tag', %s)",
            (bullet_id, tag),
        )
    for r in parsed.refs:
        cur.execute("""
            INSERT INTO journal_refs (bullet_id, agent, entity_type, entity_id, label)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (bullet_id, agent, entity_type, entity_id) DO UPDATE SET label = EXCLUDED.label
        """, (bullet_id, r.agent, r.entity_type, r.entity_id, r.label))

    people_now = {p.person_id for p in parsed.people if p.person_id}
    people_now |= set(resolved.values())
    people_now |= {str(pid) for pid in (person_ids or [])}

    cur.execute("SAVEPOINT komi_links")
    try:
        # sync_people deixa o conjunto de pessoas do bullet EXATAMENTE igual ao citado agora e
        # já ignora pessoa apagada/inexistente — por isso não precisa mais de um savepoint por vínculo.
        from agents.komi.integration import sync_people  # noqa: PLC0415
        sync_people(cur, "journal_bullet", bullet_id, sorted(people_now))
        cur.execute("RELEASE SAVEPOINT komi_links")
    except Exception:  # noqa: BLE001 — Komi ausente: segue sem vínculo
        cur.execute("ROLLBACK TO SAVEPOINT komi_links")


def _unlink_bullet_on_cursor(cur, bullet_id: int) -> None:
    """Remover os vínculos da Komi de um bullet apagado (person_links não tem FK)."""
    cur.execute("SAVEPOINT komi_unlink")
    try:
        from agents.komi.integration import unlink_all  # noqa: PLC0415
        unlink_all(cur, "journal_bullet", bullet_id)
        cur.execute("RELEASE SAVEPOINT komi_unlink")
    except Exception:  # noqa: BLE001
        cur.execute("ROLLBACK TO SAVEPOINT komi_unlink")


def _mark_violet_dirty() -> None:
    # Espelho Calendar Hub → Google Calendar (spec 069) — reconcilia "Violet — Diário"
    try:
        from agents.kaguya import gcal_mirror as _gm  # noqa: PLC0415
        _gm.mark_dirty("violet")
    except Exception:  # noqa: BLE001
        pass


def upsert_bullet(page_id: int, position: int, content: str, kind: str = 'bullet', person_ids: list[str] | None = None) -> dict:
    """Inserir ou atualizar um bullet em uma posição específica da página.

    Upsert por ``(page_id, position)``. Depois de salvar, regrava menções, referências e
    vínculos com a Komi (ver ``_sync_bullet_links_on_cursor``).

    Texto vazio (só espaços) **apaga** o bullet daquela posição, se existir — o diário não
    guarda mais bullets vazios (spec 076; eles apareciam como dias "vazios" no Arquivo).

    Args:
        page_id: ID da página onde o bullet pertence.
        position: Posição (linha) do bullet na página (esparso ×1000).
        content: Texto do bullet (pode conter ``@[Nome](komi:id)`` e ``[Rótulo](agente:tipo:id)``).
        kind: Tipo do bullet — bullet, highlight, dream, idea, wisdom, note. Default 'bullet'.
        person_ids: IDs de pessoas da Komi a vincular além das citadas no texto.

    Returns:
        ``{"status": "ok", "bullet": {...}}``; com texto vazio,
        ``{"status": "ok", "bullet": None, "deleted": bool}``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if not (content or "").strip():
                cur.execute(
                    "DELETE FROM journal_bullets WHERE page_id = %s AND position = %s RETURNING id",
                    (page_id, position),
                )
                gone = cur.fetchone()
                if gone:
                    _unlink_bullet_on_cursor(cur, gone["id"])
                conn.commit()
                if gone:
                    _mark_violet_dirty()
                return {"status": "ok", "bullet": None, "deleted": bool(gone)}

            # favorite NÃO entra no DO UPDATE SET — editar texto ou tipo nunca reseta o favorito (FR-005).
            cur.execute("""
                INSERT INTO journal_bullets (page_id, position, content, kind)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (page_id, position)
                DO UPDATE SET content = EXCLUDED.content, kind = EXCLUDED.kind
                RETURNING id, page_id, kind, content, position, created_at, favorite
            """, (page_id, position, content, kind))
            row = cur.fetchone()
            bullet = {**dict(row), "created_at": row["created_at"].isoformat() if row["created_at"] else None}

            cur.execute("UPDATE journal_pages SET updated_at = NOW() WHERE id = %s", (page_id,))
            _sync_bullet_links_on_cursor(cur, bullet["id"], content, person_ids)

        conn.commit()
        _mark_violet_dirty()
        return {"status": "ok", "bullet": bullet}
    except psycopg2.errors.ForeignKeyViolation:
        # page_id não existe em journal_pages — retorna erro amigável em vez de HTTP 500
        conn.rollback()
        return {"status": "error", "message": "page_id não encontrado"}
    finally:
        conn.close()


def delete_bullet(bullet_id: int) -> dict:
    """Deletar um bullet pelo ID.

    Menções e referências saem pelo CASCADE; os vínculos com a Komi (sem FK) são removidos
    explicitamente na mesma transação (spec 076 — antes ficavam órfãos).

    Args:
        bullet_id: ID único do bullet a ser removido.

    Returns:
        ``{"status": "ok", "bullet": {...}}`` (o que foi apagado, para o Desfazer) ou erro.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                DELETE FROM journal_bullets WHERE id = %s
                RETURNING id, page_id, kind, content, position, favorite
            """, (bullet_id,))
            gone = cur.fetchone()
            if gone is None:
                conn.rollback()
                return {"status": "error", "message": "bullet não encontrado"}
            _unlink_bullet_on_cursor(cur, bullet_id)
        conn.commit()
        _mark_violet_dirty()
        return {"status": "ok", "bullet": dict(gone)}
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
                  AND jp.date <= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
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
            if kind == "person":
                # Spec 076: menções resolvidas se agrupam pela pessoa (mesmo citada com nomes
                # diferentes); o nome exibido é o mais usado. `last_date` ordena "recentes".
                cur.execute("""
                    SELECT MODE() WITHIN GROUP (ORDER BY m.value) AS value,
                           m.person_id,
                           COUNT(*) AS count,
                           MAX(p.date)::text AS last_date
                    FROM journal_mentions m
                    JOIN journal_bullets b ON b.id = m.bullet_id
                    JOIN journal_pages p ON p.id = b.page_id
                    WHERE m.kind = 'person'
                    GROUP BY m.person_id, CASE WHEN m.person_id IS NULL THEN lower(m.value) END
                    ORDER BY count DESC
                """)
            else:
                cur.execute("""
                    SELECT m.value, NULL AS person_id, COUNT(*) AS count, MAX(p.date)::text AS last_date
                    FROM journal_mentions m
                    JOIN journal_bullets b ON b.id = m.bullet_id
                    JOIN journal_pages p ON p.id = b.page_id
                    WHERE m.kind = %s
                    GROUP BY m.value
                    ORDER BY count DESC
                """, (kind,))
            rows = cur.fetchall()

        return [{**dict(row), "count": int(row["count"])} for row in rows]
    finally:
        conn.close()


def get_bullets_by_mention(kind: str, value: str = "", person_id: str | None = None) -> list:
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
            # person_id (spec 076) acha a pessoa por qualquer nome com que foi citada.
            cur.execute("""
                SELECT DISTINCT jp.date::text AS date, jp.date AS d, jb.position,
                       jb.id, jb.content, jb.kind, jb.favorite
                FROM journal_mentions jm
                JOIN journal_bullets jb ON jb.id = jm.bullet_id
                JOIN journal_pages jp ON jp.id = jb.page_id
                WHERE jm.kind = %(kind)s
                  AND (CASE WHEN %(pid)s::text IS NOT NULL THEN jm.person_id = %(pid)s
                            ELSE lower(jm.value) = lower(%(value)s) END)
                ORDER BY jp.date DESC, jb.position ASC
            """, {"kind": kind, "value": value or "", "pid": person_id})
            rows = cur.fetchall()

        # Agrupa os bullets por data em uma estrutura hierárquica
        # Usa um dict ordenado para preservar a ordem por data DESC
        grouped: dict[str, list] = {}
        for row in rows:
            date_key = row["date"]
            if date_key not in grouped:
                grouped[date_key] = []
            grouped[date_key].append({"id": row["id"], "content": row["content"],
                                      "kind": row["kind"], "favorite": row["favorite"]})

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
                       l.created_at, l.distortions
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
                          reappraised_intensity, created_at, distortions
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
                          reappraised_intensity, created_at, distortions
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


def get_emotion_stats(year: int | None = None, since: str | None = None, until: str | None = None) -> dict:
    """Agregar os registros emocionais de um ano para a aba "Emoções" dos Insights.

    Calcula no banco (não no cliente) o total de registros, a intensidade média
    geral, a emoção mais frequente, a contagem + média por emoção e a
    distribuição dos registros por mês. Usa a intensidade inicial (intensity),
    não a reavaliada, para as médias.

    Args:
        year: Ano de referência (ex.: 2026); None = sem filtro de ano.
        since / until: Intervalo de datas (YYYY-MM-DD, inclusivo) — aba Registro emocional (spec 076).

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
                WHERE (%(year)s::int IS NULL OR EXTRACT(YEAR FROM p.date) = %(year)s)
                  AND (%(since)s::date IS NULL OR p.date >= %(since)s::date)
                  AND (%(until)s::date IS NULL OR p.date <= %(until)s::date)
            """, {"year": year, "since": since, "until": until})
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
_LETTER_TEXT_FIELDS = ("recipient", "title", "body", "font")


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
                SELECT l.id, l.page_id, l.recipient, l.title, l.body, l.font,
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
    font: str = "normal",
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
    if font not in FONTS:
        return {"status": "error", "message": f"fonte deve ser uma de {', '.join(FONTS)}"}

    # Carta lacrada na criação já recebe o carimbo de quando foi lacrada
    sealed_sql = "NOW()" if status == "sealed" else "NULL"

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # INSERT com RETURNING traz a carta completa recém-criada numa só query.
            # sealed_at é injetado como literal SQL (NOW()/NULL), nunca como dado do usuário.
            cur.execute(f"""
                INSERT INTO journal_letters
                    (page_id, recipient, title, body, status, font, sealed_at)
                VALUES (%s, %s, %s, %s, %s, %s, {sealed_sql})
                RETURNING id, page_id, recipient, title, body,
                          status, sealed_at, created_at, updated_at, font
            """, (page_id, recipient, title, body, status, font))
            row = cur.fetchone()
            letter_id = row["id"]

            # Vínculos com pessoas da Komi — mesma transação (atômico).
            # Import lazy para evitar ciclo agents.journal → agents.komi → agents.journal.
            if person_ids:
                from agents.komi.integration import link_people  # noqa: PLC0415
                link_people(cur, "journal_letter", letter_id, person_ids)
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
    if "font" in updates and updates["font"] not in FONTS:
        return {"status": "error", "message": f"fonte deve ser uma de {', '.join(FONTS)}"}

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
                          status, sealed_at, created_at, updated_at, font
            """, values)
            row = cur.fetchone()

            # Regrava vínculos se person_ids foi explicitamente fornecido.
            # Import lazy para evitar ciclo de import com a Komi.
            if person_ids is not None:
                from agents.komi.integration import sync_people  # noqa: PLC0415
                # O conjunto final da carta é exatamente o enviado (quem continua é preservado).
                sync_people(cur, "journal_letter", letter_id, person_ids)
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
                          status, sealed_at, created_at, updated_at, font
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
                from agents.komi.integration import unlink_all  # noqa: PLC0415
                unlink_all(cur, "journal_letter", letter_id)
            except Exception:  # noqa: BLE001
                # Komi ausente — sem vínculos para remover; não falha a exclusão
                pass
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ═════════════════════════════════════════════════════════════════════════════
# Spec 076 — abas consolidadas (Cartas e Registro emocional)
# ═════════════════════════════════════════════════════════════════════════════

_LETTER_BASE_COLUMNS = """
    l.id, l.page_id, p.date::text AS date, l.recipient, l.title, l.body, l.font,
    l.status, l.sealed_at, l.created_at, l.updated_at"""

_LETTER_PEOPLE_COLUMN = """,
    COALESCE(
      (SELECT json_agg(json_build_object('id', pe.id, 'name', pe.name, 'avatar_url', pe.avatar_url) ORDER BY pe.name)
         FROM person_links pl JOIN people pe ON pe.id = pl.person_id AND pe.deleted = FALSE
        WHERE pl.entity_type = 'journal_letter' AND pl.entity_id = l.id::text),
      '[]'
    ) AS people"""


def _people_tables_exist(cur) -> bool:
    cur.execute("SELECT to_regclass('person_links') IS NOT NULL AND to_regclass('people') IS NOT NULL AS ok")
    return bool(cur.fetchone()["ok"])


def _letter_columns(cur) -> str:
    """Colunas da carta + pessoas vinculadas (ou lista vazia se a Komi não existir)."""
    people = _LETTER_PEOPLE_COLUMN if _people_tables_exist(cur) else ", '[]'::json AS people"
    return _LETTER_BASE_COLUMNS + people


def list_all_letters(
    status: str | None = None,
    person_id: str | None = None,
    q: str | None = None,
    limit: int = 50,
    before: str | None = None,
) -> list:
    """Todas as cartas, da mais recente para a mais antiga (aba Cartas — spec 076).

    Args:
        status: ``draft`` | ``sealed`` | None (todas).
        person_id: Só cartas vinculadas a esta pessoa da Komi.
        q: Busca (sem caixa) no destinatário, título e corpo.
        limit: Máximo de cartas (1–200).
        before: Paginação — só cartas de dias anteriores a esta data.

    Returns:
        ``[{id, page_id, date, recipient, title, body, font, status, sealed_at, created_at,
        updated_at, people: [{id, name, avatar_url}]}]``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cols = _letter_columns(cur)
            person_filter = (
                "AND EXISTS (SELECT 1 FROM person_links pl WHERE pl.entity_type = 'journal_letter' "
                "AND pl.entity_id = l.id::text AND pl.person_id = %(pid)s)"
                if person_id else ""
            )
            cur.execute(f"""
                SELECT {cols}
                FROM journal_letters l
                JOIN journal_pages p ON p.id = l.page_id
                WHERE (%(status)s::text IS NULL OR l.status = %(status)s)
                  AND (%(before)s::date IS NULL OR p.date < %(before)s::date)
                  AND (%(q)s::text IS NULL OR
                       (l.recipient || ' ' || COALESCE(l.title, '') || ' ' || l.body) ILIKE %(qlike)s)
                  {person_filter}
                ORDER BY p.date DESC, l.created_at DESC
                LIMIT %(limit)s
            """, {"status": status if status in ("draft", "sealed") else None, "before": before,
                  "q": q or None, "qlike": f"%{q}%" if q else None, "pid": person_id,
                  "limit": max(1, min(int(limit), 200))})
            return [_serialize_letter(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_letter(letter_id: int) -> dict:
    """Uma carta com o dia e as pessoas vinculadas.

    Returns:
        ``{"status": "ok", "letter": {...}}`` ou ``{"status": "error", "message"}``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cols = _letter_columns(cur)
            cur.execute(f"""
                SELECT {cols}
                FROM journal_letters l JOIN journal_pages p ON p.id = l.page_id
                WHERE l.id = %s
            """, (letter_id,))
            row = cur.fetchone()
        if row is None:
            return {"status": "error", "message": "carta não encontrada"}
        return {"status": "ok", "letter": _serialize_letter(row)}
    finally:
        conn.close()


_EMOTION_LOG_SELECT = """
    SELECT l.id, l.page_id, p.date::text AS date, l.emotion_id, e.name AS emotion_name,
           l.intensity, l.situation, l.automatic_thought, l.adaptive_response,
           l.reappraised_intensity, l.distortions, l.created_at
    FROM journal_emotion_logs l
    JOIN journal_pages p ON p.id = l.page_id
    JOIN journal_emotions e ON e.id = l.emotion_id
"""


def list_all_emotion_logs(
    emotion_id: int | None = None,
    min_intensity: int | None = None,
    q: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = 50,
    before: str | None = None,
) -> list:
    """Todos os registros emocionais, do mais recente para o mais antigo (aba Registro emocional).

    Args:
        emotion_id: Só esta emoção.
        min_intensity: Só registros com intensidade inicial >= este valor.
        q: Busca (sem caixa) em situação, pensamento automático e resposta adaptativa.
        since / until: Intervalo de datas do dia (YYYY-MM-DD, inclusivo).
        limit: Máximo (1–1000).
        before: Paginação — só dias anteriores a esta data.

    Returns:
        ``[{id, page_id, date, emotion_id, emotion_name, intensity, situation, automatic_thought,
        adaptive_response, reappraised_intensity, distortions, created_at}]``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(_EMOTION_LOG_SELECT + """
                WHERE (%(eid)s::int IS NULL OR l.emotion_id = %(eid)s)
                  AND (%(minI)s::int IS NULL OR l.intensity >= %(minI)s)
                  AND (%(since)s::date IS NULL OR p.date >= %(since)s::date)
                  AND (%(until)s::date IS NULL OR p.date <= %(until)s::date)
                  AND (%(before)s::date IS NULL OR p.date < %(before)s::date)
                  AND (%(q)s::text IS NULL OR
                       (COALESCE(l.situation,'') || ' ' || COALESCE(l.automatic_thought,'') || ' ' ||
                        COALESCE(l.adaptive_response,'')) ILIKE %(qlike)s)
                ORDER BY p.date DESC, l.created_at DESC
                LIMIT %(limit)s
            """, {"eid": emotion_id, "minI": min_intensity, "since": since, "until": until,
                  "before": before, "q": q or None, "qlike": f"%{q}%" if q else None,
                  "limit": max(1, min(int(limit), 1000))})
            return [_serialize_log(r) for r in cur.fetchall()]
    finally:
        conn.close()


def list_emotion_logs_by_ids(ids: list[int]) -> list:
    """Registros emocionais pelos IDs (a evidência por trás de um achado da análise)."""
    if not ids:
        return []
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(_EMOTION_LOG_SELECT + """
                WHERE l.id = ANY(%s)
                ORDER BY p.date DESC, l.created_at DESC
            """, ([int(i) for i in ids],))
            return [_serialize_log(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_emotion_log(log_id: int) -> dict:
    """Um registro emocional com o dia. ``{"status": "ok", "log"}`` ou erro."""
    rows = list_emotion_logs_by_ids([log_id])
    if not rows:
        return {"status": "error", "message": "registro não encontrado"}
    return {"status": "ok", "log": rows[0]}


def set_emotion_distortions(log_id: int, distortions: list[str]) -> dict:
    """Gravar os rótulos de distorção cognitiva de um registro (classificação best-effort)."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE journal_emotion_logs SET distortions = %s WHERE id = %s",
                        (list(distortions or []), log_id))
            if cur.rowcount == 0:
                conn.rollback()
                return {"status": "error", "message": "registro não encontrado"}
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


def list_refs(agent: str | None = None, since: str | None = None, until: str | None = None) -> list:
    """Referências a outros agentes citadas no diário (Refletir, Insights e backlinks futuros).

    Returns:
        ``[{agent, entity_type, entity_id, label, count, last_date}]`` ordenado por uso.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT r.agent, r.entity_type, r.entity_id,
                       MODE() WITHIN GROUP (ORDER BY r.label) AS label,
                       COUNT(*) AS count, MAX(p.date)::text AS last_date
                FROM journal_refs r
                JOIN journal_bullets b ON b.id = r.bullet_id
                JOIN journal_pages p ON p.id = b.page_id
                WHERE (%(agent)s::text IS NULL OR r.agent = %(agent)s)
                  AND (%(since)s::date IS NULL OR p.date >= %(since)s::date)
                  AND (%(until)s::date IS NULL OR p.date <= %(until)s::date)
                GROUP BY r.agent, r.entity_type, r.entity_id
                ORDER BY count DESC, last_date DESC
            """, {"agent": agent, "since": since, "until": until})
            return [{**dict(r), "count": int(r["count"])} for r in cur.fetchall()]
    finally:
        conn.close()


def get_bullets_by_ref(agent: str, entity_type: str, entity_id: str) -> list:
    """Bullets que citam um item de outro agente, agrupados por dia (mesmo shape do filtro)."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT p.date::text AS date, b.id, b.content, b.kind, b.favorite
                FROM journal_refs r
                JOIN journal_bullets b ON b.id = r.bullet_id
                JOIN journal_pages p ON p.id = b.page_id
                WHERE r.agent = %s AND r.entity_type = %s AND r.entity_id = %s
                ORDER BY p.date DESC, b.position
            """, (agent, entity_type, str(entity_id)))
            rows = cur.fetchall()
        grouped: dict[str, list] = {}
        for r in rows:
            grouped.setdefault(r["date"], []).append(
                {"id": r["id"], "content": r["content"], "kind": r["kind"], "favorite": r["favorite"]}
            )
        return [{"date": d, "bullets": b} for d, b in grouped.items()]
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
