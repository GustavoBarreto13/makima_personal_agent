# Feature Specification: Hermes Agent — multicanal, memória e mídia

**Feature Branch**: `064-hermes-multicanal`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Integrar o Hermes Agent no Makima. Tudo que é acessível pelo
Telegram deve ser acessível por WhatsApp e Discord também. Usar todo o gerenciamento de
memória e contexto do Hermes."

## Contexto

Hoje o Makima só existe no Telegram, e tudo que é canal-específico está fundido no
coordinator: transporte, formatação de mensagem, botões, estado de assistente guiado em
memória volátil e o mapeamento conversa→domínio. Construir WhatsApp e Discord à mão
significaria refazer essa infraestrutura três vezes.

O que hoje se chama "memória" é na verdade histórico de conversa cru, sem resumo nem
compressão — daí os sintomas visíveis para o usuário: um comando para apagar tudo
(`/limpar`) e um aviso quando a conversa fica grande demais, em vez de o sistema lidar com
isso sozinho. Além disso, foto e áudio enviados ao bot hoje são descartados silenciosamente
— nenhum é processado.

O Hermes Agent (Nous Research, código aberto) é um agente com gateway multicanal
(Telegram, WhatsApp, Discord, entre outros) já pronto e memória de longo prazo de verdade
(resumo, compressão automática de contexto, busca no histórico), além de suporte nativo a
transcrição de voz e leitura de imagem. A base de conhecimento por domínio do Makima
(finanças, tarefas, livros, filmes, pessoas etc.) já é acessível por uma interface aberta
(protocolo MCP) sem precisar ser reescrita — só precisa ser exposta por esse canal, o que é
trabalho incremental e de baixo risco por domínio.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Continuar usando o Telegram, agora com memória de verdade (Priority: P1)

Como usuário do Makima no Telegram, quero continuar fazendo tudo que já faço hoje
(finanças, tarefas) sem precisar apagar o histórico manualmente nem ser avisado que a
conversa "está grande demais" — o sistema deve administrar isso sozinho, e deve lembrar de
fatos relevantes de uma conversa para a próxima.

**Why this priority**: É a base de tudo o resto. Sem isso funcionando com os dois domínios
de uso diário (finanças e tarefas), nenhuma expansão para outros canais ou domínios faz
sentido.

**Independent Test**: Pode ser testado inteiramente dentro do Telegram, sem WhatsApp nem
Discord envolvidos: lançar uma despesa, criar uma tarefa, reiniciar o serviço, e confirmar
que a conversa e os fatos lembrados sobrevivem.

**Acceptance Scenarios**:

1. **Given** o usuário está conversando no Telegram, **When** ele pede para lançar uma
   despesa ou criar uma tarefa, **Then** a ação é executada e confirmada, exatamente como
   acontece hoje.
2. **Given** uma conversa antiga sobre um assunto específico (ex.: um empréstimo
   mencionado semanas atrás), **When** o usuário pergunta sobre esse assunto, **Then** o
   sistema encontra e usa essa informação, mesmo sem o usuário repetir o contexto.
3. **Given** o serviço foi reiniciado (atualização, manutenção), **When** o usuário volta a
   conversar, **Then** o histórico e os fatos que o sistema aprendeu sobre ele continuam
   disponíveis — nada se perde.
4. **Given** uma conversa longa se acumulou, **When** ela cresce além de um tamanho
   confortável, **Then** o sistema resume ou compacta automaticamente, sem exigir comando
   manual do usuário e sem interromper a conversa.

---

### User Story 2 - Falar com o Makima pelo WhatsApp e pelo Discord (Priority: P2)

Como usuário, quero abrir o WhatsApp ou o Discord e conversar com o Makima exatamente como
faço no Telegram — mesmas capacidades, mesma personalidade, sem precisar reensinar nada
que já contei em outro canal.

**Why this priority**: É o pedido central desta feature — não faz sentido sem a User Story 1
já resolvida (memória) rodando por baixo.

**Independent Test**: Enviar a mesma pergunta ou comando nos três canais e comparar a
resposta e o resultado final (ex.: a tarefa foi criada uma única vez, não uma por canal).

**Acceptance Scenarios**:

1. **Given** o usuário manda uma mensagem pelo WhatsApp pedindo para criar uma tarefa,
   **When** a tarefa é criada, **Then** ela aparece no mesmo lugar (painel web, listagem)
   que apareceria se tivesse sido criada pelo Telegram.
