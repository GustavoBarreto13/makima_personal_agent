# Feature Specification: Corrigir os bugs da auditoria da Komi (pessoas e contatos)

**Feature Branch**: `058-komi-bugfixes`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "Corrigir os bugs encontrados na auditoria da Komi, backend e
frontend, sem criar branch. Frontend: editar/remover uma data importante pelo perfil sempre
falha porque o resumo da pessoa não devolve o identificador da data (a requisição sai com
'undefined'), e pelo mesmo motivo o selo de sincronização de aniversário nunca aparece;
campos esvaziados na edição de pessoa nunca são limpos no servidor (telefone, notas,
cidade… e principalmente remover a foto — o preview limpa mas a foto volta ao recarregar);
editar a pessoa estando no próprio perfil não atualiza a tela; falhas ao salvar apelidos e
datas são engolidas sem aviso; modais sem fechamento por Esc nem focus trap. Backend:
apelido fica preso para sempre depois de excluir a pessoa (índice único global não considera
o soft delete e a mensagem de erro aponta para a pessoa excluída); excluir um bullet do
diário deixa vínculos fantasma com pessoas (contagem inflada e risco de reciclagem de id);
contagem de vínculos considera itens já excluídos; card de aniversários do Hub usa a data
UTC do servidor; nomes de coluna interpolados sem allow-list na atualização de pessoa;
busca não escapa curingas de LIKE; visão geral carrega o histórico completo de todos os
domínios sem limite para achar uma única interação; data única salva como MM-DD fica
invisível no calendário. Documentação: docstrings e CLAUDE.md divergentes do código."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Editar e remover datas importantes pelo perfil (Priority: P1)

Como usuário, quero editar ou remover uma data importante (aniversário, data comemorativa)
diretamente do perfil da pessoa — hoje os botões de editar e excluir existem, mas **toda
tentativa falha**, porque o resumo que alimenta o perfil não devolve o identificador da
data, e a requisição sai malformada.

**Why this priority**: Funcionalidade central completamente quebrada: os controles estão
visíveis e nunca funcionam. Também impede o selo de sincronização de aniversário (com a
agenda) de aparecer no perfil, escondendo uma feature que existe e funciona no servidor.

**Independent Test**: Abrir o perfil de uma pessoa com uma data cadastrada, editar o rótulo
e a data, salvar e confirmar a alteração; depois excluir a data e confirmar que sumiu.

**Acceptance Scenarios**:

1. **Given** o perfil de uma pessoa com uma data importante, **When** o usuário edita rótulo
   ou data e salva, **Then** a alteração persiste e o perfil reflete o novo valor.
2. **Given** o perfil com uma data, **When** o usuário a exclui, **Then** ela some do perfil
   e das próximas datas — e, se estava sincronizada com a agenda, o lembrete correspondente
   também é removido.
3. **Given** um aniversário sincronizado com a agenda, **When** o perfil renderiza,
   **Then** o selo de sincronização aparece na data (hoje nunca aparece).
4. **Given** falha na edição/exclusão, **When** a operação aborta, **Then** o usuário vê
   aviso de erro (nunca falha silenciosa).

---

### User Story 2 - Limpar campos ao editar uma pessoa (Priority: P1)

Como usuário, quero conseguir **apagar** o conteúdo de um campo opcional ao editar uma
pessoa (telefone, e-mail, redes, cidade, notas) e **remover a foto** — hoje o campo
esvaziado é simplesmente omitido do envio e o valor antigo permanece no servidor: o preview
da foto limpa na tela, o usuário salva acreditando que removeu, e a foto volta ao recarregar.

**Why this priority**: Perda de controle sobre os próprios dados com feedback enganoso (a
interface confirma uma remoção que não aconteceu). Dados pessoais desatualizados ou
indesejados ficam impossíveis de apagar pela interface.

**Independent Test**: Editar uma pessoa com telefone e foto preenchidos, apagar o telefone e
remover a foto, salvar, recarregar e confirmar que ambos continuam vazios.

**Acceptance Scenarios**:

1. **Given** uma pessoa com um campo opcional preenchido, **When** o usuário esvazia o campo
   e salva, **Then** o campo fica vazio no servidor e permanece vazio ao recarregar.
