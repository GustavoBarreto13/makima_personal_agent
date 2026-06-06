"""Tools do Journal — acesso ao PostgreSQL para o diário pessoal.

Contém todas as funções que lêem e escrevem no banco de dados PostgreSQL
para o módulo de journal (diário). Usa psycopg2 síncrono — o mesmo padrão
de acesso direto ao banco das tools da Nami e da Frieren ao BigQuery.

As tabelas são criadas automaticamente na primeira importação deste módulo,
via _ensure_tables() chamada no final do arquivo.

Usage:
    from agents.journal.tools import get_or_create_page, upsert_bullet
"""

import os   # Para ler DATABASE_URL do ambiente
import re   # Para extrair @menções e #tags do conteúdo dos bullets

import psycopg2          # Driver PostgreSQL síncrono
import psycopg2.extras   # Fornece RealDictCursor — retorna linhas como dicts


# ─── Conexão ─────────────────────────────────────────────────────────────────

def _get_conn():
    """Abrir uma nova conexão ao PostgreSQL usando a variável de ambiente DATABASE_URL.

    Cria uma conexão nova a cada chamada — sem pool de conexões.
    Para um app pessoal com carga baixa, isso é suficiente e mais simples
    de manter do que um pool (sem threads, sem estado global).

    Returns:
        Objeto de conexão psycopg2 pronto para uso.

    Raises:
        KeyError: Se DATABASE_URL não estiver definida no ambiente.
        psycopg2.OperationalError: Se a conexão falhar (banco indisponível, credenciais erradas).
    """
    # os.environ lança KeyError se a variável não existir — intencional: falha rápida
    return psycopg2.connect(os.environ["DATABASE_URL"])


# ─── Criação de tabelas ───────────────────────────────────────────────────────

def _ensure_tables() -> None:
    """Criar todas as tabelas do journal se ainda não existirem.

    Chamada automaticamente na importação do módulo.
    Usa CREATE TABLE IF NOT EXISTS — seguro para rodar múltiplas vezes sem efeito colateral.
    Também insere o tipo padrão 'personal' se a tabela journal_types estiver vazia.

    O schema completo:
    - journal_types: tipos de diário (pessoal, profissional, viagem, etc.)
    - journal_pages: uma página por (tipo, data), com restrição UNIQUE
    - journal_bullets: linhas/bullets de cada página, com busca full-text em português
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
        - "page": {"id": int, "date": str, "type_id": int}
        - "bullets": [{"id": int, "content": str, "position": int}, ...]
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

            # Busca a página (recém-criada ou já existente)
            cur.execute("""
                SELECT id, date::text AS date, type_id
                FROM journal_pages
                WHERE type_id = %s AND date = %s
            """, (type_id, date))
            page = dict(cur.fetchone())

            # Busca todos os bullets da página, ordenados por posição crescente
            cur.execute("""
                SELECT id, content, position
                FROM journal_bullets
                WHERE page_id = %s
                ORDER BY position ASC
            """, (page["id"],))
            bullets = [dict(row) for row in cur.fetchall()]

        conn.commit()
        return {"page": page, "bullets": bullets}
    finally:
        conn.close()


def upsert_bullet(page_id: int, position: int, content: str) -> dict:
    """Inserir ou atualizar um bullet em uma posição específica da página.

    Se já existir um bullet com (page_id, position), atualiza o content.
    Se não existir, insere um novo bullet nessa posição.

    Após salvar o bullet, re-extrai todas as menções (@pessoas, #tags) do
    conteúdo e as substitui na tabela journal_mentions (delete + insert),
    garantindo que as menções estejam sempre sincronizadas com o texto atual.

    Args:
        page_id: ID da página onde o bullet pertence.
        position: Posição (linha) do bullet na página (0-indexado ou 1-indexado).
        content: Texto do bullet.

    Returns:
        Dicionário com:
        - "status": "ok"
        - "bullet": {"id": int, "content": str, "position": int}
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

            # INSERT ... ON CONFLICT: se já existe bullet nessa posição, atualiza content.
            # RETURNING retorna os dados do bullet inserido ou atualizado em uma só query.
            cur.execute("""
                INSERT INTO journal_bullets (page_id, position, content)
                VALUES (%s, %s, %s)
                ON CONFLICT (page_id, position)
                DO UPDATE SET content = EXCLUDED.content
                RETURNING id, content, position
            """, (page_id, position, content))
            bullet = dict(cur.fetchone())

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

            # Extrai as novas menções do conteúdo atualizado
            mentions = _parse_mentions(content)

            # Insere cada menção encontrada no texto
            for kind, value in mentions:
                cur.execute("""
                    INSERT INTO journal_mentions (bullet_id, kind, value)
                    VALUES (%s, %s, %s)
                """, (bullet_id, kind, value))

        conn.commit()
        return {"status": "ok", "bullet": bullet}
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
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


def list_heatmap(year: int) -> dict:
    """Retornar contagem de bullets por dia para o ano especificado.

    Usado para gerar o heatmap de atividade do diário (estilo GitHub contributions).
    Retorna apenas dias que têm pelo menos um bullet — dias sem entrada não aparecem.

    Args:
        year: Ano de referência (ex.: 2026).

    Returns:
        Dicionário mapeando datas para contagens:
        {"2026-06-06": 3, "2026-06-07": 1, ...}

    Example:
        >>> list_heatmap(2026)
        {"2026-06-06": 3}
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Agrupa bullets por data de página e filtra pelo ano.
            # jp.date::text converte DATE para string no formato YYYY-MM-DD.
            # EXTRACT(YEAR FROM jp.date) filtra apenas o ano solicitado.
            cur.execute("""
                SELECT jp.date::text AS date, COUNT(jb.id) AS cnt
                FROM journal_pages jp
                JOIN journal_bullets jb ON jb.page_id = jp.id
                WHERE EXTRACT(YEAR FROM jp.date) = %s
                GROUP BY jp.date
                ORDER BY jp.date
            """, (year,))
            rows = cur.fetchall()

        # Converte lista de tuplas (date, cnt) para dict {date: cnt}
        return {row[0]: row[1] for row in rows}
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

# Cria as tabelas ao importar o módulo pela primeira vez.
# Se DATABASE_URL não estiver definida (ex.: ambiente de CI sem banco),
# o erro será levantado aqui — intencionalmente, para falhar rápido.
_ensure_tables()
