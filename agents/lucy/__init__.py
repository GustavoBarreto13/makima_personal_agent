"""Lucy — agente de email (Gmail).

Domínio: leitura/classificação de emails via IMAP + Gemini. Submódulos:
- gmail_imap: camada IMAP pura (connect/fetch/parse/label/archive)
- tools: tools read-only do agente + classify_emails() + persist_classified()
- agent: lucy_agent (ADK singleton, somente leitura)
"""
