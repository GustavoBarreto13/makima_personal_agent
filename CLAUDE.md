# CLAUDE.md — makima_personal_agent

## O que é este repo

Makima é um assistente pessoal multi-agente construído com Google ADK. Roda como bot Telegram autônomo no VPS (Hostinger), coordenando agentes especialistas para finanças, email, tarefas, mídia, livros e base de conhecimento (Obsidian).

Veja `PLAN.md` para o design completo e fases de implementação.

---

## Infraestrutura

Mesmo VPS do n8n (`n8n.gusstavo42-vps.cloud`, Hostinger, Dokploy).
Container separado no mesmo Docker Compose.

### Variáveis de ambiente necessárias

```
TELEGRAM_BOT_TOKEN     # token do bot da Makima
GOOGLE_APPLICATION_CREDENTIALS  # path do service account GCP
GCP_PROJECT_ID         # para Vertex AI RAG
```

As credenciais dos agentes especialistas (Notion, Gmail, etc.) são herdadas do repo `n8n-python-scripts` via variáveis de ambiente compartilhadas no Dokploy.

---

## Estrutura

```
makima_personal_agent/
├── coordinator/
│   ├── main.py      # Telegram bot loop (python-telegram-bot)
│   ├── agent.py     # ADK Agent (Makima) + sub_agents + knowledge_tool
│   └── Dockerfile
├── requirements.txt
├── PLAN.md          # design completo, fases de migração
└── CLAUDE.md        # este arquivo
```

Agentes especialistas (`nami_agent`, `lucy_agent`, etc.) são definidos no repo `n8n-python-scripts` e importados aqui conforme cada fase é implementada.

---

## Como rodar localmente

```bash
pip install -r requirements.txt
TELEGRAM_BOT_TOKEN=xxx python -m coordinator.main
```

---

## Fase atual

**Fase 1** — Coordinator base criado. Sub-agents comentados, aguardando implementação das `tools.py` no repo `n8n-python-scripts`.