2. **Given** uma pessoa com foto, **When** o usuário remove a foto e salva, **Then** a foto
   é removida de fato e não reaparece.
3. **Given** um campo não tocado na edição, **When** o usuário salva, **Then** o valor
   existente é preservado (limpar só acontece por ação explícita).

---

### User Story 3 - Feedback de erro e tela atualizada após editar (Priority: P2)

Como usuário, quero que qualquer falha ao salvar seja avisada e que a tela reflita
imediatamente o que salvei — hoje falhas ao adicionar apelidos e datas dentro do modal de
edição são engolidas (o modal fecha "com sucesso" e o item não existe), e editar a pessoa
estando no próprio perfil deixa o perfil mostrando os dados antigos até navegar para fora e
voltar.

**Why this priority**: "Sucesso fantasma" corrói a confiança: o usuário acha que salvou um
apelido que já pertencia a outra pessoa, ou vê o nome antigo no perfil que acabou de editar.

**Independent Test**: Adicionar a uma pessoa um apelido que já pertence a outra e confirmar
o aviso de erro; editar o nome de uma pessoa a partir do perfil e confirmar que o cabeçalho
atualiza sem navegar.

**Acceptance Scenarios**:

1. **Given** um apelido que já pertence a outra pessoa, **When** o usuário tenta adicioná-lo
   no modal de edição, **Then** vê aviso claro com o motivo (incluindo a quem pertence) e o
   restante da edição não é perdido.
2. **Given** falha ao adicionar uma data no modal, **When** a operação aborta, **Then** o
   usuário é avisado (nunca fecha "com sucesso" com o item ausente).
3. **Given** o perfil aberto, **When** o usuário edita a pessoa e salva, **Then** o perfil
   (cabeçalho, contatos, notas, datas, apelidos) reflete os novos dados imediatamente.
4. **Given** qualquer modal da Komi aberto, **When** o usuário pressiona Esc, **Then** o
   modal fecha; o foco fica contido no modal enquanto aberto (focus trap).

---

### User Story 4 - Excluir uma pessoa sem prender os apelidos dela (Priority: P2)

Como usuário, quero poder excluir uma pessoa e, no futuro, recadastrá-la (ou cadastrar outra
com o mesmo apelido) — hoje o apelido da pessoa excluída fica **reservado para sempre**: a
exclusão é lógica mas a unicidade do apelido é global, então re-adicionar o apelido falha
com uma mensagem que aponta para a própria pessoa excluída, e não existe forma de liberar o
apelido pela interface.

**Why this priority**: Mesmo padrão do crash de re-adição da Mai (spec 055): exclusão lógica
brigando com unicidade global. Sem correção, apelidos viram recurso não renovável.

**Independent Test**: Criar pessoa com apelido, excluí-la, criar outra pessoa e adicionar o
mesmo apelido — deve funcionar sem erro.

**Acceptance Scenarios**:

1. **Given** uma pessoa excluída que tinha um apelido, **When** o usuário adiciona o mesmo
   apelido a outra pessoa, **Then** a operação funciona (apelidos de pessoas excluídas não
   bloqueiam).
2. **Given** um apelido que pertence a uma pessoa **ativa**, **When** o usuário tenta
   adicioná-lo a outra, **Then** o erro continua, nomeando a dona ativa do apelido.
3. **Given** a busca inteligente (smart-match), **When** consulta apelidos, **Then** apelidos
   de pessoas excluídas não geram matches.

---

### User Story 5 - Vínculos e contagens íntegros (Priority: P2)

Como usuário, quero que as contagens de vínculos e o hub da pessoa reflitam apenas itens que
existem — hoje excluir um bullet do diário deixa o vínculo com a pessoa para trás (vínculo
fantasma que infla contagens e, como o identificador do bullet pode ser reciclado, pode
futuramente vincular a pessoa a um texto alheio), e a contagem de vínculos do diretório
considera itens já excluídos (a pessoa mostra "1 vínculo" cujo detalhe é vazio).

**Why this priority**: Integridade de dados com risco real de associação errada (id
reciclado). As contagens incoerentes minam a utilidade do diretório.

**Independent Test**: Vincular uma pessoa a um bullet do diário, excluir o bullet e
confirmar que o vínculo sumiu e a contagem da pessoa voltou ao valor anterior.

**Acceptance Scenarios**:

