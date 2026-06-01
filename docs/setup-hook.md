# Configurar Hook SessionStart — TickTick Status

Este hook injeta o estado atual da tarefa "Makima - Personal Agent" do TickTick
no contexto de cada sessão Claude Code.

## Pré-requisitos

- Claude Code instalado
- Venv do projeto criada com dependências instaladas (`pip install -r requirements.txt`)
- Variáveis de ambiente `TICKTICK_*` configuradas no `.env` ou no ambiente do sistema

## Passos

1. Crie `.claude/settings.local.json` na raiz do projeto (ajuste o caminho absoluto):

   **Linux/Mac:**

   ```json
   {
     "hooks": {
       "SessionStart": [
         {
           "command": "cd /caminho/para/makima_personal_agent && .venv/bin/python scripts/ticktick_status.py"
         }
       ]
     }
   }
   ```

   **Windows:**

   ```json
   {
     "hooks": {
       "SessionStart": [
         {
           "command": "C:\\caminho\\para\\makima_personal_agent\\.venv\\Scripts\\python C:\\caminho\\para\\makima_personal_agent\\scripts\\ticktick_status.py"
         }
       ]
     }
   }
   ```

   > **Nota:** O `&&` não funciona no PowerShell 5.1 (padrão do Windows). Por isso usamos o caminho absoluto para o Python e para o script, sem `cd`.

2. Abra uma nova sessão Claude Code no projeto — o status do TickTick aparece automaticamente.

## Saída esperada

```text
=== Makima - Personal Agent (TickTick) ===
[ ] Nami - Finance Agent
    [ ] Contas Fixas
    ...
[x] Kaguya Shinomiya - TickTick Agent
==========================================
```

## Notas

- `settings.local.json` não é commitado — caminhos absolutos são específicos por máquina
- O script reutiliza as mesmas credenciais `TICKTICK_*` do MCP server da Kaguya
- Erros (token inválido, sem internet) são impressos no stderr e ignorados — a sessão continua normalmente
- Para desativar, remova ou renomeie `.claude/settings.local.json`
