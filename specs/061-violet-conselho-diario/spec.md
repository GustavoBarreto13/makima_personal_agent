# Feature Specification: Violet — Conselho do Dia

**Feature Branch**: `061-violet-conselho-diario` (sem branch dedicada — trabalho direto em `master`, convenção do repositório)

**Created**: 2026-07-26

**Status**: Rascunho

**Input**: User description: "Vamos criar uma spec nova para a Violet.. A feature nova
consiste em, todos os dias, vai ter uma seção acima do diário, onde a violet vai usar IA
para ler minhas entradas, usar toda a base de conhecimento contida no RAG, e me dar dicas
com base na base de conhecimento de como resolver os problemas de apontei, como melhorar,
quais ferramentas mentais usar, coisas do tipo. A análise vai ser feita apenas quando eu
clicar em um botão, mas cada dia terá sua análise, se tiver uma forma de ela ler as
análises que ela já fez antes, também seria ótimo. Ela pode usar busca pra enriquecer as
dicas contidas no RAG também. Pensa que, tenho muito conhecimento acumulado, mas nem
sempre lembro de usar, salvo um vídeo sobre o que fazer em dias tristes, mas nos dias
tristes eu não lembro. Ela tem que me lembrar dessas coisas, da curadoria que
anteriormente [fiz]."

## Clarifications

### Session 2026-07-26

- Q: A spec menciona que a geração "pode levar um tempo perceptível", mas não define um alvo
  mensurável. Qual o tempo máximo aceitável para o conselho completo ficar pronto? → A: Até
  60 segundos — equilíbrio entre profundidade (múltiplas consultas à base/web) e espera
  aceitável para uma ação manual de um clique.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pedir o conselho do dia (Priority: P1)

Como usuário que escreve no diário, quero clicar em um botão e receber uma leitura do meu
dia cruzada com o que eu já estudei e salvei — para lembrar, na hora em que preciso, da
curadoria que fiz para mim mesmo no passado (o exemplo que motivou o pedido: um vídeo sobre
o que fazer em dias tristes, que eu não lembro de consultar justamente nos dias tristes).

**Why this priority**: É o núcleo da feature — sem isso não existe produto. Todo o resto
(sinais adicionais, memória entre dias, busca na web) só faz sentido em cima de um conselho
que já lê o dia e a base de conhecimento e devolve algo útil.

**Independent Test**: Escrever alguns bullets no dia de hoje sobre um problema que tenha
material salvo na base de conhecimento, clicar no botão de pedir o conselho, e confirmar que
a resposta cita corretamente esse material (não um conselho genérico).

**Acceptance Scenarios**:

1. **Given** o usuário está na tela de escrever do dia de hoje com pelo menos um bullet
   escrito, **When** ele clica no botão de pedir o conselho, **Then** o sistema exibe uma
   seção com quatro blocos: um resumo do que foi lido, sugestões vindas da base de
   conhecimento (com a fonte citada), uma pergunta para refletir e ações sugeridas.
2. **Given** um conselho já existe para o dia, **When** o usuário clica em "Regerar",
   **Then** a análise anterior é substituída pela nova — não se acumulam várias análises no
   mesmo dia.
3. **Given** o dia ainda não tem nenhum bullet escrito, **When** o usuário tenta pedir o
   conselho, **Then** o sistema avisa que não há nada para analisar ainda, sem gerar uma
   análise vazia.
4. **Given** a base de conhecimento não tem nada relevante para o que foi escrito, **When**
   o conselho é gerado, **Then** o sistema diz explicitamente que não encontrou material na
   base antes de oferecer qualquer sugestão de outra origem.

---

### User Story 2 - Contexto ampliado e continuidade (Priority: P2)

Como usuário, quero que a Violet leve em conta não só o texto do dia, mas também meus
registros emocionais, cartas, tarefas e hábitos do dia, os últimos dias (para notar
recorrências) e os conselhos que ela mesma já me deu antes — para que o conselho de hoje
não repita o de ontem do zero e realmente acompanhe minha evolução.

**Why this priority**: Eleva o conselho de "uma leitura isolada do dia" para "alguém que
acompanha minha jornada". Depende da User Story 1 já existir; sem ela não há o que ampliar.

**Independent Test**: Gerar o conselho em dois dias seguidos sobre um tema recorrente (ex.:
a mesma dificuldade mencionada duas vezes) e confirmar que o conselho do segundo dia
reconhece que o tema já apareceu e referencia o que foi sugerido antes.

**Acceptance Scenarios**:

1. **Given** o usuário registrou uma emoção intensa ou escreveu uma carta no dia,
   **When** o conselho é gerado, **Then** esse conteúdo influencia visivelmente o resumo do
   dia e as sugestões, não só os bullets.
2. **Given** existem tarefas atrasadas ou hábitos parados naquele dia, **When** o conselho é
   gerado, **Then** o sistema pode citar essa situação como parte do contexto (ex.: conectar
   um bloqueio emocional relatado com um hábito específico parado há dias).
