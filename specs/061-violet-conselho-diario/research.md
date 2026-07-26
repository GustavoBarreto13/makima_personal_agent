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

## R9 — Correção pós-produção: wiki era expulsa pela memória operacional, e citação por
URI falhava (achado em produção, 2026-07-27)

**Sintoma reportado**: em todo teste real do usuário, o bloco "Da sua base" só mostrava itens
marcados como vindos da web — nunca da wiki curada, mesmo com material claramente relevante
disponível (confirmado consultando a wiki isoladamente).

**Causa raiz #1 — recência favorece sistematicamente a memória operacional.**
`buscar_na_base` (usada originalmente por `_consultar_rag`) mescla a wiki (027) com a memória
operacional (028, principalmente bullets antigos do diário) e reordena por
`recency.aplicar_recencia`: em empate de score, o conteúdo mais recente vence. Páginas da wiki
têm `doc_date = None` (`date.min` no desempate); bullets antigos sempre têm uma data real
recente. Na prática, isso empurra a wiki para fora do corte de `_TOP_N_NARROW` (5) **dentro**
de `buscar_na_base`, antes mesmo do resultado chegar em `counsel.py` — nenhuma reordenação
posterior recupera o que já foi cortado.

**Decisão**: nova função `buscar_na_wiki(query)` em `agents/kurisu/tools.py` — consulta **só**
o corpus da wiki (sem merge, sem a disputa de recência entre fontes de natureza diferente).
`_consultar_rag` passa a chamá-la primeiro; só recorre à `buscar_na_base` (wiki + operacional)
como complemento se a wiki sozinha render menos de `_MIN_TRECHOS_WIKI = 2` trechos — e mesmo
assim sem descartar o que a wiki já trouxe. Confirmado com o usuário: a wiki curada deve ser
priorizada, não apenas empatada com a memória operacional.

**Causa raiz #2 — copiar uma uri inteira é frágil para o modelo.** Mesmo quando a wiki
sobrevivia ao corte, o Gemini às vezes falhava em ecoar a `uri` do trecho exatamente (medido
em teste: ~33% de falha em 6 tentativas) — e a checagem de honestidade, corretamente,
reclassificava esses itens como "web" por não conseguir confirmar a fonte.

**Decisão**: o schema de síntese não pede mais `fonte`/`uri` como texto livre — pede
`trecho_index` (inteiro, o número `[N]` já usado na numeração do prompt) e, só quando
`trecho_index = 0` (não veio de nenhum trecho listado), um `fonte_web` curto. `fonte`/`uri` do
item final vêm **sempre** de `rag_trechos[trecho_index - 1]` no servidor — nunca do texto do
modelo. Um inteiro pequeno é muito mais fácil do modelo acertar do que uma uri de 70+
caracteres; testado de novo após a mudança: 8/8 itens corretamente atribuídos à base, contra
4/6 antes.

**Alternatives considered**: aumentar `_TOP_N_NARROW` ou o limiar de relevância em
`recency.py` para dar mais espaço à wiki — rejeitado por afetar globalmente `buscar_na_base`
(usada também pela Kurisu no Telegram e pela spec 028), quando o problema é específico de como
o Conselho do Dia usa o resultado. Fuzzy-matching de uri (similaridade de string em vez de
igualdade exata) — rejeitado: mais uma fonte de falso positivo, contra o espírito de honestidade
da feature; o índice numérico resolve a causa raiz sem introduzir ambiguidade nova.
