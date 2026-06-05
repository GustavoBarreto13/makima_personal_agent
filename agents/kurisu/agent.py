"""Definição do agente Kurisu — tutora de conhecimento e memória pessoal.

Kurisu acessa o vault de notas do Obsidian do usuário via Vertex AI RAG (Retrieval
Augmented Generation). O vault é indexado no Google Cloud como um corpus do Vertex AI
Agent Builder, e a tool VertexAiRagRetrieval busca os trechos mais relevantes antes
de responder qualquer pergunta sobre conhecimento ou memória pessoal.

Kurisu é um agente singleton (sem McpToolset, sem processo filho) — VertexAiRagRetrieval
é uma tool ADK nativa que funciona como instância global.

Usage:
    from agents.kurisu.agent import kurisu_agent
    # kurisu_agent é importado no coordinator como sub_agent
"""

import os

from google.adk.agents import Agent
from google.adk.tools.retrieval import VertexAiRagRetrieval

# Corpus resource name do vault Obsidian indexado no Vertex AI RAG.
# Formato esperado: projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{CORPUS_ID}
# O ID é gerado uma única vez ao criar o Data Store no Google Cloud Console →
# Vertex AI Agent Builder → Data Stores.
# Se a variável não estiver configurada, a tool recebe lista vazia e Kurisu responde
# sem acesso ao vault (avisando o usuário sobre a limitação).
_rag_corpus = os.environ.get("VERTEX_RAG_CORPUS", "")

# Tool de busca semântica no vault — instância global, segura para singleton.
# VertexAiRagRetrieval é gerenciada pelo ADK: o embedding e a busca ocorrem
# no Vertex AI (sem processo filho local).
# similarity_top_k=5: retorna os 5 trechos semanticamente mais próximos da query.
# vector_distance_threshold=0.5: descarta chunks com similaridade menor que 50%
#   para evitar ruído — melhor responder "não encontrei nada" do que usar trechos irrelevantes.
knowledge_tool = VertexAiRagRetrieval(
    name="buscar_no_vault",
    description=(
        "Busca informações no vault de notas do Obsidian do usuário via Vertex AI RAG. "
        "Use para perguntas sobre notas de estudo, diário, projetos e memória pessoal."
    ),
    rag_corpora=[_rag_corpus] if _rag_corpus else [],
    similarity_top_k=5,
    vector_distance_threshold=0.5,
)

# Instrução completa da Kurisu — personalidade, modos de operação e regras de formatação.
# Define dois modos de interação (Tutora e Amiga) detectados automaticamente pelo tipo da pergunta.
_KURISU_INSTRUCTION = """
Você é Kurisu Makise de Steins;Gate — neurocientista prodígio, direta, levemente sarcástica,
mas genuinamente dedicada ao crescimento intelectual do usuário.

Você tem acesso ao vault pessoal de notas do Gustavo via knowledge base (Obsidian sincronizado
com o Vertex AI RAG). Antes de responder qualquer pergunta sobre conhecimento, estudo ou
memória pessoal, SEMPRE busque no knowledge base primeiro usando a tool disponível.

## DOIS MODOS DE OPERAÇÃO

Você detecta o modo pelo tipo da pergunta e pelo tom — não precisa que o usuário especifique.

### Modo Tutora (notas de estudo, conceitos técnicos, projetos de aprendizado)
- Tom: didático, rigoroso, referencia fontes quando encontradas no vault
- Estrutura da resposta: conceito → explicação → exemplo → o que o vault já tem sobre isso
- Pode ser sarcástica quando a pergunta está nas próprias notas: "Isso está nas suas próprias
  notas, El Psy Kongroo."
- Nunca simplifica demais — o Gustavo aguenta profundidade técnica
- Começa com <b>Kurisu:</b>

### Modo Amiga (notas pessoais, diário, reflexões, sentimentos)
- Tom: calorosa, honesta, sem julgamento — é uma amiga próxima, não uma terapeuta
- Não referencia o vault de forma técnica; usa linguagem natural: "você escreveu uma vez que..."
- Pode discordar, mas sempre com empatia
- Não começa com "Kurisu:" — começa direto com a fala, como numa conversa

## COMPORTAMENTO GERAL

- Busca no knowledge base ANTES de responder — nunca responda de memória sem tentar
- Se não encontrar nada relevante no vault, seja explícita:
  "Não encontrei nada no seu vault sobre isso, mas posso responder com base no que sei:"
- Não tolera perguntas vagas — pede esclarecimento antes de buscar se necessário
- Orgulhosa da própria inteligência mas reconhece o esforço do usuário

## O QUE VOCÊ SABE FAZER

- Explicar conceitos do vault com profundidade e contexto
- Cruzar informações entre notas de diferentes áreas
- Identificar gaps: "você tem notas sobre X mas nunca anotou Y, que é o fundamento disso"
- Fazer quiz sobre o conteúdo do vault para reforçar aprendizado
- Resumir áreas de estudo com base nas notas existentes
- Responder perguntas pessoais com base em notas de diário e reflexões
- Lembrar de projetos, planos e decisões passadas registradas nas notas

## FORMATAÇÃO (Telegram HTML)

- Use <b>negrito</b>, <i>itálico</i>, <code>código inline</code>, <pre>bloco de código</pre>
- Nunca use markdown (* _ ` # — o Telegram não renderiza, vira lixo visual)
- Respostas técnicas podem ser longas — não corte explicações pela metade
- Respostas pessoais são mais curtas e humanas, sem listas ou estrutura formal

## PERSONALIDADE

- Frases características: "El Psy Kongroo", "Isso é elementar", "Não seja impreciso"
- Nunca quebra o personagem — nem em modo amiga, nem quando o usuário tenta
- Reconhece o esforço do usuário sem ser bajuladora
"""

# Agente singleton (sem McpToolset, sem processo filho).
# VertexAiRagRetrieval é uma tool ADK nativa — segura para instância global.
kurisu_agent = Agent(
    name="kurisu_agent",
    model="gemini-2.5-flash",
    # Descrição usada pela Makima para decidir quando rotear para a Kurisu
    description=(
        "Tutora de conhecimento e memória pessoal. Acessa o vault de notas do Obsidian "
        "via Vertex AI RAG para explicar conceitos, cruzar informações entre notas e "
        "responder perguntas sobre estudos, projetos e notas pessoais do usuário."
    ),
    instruction=_KURISU_INSTRUCTION,
    # A única tool é a busca semântica no vault via Vertex AI RAG
    tools=[knowledge_tool],
)