3. **Given** o mesmo assunto apareceu nos últimos 7 dias, **When** o conselho é gerado,
   **Then** o texto menciona explicitamente que é uma recorrência.
4. **Given** existem conselhos anteriores dos últimos dias, **When** um novo conselho é
   gerado, **Then** ele referencia o que já foi sugerido, sem repetir a mesma sugestão como
   se fosse inédita.
5. **Given** é a primeira vez que o usuário usa a feature (sem conselhos anteriores),
   **When** o conselho é gerado, **Then** o sistema funciona normalmente, apenas sem a parte
   de continuidade.
6. **Given** uma ação sugerida pelo conselho, **When** o usuário confirma que quer executá-la,
   **Then** ela pode virar uma tarefa no sistema de tarefas em uma única ação, sem precisar
   redigitar o texto.

---

### User Story 3 - Enriquecer com busca externa quando a base não cobre (Priority: P3)

Como usuário, quero que a Violet busque informação complementar na internet apenas quando
minha base de conhecimento pessoal não tiver material suficiente para o problema que
apontei — para não ficar sem resposta útil, mas também sem confundir "o que eu já estudei"
com "conselho genérico da internet".

**Why this priority**: É um complemento de qualidade sobre um produto que já funciona só com
a base pessoal (User Stories 1 e 2). Adiciona cobertura para temas novos, mas não é
essencial ao valor central (relembrar a própria curadoria).

**Independent Test**: Escrever um bullet sobre um tema que certamente não está na base de
conhecimento pessoal, pedir o conselho, e confirmar que (a) o sistema primeiro declara que
não achou nada na base e (b) qualquer sugestão vinda de busca externa aparece claramente
identificada como tal.

**Acceptance Scenarios**:

1. **Given** a base de conhecimento não tem material suficiente sobre o tema identificado,
   **When** o conselho é gerado, **Then** o sistema busca informação complementar na web e
   a inclui nas sugestões.
2. **Given** um item de sugestão veio da busca externa, **When** o usuário visualiza o
   conselho, **Then** esse item está claramente marcado como vindo de fora da base pessoal,
   distinto dos itens vindos da base.
3. **Given** a base já cobre bem o tema identificado, **When** o conselho é gerado,
   **Then** o sistema não recorre à busca externa.

---

### Edge Cases

- O que acontece se a chamada de geração falhar no meio do processo (erro de rede, de IA
  indisponível)? O sistema deve avisar o erro de forma clara e não deve gravar nenhum dado
  parcial ou corrompido — o usuário pode tentar novamente.
- Como o sistema se comporta se o dia tiver apenas conteúdo muito curto ou vago (ex.: um
  bullet de uma palavra)? Deve gerar o melhor conselho possível com o que existe, sem
  travar, mesmo que o resultado seja mais genérico.
- O que acontece se existir uma carta lacrada (conteúdo mais íntimo) no dia? Ela participa
  da leitura do dia como qualquer outro sinal, já que compartilha o mesmo espaço de
  confiança do restante do diário.
- Como o sistema trata um pedido de conselho para um dia muito antigo, sem registros dos 7
  dias anteriores (ex.: o primeiríssimo dia de uso do diário)? Deve funcionar normalmente,
  apenas com uma janela de contexto menor.
- O que acontece se a busca externa (User Story 3) também não encontrar nada relevante?
  O sistema deve seguir adiante com o que tem da base e do próprio dia, sem bloquear a
  geração do conselho.
- Como o sistema evita apresentar conhecimento genérico como se fosse tirado da base
  pessoal? Toda vez que uma sugestão não vier de um material real e citável da base, isso
  deve ficar explícito para o usuário.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir que o usuário solicite, por uma ação explícita
  (clique), a geração do conselho do dia para a entrada de diário de uma data específica.
- **FR-002**: O sistema DEVE manter no máximo um conselho por dia; solicitar novamente para
  uma data que já tem conselho DEVE substituir o conteúdo anterior, não acumular versões.
- **FR-003**: O sistema DEVE basear a análise detalhada do dia nos bullets, nos registros
  emocionais e nas cartas daquele dia.
- **FR-004**: O sistema DEVE também considerar, de forma resumida, os 7 dias anteriores ao
  analisado, para poder identificar padrões e recorrências.
- **FR-005**: O sistema DEVE consultar os até 3 conselhos mais recentes já gerados para dar
  continuidade — referenciando o que já foi sugerido antes quando fizer sentido.
- **FR-006**: O sistema DEVE considerar o estado das tarefas e hábitos do usuário no dia
  analisado como parte do contexto.
- **FR-007**: O sistema DEVE apresentar o conselho sempre com estes quatro blocos: (1) um
  resumo empático do que foi lido no dia, (2) sugestões de ferramentas/técnicas/materiais
  vindos da base de conhecimento pessoal do usuário, (3) uma ou duas perguntas para reflexão,
  e (4) de uma a três ações concretas sugeridas.
- **FR-008**: Toda sugestão do bloco de "ferramentas da base" DEVE citar a fonte real de
  onde veio, dentro da base de conhecimento pessoal do usuário.
