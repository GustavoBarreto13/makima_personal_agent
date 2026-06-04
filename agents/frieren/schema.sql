-- Executar no console BigQuery após criar o dataset:
--   bq mk --dataset <GCP_PROJECT_ID>:frieren_books_agent

-- Tabela de catálogo de livros e estado de leitura
-- Armazena metadados dos livros (título, autor, páginas, etc.)
-- e o status atual de leitura (lendo, lido, quero_ler, pausado, abandonado)
CREATE TABLE IF NOT EXISTS `{project}.frieren_books_agent.books` (
  -- Identificadores e metadados do livro
  id              STRING    NOT NULL,  -- UUID único da entrada de livro
  google_books_id STRING,              -- ID da API Google Books (para buscar capas e descrições)
  title           STRING    NOT NULL,  -- Título do livro
  author          STRING,              -- Autor principal
  total_pages     INT64,               -- Total de páginas do livro
  isbn            STRING,              -- ISBN para identificação

  -- Conteúdo visual e descritivo
  cover_url       STRING,              -- URL da capa (tipicamente da Google Books API)
  description     STRING,              -- Sinopse ou descrição do livro
  genre           STRING,              -- Gênero (ficção científica, mistério, romance, etc.)
  language        STRING,              -- Idioma original (português, inglês, etc.)
  published_year  INT64,               -- Ano de publicação

  -- Estado de leitura e datas
  status          STRING    NOT NULL,  -- Status da leitura: lendo / lido / quero_ler / pausado / abandonado
  date_started    DATE,                -- Data em que começou a ler
  date_finished   DATE,                -- Data em que terminou de ler

  -- Avaliação e notas pessoais
  rating          FLOAT64,             -- Classificação do livro (1.0 a 5.0, nullable)
  notes           STRING,              -- Anotações pessoais ou resenha

  -- Metadados de controle
  source          STRING,              -- Fonte da entrada (ex: telegram, manual)
  created_at      TIMESTAMP NOT NULL,  -- Quando foi criada a entrada no banco
  updated_at      TIMESTAMP NOT NULL,  -- Última atualização
  deleted         BOOL      NOT NULL   -- Flag de soft delete (para manter histórico)
)
PARTITION BY DATE(created_at)
CLUSTER BY status, author;

-- Tabela imutável de log de sessões de leitura
-- Cada linha registra uma sessão de leitura: quanto leu naquele dia
-- Serve para rastrear progresso, criar gráficos de leitura e detectar padrões
CREATE TABLE IF NOT EXISTS `{project}.frieren_books_agent.reading_logs` (
  -- Identificadores
  id              STRING    NOT NULL,  -- UUID único do log de sessão
  book_id         STRING    NOT NULL,  -- FK para livro em books.id
  book_title      STRING    NOT NULL,  -- Desnormalizado: título do livro (facilita joins sem ler books)

  -- Data e páginas lidas
  date            DATE      NOT NULL,  -- Data da sessão de leitura
  page_start      INT64     NOT NULL,  -- Página onde estava ANTES dessa sessão
  page_end        INT64     NOT NULL,  -- Página atual APÓS ler nessa sessão
  pages_read      INT64     NOT NULL,  -- Diferença (page_end - page_start): páginas lidas naquele dia

  -- Anotações sobre a sessão
  session_notes   STRING,              -- Notas pessoais ou reflexões sobre essa sessão

  -- Metadados
  created_at      TIMESTAMP NOT NULL   -- Quando foi registrada essa sessão
)
PARTITION BY date
CLUSTER BY book_id;