1. **Given** um bullet do diário vinculado a uma pessoa, **When** o bullet é excluído,
   **Then** o vínculo com a pessoa é removido na mesma operação (nada fica para trás).
2. **Given** uma pessoa cujo único vínculo é um item já excluído (transação, tarefa, livro),
   **When** o diretório exibe a contagem de vínculos, **Then** a contagem é coerente com o
   que o hub da pessoa mostra (não conta itens excluídos).
3. **Given** vínculos fantasma pré-existentes no banco, **When** a correção é aplicada,
   **Then** os fantasmas existentes são saneados (limpeza retroativa).

---

### User Story 6 - Robustez do backend e documentação fiel (Priority: P3)

Como usuário e mantenedor, quero que os pontos frágeis do backend sejam corrigidos: o card
de aniversários do Hub usa a data UTC do servidor para decidir o mês (na virada do mês, à
noite, conta o mês errado — viola a convenção do repo); a atualização de pessoa monta a
query interpolando nomes de coluna sem lista branca (injeção latente quando chamada pelo
agente com chaves arbitrárias); a busca não escapa curingas (buscar "_" casa qualquer
inicial); a visão geral do diretório carrega o histórico completo de todos os domínios para
achar a última interação de cada pessoa (custo cresce com o banco inteiro); uma data única
(não recorrente) salva só com mês e dia fica invisível no calendário sem qualquer aviso; e
docstrings/CLAUDE.md divergem do código em vários pontos.

**Why this priority**: Nenhum quebra fluxo hoje, mas são bugs latentes (injeção, virada de
mês, escala) e dívidas de documentação que confundem manutenção futura.

**Independent Test**: Verificar que o card de aniversários usa a data local; que atualizar
pessoa com chave de campo inválida é rejeitado; que a busca por termos com curingas trata os
caracteres literalmente; e que a visão geral responde com custo proporcional ao número de
pessoas.

**Acceptance Scenarios**:

1. **Given** a noite de virada de mês no fuso local, **When** o Hub calcula "aniversários
   este mês", **Then** usa a data em America/Sao_Paulo (convenção do repo), não UTC.
2. **Given** uma atualização de pessoa com nome de campo fora da lista permitida, **When** a
   operação chega ao backend, **Then** é rejeitada sem interpolar o nome na query.
3. **Given** uma busca contendo os caracteres curinga de busca (%, _), **When** executada,
   **Then** os caracteres são tratados literalmente.
4. **Given** uma tentativa de salvar data única (não recorrente) sem ano, **When** o usuário
   confirma, **Then** o sistema exige o ano ou avisa que a data não aparecerá no calendário
   (nunca grava um registro silenciosamente invisível).
5. **Given** as divergências de documentação catalogadas na auditoria, **When** a spec é
   implementada, **Then** docstrings e CLAUDE.md refletem o código real.

---

### Edge Cases

- Editar uma data e excluí-la em sequência rápida no perfil: operações usam o identificador
  real; a segunda falha graciosamente se a primeira já removeu.
- Limpar um campo e restaurá-lo na mesma edição: o valor final digitado prevalece.
- Apelido igual entre pessoa ativa e pessoa excluída: a ativa é a dona; a excluída não
  bloqueia nem aparece em erros.
- Exclusão de pessoa com datas sincronizadas com a agenda: lembretes da agenda são tratados
  conforme o fluxo de sync existente (sem lembrete órfão).
- Visão geral com pessoa sem nenhuma interação: continua aparecendo (sem interação ≠ erro).
- Saneamento retroativo de vínculos fantasma não pode remover vínculos de itens que existem
  mas estão soft-deletados (política: manter o vínculo, não contar).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O resumo da pessoa (que alimenta o perfil) DEVE fornecer o identificador e o
  estado de sincronização de cada data importante, de modo que editar/excluir pelo perfil
  funcione e o selo de sincronização apareça — mesmo contrato do detalhe da pessoa.
- **FR-002**: A edição de pessoa DEVE distinguir "campo esvaziado" (limpar no servidor) de
  "campo não enviado" (preservar), em todos os campos opcionais, incluindo a foto.
- **FR-003**: Toda mutação da Komi (pessoa, apelido, data, foto) DEVE apresentar feedback de
  erro visível quando falhar; nenhuma falha pode ser engolida silenciosamente.