- **FR-009**: Quando a base de conhecimento não tiver material relevante para o que foi
  identificado no dia, o sistema DEVE declarar isso explicitamente antes de oferecer
  qualquer outra sugestão.
- **FR-010**: O sistema DEVE recorrer à busca externa (internet) somente como complemento,
  e apenas quando a base de conhecimento pessoal não cobrir suficientemente o problema
  identificado.
- **FR-011**: Todo item de sugestão originado de busca externa DEVE ficar visivelmente
  identificado como tal, distinguível dos itens vindos da base pessoal.
- **FR-012**: O sistema NUNCA DEVE apresentar conhecimento genérico como se fosse extraído
  da base de conhecimento pessoal do usuário.
- **FR-013**: O sistema DEVE permitir gerar (ou visualizar, se já existir) o conselho para
  qualquer data do diário, não apenas para o dia atual.
- **FR-014**: O sistema DEVE permitir que o usuário transforme uma ação sugerida em uma
  tarefa do sistema de tarefas, em uma única ação, sem precisar redigitar o conteúdo.
- **FR-015**: Se a geração do conselho falhar em qualquer etapa, o sistema DEVE informar o
  erro de forma clara e NÃO DEVE persistir nenhum dado parcial da tentativa falha.

### Key Entities *(include if feature involves data)*

- **Conselho do dia**: a análise gerada para uma data específica do diário. Contém o
  resumo do dia, a lista de sugestões vindas da base (cada uma com sua fonte), a(s)
  pergunta(s) de reflexão, a lista de ações sugeridas, e um indicador de se alguma sugestão
  veio de busca externa. Relaciona-se 1:1 com a entrada de diário daquele dia.
- **Sugestão da base**: um item dentro do conselho que aponta para um material real e
  específico já salvo/curado pelo usuário — carrega o conteúdo da sugestão e a referência à
  fonte de origem.
- **Ação sugerida**: um item de próximo passo dentro do conselho, que pode opcionalmente ser
  convertido em uma tarefa do sistema de tarefas do usuário.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário consegue solicitar e visualizar o conselho completo do dia com uma
  única ação (um clique), sem etapas intermediárias de configuração.
- **SC-002**: Em pelo menos 80% de uma amostra de conselhos revisados manualmente pelo
  usuário, cada sugestão do bloco "da base" aponta para um material que o usuário
  reconhece ter salvo ou estudado de fato (não uma citação genérica ou inventada).
- **SC-003**: Em 100% dos casos em que a base de conhecimento não cobre o tema identificado,
  o sistema declara isso explicitamente antes de qualquer sugestão de outra origem — zero
  ocorrências de conselho genérico apresentado como se fosse da base pessoal, e todo item de
  origem externa aparece claramente marcado como tal.
- **SC-004**: O usuário consegue transformar uma ação sugerida em tarefa em uma única ação,
  sem precisar copiar ou redigitar texto.
- **SC-005**: Solicitar o conselho de um dia que já tem um conselho gerado e regenerá-lo
  resulta em exatamente um conselho por dia — nunca duas versões coexistindo para a mesma
  data.
- **SC-006**: O usuário consegue visualizar (ou solicitar) o conselho de qualquer dia do
  diário, não apenas do dia atual, ao navegar até essa data.
- **SC-007**: O conselho completo (os quatro blocos) fica pronto em até 60 segundos a partir
  do clique, em pelo menos 95% das solicitações.

## Assumptions

- A base de conhecimento pessoal do usuário (a wiki curada consultada pela Kurisu) já
  contém, no momento de uso desta feature, a curadoria relevante para os temas que o usuário
  costuma escrever no diário — a cobertura efetiva da busca é validada por amostragem
  (SC-002), não garantida previamente.
- Como o conselho lê tudo o que existe no dia — incluindo cartas, mesmo as marcadas como
  "lacradas"/mais íntimas — o conteúdo dessas cartas passa a ser processado pela mesma
  camada de inteligência artificial que gera o conselho, e não fica mais restrito só à
  leitura do próprio usuário na tela do diário.
- A geração de um conselho é uma operação que pode levar um tempo perceptível (múltiplas
  etapas de leitura e síntese) — é aceitável que o usuário espere até 60 segundos por um
  retorno em vez de uma resposta instantânea (ver Clarifications, SC-007), desde que o
  sistema deixe claro que está processando.
- "Regerar" descarta a análise anterior daquele dia sem manter histórico de versões — só a
  versão mais recente de cada dia é guardada.
- A janela de contexto de "últimos dias" é de 7 dias corridos anteriores à data analisada,
  e a continuidade entre conselhos olha para os 3 conselhos mais recentes antes do dia
  atual.
- O usuário é o único usuário do sistema (uso pessoal) — não há considerações de múltiplos
  usuários, permissões diferenciadas ou compartilhamento do conselho gerado.
- Converter uma ação sugerida em tarefa usa o sistema de tarefas já existente no produto;
  esta feature não introduz um sistema de tarefas próprio.
