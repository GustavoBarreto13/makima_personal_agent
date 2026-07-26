# Research — Violet: Conselho do Dia

## R1 — Onde a lógica mora

**Decisão**: `agents/kurisu/counsel.py`, módulo irmão de `agents/kurisu/tutor.py`.

**Rationale**: a feature é fundamentalmente RAG (ler a base de conhecimento pessoal e citar
fontes), e a Kurisu já é a dona desse domínio (Constitution, Princípio I). É exatamente o
precedente da spec 031: "o tutor **é** a Kurisu — persona + gancho futuro com a memória
unificada (spec 028)". Aqui a relação é análoga: a *voz* que aparece na tela é a da Violet
(no prompt de síntese), o *conhecimento e a lógica de recuperação* são da Kurisu.

**Alternatives considered**:
- `agents/journal/tools.py` — rejeitado: o plano `PLANO_VIOLET_EVERGARDEN.md` (pendente,
  não executado) declara explicitamente "sem novas tools em `tools.py`" para o rename
  `agents/journal → agents/violet`; colocar a lógica aqui colidiria com esse plano e
  misturaria RAG com o domínio "CRUD de bullets".
- Um agente novo `agents/violet/` com `agent.py` próprio — rejeitado por Minimal Footprint
  (Princípio V): não há domínio genuinamente novo, e o Evergarden já cobre "dar personalidade
  à Violet" como tarefa separada e menor.

## R2 — Busca web como complemento: restrição real da API

**Decisão**: a etapa de busca web é uma **chamada Gemini separada**, sem `response_schema`,
cujo texto de saída (mais qualquer URL do `grounding_metadata`, se disponível) alimenta a
etapa de síntese como contexto adicional.

**Rationale**: no `google-genai`, a tool `google_search` (grounding) e
`response_mime_type: application/json` + `response_schema` **não podem ser usados na mesma
chamada** — é uma restrição de produto da API, não uma escolha de implementação. Todas as
chamadas estruturadas existentes no repo (`agents/kurisu/tutor.py`, `agents/lucy/tools.py`)
usam `response_schema` e nenhuma usa `google_search`; não há precedente a seguir, então a
integração da web é desenhada como uma etapa isolada e condicional.

**Alternatives considered**:
- Uma única chamada com `google_search` e pedir JSON via instrução de prompt (sem
  `response_schema`) — rejeitado: perde a validação estrutural que todo o resto do pipeline
  depende (parsing de erros vira ad-hoc, sem o `_normalize_*` server-side já usado no Tutor).
- Não fazer busca web nenhuma nesta fase — rejeitado: contradiz explicitamente a User Story 3
  da spec, que é parte do escopo aprovado (ainda que P3/opcional na ordem de entrega).

## R3 — Orçamento de latência (SC-007: ≤60s em 95%)

**Decisão**: limitar a etapa de recuperação a no máximo 4 consultas a `buscar_na_base`
(derivadas da etapa de extração de temas) e a **no máximo 1** chamada de busca web,
disparada só quando a cobertura do RAG for insuficiente (nenhum corpus com `status == "ok"`,
ou menos de 2 trechos relevantes agregados).

**Rationale**: o pipeline inteiro é síncrono dentro da request HTTP (sem background job no
webapp — `webapp/CLAUDE.md` confirma que todos os endpoints de domínio são `def` síncronos,
rodando no threadpool do Starlette). Cada chamada a `buscar_na_base` já faz 2 round-trips ao
Vertex (um por corpus: wiki + operacional) mais o reranker; 4 consultas + 2 chamadas Gemini
(temas + síntese) + 1 busca web condicional é o teto que ainda cabe confortavelmente em 60s
com folga para variação de latência de rede.

**Alternatives considered**:
- Deixar o número de consultas dinâmico (uma por "problema identificado", sem teto) —
  rejeitado: risco real de estourar os 60s em dias com múltiplos temas no mesmo bullet.
- Processar em background e o frontend fazer polling — rejeitado por Minimal Footprint: o
  webapp não tem nenhuma infra de job em background hoje; introduzir uma só para esta feature
  seria desproporcional a um produto de uso pessoal, single-user.

## R4 — Reuso das leituras da Kaguya

**Decisão**: `agents.kaguya.tools_tasks.list_tasks_today()` e
`agents.kaguya.tools_habits.list_habits()`, chamadas em modo leitura, import lazy dentro de
`counsel.py` (mesmo padrão de import lazy já usado por `agents/journal/tools.py` para
`agents.komi.tools`).

**Rationale**: ambas as funções já existem, já retornam exatamente o estado do dia (tarefas
de hoje; hábitos com sua tendência/consistência) e são as fontes que o próprio webapp usa
para renderizar as telas Hoje/Hábitos da Kaguya — nenhuma tool nova precisa ser criada na
Kaguya, e a Kaguya continua sem saber que o conselho existe (Self-Contained Agents).

**Alternatives considered**: consultar a tabela `tasks`/`habits` diretamente via SQL dentro de
`counsel.py` — rejeitado: duplicaria a lógica de "o que conta como tarefa de hoje" (recorrência
virtual, etc.) que já vive nas tools da Kaguya.

## R5 — Persistência: uma linha por dia

**Decisão**: `journal_counsel.page_id` é `UNIQUE`; a gravação usa
`INSERT ... ON CONFLICT (page_id) DO UPDATE SET ...`.

**Rationale**: espelha exatamente a regra de negócio da spec ("regerar sobrescreve, nunca
acumula") sem precisar de lógica de aplicação para decidir insert-vs-update — o banco garante
a invariante. É o padrão mais simples que resolve FR-002/SC-005.

**Alternatives considered**: `SELECT` prévio + `UPDATE`/`INSERT` condicional em Python —
rejeitado: mais código, mesma garantia, e uma corrida de duas requisições simultâneas (baixa
probabilidade em uso single-user, mas gratuita de evitar) ficaria mais frágil.

## R6 — Continuidade entre dias

**Decisão**: ao gerar um novo conselho, ler os 3 conselhos mais recentes **anteriores** à data
analisada (via `created_at DESC LIMIT 3`, excluindo o próprio dia), passando só `mirror` +
`question` + os textos de `actions_json` — não o payload de coleta inteiro.

**Rationale**: atende FR-005 com o menor payload possível — o objetivo é continuidade
narrativa ("você mencionou algo parecido anteriormente"), não reprocessar dados brutos já
resumidos nos próprios conselhos anteriores.

## R7 — Cartas lacradas participam da leitura

**Decisão**: nenhuma exclusão especial — `journal_letters` do dia (rascunho ou lacrada) entram
na coleta como qualquer outro sinal.

**Rationale**: decisão de produto já confirmada com o usuário (ver spec, seção Assumptions) —
o conselho compartilha o mesmo espaço de confiança do restante do diário. Tecnicamente não
exige nada além de incluir a tabela na query de coleta.

## R8 — Falha não persiste nada

**Decisão**: toda a coleta + chamadas de IA acontecem **antes** de abrir qualquer transação de
escrita; o `INSERT ... ON CONFLICT` só roda depois que a resposta da etapa de síntese já foi
validada contra o schema esperado.

**Rationale**: mesmo padrão de `agents/kurisu/tutor.py::analisar_escrita` (FR-010 da spec 031)
— replicado aqui para FR-015 desta spec. Evita qualquer estado parcial/corrompido em caso de
falha de rede, quota ou JSON malformado.
