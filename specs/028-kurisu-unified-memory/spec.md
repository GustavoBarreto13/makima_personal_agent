# Feature Specification: Kurisu — Memória Unificada sobre o Postgres

**Feature Branch**: `028-kurisu-unified-memory` (diretório de spec; nenhuma branch criada — regra do usuário)

**Created**: 2026-06-26

**Status**: Draft

**Input**: User description: "Também quero abastecer o RAG com todos os dados do Postgres — tarefas, diários etc. Tudo gerado quero que seja conteúdo pro RAG também."

> **Decisões confirmadas com o usuário (2026-06-26):**
> 1. **Fonte:** todos os domínios da Makima no Postgres (tarefas, diário, finanças, leituras, filmes,
>    animes, séries, pessoas) viram conteúdo da memória da Kurisu — além da wiki da spec 027.
> 2. **Backend:** **Vertex AI RAG Engine** em **Serverless mode** (mesma fundação da 027), mas num
>    **corpus separado** só para os dados operacionais; embeddings multilíngues gerenciados. A busca
>    (`buscar_na_base`) consulta os dois corpora. O usuário **aceita** que os dados (inclusive
>    diário/finanças) sejam indexados na nuvem do Google (decisão revista em 2026-06-28).
> 3. **Sync:** **job automático agendado** (noturno), incremental.
> 4. **Representação:** **mista por domínio** — resumos datados para atividade/finanças; itens
>    individuais para bullets de diário e itens de mídia.
> 5. **Permissões:** **somente leitura** sobre os dados de origem — a memória espelha, nunca altera.

## Clarifications

### Session 2026-06-26

- Q: Privacidade — diário/finanças podem ir para a nuvem? → A: **Sim** (revisão de 2026-06-28); o usuário aceita indexar tudo no Vertex AI RAG do Google. (Antes a resposta era "não, tudo local" — revertido.)
- Q: Como manter a memória atualizada? → A: Job agendado (noturno), incremental.
- Q: Como representar os dados estruturados? → A: Misto — resumos datados (atividade/finanças) e itens individuais (bullets de diário, itens de mídia).

### Session 2026-06-28

- Q: Dado que a 027 recria o corpus inteiro a cada atualização da wiki (`--recreate`, ID novo), onde a 028 guarda os dados do Postgres? → A: **Corpus separado** — um segundo corpus só para os dados operacionais, isolando os ciclos de vida (recriar a wiki nunca toca os dados do Postgres).
- Q: Com wiki e dados operacionais em corpora separados, como a Kurisu busca a cada pergunta? → A: **Buscar nos dois sempre** — a tool `buscar_na_base` consulta ambos os corpora; o reranker + peso de recência decidem a relevância (busca unânime, FR-009).

> **Dependência:** esta spec assume a fundação da **027** (Vertex AI RAG em **Serverless mode** +
> embeddings multilíngues gerenciados + a FunctionTool **`buscar_na_base`** com reranker). A 028
> acrescenta um **corpus operacional separado**, as *fontes* (os domínios do Postgres) e o *sync
> agendado*, e **estende `buscar_na_base` para consultar os dois corpora**; não reimplementa o motor de busca.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recuperar minha atividade num período ("o que fiz esta semana?") (Priority: P1)

O Gustavo pergunta "o que eu fiz esta semana?" ou "o que andei fazendo em maio?". A Kurisu recupera a
atividade daquele período — tarefas concluídas, bullets de diário, itens de mídia consumidos — e
responde de forma coerente, com as datas certas (UTC-3).

**Why this priority**: É o coração do "segundo cérebro": transformar o registro operacional disperso
(que hoje vive em tabelas separadas) numa memória consultável por linguagem natural e por tempo.

**Independent Test**: Com atividade conhecida numa semana, perguntar por aquela semana e verificar que
a resposta reflete os itens reais daquele intervalo, com as datas corretas, e não vaza itens de outras
semanas.

**Acceptance Scenarios**:

1. **Given** houve tarefas concluídas e bullets escritos numa semana, **When** o usuário pergunta por
   aquela semana, **Then** a Kurisu lista a atividade real daquele intervalo com as datas corretas.
2. **Given** a pergunta usa um período relativo ("semana passada", "mês passado"), **When** a Kurisu
   responde, **Then** ela resolve o intervalo em UTC-3 (America/Sao_Paulo), não em UTC do servidor.
