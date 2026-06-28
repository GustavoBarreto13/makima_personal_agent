# Feature Specification: Kurisu — Assistente de Base de Conhecimento

**Feature Branch**: `027-kurisu-knowledge-base` (diretório de spec; nenhuma branch criada — regra do usuário)

**Created**: 2026-06-26

**Status**: Draft

**Input**: User description: "Kurisu — agente de knowledge base (Vertex AI RAG sobre vault Obsidian)"

> **Decisões de escopo confirmadas com o usuário (2026-06-26):**
> 1. **Fonte de conhecimento:** a base curada "Knowledge Base Karpathy" (a wiki pessoal mantida via skill `obsidian-wiki`) — **não** o vault Obsidian geral, nem o diário Violet.
> 2. **Personalidade:** **persona única** no v1 (Kurisu Makise — direta, rigorosa, levemente sarcástica). Os dois modos Tutora/Amiga ficam fora do v1.
> 3. **Permissões:** **somente leitura** no v1 — Kurisu recupera e responde, nunca cria nem edita notas.
> 4. **Mecanismo (decidido):** **Vertex AI RAG Engine** (Google Cloud) — a camada `wiki/`
>    (+ `index.md`) é ingerida num corpus do Vertex e consultada via `VertexAiRagRetrieval`. Só a
>    camada `wiki/` é ingerida na 027; os demais dados do Postgres (diário, tarefas, etc.) entram na
>    **spec 028**. Detalhes em *Restrições Técnicas*.

## Clarifications

### Session 2026-06-26

- Q: Quando a base curada não tem material relevante, o que a Kurisu faz? → A: Responde com conhecimento geral, mas sinalizando explicitamente que não veio da base (confirma FR-004).
- Q: Como a Kurisu cita a origem da resposta (a base é wiki + fontes raw)? → A: Cita a(s) página(s) do wiki (concept/entity/source/overview) por título e menciona a fonte raw subjacente quando fizer diferença.
- Q: Qual mecanismo de recuperação a Kurisu usa? → A: **Vertex AI RAG Engine** (Google Cloud) com embedding multilíngue gerenciado; a Kurisu consulta o corpus via `VertexAiRagRetrieval`. (Decisão: o usuário aceita usar a nuvem do Google para a memória — ver também spec 028.)
- Q: O que entra no corpus na 027? → A: **Somente a camada `wiki/`** (386 páginas sintetizadas) + `index.md`. O `raw/` (≈192 fontes brutas) fica fora — cada source-page já guarda `source_path: raw/...`, então o raw é citável sem ser embeddado. (Os dados do Postgres entram na 028.)
- Q: Como o corpus é atualizado quando a wiki muda? → A: Re-execução do ingester sobre a wiki atual — a versão nova de uma página passa a ser a recuperada. (O Vertex RAG de-duplica por URI da fonte, então refletir edições exige re-importar a página alterada / rebuild do corpus — ver *Restrições Técnicas*.)

> **Nota de design:** a "Knowledge Base Karpathy" é, por filosofia própria, uma wiki *compilada e
> interligada* — `raw/` (fontes imutáveis) → `wiki/` (páginas sintetizadas) → `index.md` (mapa). O
> v1 ingere a camada `wiki/` (a compilação já destilada) num índice RAG vetorial em vez de navegar
> a wiki em tempo real; isso troca a navegação por `index.md` por busca semântica, mantendo a
> citação ancorada nas páginas sintetizadas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Perguntar e receber resposta ancorada na minha base (Priority: P1)

O Gustavo manda uma pergunta em português no Telegram ("O que eu sei sobre React hooks?",
"Resume o que eu tenho sobre embeddings"). A Makima reconhece que é uma pergunta de
conhecimento/estudo e encaminha para a Kurisu. A Kurisu busca o material relevante na base
curada, sintetiza uma resposta clara e indica de qual(is) nota(s)/fonte(s) a resposta veio.

