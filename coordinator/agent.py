from google.adk.agents import Agent
from google.adk.tools import VertexAiRagRetrieval

# knowledge_tool — Obsidian vault via Vertex AI RAG
# knowledge_tool = VertexAiRagRetrieval(
#     rag_corpus="projects/SEU_PROJETO/locations/us-central1/ragCorpora/SEU_CORPUS",
#     similarity_top_k=5,
# )

# Sub-agents (uncomment as each phase is implemented)
# from nami_finance_agent.agent import nami_agent
# from lucy_email_agent.agent import lucy_agent
# from tasks_agent.agent import tasks_agent
# from media_agent.agent import media_agent
# from books_agent.agent import books_agent

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

        Responda sempre em português. Seja direta e eficiente.
    """,
    # tools=[knowledge_tool],
    # sub_agents=[nami_agent, lucy_agent, tasks_agent, media_agent, books_agent],
)