3. **Given** dois itens casam com a pergunta, **When** a Kurisu ordena, **Then** o item mais recente
   tende a vir primeiro (peso de recência).

---

### User Story 2 - Recuperar o que escrevi no diário sobre um tema (Priority: P1)

O Gustavo pergunta "o que eu escrevi no diário sobre minha carreira?" ou "como eu estava me sentindo
em abril?". A Kurisu recupera os bullets de diário (Violet) relevantes e responde citando as datas.

**Why this priority**: O diário é a memória pessoal mais rica; recuperá-lo por tema/sentimento é um
dos maiores valores da memória unificada.

**Independent Test**: Com bullets conhecidos sobre um tema, perguntar pelo tema e verificar que a
resposta reflete bullets reais, citando datas, sem inventar.

**Acceptance Scenarios**:

1. **Given** existem bullets de diário sobre o tema, **When** o usuário pergunta, **Then** a Kurisu
   recupera bullets reais e cita as datas de quando foram escritos.
2. **Given** não há bullets sobre o tema, **When** o usuário pergunta, **Then** a Kurisu diz que não
   encontrou nada no diário sobre isso (mesma honestidade da 027/FR-004).

---

### User Story 3 - Recuperar consumo de mídia ("que filmes vi em maio?") (Priority: P2)

O Gustavo pergunta "que filmes eu vi em maio?", "que livros li este ano?", "que animes terminei?". A
Kurisu recupera os logs de Akane/Frieren/Marin/Mai do período e responde, com notas/datas quando há.

**Why this priority**: Valor real de recall, mas secundário em relação a atividade e diário.

**Acceptance Scenarios**:

1. **Given** há logs de mídia num período, **When** o usuário pergunta por aquele período/domínio,
   **Then** a Kurisu lista os itens reais consumidos, com data e nota quando disponíveis.

---

### User Story 4 - Manter a memória fresca automaticamente (Priority: P1 — prerequisito habilitador)

Um job agendado sincroniza, toda noite, os dados novos/alterados de cada domínio do Postgres para a
store da Kurisu — sem o Gustavo fazer nada. Itens removidos na origem somem da memória.

**Why this priority**: Sem o sync, a memória fica velha e "o que fiz esta semana" perde sentido. É o
que habilita US1–US3 de forma contínua.

**Independent Test**: Criar uma tarefa/bullet novo, rodar o ciclo de sync, e verificar que ele fica
consultável; depois apagar o item na origem, rodar o sync, e verificar que ele saiu da memória.

**Acceptance Scenarios**:

1. **Given** um item novo foi criado num domínio, **When** o ciclo de sync roda, **Then** o item fica
   consultável pela Kurisu.
2. **Given** um item foi apagado na origem, **When** o sync roda, **Then** ele é removido da memória.
3. **Given** o sync calcula que removeria mais de 50% dos documentos de um domínio num único passe,
   **When** isso acontece, **Then** o sync **aborta a remoção** e registra um alerta (trava
   anti-catástrofe), tratando como provável defeito e não como remoção legítima.
4. **Given** a sincronização roda, **When** ela termina, **Then** os dados de origem (tabelas dos
   agentes) permanecem inalterados — a escrita ocorre só na store da memória.

---

### Edge Cases

- **Período relativo ambíguo** ("recentemente"): a Kurisu deve assumir uma janela razoável (ex.: ~30
  dias) e ser explícita sobre o intervalo que usou.
- **Domínio vazio/esparso**: se não houve atividade no período, responder "nada registrado nesse
  período" em vez de inventar.
- **Dado sensível**: finanças/diário são indexados no corpus operacional do Vertex (tradeoff
  aceito); o corpus é privado ao projeto GCP e acessível só pela service account — nunca público.
- **Fuso horário**: datas derivadas de `TIMESTAMPTZ` devem usar `America/Sao_Paulo` (UTC-3), nunca a
  data UTC do container (ver CLAUDE.md — bug histórico da Violet).
- **Item editado na origem**: a versão nova substitui a antiga na memória no próximo sync (incremental
  por hash), sem duplicar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST ingerir, na store da Kurisu, os dados gerados nos domínios do Postgres:
  finanças (Nami), tarefas (Kaguya), diário (Violet), pessoas (Komi), livros (Frieren), filmes
  (Akane), animes (Marin) e séries (Mai).
