"""Tool de integração RAG entre Nami e Kurisu (stub).

Esta tool fará cross-agent call para o kurisu_agent, usando o mesmo padrão
que a Kaguya usa para chamar a Nami (ver agents/kaguya/tools.py).

BLOQUEADA: depende do setup do Vertex AI corpus (Fase 3 do projeto).
Quando o corpus estiver pronto, substituir a implementação stub pelo
cross-agent call real ao kurisu_agent.

Usage:
    Importado pelo nami_agent após o corpus da Kurisu estar configurado.
"""


def consult_financial_knowledge(query: str) -> dict:
    """Consulta a base de conhecimento financeiro curada pelo usuário (via Kurisu).

    Usa RAG (Retrieval-Augmented Generation) sobre o vault Obsidian do usuário,
    pasta Finanças/ — regras pessoais, artigos e estratégias financeiras.

    Args:
        query: Pergunta ou tópico financeiro a consultar (em português)

    Returns:
        Dicionário com trechos relevantes da base ou indicação de que está pendente.

    Example:
        >>> consult_financial_knowledge("qual estratégia usar para sair das dívidas?")
        {'status': 'pendente', 'message': '...'}
    """
    # TODO: substituir por cross-agent call ao kurisu_agent após setup do corpus
    # Padrão de implementação: ver agents/kaguya/tools.py (complete_payment_task)
    # que importa e chama tools da Nami diretamente
    return {
        "status": "pendente",
        "message": (
            "Base de conhecimento financeiro ainda não configurada. "
            "Quando disponível, consultarei seus artigos e regras pessoais salvas no Obsidian."
        ),
    }
