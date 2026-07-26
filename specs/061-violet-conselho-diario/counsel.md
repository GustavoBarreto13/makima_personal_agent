# Conselho do Dia — o conceito por trás da feature

> Documento explicativo, complementar aos artefatos formais do Spec Kit
> (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `tasks.md`).
> Este arquivo existe para responder uma pergunta diferente: **por que essa feature existe
> e como ela pensa**, não *o que implementar* nem *como testar*.

---

## O problema que ela resolve

Você tem uma base de conhecimento pessoal grande e curada — a wiki "Knowledge Base
Karpathy", com centenas de páginas sobre modelos mentais, técnicas de psicologia,
produtividade, autoconhecimento. O problema não é falta de conhecimento. É que **o
conhecimento certo raramente aparece na hora certa**.

O exemplo que originou a spec: você salvou, em algum momento, um vídeo sobre o que fazer em
dias tristes. Só que nos dias tristes — exatamente quando aquele material importaria — você
não lembra que ele existe. A curadoria feita pelo "você de antes" fica presa na wiki,
desconectada do momento em que o "você de agora" precisaria dela.

O Conselho do Dia existe para fechar esse laço: ler o que você escreveu **hoje** e ir buscar,
na sua própria base, o que **você mesmo** já preparou para situações parecidas.

## A ideia central

Não é um chatbot genérico de autoajuda. É deliberadamente mais restrito que isso:

- Ele só fala a partir de **duas fontes**: o que você escreveu no diário e o que está
  guardado na sua base de conhecimento (mais, secundariamente, o estado das suas tarefas e
  hábitos na Kaguya).
- Ele **nunca inventa conselho genérico e o apresenta como se fosse seu**. Se a base não
  tem nada relevante para o que você escreveu, ele diz isso primeiro — antes de qualquer
  outra coisa. Só depois, e só se necessário, complementa com uma busca na web, sempre
  marcada como vinda de fora.
- Ele é **acionado por você**, nunca automático. Um botão. Sem notificação empurrada, sem
  análise rodando em segundo plano sem pedir.
- Ele **lembra do que já disse**. Cada novo conselho lê os três anteriores antes de falar de
  novo — para não repetir uma sugestão como se fosse a primeira vez, e para notar quando um
  tema está se repetindo ao longo dos dias.

Em uma frase: é uma camada de **recuperação de contexto pessoal**, com uma persona (Violet)
por cima, que reconecta o presente do diário com o passado da sua curadoria.

## Onde ela vive

Uma seção nova no topo da tela **Escrever** da Violet (`/journal`) — antes do prompt de
sonho, do Registro Emocional e das Cartas, antes dos próprios bullets. É a primeira coisa
que aparece quando você abre o dia. Funciona em qualquer data, não só hoje: navegar para um
dia passado mostra (ou permite gerar) o conselho daquele dia específico.

Estado inicial: um convite discreto — "Pedir o conselho da Violet". Depois de gerado, vira
um cartão com os 4 blocos e um botão "Regerar".

## O que ela lê para formar uma opinião

Quando você clica no botão, o pipeline reúne, nesta ordem de importância:

1. **O dia em si, em detalhe** — os bullets que você escreveu, os registros emocionais
   (o Registro de Pensamentos da TCC, se você preencheu algum), e qualquer carta escrita
   naquele dia. Isso inclui cartas lacradas — elas compartilham o mesmo espaço de confiança
   do resto do diário.
2. **Os 7 dias anteriores, em resumo** — não o texto inteiro, só um resumo por dia. Serve
   para detectar recorrência ("isso já apareceu essa semana").
3. **O estado das suas tarefas e hábitos na Kaguya** — o que está atrasado, o que está
   pendente hoje, quais hábitos estão em queda e não foram feitos. Permite conectar um
   bloqueio emocional relatado com, por exemplo, um hábito parado há dias.
4. **Os 3 conselhos anteriores** — não o dia inteiro deles, só o resumo, a pergunta que
   fizeram e as ações que sugeriram. É a memória da conversa.

Nada disso é escolha do usuário no momento — é sempre a mesma janela, para manter o
comportamento previsível.

## O que ela faz com isso

O processo interno tem 4 etapas, encadeadas:

**1. Extrair os temas.** Antes de sair procurando qualquer coisa, uma primeira passagem pela
IA lê o dia e resume: quais são os 2 a 4 assuntos/conceitos por trás do que foi escrito, e
qual a carga emocional geral. Isso existe porque jogar o texto cru do diário direto numa
busca semântica tende a trazer resultados ruins — busca funciona melhor por conceito
("regulação emocional", "procrastinação por medo") do que por frase literal do diário.

**2. Consultar a base.** Cada tema vira uma consulta à mesma busca que a Kurisu usa para
responder perguntas no Telegram (`buscar_na_base` — busca semântica + reranker sobre o
corpus Vertex AI RAG da wiki). Os resultados de todas as consultas são juntados e
deduplicados.

**3. Decidir se precisa de ajuda externa.** Se a base devolveu menos de 2 trechos
relevantes no total, entende-se que ela não cobre bem o problema — e só nesse caso uma
busca complementar na web é disparada, numa chamada separada à IA (tecnicamente, busca web
e resposta estruturada não podem coexistir na mesma chamada — por isso são dois passos).