**Why this priority**: É a razão de existir da Kurisu. Sem isso, não há funcionalidade — é o
MVP mínimo que entrega valor. Transforma a base de conhecimento parada num interlocutor que o
usuário consulta por linguagem natural.

**Independent Test**: Com a base já contendo notas sobre um tema conhecido, perguntar sobre esse
tema e verificar que a resposta (a) é fiel ao conteúdo das notas e (b) atribui a resposta às
notas reais de onde veio. Testável sozinho, sem nenhuma outra história.

**Acceptance Scenarios**:

1. **Given** a base tem uma ou mais notas sobre o tema perguntado, **When** o usuário pergunta
   sobre esse tema, **Then** a Kurisu responde sintetizando o conteúdo dessas notas e cita
   pelo menos uma fonte real da base.
2. **Given** a pergunta chega no Telegram, **When** o assunto é conhecimento/estudo/memória de
   notas, **Then** a Makima encaminha para a Kurisu (e não para outro agente).
3. **Given** a resposta é longa, **When** a Kurisu responde, **Then** o texto usa formatação
   HTML do Telegram (listas, <b>negrito</b>) em vez de um bloco corrido, em português.

---

### User Story 2 - Honestidade quando a base não tem a resposta (Priority: P2)

O Gustavo pergunta sobre um tema que não está coberto na base curada. A Kurisu não inventa uma
fonte nem finge que veio das notas: ela deixa explícito que não encontrou nada na base e, se
optar por responder com conhecimento geral, sinaliza isso claramente.

**Why this priority**: Confiabilidade. Uma assistente de conhecimento que mistura "o que está
nas minhas notas" com "o que o modelo sabe" sem distinguir destrói a confiança na ferramenta.
Logo após o caminho feliz, este é o requisito que torna a Kurisu confiável.

**Independent Test**: Perguntar sobre um tema comprovadamente ausente da base e verificar que a
resposta declara explicitamente a ausência (ex.: "Não encontrei nada na sua base sobre isso").

**Acceptance Scenarios**:

1. **Given** a base não tem material relevante, **When** o usuário pergunta sobre o tema,
   **Then** a Kurisu afirma explicitamente que não encontrou nada na base antes de qualquer
   resposta com conhecimento geral.
2. **Given** a base tem apenas material tangencialmente relacionado, **When** a Kurisu responde,
   **Then** ela não apresenta esse material como se respondesse diretamente à pergunta —
   distingue o que está coberto do que não está.

---

### User Story 3 - Cruzar e sintetizar várias notas (Priority: P3)

O Gustavo faz uma pergunta ampla ("O que eu tenho sobre arquitetura de software?"). A Kurisu
recupera material de várias notas diferentes e conecta os pontos numa resposta coerente, em vez
de despejar trechos isolados.

**Why this priority**: Valor adicional de síntese — é o que diferencia a Kurisu de uma busca
textual simples. Útil, mas o produto já entrega valor sem isso (US1 e US2).

**Independent Test**: Com a base contendo notas de subtemas distintos sob um guarda-chuva comum,
perguntar pelo tema amplo e verificar que a resposta integra mais de uma nota de forma conectada.

**Acceptance Scenarios**:

1. **Given** o tema perguntado aparece em múltiplas notas, **When** a Kurisu responde, **Then**
   a resposta reflete e conecta o conteúdo de mais de uma nota e cita as fontes envolvidas.

---

### User Story 4 - Quiz de revisão sobre um tema das notas (Priority: P3)

O Gustavo pede um quiz ("Me faz um quiz sobre minhas notas de Python"). A Kurisu lê as notas do
tema e gera perguntas de revisão (active recall) baseadas exclusivamente no que está na base.

**Why this priority**: Reforça o papel de tutora de estudo, mas é claramente um extra sobre o
núcleo de pergunta-resposta. Pode ficar para depois sem comprometer o MVP.

**Independent Test**: Pedir um quiz sobre um tema presente na base e verificar que as perguntas
geradas derivam do conteúdo real das notas daquele tema.

**Acceptance Scenarios**:

