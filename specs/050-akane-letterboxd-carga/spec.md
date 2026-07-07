# Feature Specification: Prontidão e execução da carga histórica do Letterboxd (Akane)

**Feature Branch**: `050-akane-letterboxd-carga`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado.
Usuário já possui o export oficial (ZIP) do Letterboxd em mãos, pronto para a carga assim
que as lacunas abaixo forem fechadas.

**Input**: User description: "Fechar as lacunas da importação histórica do Letterboxd
(watched.csv não processado, --no-tmdb vaza na watchlist) e documentar o passo a passo de
execução da carga real do export do usuário no VPS, incluindo validação de idempotência."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar todo o histórico do Letterboxd sem perdas (Priority: P1)

Como usuária que exportou seu histórico completo do Letterboxd, quero importar todos os
filmes que já assisti — inclusive os que não têm nota nem data de diário registrada — para
que minha coleção na Akane reflita fielmente meu histórico real, sem lacunas.

**Why this priority**: O propósito inteiro da carga histórica é ter o catálogo completo;
qualquer arquivo do export ignorado silenciosamente gera uma coleção incompleta sem que a
usuária perceba.

**Independent Test**: Rodar a importação com um export de teste contendo um filme presente
apenas no arquivo de "assistidos" (sem entrada correspondente no diário, nas notas ou nas
resenhas) e confirmar que ele aparece na coleção ao final.

**Acceptance Scenarios**:

1. **Given** um export do Letterboxd com um filme presente apenas na lista geral de
   assistidos (sem data de diário, nota ou resenha), **When** a importação roda, **Then**
   esse filme é adicionado à coleção com status "assistido".
2. **Given** um filme presente tanto no diário (com data e nota) quanto na lista geral de
   assistidos, **When** a importação roda, **Then** o filme aparece uma única vez na coleção,
   com a data e nota do diário preservadas (sem duplicata vinda da lista geral).
3. **Given** a mesma pasta de export é importada duas vezes seguidas, **When** a segunda
   execução termina, **Then** a contagem final de filmes e sessões é idêntica à primeira
   execução (nenhuma duplicata criada).

---

### User Story 2 - Importar apenas metadados do Letterboxd, sem enriquecimento externo (Priority: P3)

Como responsável por rodar a importação, quero poder optar por não consultar nenhuma fonte
de metadados externa durante toda a importação (incluindo a lista de "quero ver"), para
testes rápidos ou execuções sem acesso à internet.

**Why this priority**: É uma opção de conveniência para diagnóstico e testes, não bloqueia
o uso normal do sistema — mas hoje a opção existe pela metade e engana quem a usa.

**Independent Test**: Rodar a importação com a opção de "sem enriquecimento externo" ativada
e confirmar que nenhuma chamada de rede para busca de metadados ocorre, inclusive para os
itens da lista de "quero ver".

**Acceptance Scenarios**:

1. **Given** a opção de importação sem enriquecimento externo está ativada, **When** a
   importação processa a lista de "quero ver" (watchlist), **Then** nenhuma consulta externa
   de metadados é feita para esses itens — o filme é criado só com os dados do próprio export.

---

### User Story 3 - Executar a carga histórica real no ambiente de produção (Priority: P1)

Como responsável pela Akane, quero um roteiro claro para importar o export real do
Letterboxd no ambiente de produção (VPS) e confirmar que a carga foi bem-sucedida, para
popular a coleção sem risco de duplicar dados ou corromper o catálogo existente.

**Why this priority**: É o objetivo final desta spec — sem um roteiro claro e validado, a
carga do histórico real fica bloqueada mesmo com o código corrigido.

**Independent Test**: Seguir o roteiro documentado do início ao fim contra o export real do
usuário e confirmar que a contagem de filmes importados é consistente com o perfil do
Letterboxd do usuário.

**Acceptance Scenarios**:

1. **Given** o export oficial do Letterboxd do usuário e o ambiente de produção acessível,
   **When** o roteiro de importação é seguido, **Then** a coleção reflete o histórico do
   usuário sem erros não tratados interrompendo o processo.
2. **Given** a importação já foi executada com sucesso uma vez, **When** é executada uma
   segunda vez com o mesmo export (validação de segurança), **Then** nenhum dado é duplicado.

### Edge Cases

- Filme do export sem correspondência encontrada na fonte de metadados externa (TMDB): a
  importação MUST continuar, criando o filme apenas com os dados do próprio export do
  Letterboxd (título, ano), sem interromper o restante do lote.
- Arquivo do export ausente ou vazio (ex.: usuária nunca usou resenhas): a importação MUST
  pular esse arquivo sem erro, processando os demais normalmente.
- Filme adicionado manualmente antes da importação (sem vínculo com o Letterboxd) que
  também aparece no export: comportamento de deduplicação nesse cruzamento é documentado
  como limitação conhecida (ver Assumptions), não é requisito bloqueante desta spec.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A importação histórica MUST processar a lista geral de "assistidos" do
  export do Letterboxd, adicionando à coleção qualquer filme que não tenha entrada
  correspondente nos demais arquivos do export (diário, notas, resenhas).
- **FR-002**: A importação histórica MUST permanecer idempotente após a mudança do FR-001 —
  executar a importação múltiplas vezes sobre o mesmo export MUST produzir o mesmo resultado
  final, sem duplicar filmes ou sessões.
- **FR-003**: A opção de importação sem enriquecimento externo MUST se aplicar
  uniformemente a todas as categorias de item do export, incluindo a lista de "quero ver".
- **FR-004**: Deve existir um roteiro documentado, passo a passo, para executar a carga
  histórica real no ambiente de produção, incluindo como confirmar que a carga foi
  bem-sucedida e como validar que uma reexecução não duplica dados.

### Key Entities

- **Export do Letterboxd**: pacote de arquivos (diário, notas, resenhas, lista de "quero
  ver", lista geral de assistidos) gerado pela ferramenta oficial de exportação do
  Letterboxd, usado como fonte da carga histórica.
- **Filme (na importação)**: item potencialmente presente em múltiplos arquivos do export;
  deve ser consolidado em um único registro na coleção, com a data/nota mais completa
  disponível entre as fontes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos filmes presentes em qualquer arquivo do export de teste (incluindo os
  presentes apenas na lista geral de assistidos) aparecem na coleção após a importação.
- **SC-002**: Repetir a importação do mesmo export duas vezes resulta em contagem de filmes
  e sessões idêntica entre a primeira e a segunda execução, em 100% dos testes.
- **SC-003**: Com a opção "sem enriquecimento externo" ativada, zero consultas de metadados
  externos ocorrem durante toda a importação, incluindo a watchlist.
- **SC-004**: A carga real do export do usuário é concluída no ambiente de produção com a
  contagem final de filmes coerente com o perfil público do usuário no Letterboxd (variação
  aceitável apenas para filmes privados/removidos).

## Assumptions

- O usuário já possui o export oficial (ZIP) do Letterboxd em mãos — esta spec cobre o
  código e o roteiro de execução, não a obtenção do export.
- Deduplicação entre um filme cadastrado manualmente (sem vínculo com o Letterboxd) e o
  mesmo filme vindo do export é uma limitação conhecida e aceitável nesta spec — pode gerar
  uma entrada duplicada nesse cruzamento específico; reconciliação mais robusta fica como
  melhoria futura.
- A execução da carga em produção roda dentro do container da aplicação no VPS (mesma
  restrição de rede documentada no CLAUDE.md raiz: hostname do banco não resolve fora do
  container).
- Bugs de comportamento do sync automático (RSS) que também afetam qualidade de dados
  (data, nota, alertas de falha) são tratados na spec 049, não nesta — esta spec foca na
  importação histórica via arquivo.
