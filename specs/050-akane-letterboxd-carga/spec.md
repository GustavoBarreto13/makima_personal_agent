# Feature Specification: Carga histórica do Letterboxd e correção de dados (Akane)

**Feature Branch**: `050-akane-letterboxd-carga`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado.
Usuário já possui o export oficial (ZIP) do Letterboxd em mãos, pronto para a carga assim
que as lacunas abaixo forem fechadas. Escopo ampliado em 2026-07-27: além da carga em si,
a spec passou a cobrir a correção de dados depois de importados (metadados errados,
duplicatas, edição manual, ordem de sessões no mesmo dia).

**Input**: User description: "Fechar as lacunas da importação histórica do Letterboxd
(watched.csv não processado, --no-tmdb vaza na watchlist) e documentar o passo a passo de
execução da carga real do export do usuário no VPS, incluindo validação de idempotência."
Ampliação (2026-07-27): "A página do filme deve ter um botão para rebuscar dados — a carga
inicial já deve vir certa, mas o botão deve permitir corrigir dados errados depois. Os
dados do filme devem vir em inglês, não em português. Os dados devem vir do Letterboxd, mas
deve ser possível atualizar pela interface da Akane tudo que eu quiser — anotações, notas,
etc. Ter um sistema pra não duplicar entradas, por exemplo por data + título ou algo do
tipo. Apesar de não ter horário nos logs, deve existir a ordem de adição para filmes
assistidos no mesmo dia."

## Clarifications

### Session 2026-07-27

- Q: Para filmes que aparecem SÓ no watched.csv (sem entrada em diary/reviews/ratings), como a
  importação deve registrá-los? → A: Só marca o filme como assistido — cria/atualiza apenas a
  linha em `movies` (status='watched'), sem criar `diary_entries`. `last_watched_date` e
  `times_watched` permanecem vazios para esses filmes por falta de data confiável na fonte.
- Q: A ação de rebuscar metadados no detalhe do filme — o que fazer quando o resultado
  encontrado é diferente do que está salvo? → A: Sobrescreve os campos de catálogo e permite
  escolher outro candidato quando o filme foi associado ao título errado; nunca toca em dado
  pessoal (nota, coração, anotações, sessões, listas, cofre).
- Q: Hoje a deduplicação usa só `letterboxd_uri`/`tmdb_id` informado pelo chamador, e um filme
  cadastrado manualmente reaparece duplicado quando a importação o encontra depois. Qual
  chave usar? → A: Identificador externo (TMDB) como chave primária de identidade, com
  fallback para título normalizado + ano quando não há identificador; ao reencontrar um filme
  existente, funde nele em vez de criar um novo registro.
- Q: Qual o escopo de edição manual pela interface? → A: Filme (campos de catálogo e campos
  pessoais) e cada sessão do diário (data, nota, resenha, tags, revisão); o Cofre fica fora
  deste escopo.
- Q: Como registrar a ordem de sessões no mesmo dia, já que o export não traz horário? → A:
  A importação preserva a ordem das linhas do export como ordem de criação das sessões; a
  interface ganha um controle para reordenar sessões do mesmo dia quando vier errado.

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

---

### User Story 4 - Corrigir os dados de um filme importado errado (Priority: P1)

Como usuária que já importou seu histórico, quero poder rebuscar os dados de um filme
diretamente na sua página de detalhe, para corrigir metadados errados (sinopse no idioma
errado, filme associado ao título errado) sem precisar apagar e reimportar nada.

**Why this priority**: a carga inicial deve vir certa, mas nenhuma fonte externa é perfeita —
sem um jeito de corrigir um item pontual, um erro de match vira permanente.

**Independent Test**: abrir o detalhe de um filme com metadados desatualizados ou incorretos,
acionar a busca de dados, e confirmar que os campos de catálogo são atualizados sem alterar
nota, coração, anotações, sessões, listas ou itens do Cofre daquele filme.

**Acceptance Scenarios**:

1. **Given** um filme com sinopse salva em português, **When** a busca de dados é acionada,
   **Then** a sinopse (e demais metadados de catálogo) passa a vir em inglês.
2. **Given** um filme que foi associado ao título errado durante a importação, **When** a
   busca de dados é acionada, **Then** é possível escolher, entre os candidatos encontrados,
   o filme correto, substituindo o vínculo anterior.
3. **Given** um filme com nota, coração, anotações e sessões registradas, **When** a busca de
   dados é acionada, **Then** nenhum desses dados pessoais é alterado ou perdido.
4. **Given** a fonte externa de metadados está indisponível, **When** a busca de dados é
   acionada, **Then** o registro permanece inalterado e o erro é comunicado, sem interromper
   o restante da navegação.

---

### User Story 5 - Editar manualmente filme e sessões (Priority: P1)

Como usuária, quero poder editar qualquer campo de um filme e de suas sessões de assistência
pela interface da Akane, para corrigir informações que a importação ou o enriquecimento
externo trouxeram erradas ou incompletas.

