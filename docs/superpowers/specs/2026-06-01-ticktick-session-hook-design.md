# TickTick Session Hook — Design Spec

**Date:** 2026-06-01
**Status:** Approved

## Context

O projeto Makima - Personal Agent tem uma tarefa no TickTick (ID: `6a1b7ed4ebd7ba00000000f8`, projeto Knowledge) com sub-tarefas representando cada agente e feature planejada. O objetivo é usar essa tarefa como tracker vivo do progresso do projeto, sem criar overhead manual.

## Design

### Comportamento do Hook (automático)

Um script Python executado via hook `SessionStart` do Claude Code:

1. Autentica no TickTick usando as credenciais do `.env` do projeto
2. Busca a tarefa raiz e todas as sub-tarefas recursivamente
3. Imprime um resumo de status no stdout

O output é injetado automaticamente no contexto da sessão pelo Claude Code.

### Responsabilidades do Claude durante a sessão

- **Consultar o estado** injetado pelo hook para entender o que está pendente
- **Sugerir quando marcar concluído**: ao terminar uma implementação, indicar explicitamente qual sub-tarefa pode ser marcada ("pode marcar `Kaguya Shinomiya - TickTick Agent` como concluída")
- **Sugerir novas sub-tarefas**: quando identificar work não representado na árvore ("falta uma sub-tarefa para X — cria com o título Y")
- **Atualizar descrição das sub-tarefas** via API TickTick: adicionar contexto útil (decisões de design, IDs relevantes, comandos, links)

### Responsabilidades do usuário

- Marcar sub-tarefas como concluídas no TickTick quando sugerido
- Criar novas sub-tarefas quando sugerido

### O que o Claude NÃO faz

- Nunca marca sub-tarefas como concluídas automaticamente
- Nunca cria ou deleta sub-tarefas automaticamente

## Implementação

### Script: `scripts/ticktick_status.py`

Script standalone que:
- Lê credenciais de env vars (`TICKTICK_ACCESS_TOKEN`, `TICKTICK_REFRESH_TOKEN`, etc.) — mesmas usadas pelo MCP server
- Faz GET na API do TickTick para buscar a task raiz e sub-tasks
- Imprime output formatado para leitura pelo Claude

Output esperado:
```
=== Makima - Personal Agent (TickTick Status) ===
[ ] Nami - Finance Agent
    [ ] Contas Fixas
    [ ] Carregar base inicial
    ...
[x] Kaguya Shinomiya - TickTick Agent
...
```

### Hook: `settings.json`

```json
{
  "hooks": {
    "SessionStart": [{
      "command": "cd c:\\Users\\barreto.gustavo\\Documents\\GitHub\\makima_personal_agent && .venv\\Scripts\\python scripts/ticktick_status.py 2>/dev/null"
    }]
  }
}
```

O hook roda o script na venv do projeto. Falhas silenciosas (2>/dev/null) para não poluir sessões quando offline ou sem token.

### Credenciais

O script reutiliza as mesmas env vars já configuradas para o MCP TickTick — nenhuma credencial nova necessária. Lê do `.env` via `python-dotenv` ou diretamente de env vars do sistema.

## Arquivos afetados

- `scripts/ticktick_status.py` — novo script
- `.claude/settings.json` (ou `settings.local.json`) — novo hook SessionStart
- `docs/setup-hook.md` — guia de configuração para novas máquinas

## Configuração em nova máquina

As instruções completas ficam em `docs/setup-hook.md` (commitado no repo). Em resumo:

1. Garantir que o `.env` do projeto tem as vars `TICKTICK_*`
2. Criar (ou editar) `.claude/settings.local.json` com o bloco de hook abaixo, ajustando o caminho absoluto do projeto:
```json
{
  "hooks": {
    "SessionStart": [{
      "command": "cd /caminho/para/makima_personal_agent && .venv/Scripts/python scripts/ticktick_status.py 2>/dev/null"
    }]
  }
}
```
3. No Linux/Mac, trocar `.venv/Scripts/python` por `.venv/bin/python`

> `settings.local.json` não é commitado (está no `.gitignore` do Claude Code) pois contém caminhos absolutos específicos de cada máquina. Por isso o guia fica em `docs/setup-hook.md`.

## Verificação

Após implementação:
1. Abrir nova sessão Claude Code no projeto
2. Verificar que o output do TickTick aparece no contexto inicial
3. Testar com token inválido — deve falhar silenciosamente sem quebrar a sessão
