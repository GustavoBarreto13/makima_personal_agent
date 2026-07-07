# Feature Specification: Corrigir bugs de backend e frontend da Mai (séries de TV)

**Feature Branch**: `055-mai-bugfixes`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "Corrigir os bugs encontrados na auditoria da Mai (agente de séries
de TV), backend e frontend, sem criar branch. Backend: crash HTTP 500 ao re-adicionar série
removida (índice único não filtra deleted); 9 violações de timezone UTC onde a convenção do
repo exige America/Sao_Paulo (data default da sessão, date_finished, date_started, ano das
stats, heatmap, airing_status derivado, skip-logic do sync); estatísticas tratam séries
deletadas de forma incoerente entre agregados (somas incluem, destaque exclui); falta de
atomicidade (tools fazem múltiplos commits independentes); tratamento de erro inconsistente
quando a chave do TMDB falta; N+1 queries em assistindo-agora. Frontend: 10 ocorrências de
toISOString() para 'hoje' (proibido pelo CLAUDE.md — após 21h a sessão cai no dia seguinte),
sem dateUtils próprio; mutações sem tratamento de erro (status, nota, excluir, sync — sucesso
fantasma); toast de sync mente sobre o resultado; erros de rede renderizados como lista vazia;
telas não recarregam após registrar sessão (Home, Detalhe, Diário); pôster permanentemente
vazio no Diário; bloco de estado vazio inalcançável na Home; funções órfãs (posterUrl),
enum de view morta (search); catálogo trunca silenciosamente em 100 séries. Docs: TMDB
documentado como v4 Bearer em dois arquivos mas o código usa api_key v3; regra do contador
COUNT documentada mas violada por log_watch; campo source documentado com valores errados;
rating_source ausente da tabela; status nao_lancada omitido; tools/colunas prometidas sem
implementação (tags); date_finished 'inferida' que nunca é inferida."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Datas corretas no fuso do usuário (Priority: P1)

Como usuário em UTC-3, quero que toda data "de hoje" — o default do modal de registrar sessão,
as datas otimistas ao marcar episódios, os rótulos "hoje"/"ontem", os badges HOJE da agenda,
o heatmap e as datas gravadas pelo backend (início, conclusão, sessão) — use o meu horário
local, e não UTC. Hoje, depois das ~21h, registrar uma sessão grava a data de amanhã.

**Why this priority**: É corrupção silenciosa de dados em uso diário — o mesmo bug histórico
da Violet, proibido explicitamente pela convenção do repositório. São 10 ocorrências no
frontend e 9 no backend.

**Independent Test**: Com o relógio local após as 21h, abrir o modal de registrar sessão e
confirmar que a data default é o dia atual local; registrar e confirmar que a sessão aparece
no diário na data local correta.

**Acceptance Scenarios**:

1. **Given** horário local 22h (UTC-3), **When** o usuário abre o modal de registrar sessão,
   **Then** o campo de data vem preenchido com a data local de hoje e o teto do campo não
   permite data futura em relação ao dia local.
2. **Given** horário local 22h, **When** o usuário marca um episódio como assistido pelo
   acordeão de temporadas, **Then** a data registrada é o dia local de hoje.
3. **Given** um episódio que estreia hoje (data local), **When** a agenda de próximos
   episódios é exibida, **Then** o badge "HOJE" aparece no grupo correto em qualquer horário.
4. **Given** uma série concluída às 23h locais, **When** o status muda para concluída,
   **Then** a data de conclusão gravada é o dia local, não o dia seguinte.
5. **Given** sessões registradas ao longo do ano, **When** o heatmap e a sparkline são
   exibidos, **Then** cada sessão soma no dia local em que foi registrada.

---

### User Story 2 - Re-adicionar uma série removida sem erro (Priority: P1)

Como usuário, quero poder adicionar de volta uma série que removi do catálogo. Hoje isso
causa um erro interno (a remoção é lógica, mas a restrição de unicidade do identificador
externo não considera itens removidos), e a operação falha com erro 500.