- **FR-002**: A ingestão MUST ser **somente leitura** sobre as tabelas de origem — nunca alterar os
  dados dos agentes; escreve apenas no corpus operacional (separado) da Kurisu.
- **FR-003**: A representação MUST ser **mista por domínio**: resumos datados para atividade (tarefas
  concluídas) e finanças; itens individuais para bullets de diário e itens de mídia; uma entrada por
  pessoa para os contatos (Komi).
- **FR-004**: Cada documento gerado MUST carregar `doc_date` (data local UTC-3), `domain` e
  `source_ref` (identidade da linha de origem) para citação e para o peso de recência.
- **FR-005**: A recuperação MUST aplicar **peso de recência** em consultas temporais, de modo que, em
  empate de relevância, o conteúdo mais recente seja priorizado.
- **FR-006**: Um **job agendado** MUST sincronizar os domínios periodicamente (noturno), de forma
  **incremental** (só linhas novas/alteradas desde o último watermark/hash).
- **FR-007**: O sync MUST remover da memória os documentos cujas linhas de origem foram apagadas,
  **exceto** quando a remoção atingiria >50% dos documentos de um domínio num único passe — nesse
  caso MUST abortar a remoção e registrar alerta (trava anti-catástrofe).
- **FR-008**: O corpus operacional do Vertex que recebe o conteúdo dos domínios (inclusive
  diário/finanças) MUST ser privado ao projeto GCP do usuário — acessível somente pela service
  account do projeto, nunca público nem compartilhado. (A indexação na nuvem do Google é um tradeoff
  aceito pelo usuário; o controle de acesso é a contrapartida obrigatória.)
- **FR-009**: A memória unificada MUST viver num **corpus Vertex AI RAG separado** (distinto do
  corpus da wiki da 027, para isolar o ciclo de vida do refresh). A tool **`buscar_na_base`** da 027
  (FunctionTool com reranker — **não** a `VertexAiRagRetrieval`) MUST ser estendida para consultar
  **ambos** os corpora (wiki + operacional) em toda pergunta, de modo que a Kurisu responda de forma
  unânime sobre wiki + dados operacionais.
- **FR-010**: Datas MUST ser derivadas e exibidas em `America/Sao_Paulo` (UTC-3), nunca na data UTC
  do servidor.
