# Plano: Agente Kurisu (Knowledge Base + Tutora Pessoal)

## Contexto

A Makima já tem Nami (finanças) e Kaguya (tarefas + agenda). A próxima especialista é **Kurisu Makise** de Steins;Gate — cientista brilhante, direta, levemente sarcástica, mas genuinamente comprometida com o crescimento de quem ela tutora.

O Obsidian vault do Gustavo já está sincronizado com o Google Drive. O plano original (Fase 5) previa VertexAiRagRetrieval para indexar esse vault. Aqui expandimos esse plano com a camada de personalidade e os dois modos de uso (tutora técnica vs. amiga pessoal).

---

## Arquitetura

### Abordagem: `VertexAiRagRetrieval` como knowledge_tool de Kurisu

Ao invés de adicionar `knowledge_tool` diretamente ao coordinator (como estava planejado no PLAN.md), **Kurisu encapsula o acesso ao RAG**. Isso mantém a separação de domínios: Makima roteia para Kurisu quando o assunto é conhecimento, estudo, notas ou memória pessoal.

```
Usuário → Makima → kurisu_agent
                      └── VertexAiRagRetrieval (Vertex AI Search)
                              └── Corpus: Obsidian Vault (via Google Drive)
```

### Por que Kurisu encapsula o RAG (e não Makima diretamente)

- Kurisu pode pré-processar a query antes de buscar (clarificar, expandir)
- Kurisu pode pós-processar o resultado com seu estilo e contexto
- Mantém coerência arquitetural: cada agente especialista é dono de seu domínio
- Makima fica enxuta, sem tools próprias

### Dois modos de interação

| Modo | Trigger | Comportamento |
|------|---------|---------------|
| **Tutora** | Notas de estudo, conceitos técnicos, projetos de aprendizado | Tom didático, rigoroso, referencia fontes do vault |
| **Amiga** | Notas pessoais, diário, reflexões | Tom de amiga próxima, calorosa mas honesta |

Kurisu detecta o modo pelo **tipo de nota** (`tipo` no frontmatter YAML) e pelo **tom da pergunta**.

---

## Sugestões de melhoria (em relação ao PLAN.md original)

### 1. Kurisu como agente, não tool direta
O PLAN.md colocava `knowledge_tool` direto no coordinator. Extrair para um agente especialista é melhor: permite instrução rica, comportamento condicional, e formatação consistente com os outros agentes.

### 2. Detecção de contexto por frontmatter
As notas do vault devem ter `tipo: estudo | pessoal | projeto | referencia`. Kurisu usa isso para calibrar o tom. Isso exige uma convenção mínima nas notas — não é uma constraint pesada, mas precisa existir.

### 3. Fallback quando o RAG não encontra
Kurisu deve responder com conhecimento próprio (Gemini base) quando o vault não tem resultado relevante, mas ser **explícita** sobre isso: "Não encontrei nada no seu vault sobre isso, mas com base no que sei..."

### 4. Integração futura com Kaguya
Kurisu pode sugerir criar uma tarefa de estudo no TickTick quando identifica um gap de conhecimento. Isso é cross-agent, igual ao `create_expense_reminder` da Kaguya. Planejar o hook desde já (sem implementar ainda).

### 5. Instância singleton vs. factory
Kurisu não usa McpToolset (usa VertexAiRagRetrieval, que é uma tool ADK nativa). Logo, pode ser **singleton** como a Nami — sem processo filho para gerenciar.

---

## Implementação

### Pré-requisito: Vertex AI Setup (único passo manual)

1. Google Cloud Console → projeto `projetos-448301` → APIs e Serviços → habilitar **Vertex AI API** e **Vertex AI Agent Builder API**
2. Agent Builder → Data Stores → Create → Google Drive → selecionar pasta do vault do Obsidian
3. Aguardar indexação (pode levar 15–30 min na primeira vez)
4. Copiar o **corpus resource name**: `projects/projetos-448301/locations/us-central1/ragCorpora/XXXXXXXX`
5. Adicionar ao `.env` e Dokploy: `VERTEX_RAG_CORPUS=projects/projetos-448301/locations/us-central1/ragCorpora/XXXXXXXX`

### Estrutura de arquivos criados

```
agents/
└── kurisu/
    ├── __init__.py        # pacote vazio
    ├── agent.py           # kurisu_agent (singleton, usa VertexAiRagRetrieval)
    └── PLAN.md            # este arquivo
```

Kurisu não tem `tools.py` — o RAG é a tool. Se no futuro houver cross-agent (sugerir tarefa de estudo), isso vai para `tools.py`.

Não há MCP server — VertexAiRagRetrieval é nativa do ADK.

### Mudanças pendentes em `coordinator/agent.py`

```python
# Adicionar import
from agents.kurisu.agent import kurisu_agent

# Adicionar ao sub_agents de Makima
sub_agents=[nami_agent, kaguya_agent, kurisu_agent]

# Atualizar _MAKIMA_INSTRUCTION: adicionar Kurisu como especialista em:
# - perguntas sobre conteúdo do vault de notas
# - dúvidas de estudo ou conceitos
# - memória pessoal ("o que eu anotei sobre X?")
# - reflexões e notas de diário
```

### Mudanças em `requirements.txt`

Nenhuma nova dependência — `google-adk` já inclui `VertexAiRagRetrieval`. Vertex AI é acessado via `GOOGLE_APPLICATION_CREDENTIALS` (service account do BigQuery, já configurado).

### Mudanças em `.env` e Dokploy

```
VERTEX_RAG_CORPUS=projects/projetos-448301/locations/us-central1/ragCorpora/XXXXXXXX
```

---

## Verificação

### Testes a rodar após implementação completa

1. **Teste de roteamento**: Enviar no Telegram "O que eu anotei sobre React hooks?" → deve rotear para Kurisu, que busca no vault
2. **Teste de fallback**: "Explique termodinâmica" (sem notas no vault) → Kurisu responde com aviso de que não encontrou no vault
3. **Teste modo amiga**: "Como eu me sentia sobre minha carreira no ano passado?" → Tom muda para amiga, busca notas pessoais
4. **Teste quiz**: "Me faz um quiz sobre as notas de Python que tenho" → Kurisu lê e gera perguntas
5. **Teste de cross-referência**: "O que eu tenho sobre arquitetura de software?" → Kurisu cruza notas de diferentes áreas

### Verificação de logs

- Vertex AI Search queries aparecem no Cloud Console em "API & Services > Activity"
- Erros de corpus (ID errado, permissão negada) aparecem no log do container como `VertexAiRagRetrieval error`

---

## Ordem de execução

1. [x] Criar `agents/kurisu/__init__.py` e `agents/kurisu/agent.py`
2. [ ] Setup manual do Vertex AI (Data Store + corpus — único passo fora do código)
3. [ ] Atualizar `coordinator/agent.py` (import + sub_agents + instrução Makima)
4. [ ] Atualizar `.env` com `VERTEX_RAG_CORPUS`
5. [ ] Testar localmente com `python -m coordinator.main`
6. [ ] Deploy no Dokploy (adicionar env var + redeploy)
7. [ ] Testar via Telegram os 5 cenários acima