**Why this priority**: É um crash reprodutível em um fluxo natural (remover por engano e
adicionar de novo), sem mensagem útil e sem caminho de recuperação pela interface.

**Independent Test**: Adicionar uma série, removê-la, adicioná-la novamente e confirmar que
ela volta ao catálogo sem erro (idealmente preservando o histórico anterior).

**Acceptance Scenarios**:

1. **Given** uma série removida do catálogo, **When** o usuário a adiciona novamente pela
   busca, **Then** a série volta a aparecer no catálogo sem erro.
2. **Given** a série re-adicionada, **When** o usuário abre o detalhe, **Then** o histórico
   de sessões anterior à remoção é preservado (a remoção é lógica).
3. **Given** uma série ativa já no catálogo, **When** o usuário tenta adicioná-la de novo,
   **Then** o sistema informa que ela já existe (comportamento atual mantido).

---

### User Story 3 - Feedback de erro em todas as ações (Priority: P2)

Como usuário, quero saber quando uma ação falhou. Hoje mudar status, dar nota, excluir série
e sincronizar metadados não tratam falha (a ação parece ter funcionado mas pode não ter
persistido — "sucesso fantasma"); o aviso de sincronização anuncia "atualizados!" antes de os
dados chegarem; e erros de rede nas telas de leitura aparecem como lista vazia,
indistinguíveis de "sem dados".

**Why this priority**: Mina a confiança no app — o usuário só descobre a falha depois, e a
tela vazia por erro de rede sugere que o acervo sumiu.

**Independent Test**: Simular falha de rede, executar cada mutação (status, nota, excluir,
sync, mover da watchlist) e confirmar aviso de erro com estado revertido; carregar cada tela
de leitura offline e confirmar mensagem de erro com opção de tentar de novo.

**Acceptance Scenarios**:

1. **Given** falha de rede, **When** o usuário muda o status, dá nota, exclui uma série ou
   inicia uma série da watchlist, **Then** um aviso de erro é exibido e o estado visual
   reverte (nenhum item some da tela sem ter sido persistido).
2. **Given** uma sincronização de metadados em andamento, **When** ela conclui com sucesso,
   **Then** o aviso de sucesso só aparece depois de os dados novos estarem na tela; em caso
   de falha, um aviso de erro é exibido.
3. **Given** falha de rede ao carregar catálogo, diário, watchlist, agenda ou episódios,
   **When** a tela renderiza, **Then** o usuário vê um estado de erro com ação de tentar
   novamente — não a mensagem de coleção vazia.

---

### User Story 4 - Telas atualizadas após registrar sessão (Priority: P2)

Como usuário, quero que ao registrar uma sessão as telas reflitam imediatamente: o progresso
e as sessões recentes no detalhe, o hero e a atividade na Home, e a lista do Diário. Hoje
nada recarrega — a sessão só aparece ao sair e voltar.

**Why this priority**: O feedback imediato é o que confirma que a ação funcionou; a tela
desatualizada induz a registrar de novo (duplicando a sessão).

**Independent Test**: Registrar uma sessão a partir da Home, do detalhe e do Diário e
confirmar que cada tela atualiza sem navegação manual.

**Acceptance Scenarios**:

1. **Given** o detalhe de uma série aberto, **When** o usuário registra uma sessão, **Then**
   o progresso, o próximo episódio e as sessões recentes atualizam na hora.
2. **Given** a Home aberta, **When** o usuário registra uma sessão pelo hero, **Then** o
   hero, a atividade recente e os números atualizam.
3. **Given** o Diário aberto, **When** o usuário registra uma sessão pelo botão da tela,
   **Then** a nova sessão aparece na lista imediatamente.

---

### User Story 5 - Estatísticas coerentes e acervo completo (Priority: P3)

