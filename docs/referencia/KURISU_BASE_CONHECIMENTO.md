# A Kurisu e a sua Base de Conhecimento — explicado do zero

Este documento explica, **sem exigir conhecimento técnico**, o que foi construído para
dar à Kurisu a capacidade de responder perguntas sobre as suas próprias anotações de
estudo. Se você nunca programou na vida, tudo bem: cada termo difícil é explicado com
uma analogia do dia a dia.

> **Resumo de uma frase:** a Kurisu virou uma "bibliotecária particular" que leu todas
> as suas notas de estudo e agora responde perguntas sobre elas, sempre dizendo de qual
> página tirou a resposta — e admitindo quando não sabe.

---

## Índice

1. [Quem é a Kurisu e o que ela faz](#1-quem-é-a-kurisu-e-o-que-ela-faz)
2. [O problema que ela resolve](#2-o-problema-que-ela-resolve)
3. [Como ela funciona, em linguagem de gente](#3-como-ela-funciona-em-linguagem-de-gente)
4. [O caminho de uma pergunta, passo a passo](#4-o-caminho-de-uma-pergunta-passo-a-passo)
5. [O que foi efetivamente construído](#5-o-que-foi-efetivamente-construído)
6. [A grande pedra no caminho: o "modo Serverless"](#6-a-grande-pedra-no-caminho-o-modo-serverless)
7. [Como abastecer e atualizar a base](#7-como-abastecer-e-atualizar-a-base)
8. [O que funciona, o que ainda falta](#8-o-que-funciona-o-que-ainda-falta)
9. [Glossário — todos os termos difíceis](#9-glossário--todos-os-termos-difíceis)

---

## 1. Quem é a Kurisu e o que ela faz

A **Makima** é o "cérebro coordenador" do seu assistente pessoal no Telegram. Ela não
faz o trabalho sozinha — ela tem uma **equipe de especialistas**, e cada um cuida de um
assunto:

- **Nami** cuida de finanças.
- **Kaguya** cuida de tarefas e agenda.
- **Frieren** cuida de livros.
- ...e assim por diante.

A **Kurisu** é a especialista em **conhecimento e estudo**. Pense nela como uma
**bibliotecária particular** que leu todas as suas anotações e está sempre disponível
para consulta.

Quando você pergunta no Telegram algo como *"o que eu sei sobre ansiedade?"* ou
*"me explica aquele conceito do córtex pré-frontal que eu anotei"*, a Makima percebe
que é um assunto de estudo e **passa a pergunta para a Kurisu**.

---

## 2. O problema que ela resolve

Você mantém uma coleção grande de anotações de estudo — uma espécie de **enciclopédia
pessoal** que você foi escrevendo ao longo do tempo (no projeto ela se chama
*"Knowledge Base Karpathy"*). São mais de **400 páginas** sobre os assuntos mais
variados: psicologia, filosofia, programação, neurociência, segurança...

O problema: **ninguém consegue lembrar de tudo que escreveu.** Procurar manualmente em
400 páginas toda vez que você quer relembrar algo é inviável.

A Kurisu resolve isso. Ela:

- **Lê e entende** todas as suas anotações.
- **Responde perguntas** com base no que VOCÊ escreveu (não inventando do nada).
- **Cita a página** de onde tirou cada resposta, para você poder conferir.
- **É honesta**: se você não tem nada anotado sobre o assunto, ela diz *"não encontrei
  nada na sua base sobre isso"* em vez de inventar.

---

## 3. Como ela funciona, em linguagem de gente

Aqui entram alguns conceitos técnicos. Vou explicar cada um com uma analogia.

### 3.1. O "corpus" — a biblioteca organizada

Suas 400 páginas, do jeito que estão no seu computador, são só arquivos soltos. Para a
Kurisu poder consultá-las rapidamente, elas precisam ser **organizadas numa biblioteca
especial** na nuvem do Google. Essa biblioteca organizada se chama **corpus**.

> 📚 **Analogia:** um monte de livros empilhados no chão vs. uma biblioteca com tudo
> catalogado e nas prateleiras. O *corpus* é a biblioteca catalogada.

### 3.2. Os "embeddings" — entender significado, não só palavras

Aqui está a parte genial. Quando a Kurisu organiza suas páginas, ela não guarda só as
palavras — ela guarda o **significado** de cada trecho, traduzido para uma linguagem que
o computador entende (uma lista de números chamada **embedding**).

Por que isso importa? Porque assim a Kurisu encontra a resposta certa **mesmo que você
use palavras diferentes** das que estão na página.

> 🧭 **Analogia:** você pergunta "como lido com nervosismo antes de uma prova?" e a sua
> página fala de "ansiedade diante da incerteza". As palavras são diferentes, mas o
> **significado é o mesmo** — e os embeddings permitem que a Kurisu faça essa ponte.

Como suas notas têm português, inglês e japonês misturados, usamos um modelo de
embedding **multilíngue** (que entende os três idiomas).

### 3.3. O "RAG" — responder consultando a fonte, não a memória

**RAG** é a sigla (em inglês) para "Geração de resposta Aumentada por Busca". Parece
complicado, mas a ideia é simples:

Em vez de a Kurisu responder "de cabeça" (o que levaria a invenções), ela primeiro
**busca os trechos relevantes** na sua biblioteca, **lê esses trechos**, e só então
**escreve a resposta com base no que leu**.

> 🔎 **Analogia:** a diferença entre um estudante chutando a resposta numa prova vs. um
> estudante que pode consultar o livro, acha a página certa, lê e então responde com
> segurança. A Kurisu é sempre o segundo tipo.

### 3.4. O "reranker" — separar o relevante do mais ou menos

Quando a Kurisu busca na biblioteca, ela primeiro pega **vários candidatos** (digamos,
os 10 trechos que parecem ter a ver). Mas nem todos são bons. Então um segundo
mecanismo, o **reranker** ("reordenador"), **reavalia esses candidatos** e coloca os
mais relevantes no topo, descartando os fracos.

> 🥇 **Analogia:** numa entrevista de emprego, primeiro o RH separa 10 currículos que
> "parecem bons" (a busca). Depois um especialista entrevista os 10 e escolhe os 3
> melhores de verdade (o reranker). A Kurisu usa os 3 melhores para responder.

Esse padrão tem um nome: **"buscar muitos, refinar para poucos"**. Buscamos 10, mas só
os 5 melhores depois do reranker vão para a resposta.

---

## 4. O caminho de uma pergunta, passo a passo

Vamos seguir uma pergunta real do começo ao fim:

```
Você (no Telegram): "O que eu sei sobre ansiedade?"
        │
        ▼
1. MAKIMA recebe a mensagem e pensa:
   "Isso é assunto de conhecimento/estudo → é com a Kurisu."
        │
        ▼
2. KURISU recebe a pergunta e usa a ferramenta "buscar_na_base".
        │
        ▼
3. A ferramenta vai até a biblioteca na nuvem (o corpus) e:
   a) traduz a pergunta para "significado" (embedding)
   b) busca os 10 trechos mais parecidos
   c) o reranker reordena e fica com os 5 melhores
        │
        ▼
4. A ferramenta devolve os trechos + de qual página cada um veio.
   Ex.: trecho de "ansiedade.md", trecho de "filosofia-ansiedade-ludoviajante.md"
        │
        ▼
5. KURISU lê esses trechos e escreve uma resposta organizada,
   CITANDO as páginas de onde tirou.
        │
        ▼
Você recebe: uma explicação fiel às suas notas, com as fontes citadas.
```

E se você perguntar algo que **não está** nas suas notas? No passo 3, a busca não acha
nada relevante, e a Kurisu responde com honestidade: *"Não encontrei nada na sua base
sobre isso."* — ela **não inventa**.

---

## 5. O que foi efetivamente construído

Aqui está, em termos simples, o que foi criado ou modificado nesta implementação:

| O quê | Para que serve (em linguagem simples) |
|---|---|
| **A ferramenta de busca** (`buscar_na_base`) | É o "braço" que a Kurisu usa para ir até a biblioteca, buscar os trechos relevantes, passar pelo reranker e trazer de volta — junto com a página de origem de cada um. |
| **A definição da Kurisu** (`agent.py`) | A "personalidade" e as regras dela: sempre buscar antes de responder, citar as fontes, ser honesta quando não sabe, e só consultar (nunca alterar suas notas). |
| **O abastecedor da biblioteca** (`setup_kurisu_rag.py`) | O programa que pega suas 400 páginas e as organiza na biblioteca da nuvem. É ele que você roda quando quer atualizar a base. |
| **As anotações de uso** (`CLAUDE.md`) | Um guia técnico para quem for mexer no código no futuro entender como tudo funciona. |

Tudo isso roda usando a **infraestrutura do Google na nuvem** (o serviço se chama
*Vertex AI*). A mesma "chave de acesso" (credencial) que o projeto já usava para outras
coisas (como backup) é reaproveitada — não foi preciso criar nada novo de conta.

> 🔐 **Sobre privacidade:** suas anotações ficam guardadas na nuvem privada do Google,
> dentro do **seu** projeto, acessíveis só pela sua chave. Você aceitou conscientemente
> que esses dados ficassem na nuvem do Google em troca dessa capacidade de busca.

---

## 6. A grande pedra no caminho: o "modo Serverless"

Esta seção conta o **problema mais difícil** que apareceu — e como foi resolvido. Vale
a pena entender porque pode voltar a aparecer no futuro.

### O que aconteceu

Quando tentamos pela primeira vez organizar suas páginas na biblioteca da nuvem, o
Google **recusou** com uma mensagem mais ou menos assim:

> *"Esse modo de funcionamento está restrito a projetos da lista de permitidos por
> limite de capacidade. Use o modo Serverless, ou outra região."*

### Por que aconteceu

O serviço de biblioteca do Google (Vertex AI RAG) tem **dois modos de funcionamento**:

- **Modo "Spanner"**: o modo antigo/padrão. Acontece que o Google **fechou esse modo
  para projetos novos** em algumas regiões (incluindo a que usávamos) por falta de
  capacidade nos servidores deles. O seu projeto é considerado "novo" para esse serviço.
- **Modo "Serverless"**: o modo novo e recomendado, **sem essa restrição**.

> 🚪 **Analogia:** é como chegar num estacionamento e descobrir que a entrada principal
> está fechada "só para sócios antigos". Mas existe uma entrada lateral (a Serverless)
> que está aberta para todo mundo. Bastava usar a entrada certa.

### Como foi resolvido

Três ajustes, todos **automatizados** no abastecedor da biblioteca (você não precisa
fazer nada manual):

1. **Trocar para o modo Serverless** antes de criar a biblioteca. O programa agora faz
   isso sozinho.
2. **Ligar duas "chaves de funcionalidade" do Google** (no jargão, *APIs*) que o modo
   Serverless precisa: uma para guardar os significados das páginas (*Vector Search*) e
   outra para o reranker funcionar (*Discovery Engine*). O programa liga a primeira
   sozinho; a segunda foi ligada na ativação.
3. **Esperar e tentar de novo.** Ligar essas chaves leva 1 a 2 minutos para "pegar" nos
   servidores do Google. O programa agora tenta algumas vezes, com pausa entre elas, em
   vez de desistir na primeira falha.

Um detalhe técnico que precisou de conserto: no modo Serverless, o Google devolve os
trechos **sem o nome da página**. Sem isso, a Kurisu não conseguiria citar a fonte.
A solução foi **deduzir o nome da página a partir do endereço do arquivo** — assim a
citação continua funcionando ("isso veio da página `ansiedade.md`").

---

## 7. Como abastecer e atualizar a base

Sempre que você **adicionar ou editar** páginas nas suas anotações e quiser que a Kurisu
fique sabendo, é preciso **reabastecer a biblioteca**. Isso é feito rodando um comando
no computador (com o ambiente do projeto configurado):

```bash
# Só conferir o que seria enviado, sem mexer em nada (modo de teste):
python -m scripts.setup_kurisu_rag --dry-run

# Abastecer a biblioteca pela primeira vez (ou adicionar páginas novas):
python -m scripts.setup_kurisu_rag

# Reconstruir do zero — necessário quando você EDITOU páginas existentes:
python -m scripts.setup_kurisu_rag --recreate
```

### Por que o `--recreate` é importante

A biblioteca da nuvem tem uma mania: se você reenvia uma página que **mudou de
conteúdo mas tem o mesmo nome**, ela **ignora** e mantém a versão antiga. Então:

- **Adicionou páginas novas?** Basta rodar o comando normal.
- **Editou páginas que já existiam?** Use o `--recreate`, que **reconstrói tudo do
  zero** e garante que a versão nova seja a usada.

> ⚠️ **Atenção:** o `--recreate` gera uma biblioteca nova com um **endereço novo**. Esse
> endereço (chamado `VERTEX_RAG_CORPUS`) precisa ser atualizado na configuração para a
> Kurisu apontar para a biblioteca certa. O comando imprime o novo endereço no final.

---

## 8. O que funciona, o que ainda falta

> 📌 **Atualização (jul/2026):** a Kurisu **já está no ar** — o deploy foi feito, ela
> responde pelo Telegram e a biblioteca está completa com **410 de 410 páginas** (as
> páginas que tinham ficado de fora na primeira tentativa foram recuperadas com uma
> correção no importador, que agora detecta e completa importações truncadas).

### ✅ O que já está funcionando

- A biblioteca está na nuvem, **completa (410/410 páginas)**, e a Kurisu responde pelo
  Telegram em produção.
- A Kurisu **encontra e cita** as páginas certas. Exemplos reais testados:
  - "ansiedade" → achou as páginas `ansiedade.md` e `filosofia-ansiedade-ludoviajante.md`
  - "álcool e cérebro" → achou a página `cortex-prefrontal.md`
- O reranker está ativo (refina os resultados).
- A honestidade funciona: quando não acha nada, ela avisa em vez de inventar.

### 🔧 O que ainda falta

1. **Melhorar a busca por termos exatos:** hoje, se você procura um termo bem específico
   e raro (tipo a sigla "BM25"), a busca por significado pode trazer páginas só
   parecidas, não a exata. Isso é uma limitação conhecida desta primeira versão. Uma
   melhoria futura ("fase 2") resolveria isso com uma técnica de busca mista, mas só será
   feita se na prática isso virar um incômodo real.
2. **Memória unificada (spec 028):** expandir a biblioteca para incluir também os dados
   dos outros domínios (diário, tarefas, finanças…) via "exporters". A fundação e 2 dos
   8 exporters já estão prontos localmente; o deploy dessa parte ainda está pendente.

---

## 9. Glossário — todos os termos difíceis

| Termo | O que significa, em uma frase |
|---|---|
| **Makima** | O coordenador que recebe suas mensagens e decide qual especialista responde. |
| **Kurisu** | A especialista em conhecimento/estudo — a "bibliotecária" das suas anotações. |
| **Base de conhecimento / wiki** | A sua coleção pessoal de mais de 400 páginas de anotações de estudo. |
| **Corpus** | A versão organizada dessas páginas, guardada na nuvem para busca rápida. |
| **Embedding** | A "tradução" do significado de um texto para números, permitindo busca por sentido (não só por palavras iguais). |
| **Multilíngue** | Capaz de entender vários idiomas — no caso, português, inglês e japonês. |
| **RAG** | Técnica em que a Kurisu busca os trechos na fonte e responde com base neles, em vez de "chutar de cabeça". |
| **Reranker** | Mecanismo que reordena os resultados da busca, deixando os mais relevantes no topo. |
| **Vertex AI** | O serviço de inteligência artificial do Google na nuvem, onde a biblioteca vive. |
| **Modo Serverless** | A forma de funcionamento da biblioteca do Google que está liberada para projetos novos (a "entrada lateral" do estacionamento). |
| **Modo Spanner** | A forma antiga/padrão, que ficou restrita para projetos novos por limite de capacidade. |
| **API** | Uma "chave de funcionalidade" do Google que precisa estar ligada para um serviço funcionar. |
| **Deploy** | O ato de "colocar no ar" — levar o que funciona no computador para o servidor que atende você 24h. |
| **Dokploy** | O painel onde o servidor do seu assistente é configurado e reiniciado. |
| **VERTEX_RAG_CORPUS** | O "endereço" da biblioteca na nuvem, que a Kurisu precisa saber para consultá-la. |
| **Somente leitura** | A Kurisu só consulta suas anotações; ela nunca cria, edita ou apaga nada. |

---

## Em resumo

Você ganhou uma bibliotecária particular incansável que leu todas as suas anotações,
responde suas dúvidas com base no que **você mesmo** escreveu, sempre aponta de onde
tirou a resposta, e tem a honestidade de dizer "não sei" quando o assunto não está nas
suas notas. O maior obstáculo técnico (o modo de funcionamento bloqueado pelo Google)
foi contornado e automatizado, então atualizar a base no futuro é só rodar um comando.

> Documento de referência técnica para desenvolvedores: `agents/kurisu/CLAUDE.md`.
> Especificação completa do recurso: `specs/027-kurisu-knowledge-base/`.
