from google.adk.agents import Agent

# knowledge_tool — Obsidian vault via Vertex AI RAG (Fase 5).
# Import comentado: VertexAiRagRetrieval só é necessário na Fase 5 e, dependendo
# da versão do google-adk, vive em outro módulo. Deixar comentado evita quebrar
# o import do coordinator antes da hora.
# from google.adk.tools import VertexAiRagRetrieval
# knowledge_tool = VertexAiRagRetrieval(
#     rag_corpus="projects/SEU_PROJETO/locations/us-central1/ragCorpora/SEU_CORPUS",
#     similarity_top_k=5,
# )

# Sub-agents (descomente conforme cada fase for implementada).
# Fase 1 — Nami (finanças). Pacote local: makima é self-contained.
from agents.nami.agent import nami_agent
# from agents.lucy.agent import lucy_agent
# from agents.tasks.agent import tasks_agent
# from agents.media.agent import media_agent
# from agents.books.agent import books_agent

makima = Agent(
    name="makima",
    model="gemini-2.0-flash",
    instruction="""
        Você é Makima, assistente pessoal e coordenadora. Você gerencia uma equipe de especialistas:
        - Nami: finanças e transações no Notion
        - Lucy: emails e Gmail
        - Tasks: tarefas no TickTick/Notion
        - Media: séries, filmes e anime
        - Books: livros

        Delegue para o especialista certo. Combine agentes quando o pedido envolver
        múltiplos domínios. Consulte a base de conhecimento quando o usuário perguntar
        sobre anotações ou projetos pessoais.

        Atualmente apenas a Nami (finanças) está ativa — para outros domínios,
        avise que ainda não estão disponíveis.

        Responda sempre em português. Seja direta e eficiente.
    """,
    # tools=[knowledge_tool],
    # Fase 1: apenas o Nami. Demais sub-agentes entram nas próximas fases.
    sub_agents=[nami_agent],
)