1. **Given** a base tem notas sobre o tema, **When** o usuário pede um quiz, **Then** a Kurisu
   gera perguntas ancoradas no conteúdo dessas notas.
2. **Given** a base não tem notas sobre o tema, **When** o usuário pede um quiz, **Then** a
   Kurisu informa que não há material suficiente em vez de inventar perguntas.

---

### User Story 5 - Popular e atualizar a base de conhecimento da Kurisu (Priority: P1 — prerequisito habilitador)

O Gustavo roda um processo de ingestão que lê a camada `wiki/` da sua base curada e a sobe para o
índice consultável da Kurisu. Quando a wiki muda (novas páginas, páginas revisadas), ele roda o
mesmo processo de novo para atualizar o índice — de forma incremental, refletindo páginas editadas.

**Why this priority**: É P1 porque **habilita** US1–US4 — sem o índice populado, a Kurisu não tem o
que recuperar. Vem depois de US1 na ordem narrativa porque é a etapa de setup/manutenção que
sustenta o produto, não a interação do dia a dia.

**Independent Test**: Rodar a ingestão sobre a wiki atual e verificar que (a) todas as páginas
elegíveis (camada `wiki/` + `index.md`) ficam presentes no índice e (b) nenhuma página do `raw/`
foi indexada; depois editar uma página, rodar a ingestão de novo e confirmar que a versão nova é a
recuperada.

**Acceptance Scenarios**:

1. **Given** a wiki tem N páginas elegíveis (`wiki/` + `index.md`), **When** a ingestão roda,
   **Then** as N páginas ficam consultáveis e nenhum arquivo de `raw/` é indexado.
2. **Given** o índice já existe e uma página foi editada, **When** o usuário roda a ingestão de novo,
   **Then** uma consulta sobre essa página retorna o conteúdo novo, não o antigo.
3. **Given** a ingestão roda, **When** ela termina, **Then** a base curada de origem (`raw/` e
   `wiki/`) permanece inalterada — a escrita ocorre só no índice consultável.
4. **Given** o índice ainda não foi configurado, **When** o usuário pergunta algo à Kurisu,
   **Then** a Kurisu avisa que a base ainda não está disponível em vez de falhar (ver US2/FR-009).

---

### Edge Cases

- **Base vazia ou ainda não indexada**: a Kurisu deve responder que não há base disponível para
  consultar, sem travar nem produzir resposta falsamente ancorada.
- **Pergunta ambígua** ("me fala sobre aquilo"): a Kurisu deve pedir uma reformulação curta em
  vez de adivinhar e responder sobre o tema errado.
- **Material recém-adicionado ainda não recuperável**: se uma nota foi adicionada há pouco e a
  Kurisu não a encontra, a resposta de "não encontrei" deve ser tratada como o caminho de US2 —
  o usuário não recebe garantia de que a base está atualizada em tempo real.
- **Resultado de baixa relevância**: trechos recuperados com baixa aderência ao tema não devem
  ser tratados como "encontrei" — devem cair no caminho de fallback honesto (US2).
- **Pergunta fora do domínio de conhecimento** (ex.: "lança uma despesa de R$50"): não é
  problema da Kurisu — a Makima deve rotear para o agente certo (Nami). A Kurisu só atua quando
  recebe a pergunta.
- **Termo exato presente literal numa página**: se a pergunta é um nome próprio/identificador que
  aparece verbatim numa página (ex.: "BM25", "Present Perfect"), a Kurisu deve trazer essa página
  mesmo que o entorno semântico seja genérico (ver FR-017).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A Makima MUST encaminhar para a Kurisu perguntas cujo domínio seja conhecimento,
  estudo, conceitos, ou memória das notas do usuário ("o que eu sei/anotei sobre X?").
- **FR-002**: A Kurisu MUST recuperar material relevante da base de conhecimento curada e
  produzir uma resposta ancorada nesse material.
- **FR-003**: A Kurisu MUST atribuir a resposta à(s) página(s) reais do wiki (concept/entity/
  source/overview) de onde o conteúdo veio, citando-as por título, e MUST mencionar a fonte raw
  subjacente (artigo/vídeo/lecture/etc.) quando isso ajudar o usuário a rastrear a origem.