Como usuário, quero que os números do ano sejam coerentes entre si — hoje séries removidas
entram nas somas (episódios, gêneros, emissoras) mas nunca podem ser o destaque do ano — e
que o catálogo mostre todo o acervo (hoje trunca silenciosamente em 100 séries).

**Why this priority**: Incoerência visível só com acervo grande ou remoções; menos urgente
que os fluxos diários.

**Acceptance Scenarios**:

1. **Given** uma série removida com sessões no ano, **When** as estatísticas do ano são
   exibidas, **Then** uma única política vale para todos os blocos (totais, gêneros,
   emissoras e destaque contam — ou não contam — o histórico da série removida de forma
   uniforme e documentada).
2. **Given** um acervo com mais de 100 séries, **When** o catálogo carrega, **Then** todas
   as séries aparecem (ou há paginação explícita) — nada é truncado em silêncio.

---

### User Story 6 - Interface sem elementos mortos (Priority: P3)

Como usuário, não quero ver espaços decorativos sem função: a coluna de pôster do Diário é
sempre vazia (o dado existe na API mas a tela não o usa), e há um bloco de estado vazio na
Home que nunca pode aparecer (condição impossível).

**Acceptance Scenarios**:

1. **Given** o Diário com sessões, **When** a lista renderiza, **Then** cada linha mostra o
   pôster da série (ou a coluna é removida — decisão registrada).
2. **Given** o código da Home, **When** revisado, **Then** não há blocos inalcançáveis nem
   funções/tipos órfãos remanescentes (helper de pôster não usado, view de busca morta).

---

### User Story 7 - Robustez e documentação fiéis ao código (Priority: P3)

Como mantenedor, quero que cada operação do agente seja atômica (hoje uma tool emite vários
commits independentes — falha no meio deixa estado parcial), que a falta da chave do TMDB
produza erro consistente (hoje ora retorna erro claro, ora falha em silêncio), e que a
documentação da Mai reflita o código real.

**Acceptance Scenarios**:

1. **Given** uma falha no meio de registrar sessão ou marcar episódios, **When** a operação
   aborta, **Then** nenhuma escrita parcial persiste (tudo-ou-nada).
2. **Given** a chave do TMDB ausente, **When** qualquer operação que depende dela roda,
   **Then** o erro retornado é claro e consistente entre as operações.
3. **Given** a documentação da Mai, **When** comparada ao código, **Then** não restam as
   divergências catalogadas: versão da API do TMDB (dois documentos dizem v4 Bearer, o código
   usa chave v3), regra do contador de episódios, valores reais do campo de origem,
   coluna de fonte da nota ausente, status de série omitido, recursos prometidos sem
   implementação e módulo de calendário não documentado.

---

### Edge Cases

- Sessão registrada exatamente à meia-noite local: deve cair no novo dia local.
- Re-adição de série removida que mudou de nome/metadados no TMDB: re-sincronizar os
  metadados ao restaurar.
- Falha de rede no meio de "marcar temporada": o estado visual dos episódios deve reverter
  por completo, não ficar metade marcado.
- Acervo exatamente no limite de página (100): garantir que nenhum item é omitido.
- Estatísticas de um ano em que TODAS as sessões são de séries removidas: blocos devem seguir
  a política única (tudo ou nada), sem mistura.
- Duas abas abertas registrando sessões: a atualização pós-mutação de uma aba não precisa
  refletir na outra em tempo real (fora de escopo), mas recarregar deve convergir.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Toda derivação de "hoje" na interface da Mai DEVE usar o dia local do usuário
  (UTC-3), via helper local único no padrão já existente no projeto — nas 10 ocorrências
  catalogadas (modal de sessão: default e teto do campo; datas otimistas de episódio e
  temporada; rótulos relativos e badges HOJE da Home e da agenda; sparkline).