**4. Escrever a resposta.** Uma última passagem pela IA — na voz da Violet, instruída a
nunca inventar uma fonte que não esteja realmente nos trechos recuperados — produz os 4
blocos finais.

## Os 4 blocos

| Bloco | O que é | Exemplo do espírito |
|---|---|---|
| **Espelho do dia** | Um resumo curto e empático do que foi lido — não um resumo mecânico, um reconhecimento do que pesou. | "Hoje teve um misto de cansaço com uma alegria pequena no fim da tarde..." |
| **Da sua base: ferramentas e curadoria** | 1 a 3 sugestões concretas, cada uma citando de onde vieram (o arquivo real da wiki, se veio de lá). | "Você salvou um material sobre [técnica X] — ele fala exatamente sobre isso que você descreveu." |
| **Pergunta para refletir** | 1 a 2 perguntas socráticas, para você responder no próprio diário, não para a IA responder por você. | "O que mudaria se você tratasse esse cansaço como informação, não como falha?" |
| **Ações sugeridas** | 1 a 3 próximos passos pequenos e concretos — cada um pode virar uma tarefa real na Kaguya com um clique. | "Separar 10 minutos amanhã de manhã para [ação]." |

## A regra de honestidade — o ponto mais importante da implementação

Isso é o que diferencia a feature de "IA dá conselho genérico" para "IA me lembra do que EU
já preparei":

- A origem de cada sugestão ("da sua base" vs. "da web") **não é decidida pelo texto que a
  IA escreve**. É decidida no código, comparando a URL/arquivo citado contra o conjunto de
  trechos que **de fato** foram recuperados da base naquela chamada. Se a IA citar algo que
  não bate com nenhum trecho real, o item é automaticamente reclassificado como "vindo de
  fora" — mesmo que a IA tenha "achado" que era da base.
- Quando a base não retorna absolutamente nada relevante, a frase "não encontrei nada
  equivalente na sua base de conhecimento para isso" é inserida **sempre**, de forma
  determinística — independente do que o modelo de linguagem tenha escrito no resumo do
  dia.
- Todo item marcado como vindo da web aparece visualmente diferente no cartão (um selo
  "fonte externa"), nunca misturado sem distinção com o que veio da sua curadoria.

A ideia é que você nunca precise se perguntar "isso é meu ou é a IA inventando" — o sistema
já resolveu essa dúvida antes de mostrar a resposta.

## Persistência: um conselho por dia, e ele lembra de si mesmo

Cada dia tem no máximo uma análise guardada. Clicar em "Regerar" **substitui** a anterior —
não empilha versões, não guarda histórico de tentativas. A exceção é o vínculo com tarefas
já criadas: se uma ação virou tarefa e você regenera o conselho depois, o sistema tenta
casar a ação nova (pelo texto) com a antiga para não perder essa marcação.

Como cada conselho lê os 3 anteriores antes de ser gerado, existe uma cadeia implícita de
memória — o conselho de hoje "sabe" que o de anteontem já falou de um tema parecido, mesmo
sem nenhuma ação explícita sua para isso acontecer.

## Onde a lógica mora, e por quê

O código vive em `agents/kurisu/counsel.py` — não em `agents/journal/` (o pacote que cuida
dos bullets em si). A razão: quem é "dona" da base de conhecimento e da lógica de busca é a
Kurisu, não a Violet. A Violet empresta só a voz (o tom do prompt final); quem sabe recuperar
e citar informação da wiki é a Kurisu. Essa mesma separação já existia para o Tutor de
Idiomas (outra feature da Violet que também "pede emprestada" a inteligência de outro
agente) — o Conselho do Dia segue exatamente o mesmo desenho.

O router do webapp (`webapp/backend/routers/journal.py`) é o único lugar do sistema que
conhece Journal e Kurisu ao mesmo tempo — ele compõe as duas coisas na hora de responder,
sem que `agents/journal/` precise saber que a Kurisu existe.

## Limitações conhecidas

- **Demora.** É um processo de várias etapas (2 chamadas de IA + várias buscas na base +
  eventualmente uma busca web), tudo acontecendo enquanto você espera — o alvo é terminar
  em até 60 segundos na maioria das vezes, não é instantâneo como o resto do diário.
- **Depende da cobertura real da sua base.** Se um assunto não tiver nada salvo na wiki, o
  "da sua base" fica vazio (e isso é comunicado com honestidade, não escondido).
- **Cartas lacradas entram na leitura.** Conteúdo mais íntimo passa pela mesma camada de IA
  que gera o conselho — foi uma decisão consciente, não um descuido.
- **Sem histórico visual de versões.** Regenerar apaga a análise anterior daquele dia; não
  há como "voltar" para o que a Violet disse antes de você clicar em Regerar.

## Para ir mais fundo

- **O quê / critérios de aceite:** [spec.md](spec.md)
- **Como foi decidido tecnicamente:** [research.md](research.md)
- **Schema da tabela `journal_counsel`:** [data-model.md](data-model.md)
- **Contrato das rotas HTTP:** [contracts/rest-api.md](contracts/rest-api.md)
- **Como testar na prática:** [quickstart.md](quickstart.md)
- **Lista de tarefas de implementação:** [tasks.md](tasks.md)