- **FR-004**: Quando a base não tiver material relevante, a Kurisu MUST declarar explicitamente
  essa ausência antes de qualquer conteúdo gerado a partir de conhecimento geral, e MUST NOT
  apresentar conhecimento geral como se viesse da base.
- **FR-005**: A Kurisu MUST operar em modo somente leitura — nunca criar, editar ou remover
  notas, nem alterar a base de conhecimento de qualquer forma.
- **FR-006**: A Kurisu MUST responder em português, em tom de persona única (direta, rigorosa,
  levemente sarcástica), usando formatação HTML do Telegram (`<b>`, `<i>`, `<code>`, `<pre>`) para
  respostas longas — nunca markdown, que o parser do Telegram do projeto não renderiza.
- **FR-007**: A Kurisu MUST integrar conteúdo de múltiplas notas quando o tema perguntado
  estiver distribuído em mais de uma nota, conectando-as numa resposta coerente.
- **FR-008**: A Kurisu MUST gerar perguntas de revisão (quiz) baseadas exclusivamente no
  conteúdo da base quando o usuário pedir, e MUST recusar gerar quiz quando não houver material
  suficiente.
- **FR-009**: A Kurisu MUST tratar a base indisponível ou vazia como um estado válido,
  comunicando-o ao usuário em vez de falhar silenciosamente ou alucinar.
- **FR-010**: A Kurisu MUST pedir reformulação quando a pergunta for ambígua demais para
  determinar o tema, em vez de responder sobre um tema possivelmente errado.
- **FR-011**: O sistema MUST popular o índice consultável da Kurisu a partir da camada `wiki/` da
  base curada (páginas sintetizadas + `index.md`), e MUST NOT indexar a camada `raw/` no v1.
- **FR-012**: A ingestão MUST preservar conteúdo multilíngue (PT/EN/JA) de modo que a recuperação
  funcione independentemente do idioma da página.
- **FR-013**: O sistema MUST ser re-executável para refletir mudanças na wiki — após uma página ser
  editada e o ingester rodar de novo, uma consulta sobre ela MUST retornar o conteúdo novo (não o
  antigo), e páginas removidas da wiki MUST deixar de ser recuperadas. (O *como* — re-import por
  arquivo vs. rebuild do corpus, dada a de-duplicação por URI do Vertex RAG — fica em
  *Restrições Técnicas*.)
- **FR-014**: A ingestão MUST NOT modificar a base curada de origem (nem `raw/` nem `wiki/`) — lê
  da origem e escreve apenas no índice consultável.
- **FR-015**: A ingestão MUST ser operável como passo de setup/manutenção fora do runtime do bot,
  e a Kurisu MUST degradar graciosamente (avisar o usuário) quando o índice ainda não estiver
  configurado.
- **FR-016**: A recuperação MUST buscar mais candidatos do que o nº final usado e reordená-los
  (rerank) antes de responder — a relevância é decidida por ranking, não por um corte de distância
  fixo.
- **FR-017** *(faseado — ver Phasing no plan.md)*: Termos técnicos, nomes próprios e tokens em
  qualquer idioma presentes verbatim numa página MUST ser recuperáveis. **No v1** isso é apoiado por
  recuperação densa (multilíngue) + reranker, com fallback honesto (US2) para o que escapar. A busca
  híbrida plena (densa + termo-exato/BM25, "não puramente vetorial") é entregue na **fase 2**
  (backend Weaviate), sob gatilho de uso real.
- **FR-018** *(faseado)*: Quando a busca não retornar nada relevante, a Kurisu MUST declarar
  ausência de forma honesta (US2). **No v1** a fronteira é o score do reranker (sem fallback por
  keyword dedicado — esse fallback chega com o hybrid da fase 2). (reforça FR-004/US2.)