- **FR-002**: Toda derivação de data no backend da Mai (data default de sessão, datas de
  início/conclusão, ano-alvo e fim do heatmap das estatísticas, decisão lançado/agendado,
  skip-logic do sync) DEVE usar o fuso America/Sao_Paulo, conforme a convenção do repositório.
- **FR-003**: Re-adicionar uma série previamente removida DEVE restaurar o registro (remoção
  é lógica) com metadados re-sincronizados, sem erro; a restrição de unicidade não pode
  causar falha interna nesse fluxo.
- **FR-004**: Toda mutação da interface (status, nota, excluir, sincronizar, iniciar da
  watchlist, registrar sessão) DEVE tratar falha com aviso visível ao usuário e reversão do
  estado otimista; avisos de sucesso só DEVEM aparecer após a conclusão real.
- **FR-005**: Telas de leitura DEVEM distinguir erro de carregamento de coleção vazia,
  oferecendo nova tentativa.
- **FR-006**: Registrar uma sessão DEVE atualizar as telas visíveis afetadas (detalhe, Home,
  Diário) sem navegação manual.
- **FR-007**: As estatísticas anuais DEVEM aplicar uma política única e documentada para
  séries removidas em todos os agregados.
- **FR-008**: O catálogo NÃO PODE truncar silenciosamente o acervo; o limite deve ser
  explícito (paginação ou carga completa).
- **FR-009**: O Diário DEVE exibir o pôster de cada série (dado já disponível) ou a coluna
  decorativa deve ser removida; blocos inalcançáveis e órfãos catalogados DEVEM ser removidos.
- **FR-010**: Cada operação de escrita do agente DEVE ser atômica (uma transação por
  operação); falha no meio não pode deixar escrita parcial.
- **FR-011**: A ausência da chave do TMDB DEVE produzir erro claro e consistente em todas as
  operações dependentes.
- **FR-012**: A documentação da Mai (agente, webapp e raiz) DEVE ser corrigida nas
  divergências catalogadas na auditoria (D1–D8), incluindo documentar ou remover o módulo de
  calendário órfão.

### Key Entities

- **Série**: item do catálogo com remoção lógica; re-adição restaura o mesmo registro.
- **Sessão (diário)**: registro de exibição com data local do usuário.
- **Episódio**: unidade marcável com data local de visualização.
- **Estatísticas anuais**: agregados derivados que devem seguir política única para removidos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sessões registradas a qualquer hora do dia local caem na data local correta em
  100% dos casos (testado nos limites 21h–00h).
- **SC-002**: Re-adicionar uma série removida funciona em 100% das tentativas, sem erro
  interno, preservando o histórico.
- **SC-003**: Nenhuma mutação da interface falha em silêncio: em teste com rede cortada,
  100% das ações exibem aviso de erro e revertem o estado.
- **SC-004**: Após registrar uma sessão, as telas afetadas refletem a mudança sem navegação
  manual em 100% dos casos.
- **SC-005**: Os blocos das estatísticas anuais são mutuamente coerentes (mesma política para
  removidos) — zero divergência entre totais, rankings e destaque para o mesmo conjunto.
- **SC-006**: Acervos com mais de 100 séries exibem todos os itens.
- **SC-007**: Zero divergências doc↔código remanescentes da lista da auditoria.

## Assumptions

- O helper de data local do frontend segue o padrão canônico já existente no projeto
  (equivalente ao da Violet), criado como utilitário próprio da Mai ou compartilhado.
- Na re-adição de série removida, a semântica escolhida é restaurar o registro existente
  (preserva histórico de sessões e episódios), não criar um duplicado.
- A política para séries removidas nas estatísticas é INCLUIR o histórico em todos os
  agregados (a remoção lógica preserva sessões por design); o destaque do ano passa a
  considerá-las também.
- O aviso/toast de erro reutiliza o mecanismo já existente no shell da Mai.
- A correção do modelo de progresso (sessões × episódios marcados × contador) NÃO é desta
  spec — é o objeto da spec 056 (progresso e diário unificados).