- **FR-004**: Após salvar uma edição, todas as telas visíveis que exibem os dados da pessoa
  DEVEM refletir o novo estado sem exigir navegação manual.
- **FR-005**: Os modais da Komi DEVEM fechar com Esc e conter o foco enquanto abertos.
- **FR-006**: A unicidade de apelidos DEVE considerar apenas pessoas ativas; apelidos de
  pessoas excluídas não bloqueiam re-uso, não aparecem em mensagens de erro como donos e não
  geram matches na busca.
- **FR-007**: A exclusão de um bullet do diário DEVE remover, na mesma operação atômica, os
  vínculos dele com pessoas; um saneamento retroativo DEVE limpar os vínculos fantasma
  existentes.
- **FR-008**: A contagem de vínculos do diretório DEVE ser coerente com o hub da pessoa
  (não contar itens excluídos).
- **FR-009**: Todo cálculo de "hoje/este mês" em contexto de exibição DEVE usar o fuso
  America/Sao_Paulo, conforme a convenção do repositório (inclui o card do Hub).
- **FR-010**: A atualização de pessoa DEVE validar os nomes de campo contra uma lista
  permitida antes de montar a query; a busca DEVE tratar curingas literalmente.
- **FR-011**: A visão geral do diretório DEVE calcular a última interação por pessoa sem
  carregar o histórico completo dos domínios (custo proporcional ao número de pessoas).
- **FR-012**: Salvar data única (não recorrente) sem ano DEVE ser impedido ou avisado; o
  sistema não pode gravar registros invisíveis no calendário sem informar o usuário.
- **FR-013**: As divergências doc↔código catalogadas na auditoria DEVEM ser corrigidas:
  docstring da busca (nome da chave de resposta), docstring da ordenação de datas do detalhe
  da pessoa, exemplo de smart-match no CLAUDE.md da Komi, marcação webapp-only das tools não
  registradas no agente, e lacunas do POSTGRES.md sobre o ano-sentinela e a ausência de
  unicidade em datas.

### Key Entities

- **Pessoa**: registro canônico com campos opcionais limpáveis e foto removível; exclusão
  lógica que não prende apelidos.
- **Apelido**: nome alternativo com unicidade restrita a pessoas ativas.
- **Data importante**: rótulo + data (recorrente ou única) com identificador exposto ao
  perfil e estado de sincronização visível.
- **Vínculo pessoa↔item**: associação cross-agent que morre junto com itens removidos
  fisicamente e não infla contagens de itens excluídos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das edições e exclusões de datas pelo perfil funcionam (hoje 0%).
- **SC-002**: Campos esvaziados e foto removida persistem vazios após recarregar em 100% dos
  casos.
- **SC-003**: Zero mutações com falha silenciosa: toda falha produz aviso visível.
- **SC-004**: Após excluir uma pessoa, o apelido dela pode ser reutilizado imediatamente.
- **SC-005**: Zero vínculos fantasma após excluir bullets; contagens do diretório idênticas
  ao que o hub da pessoa mostra.
- **SC-006**: O card de aniversários do Hub mostra o mês local correto em qualquer horário,
  inclusive na virada de mês.
- **SC-007**: Todas as divergências de documentação da auditoria corrigidas (checagem por
  item).

## Assumptions

- A auditoria de 2026-07-07 é a fonte dos achados; referências exatas de arquivo:linha
  ficam registradas para a fase de plano.
- Política de vínculos com itens **soft-deletados** (transações, tarefas, livros): o vínculo
  é mantido no banco e apenas deixa de contar/aparecer — coerente com a possibilidade de
  restauração do item. Vínculos de itens **hard-deleted** (bullets) são removidos.
- Liberar apelidos de pessoas excluídas será feito preservando o histórico (sem apagar os
  apelidos da pessoa excluída), apenas retirando-os do escopo de unicidade/busca — a decisão
  técnica exata (índice parcial vs. limpeza) fica para o plano.
- O aviso de "data única sem ano" pode ser resolvido na interface (exigir ano quando não
  recorrente) — comportamento do agente Telegram segue a mesma regra.
- A performance da visão geral (FR-011) não tem meta numérica: o critério é estrutural
  (consulta agregada em vez de varredura completa em memória).