2. **Given** o usuário mencionou uma preferência pessoal em um canal (ex.: "prefiro
   respostas curtas"), **When** ele volta a conversar em outro canal, **Then** o sistema
   já sabe disso — o fato aprendido é compartilhado entre canais, mesmo que o histórico
   detalhado da conversa não seja.
3. **Given** um usuário não autorizado tenta falar com o bot no WhatsApp ou Discord,
   **When** ele manda uma mensagem, **Then** o sistema não responde nem executa nenhuma
   ação.

---

### User Story 3 - Mandar áudio e foto em vez de digitar (Priority: P2)

Como usuário, quero mandar um áudio contando o que aconteceu no dia (para virar registro
no diário) ou uma foto de um recibo (para virar um lançamento financeiro), em vez de
digitar tudo.

**Why this priority**: Hoje essa capacidade não existe — é o ganho de usabilidade mais
citado para uso no dia a dia (celular), mas depende dos canais e da inteligência de
domínio já estarem funcionando (US1/US2).

**Independent Test**: Mandar um áudio curto contando algo do dia e conferir que vira um
registro correto; mandar uma foto de um recibo/nota e conferir que os dados extraídos
(valor, estabelecimento) batem antes de confirmar o lançamento.

**Acceptance Scenarios**:

1. **Given** o usuário manda uma mensagem de voz relatando o que fez no dia, **When** o
   sistema processa, **Then** um registro de diário é criado com o conteúdo transcrito.
2. **Given** o usuário manda uma foto de uma nota fiscal ou recibo, **When** o sistema
   processa a imagem, **Then** ele identifica o valor e propõe um lançamento financeiro,
   pedindo confirmação antes de gravar.
3. **Given** um áudio ou foto ilegível/corrompido é enviado, **When** o sistema tenta
   processar, **Then** ele avisa que não conseguiu entender, em vez de falhar
   silenciosamente ou inventar dados.

---

### User Story 4 - Todos os domínios disponíveis nos três canais (Priority: P3)

Como usuário, quero que os demais domínios do Makima — livros, filmes, animes, séries,
pessoas, e-mails, base de conhecimento — fiquem disponíveis por WhatsApp e Discord também,
não só finanças e tarefas.

**Why this priority**: Amplia a cobertura depois que o caminho já foi validado com os dois
domínios de maior uso. Cada domínio é independente dos demais — pode ser entregue um de
cada vez sem esperar todos.

**Independent Test**: Por domínio, testar uma operação de escrita e uma de leitura em
qualquer um dos três canais e confirmar que o resultado é idêntico ao que o Telegram atual
produz hoje.

**Acceptance Scenarios**:

1. **Given** um domínio (ex.: livros) foi migrado, **When** o usuário pede para registrar
   uma leitura por qualquer um dos três canais, **Then** o registro é criado corretamente.
2. **Given** um domínio ainda não foi migrado, **When** o usuário pede algo relacionado a
   ele em qualquer canal, **Then** o pedido ainda é atendido (via o caminho antigo por
   baixo), sem erro nem silêncio.

---

### User Story 5 - Avisos e resumos agendados chegam em qualquer canal (Priority: P3)

Como usuário, quero que os resumos e avisos automáticos que já recebo hoje (resumo diário
de e-mails, aviso de orçamento estourado, relatório mensal) cheguem também no canal que eu
preferir, não só no Telegram.

**Why this priority**: Valor real, mas depende de todos os canais já estarem estáveis
(US2). Avisos de falha operacional do próprio sistema continuam por um canal fixo e
confiável, para funcionar mesmo se algo mais quebrar — essa parte não muda.

**Independent Test**: Configurar um canal preferido diferente do Telegram e confirmar que
o próximo resumo agendado chega lá.

**Acceptance Scenarios**:

1. **Given** um resumo diário está agendado, **When** chega o horário, **Then** ele é
   entregue no(s) canal(is) configurado(s) pelo usuário, podendo ser mais de um.
2. **Given** um job interno de manutenção falha (ex.: uma sincronização automática),
   **When** isso acontece, **Then** o alerta técnico continua chegando por um canal fixo e
   simples, independentemente do estado dos canais conversacionais.

---

### Edge Cases

- O que acontece se o usuário manda a mesma pergunta quase ao mesmo tempo em dois canais
  diferentes? (Não deve gerar duas ações duplicadas quando a pergunta é uma ação de
  escrita, ex. "criar uma tarefa".)
- Como o sistema se comporta se um canal (ex.: WhatsApp) cair enquanto os outros dois
  continuam no ar? Os outros canais não devem ser afetados.
- O que acontece com uma conversa em andamento (ex.: uma pergunta de confirmação pendente)
  se o serviço reinicia no meio? O usuário não deve receber uma resposta a uma pergunta que
  ele nunca fez, nem perder a pergunta pendente sem explicação.
- Um domínio ainda não migrado e um domínio já migrado são mencionados na mesma mensagem —
  o pedido precisa ser atendido para ambos, sem o usuário perceber a diferença de caminho.
- Um áudio ou foto sem relação clara com nenhum domínio conhecido (ex.: um meme) — o
  sistema deve responder com bom senso, não tentar forçar um lançamento ou registro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o usuário realize, por WhatsApp e por Discord,
  toda operação hoje disponível pelo Telegram, para os domínios já migrados.
- **FR-002**: O sistema MUST manter uma memória de longo prazo por usuário que persiste
  entre reinícios do serviço e é compartilhada entre os três canais.
- **FR-003**: O sistema MUST comprimir ou resumir automaticamente conversas longas, sem
  exigir comando manual do usuário para "limpar" o histórico.
- **FR-004**: O sistema MUST permitir buscar informação em conversas passadas por conteúdo,
  não apenas navegando cronologicamente.
- **FR-005**: O sistema MUST processar mensagens de voz, transcrevendo-as em texto
  utilizável pelas ações de domínio (ex.: registro de diário).
- **FR-006**: O sistema MUST processar imagens enviadas, extraindo informação relevante
  (ex.: valor e estabelecimento de um recibo) antes de propor uma ação.
- **FR-007**: O sistema MUST pedir confirmação do usuário antes de gravar uma ação
  financeira ou de registro extraída automaticamente de áudio ou imagem.
- **FR-008**: O sistema MUST restringir cada canal a usuários explicitamente autorizados;
  mensagens de remetentes não autorizados MUST ser ignoradas sem resposta.
- **FR-009**: Durante a migração, domínios ainda não convertidos para o novo caminho
  MUST continuar respondendo normalmente por um caminho de transição, em qualquer canal.
- **FR-010**: O painel web existente NÃO MUST sofrer nenhuma alteração de comportamento
  em consequência desta feature.
- **FR-011**: Avisos de falha de funcionamento interno (jobs agendados, sincronizações)
  MUST continuar sendo entregues por um canal simples e direto, independente da
  disponibilidade dos canais conversacionais.
- **FR-012**: Resumos e avisos agendados voltados ao usuário (não operacionais) MUST poder
  ser entregues em mais de um canal ao mesmo tempo.
- **FR-013**: A personalidade e o tom de resposta do Makima MUST ser consistentes entre os
  três canais — a formatação visual pode variar por plataforma, mas o conteúdo e o
  comportamento não.

### Key Entities

- **Canal**: uma superfície de conversa (Telegram, WhatsApp, Discord); tem lista própria de
  usuários autorizados, mas compartilha a mesma inteligência e memória de longo prazo.
- **Memória de longo prazo**: fatos e preferências aprendidos sobre o usuário, distintos do
  histórico literal de mensagens; sobrevivem a reinício e são visíveis em qualquer canal.
- **Sessão de conversa**: o histórico de mensagens de um usuário em um canal; comprimido
  automaticamente com o tempo; pesquisável por conteúdo.
- **Domínio**: uma área de capacidade do Makima (finanças, tarefas, livros, filmes, animes,
  séries, pessoas, e-mail, base de conhecimento, diário); migra para o novo caminho de
  forma independente dos demais.
- **Caminho de transição**: mecanismo temporário que garante que domínios ainda não
  migrados continuem respondendo durante a migração incremental.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: As mesmas 10 operações de referência (ex.: lançar despesa, criar tarefa,
  consultar agenda, registrar filme assistido, buscar uma pessoa) produzem o mesmo
  resultado correto nos três canais.
- **SC-002**: Um usuário consegue recuperar uma informação mencionada há semanas numa
  conversa antiga sem precisar rolar ou lembrar a data exata.
- **SC-003**: Nenhum comando manual de "limpar histórico" é necessário durante o uso normal
  — conversas longas continuam funcionando sem degradação perceptível de qualidade de
  resposta.
- **SC-004**: Um áudio de até 30 segundos relatando o dia vira um registro de diário
  corretamente na primeira tentativa, sem retrabalho do usuário.
- **SC-005**: Uma foto de recibo legível resulta em um lançamento financeiro com valor
  correto, confirmado pelo usuário antes de gravar.
- **SC-006**: O painel web não apresenta nenhuma regressão de comportamento em nenhum
  momento da migração.
- **SC-007**: Um fato aprendido em um canal (ex.: uma preferência) influencia o
  comportamento do Makima em outro canal, sem o usuário precisar repeti-lo.

## Assumptions

- A conta do Makima é de uso pessoal, com uma lista de usuários autorizados pequena (não é
  um serviço multiusuário público) em cada canal.
- Existe um número de telefone dedicado disponível para o canal de WhatsApp, distinto do
  número pessoal do usuário.
- A migração dos domínios ocorre de forma incremental — nem todos precisam estar
  disponíveis nos novos canais no primeiro momento; finanças e tarefas são o piloto e o
  restante segue em ondas subsequentes.
- Ferramentas de execução de código ou acesso a terminal do lado do agente não fazem parte
  do escopo de uso deste sistema (que lida com dados financeiros e de e-mail pessoal) e
  devem permanecer desligadas por padrão.
- A substituição do canal de leitura de e-mail (hoje um agente dedicado, somente leitura)
  por um recurso equivalente do Hermes foi avaliada e está fora do escopo desta feature —
  o agente de e-mail existente é mantido e apenas ganha exposição pelos novos canais.