- **FR-019**: A ingestão MUST gravar, por trecho indexado, a proveniência da página (título/slug +
  caminho do arquivo) e o `source_path: raw/...` da página-fonte, de modo que as citações (FR-003)
  resolvam para arquivos reais.

### Key Entities *(include if feature involves data)*

- **Base de conhecimento**: a wiki compilada e interligada do usuário (a "Knowledge Base
  Karpathy") — fontes brutas imutáveis (`raw/`) integradas numa camada de páginas sintetizadas
  (`wiki/`), navegável por um índice central (`index.md`). É a única fonte autoritativa de onde a
  Kurisu extrai respostas ancoradas.
- **Página do wiki**: a unidade sintetizada de conhecimento (tipo concept, entity, source ou
  overview), com título e metadados (topic, tags, related). É a unidade primária de citação das
  respostas. Cada página rastreia para uma ou mais fontes em `raw/`.
- **Fonte raw**: o material bruto original (artigo, vídeo, lecture, código) sob `raw/`, citado
  como provência mais profunda quando relevante.
- **Índice consultável (corpus Vertex AI RAG)**: o corpus no Vertex AI RAG Engine que a Kurisu
  consulta em runtime (via `VertexAiRagRetrieval`). É construído pela ingestão (US5) e é a única
  coisa que a ingestão escreve; espelha a wiki, mas não é a fonte de verdade — a wiki é. A mesma
  abordagem de corpus é compartilhada com a 028.
- **Pergunta**: a consulta em linguagem natural do usuário sobre conhecimento/estudo/memória.
- **Resposta ancorada**: a saída da Kurisu — síntese fiel ao conteúdo recuperado, com atribuição
  às fontes e demarcação clara entre "veio da base" e "conhecimento geral".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em um conjunto de perguntas de teste cujo tema está na base, 100% das respostas
  citam pelo menos uma página real e existente do wiki (zero citações inventadas).
- **SC-002**: Em um conjunto de perguntas cujo tema está comprovadamente ausente da base, ≥95%
  das respostas sinalizam explicitamente a ausência antes de qualquer conteúdo de conhecimento
  geral.
- **SC-003**: Perguntas de conhecimento/estudo enviadas no Telegram são roteadas para a Kurisu
  (e não para outro agente) em ≥90% dos casos de um conjunto de teste representativo.
- **SC-004**: Para uma pergunta típica de consulta, o usuário recebe a resposta ancorada sem
  precisar de mensagens de follow-up em ≥80% dos casos.
- **SC-005**: A Kurisu nunca modifica a base — em 100% das interações de teste, o conteúdo da
  base permanece inalterado após a conversa.
- **SC-006**: Uma ingestão completa indexa 100% das páginas elegíveis (camada `wiki/` + `index.md`)
  e 0 arquivos de `raw/`.
- **SC-007**: Após editar uma página e rodar a ingestão (rebuild via `--recreate`), uma consulta
  sobre ela retorna o conteúdo novo em 100% dos casos de teste (sem servir a versão antiga).
- **SC-008** *(faseado)*: Num conjunto de consultas que são termos exatos/nomes próprios presentes
  na wiki, a página que contém o termo é retornada em **≥80% no v1** (densa+reranker) e **≥95% na
  fase 2** (hybrid/Weaviate).
- **SC-009**: 100% das páginas citadas nas respostas resolvem para um caminho de arquivo real da
  wiki (nenhuma citação aponta para algo inexistente).

## Assumptions

- A base de conhecimento curada ("Knowledge Base Karpathy") **já existe** e é mantida pelo
  usuário através da skill `obsidian-wiki`; a Kurisu apenas a consulta, não a constrói.
- O mecanismo de recuperação foi decidido: **Vertex AI RAG Engine** (Google Cloud), com embedding
  multilíngue gerenciado (ver *Restrições Técnicas*). A ingestão é re-executável para refletir
  mudanças na wiki.
- Usuário único (Gustavo), interação em português, via Telegram, com a Makima fazendo o
  roteamento entre agentes.
- A atualização do índice de recuperação pode não ser em tempo real; o usuário aceita que notas
  recém-adicionadas possam levar algum tempo até ficarem consultáveis.
- A base já oferece estrutura que a Kurisu pode aproveitar: cada página do wiki tem frontmatter
  padronizado (title, type, topic, tags, related) e existe um `index.md` central que cataloga
  todas as páginas — a Kurisu lê dessa estrutura, não precisa reconstruí-la.

## Out of Scope (v1)

- Dois modos de personalidade (Tutora técnica vs. Amiga pessoal) — v1 tem persona única.
- Qualquer escrita: criar/editar notas, salvar resumos ou anexar reflexões à base.
- Cross-agent com a Kaguya (sugerir tarefa de estudo ao detectar gap) — fica como gancho futuro,
  não implementado no v1.
- Indexar o vault Obsidian geral — fora de escopo.
- Busca na web ou fontes externas como fonte primária de resposta.
- Indexar a camada `raw/` (fontes brutas) — a 027 ingere só a camada `wiki/` sintetizada.
- Ingestão dos dados do Postgres (diário Violet, tarefas, finanças, mídia, pessoas) — é a **spec 028**
  (memória unificada), construída sobre a mesma abordagem Vertex AI RAG da 027.

## Restrições Técnicas (decididas — v1)

Esta seção registra as decisões de implementação já tomadas (a pedido do usuário). O *como*
detalhado fica em `/speckit-plan`; aqui ficam só as escolhas fechadas que restringem o plano.

- **Backend de recuperação**: **Vertex AI RAG Engine** (Google Cloud). Reusa a service account e o
  projeto GCP já usados pelo resto do projeto (BigQuery/backup); depende de
  `google-cloud-aiplatform` (SDK `vertexai.rag`). O corpus vive em `us-central1`.
- **Embeddings**: modelo **multilíngue gerenciado** do Vertex (`text-multilingual-embedding-002`),
  pois a wiki é PT/EN/JA — o text-embedding-005 (focado em inglês) degradaria PT/JA. Embedding de
  documentos (ingestão) e de query (runtime) ficam a cargo do Vertex.
- **LLM**: Gemini 2.5 Flash (inalterado).
- **Corpus**: um corpus único do Vertex RAG (display name `kurisu-karpathy-wiki`), chunking ~512
  tokens / 100 de sobreposição. Cada arquivo é espelhado num bucket GCS antes do
  `rag.import_files`, preservando o caminho relativo (`wiki/concepts/...`) como proveniência.
- **Tool de recuperação**: `VertexAiRagRetrieval` no `agents/kurisu/agent.py` (`rag_corpora`,
  `similarity_top_k`). Para satisfazer FR-016/FR-017/FR-018/SC-008 (rerank + recall de termo
  exato), habilitar **hybrid search** (denso + esparso) e o **ranking/reranker** do RAG Engine —
  o default puramente vetorial não garante o recall de termos literais (BM25, "Present Perfect").
- **Escopo da 027**: camada `wiki/` (≈386 páginas `.md`) + `index.md`; `raw/` excluído.
- **Refresh**: o Vertex RAG de-duplica por URI da fonte — re-importar um arquivo cujo conteúdo
  mudou (mesmo nome) **não** atualiza o chunk antigo sozinho. Para refletir edições (FR-013/SC-007):
  re-importar a página alterada (delete-file + import) ou rebuild do corpus (`--recreate`). O
  ingester atual (`scripts/setup_kurisu_rag.py`) usa rebuild via `--recreate`.
- **Onde roda**: a ingestão da **wiki** lê arquivos locais (Google Drive, `G:\...` no Windows) e fala
  direto com o Vertex/GCS pela internet — **não** depende do Postgres do VPS, então não há o
  *wrinkle* local↔VPS. Roda da máquina do usuário (ou de qualquer host com a service account).
- **Privacidade**: a 027 ingere só a wiki (conteúdo de estudo, não sensível). A inclusão de dados
  sensíveis (diário/finanças) na nuvem é decisão da **028**, aceita pelo usuário.