**Why this priority**: sem edição manual, qualquer dado que a fonte externa não resolva bem
fica permanentemente errado na coleção.

**Independent Test**: editar o título, ano, diretor, duração, gêneros e sinopse de um filme, e
editar a data, nota, resenha, tags e flag de revisão de uma sessão existente; confirmar que as
mudanças persistem e que os agregados do filme (data da sessão mais recente, total de sessões)
refletem a edição.

**Acceptance Scenarios**:

1. **Given** um filme com metadados incompletos ou incorretos, **When** a usuária edita
   título, ano, diretor, duração, gêneros ou sinopse pela interface, **Then** os novos valores
   são salvos e exibidos.
2. **Given** uma sessão já registrada, **When** a usuária edita sua data, nota, resenha, tags
   ou a flag de revisão, **Then** a sessão reflete os novos valores.
3. **Given** a data de uma sessão é alterada para uma data mais recente que a sessão mais
   recente atual do filme, **When** a edição é salva, **Then** a data da sessão mais recente e
   o total de sessões do filme são recalculados de acordo.

---

### User Story 6 - Não duplicar filmes entre fontes (Priority: P1)

Como usuária que cadastra filmes manualmente e também importa do Letterboxd, quero que o
mesmo filme nunca apareça duas vezes na coleção, para que minha cinemateca reflita um
catálogo único e confiável.

**Why this priority**: uma coleção com duplicatas silenciosas quebra a confiança em qualquer
estatística ou lista gerada a partir dela.

**Independent Test**: cadastrar um filme manualmente, depois importar um export do Letterboxd
que contém esse mesmo filme, e confirmar que a coleção passa a ter um único registro para ele,
agora também vinculado ao Letterboxd.

**Acceptance Scenarios**:

1. **Given** um filme já cadastrado manualmente, **When** a importação encontra o mesmo filme
   no export, **Then** o registro existente é atualizado (ganhando o vínculo com o Letterboxd)
   em vez de um novo registro ser criado.
2. **Given** dois filmes com o mesmo título e ano mas sem correspondência confiável na fonte
   externa de metadados, **When** a importação roda, **Then** o comportamento de deduplicação
   por título normalizado e ano é aplicado, com o risco de falso positivo entre remakes
   documentado como limitação conhecida (ver Edge Cases).

---

### User Story 7 - Ordem correta de sessões no mesmo dia (Priority: P2)

Como usuária que às vezes assiste mais de um filme no mesmo dia, quero que a ordem em que
assisti apareça corretamente no meu histórico, e poder corrigi-la quando vier errada, para que
meu diário reflita a sequência real das sessões.

**Why this priority**: sem ordem confiável dentro do dia, o histórico de maratonas fica
embaralhado — mas isso não bloqueia o uso normal do diário, por isso prioridade P2.

**Independent Test**: importar um export com três sessões no mesmo dia e confirmar que
aparecem na mesma ordem das linhas do export; em seguida, reordenar essas sessões pela
interface e confirmar que a nova ordem persiste.

**Acceptance Scenarios**:

1. **Given** um export com múltiplas sessões no mesmo dia, **When** a importação roda,
   **Then** as sessões aparecem no histórico na mesma ordem em que estavam no export.
2. **Given** sessões do mesmo dia em uma ordem incorreta, **When** a usuária reordena essas
   sessões pela interface, **Then** a nova ordem é salva e refletida no histórico.

### Edge Cases

- Filme do export sem correspondência encontrada na fonte de metadados externa (TMDB): a
  importação MUST continuar, criando o filme apenas com os dados do próprio export do
  Letterboxd (título, ano), sem interromper o restante do lote.
- Arquivo do export ausente ou vazio (ex.: usuária nunca usou resenhas): a importação MUST
  pular esse arquivo sem erro, processando os demais normalmente.
- Filme adicionado manualmente antes da importação que também aparece no export: MUST ser
  reconhecido como o mesmo filme e fundido em um único registro (ver User Story 6) — deixou
  de ser uma limitação aceitável nesta spec.
- Fonte externa de metadados indisponível durante uma correção pontual (busca de dados no
  detalhe do filme): o registro MUST permanecer inalterado e o erro MUST ser comunicado, sem
  interromper a navegação.
- Filme sem identificador externo e sem ano confiável: a deduplicação cai para título
  normalizado isoladamente, com risco assumido de falso positivo entre remakes/homônimos —
  limitação conhecida (ver Assumptions).
- Edição da data de uma sessão para um dia que já tem outra sessão do mesmo filme: MUST ser
  tratada como uma nova ocorrência naquele dia (mesma regra de ordenação da User Story 7),
  não como erro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A importação histórica MUST processar a lista geral de "assistidos" do
  export do Letterboxd, adicionando à coleção qualquer filme que não tenha entrada
  correspondente nos demais arquivos do export (diário, notas, resenhas). Esse filme é
  registrado apenas como filme com status "assistido" — sem criar sessão (`diary_entries`),
  já que este arquivo não traz uma data de visualização confiável.