- **FR-011**: A Kurisu MUST citar a origem operacional de forma legível (ex.: "tarefa concluída em
  DATA", "bullet de DATA", "filme visto em DATA, nota N"), distinguindo-a das citações da wiki.

### Key Entities *(include if feature involves data)*

- **Domain exporter**: o componente (um por domínio) que lê as tabelas de um agente (somente leitura)
  e renderiza as linhas em documentos de texto para a memória.
- **Documento de atividade/resumo**: documento datado sintetizado (ex.: "atividade de DATA": tarefas
  concluídas; "gastos da semana de DATA"). Unidade de recall temporal.
- **Documento individual**: um bullet de diário, um item de mídia, ou uma pessoa — cada um com data e
  `source_ref` próprios.
- **Watermark de sync**: por domínio, o marcador (timestamp/hash) do último item sincronizado, usado
  para a ingestão incremental.
- **Corpus operacional Vertex AI RAG**: um corpus **separado** do corpus da wiki da 027 (mesmo
  Serverless mode e mesmo embedding multilíngue), dedicado aos documentos operacionais — cada um com
  `source_type`/`domain`, `doc_date`, `source_ref` e `content_hash` no metadado (citação, recência,
  sync incremental). A tool `buscar_na_base` consulta este corpus **e** o da wiki.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para "o que fiz na semana de DATA" com atividade conhecida, ≥90% das respostas refletem
  os itens reais daquele intervalo, com as datas corretas em UTC-3.
- **SC-002**: Um item novo (tarefa/bullet/log) criado na origem fica consultável pela Kurisu dentro de
  um ciclo de sync (≤24h).
- **SC-003**: Um item apagado na origem deixa de aparecer nas respostas após o próximo sync, em 100%
  dos casos de teste.
- **SC-004**: O corpus do Vertex é privado ao projeto — em 100% dos testes de acesso, nenhuma
  identidade fora da service account do projeto consegue ler o conteúdo indexado (sem exposição
  pública).
- **SC-005**: O sync nunca remove >50% dos documentos de um domínio num único passe (a trava dispara em
  100% dos cenários de teste que ultrapassam o limite).
- **SC-006**: Em consultas temporais com itens de datas diferentes igualmente relevantes, o item mais
  recente aparece antes em ≥90% dos casos.

## Assumptions

- A fundação da **027** (Vertex AI RAG em Serverless mode, ingester, tool `buscar_na_base` com
  reranker) está implementada — a 028 depende dela e a estende (corpus operacional separado + busca
  multi-corpus).
- As tabelas de cada agente são legíveis a partir do container `makima-web` (mesmo `DATABASE_URL`),
  onde o job de sync roda (lê o Postgres e sobe os documentos para o Vertex).
- Usuário único (Gustavo); interação em português via Telegram; datas em UTC-3.
- O volume de dados operacionais é compatível com o Vertex RAG (centenas a poucos milhares de
  documentos, crescendo devagar) — dentro de quotas/custo de embedding gerenciado.

## Out of Scope

- **Write-back**: a Kurisu não escreve de volta nos domínios (não cria tarefas, não edita o diário) —
  é memória somente leitura. (Sugerir ação cross-agent fica para futuro.)
- **Frescor em tempo real**: a memória é atualizada por ciclo de sync, não instantaneamente.
- **A wiki**: a ingestão da camada `wiki/` é a **027** (corpus separado, fonte diferente).
- **Indexar a camada `raw/`** da wiki.
- Tornar o corpus público ou compartilhá-lo fora do projeto GCP do usuário (ver FR-008/SC-004).

## Restrições Técnicas (decididas)

- **Corpus**: um corpus Vertex AI RAG **separado** do corpus da wiki da 027 (mesma fundação:
  **Serverless mode**, vector DB `RagManagedVertexVectorSearch`, embedding `text-multilingual-embedding-002`).
  Corpus separado porque a 027 atualiza a wiki via `--recreate` (recria o corpus do zero, ID novo) —
  compartilhar destruiria os dados operacionais a cada refresh da wiki. `doc_date`, `source_ref` e
  `content_hash` vão no metadado de cada documento importado. A env var do corpus operacional é
  distinta da `VERTEX_RAG_CORPUS` da wiki (ex.: `VERTEX_RAG_CORPUS_OPERACIONAL`).
- **Embeddings**: gerenciados pelo Vertex (mesma pipeline da 027: `text-multilingual-embedding-002`
  via `embedding_model_config`, Serverless mode) — o conteúdo (inclusive diário/finanças) é enviado
  ao Vertex/GCS; o corpus operacional é privado ao projeto (FR-008).
- **Exporters por domínio**: leitura **somente leitura** das tabelas dos agentes; cada exporter
  renderiza para texto seguindo a representação mista (resumo vs. individual) e sobe os documentos
  para o corpus.
- **Sync**: job agendado rodando **no container** `makima-web` (onde o `DATABASE_URL` resolve para
  ler as tabelas); incremental por watermark/hash por domínio; prune com trava ≤50%. O destino da
  escrita é o **corpus operacional separado** (via GCS + `rag.import_files` para novos/alterados e
  `rag.delete_file` para removidos), não o Postgres. Como é um corpus distinto da wiki, o delete-file
  granular do sync **não** colide com o `--recreate` da 027. Item editado: `delete_file` + reimport
  (o Vertex de-dup por URI, então só reimportar com o mesmo nome não atualiza o chunk antigo).
- **Recência**: o Vertex RAG não aplica decaimento por data nativamente. O peso de recência
  (FR-005/SC-006) MUST ser aplicado **pós-recuperação** — a Kurisu reordena por `doc_date` (do
  metadado) os candidatos retornados, ou filtra por janela temporal quando a pergunta é por período
  (lição do `recency_score` do Odysseus). *Wrinkle a detalhar no `/speckit-plan`.*
- **Fuso**: derivação de data via `AT TIME ZONE 'America/Sao_Paulo'` (CLAUDE.md) na leitura das
  tabelas, nunca data UTC do container; o `doc_date` gravado no metadado já é a data local UTC-3.

## Dependencies

- **Spec 027** (Kurisu — base de conhecimento): fornece a fundação Vertex AI RAG em **Serverless
  mode**, o ingester e a FunctionTool **`buscar_na_base`** (com reranker). A 028 cria um **corpus
  operacional separado**, estende `buscar_na_base` para consultar os dois corpora, e adiciona os
  exporters + o sync agendado. A 028 não pode ser implementada antes da 027.