- **FR-002**: A importação histórica MUST permanecer idempotente após a mudança do FR-001 —
  executar a importação múltiplas vezes sobre o mesmo export MUST produzir o mesmo resultado
  final, sem duplicar filmes ou sessões.
- **FR-003**: A opção de importação sem enriquecimento externo MUST se aplicar
  uniformemente a todas as categorias de item do export, incluindo a lista de "quero ver".
- **FR-004**: Deve existir um roteiro documentado, passo a passo, para executar a carga
  histórica real no ambiente de produção, incluindo como confirmar que a carga foi
  bem-sucedida e como validar que uma reexecução não duplica dados.
- **FR-005**: Toda consulta a fontes externas de metadados MUST retornar os dados em inglês.
- **FR-006**: A página de detalhe de um filme MUST oferecer uma ação que rebusca os metadados
  de catálogo na fonte externa e sobrescreve os campos existentes, preservando integralmente
  os dados pessoais do filme (nota, coração, anotações, sessões, listas, Cofre).
- **FR-007**: Essa ação MUST permitir escolher, entre os candidatos encontrados, qual
  corresponde ao filme correto, para os casos em que a correspondência automática foi errada.
- **FR-008**: Todos os campos de catálogo (título, ano, diretor, duração, gêneros, sinopse) e
  pessoais (nota, coração, status, anotações) de um filme MUST ser editáveis pela interface.
- **FR-009**: Cada sessão do diário MUST ser editável (data, nota, resenha, tags, flag de
  revisão); a edição MUST recalcular os agregados do filme afetados (data da sessão mais
  recente, total de sessões).
- **FR-010**: A identidade de um filme MUST ser resolvida por identificador externo (TMDB)
  como chave primária, com fallback para título normalizado + ano quando não há
  identificador; ao reencontrar um filme já existente por qualquer uma dessas vias, a
  importação/adição MUST fundir no registro existente em vez de criar um novo.
- **FR-011**: A importação MUST preservar a ordem das linhas do export como ordem de criação
  das sessões dentro de um mesmo dia.
- **FR-012**: A interface MUST permitir reordenar, dentro de um mesmo dia, as sessões
  existentes.

### Key Entities

- **Export do Letterboxd**: pacote de arquivos (diário, notas, resenhas, lista de "quero
  ver", lista geral de assistidos) gerado pela ferramenta oficial de exportação do
  Letterboxd, usado como fonte da carga histórica.
- **Filme (na importação)**: item potencialmente presente em múltiplos arquivos do export;
  deve ser consolidado em um único registro na coleção, com a data/nota mais completa
  disponível entre as fontes. Quando a única fonte é a lista geral de assistidos (sem data
  confiável), o filme entra apenas com status "assistido", sem sessão associada. Identidade
  resolvida por identificador externo, com fallback para título normalizado + ano — o mesmo
  filme nunca gera dois registros, seja vindo do export ou cadastrado manualmente.
- **Sessão (diário)**: registro de uma vez em que um filme foi assistido; deixou de ser
  imutável — é editável (data, nota, resenha, tags, revisão) e, dentro de um mesmo dia,
  ordenável pela usuária quando o export não permite inferir a ordem real de forma confiável.

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
- **SC-005**: 100% dos filmes com metadados rebuscados (via User Story 4) passam a exibir
  sinopse e gêneros em inglês.
- **SC-006**: Após acionar a busca de dados em um filme, zero dados pessoais (nota, coração,
  anotações, sessões, listas, Cofre) são alterados ou perdidos, em 100% das execuções.
- **SC-007**: Importar um export cujo conteúdo já existe no catálogo por cadastro manual não
  aumenta a contagem final de filmes — o registro existente é fundido, não duplicado.
- **SC-008**: Para um dia com múltiplas sessões, a ordem exibida no histórico corresponde à
  ordem do export em 100% dos casos testados, e é ajustável manualmente quando necessário.

## Assumptions

- O usuário já possui o export oficial (ZIP) do Letterboxd em mãos — esta spec cobre o
  código e o roteiro de execução, não a obtenção do export.
- Quando não há identificador externo confiável nem ano, a deduplicação recai sobre título
  normalizado isoladamente — um risco residual de falso positivo entre remakes/homônimos é
  aceito nesse caso específico (ver Edge Cases); fora desse caso, a fusão de registros
  (User Story 6) é requisito, não mais uma limitação aceitável.
- A execução da carga em produção roda dentro do container da aplicação no VPS (mesma
  restrição de rede documentada no CLAUDE.md raiz: hostname do banco não resolve fora do
  container).
- Bugs de comportamento do sync automático (RSS) que também afetam qualidade de dados
  (data, nota, alertas de falha) são tratados na spec 049, não nesta — esta spec foca na
  importação histórica via arquivo.
