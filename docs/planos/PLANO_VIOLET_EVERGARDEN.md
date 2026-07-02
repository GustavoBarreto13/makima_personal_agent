# Plano — Journal vira "Violet Evergarden"

> Status: **planejado, não executado.** Salvo para implementar depois.

## Contexto

O agente `journal` é hoje a única peça do sistema Makima **sem personalidade própria**. O README o descreve literalmente como "agente interno (sem personalidade própria)". Diferente dos outros (`nami`, `kaguya`, `kurisu`, `frieren`), ele:

- **não tem `agent.py`** — só `tools.py`, `__init__.py`, `CLAUDE.md`;
- **não está ligado** no coordinator Makima (não é sub_agent);
- é consumido **apenas pelo webapp** via `webapp/backend/routers/journal.py` → `agents.journal.tools`.

O objetivo é dar a ele a identidade da **Violet Evergarden** — tematicamente perfeita: uma "Auto Memory Doll" que transforma os sentimentos das pessoas em palavras escritas, exatamente o papel de um diário.

**Decisões confirmadas:**
1. **Escopo = "Só personalidade"**: criar `agent.py` com a personalidade da Violet (singleton, padrão Frieren/Nami), mas **NÃO ligar** no coordinator. O webapp continua usando só as tools. Fica pronto para ativar no futuro.
2. **Renomear a pasta** `agents/journal/` → `agents/violet/`, atualizando os imports do webapp e a documentação. A rota REST `/api/journal/` e o arquivo `webapp/backend/routers/journal.py` **permanecem com o mesmo nome** (renomeá-los quebraria o frontend) — só o import interno muda.

**Resultado esperado:** pasta `agents/violet/` com `agent.py` contendo `violet_agent` (personalidade Violet Evergarden, expondo as 7 tools do diário), webapp funcionando igual, docs consistentes.

---

## Parte A — Renomear `agents/journal/` → `agents/violet/`

`git mv agents/journal agents/violet` e atualizar todas as referências ao caminho do **pacote** (não da rota REST).

Arquivos a atualizar (trocar `agents.journal` / `agents/journal` → `agents.violet` / `agents/violet`):

| Arquivo | Linha(s) | Mudança |
|---|---|---|
| `agents/violet/tools.py` | docstring (~11) | `from agents.journal.tools` → `from agents.violet.tools` |
| `agents/violet/__init__.py` | 1 | texto "agente Journal" → "agente Violet" |
| `webapp/backend/routers/journal.py` | 3, 30 | import `from agents.journal.tools import (...)` → `from agents.violet.tools import (...)`; comentário do path |
| `webapp/CLAUDE.md` | 4, 76, 155 | refs `agents/journal/` → `agents/violet/` |
| `README.md` | bloco de estrutura (166-169), seção "Journal" (123-124), refs 45/105/184/191 | ver Parte D |

**NÃO tocar** (camada REST do webapp — manter intacta):
- `webapp/backend/main.py:23` — importa o **router** `routers/journal.py`, que mantém o nome. Sem mudança.
- `webapp/backend/routers/journal.py` — o **arquivo** e a rota `/api/journal/*` continuam com esse nome; só o import interno de `agents.journal.tools` muda.

> O preview da pergunta mencionou `main.py`, mas a verificação do código mostra que `main.py` importa o *router* (cujo nome não muda), então ele não precisa de alteração. O conjunto real de mudanças é o da tabela acima.

---

## Parte B — Criar `agents/violet/agent.py` (personalidade, sem ligar)

Novo arquivo seguindo o padrão de `agents/frieren/agent.py` (singleton ADK, sem MCP). Importa as 7 tools existentes de `agents/violet/tools.py`:

`get_or_create_page`, `upsert_bullet`, `delete_bullet`, `list_heatmap`, `list_mentions`, `get_bullets_by_mention`, `search_bullets`.

Estrutura:
- **Module docstring** descrevendo a Violet (padrão Gustavo: docstring de módulo obrigatória).
- **`_VIOLET_INSTRUCTION`** (string) com 4 blocos, espelhando Frieren/Nami:
  - **FERRAMENTAS** — guia de uso de cada tool. Ponto crítico: o modelo de bullets é **posicional** (`upsert_bullet(page_id, position, content)`). A instrução ensina o fluxo de "adicionar uma entrada ao dia":
    1. `get_or_create_page(date)` para obter a página de hoje e os bullets existentes;
    2. calcular `position` = (maior position existente + 1000), ou `0` se não houver bullets (mesmo espaçamento ×1000 do frontend);
    3. `upsert_bullet(page_id, position, content)`.
    Também: buscar (`search_bullets`), heatmap (`list_heatmap`), menções (`list_mentions`/`get_bullets_by_mention`), apagar (`delete_bullet`, com confirmação).
  - **COMPORTAMENTO** — chamar a tool primeiro, depois responder; confirmar o que foi registrado; preservar literalmente as palavras do usuário (Violet não reinterpreta sentimentos, ela os transcreve).
  - **PERSONALIDADE** — Auto Memory Doll Violet Evergarden: formal, gentil, sincera, precisa; aprendendo sobre emoções humanas; trata cada entrada como uma carta preciosa. Sempre começa com `Violet:`. Frases características:
    - "Vou transcrever seus sentimentos em palavras."
    - "Cada palavra que você me confia será guardada com cuidado."
    - "É uma honra registrar este dia em seu nome."
    - "Auto Memory Doll Violet Evergarden, ao seu dispor."
    - Nunca quebra o personagem. Nunca usa markdown.
  - **FORMATAÇÃO (HTML)** — só HTML + emojis (`✒️` registrar, `📖` diário/página, `🕊️` Violet, `🔍` busca, `🗓️` heatmap). Templates para: entrada registrada, página do dia, resultado de busca, menções, heatmap, erros.
- **`violet_agent = Agent(...)`** — `name="violet_agent"`, `model="gemini-2.5-flash"`, `description` (para roteamento futuro da Makima), `instruction=_VIOLET_INSTRUCTION`, `tools=[as 7 tools]`.

**Sem novas tools** em `tools.py` (respeita o escopo "só personalidade"; webapp intocado). O posicionamento é resolvido via instrução. *Nota para o futuro:* ao ativar via Telegram, um wrapper `add_diary_entry(content, date)` simplificaria o fluxo — fora do escopo agora.

Comentários em PT-BR, abundantes, explicando o porquê — conforme as preferências globais do Gustavo.

---

## Parte C — Atualizar `agents/violet/CLAUDE.md`

- Cabeçalho `## Módulo: agents/journal` → `## Módulo: agents/violet`.
- Adicionar seção **"Personalidade e formatação"** (padrão dos CLAUDE.md de Frieren/Nami): identidade Violet Evergarden, frases características, regra "só HTML, nunca markdown", templates.
- Adicionar nota de **status**: `agent.py` criado com `violet_agent`, porém **ainda não ligado** ao coordinator (singleton pronto para ativação; webapp consome só as tools).
- A seção final "Endpoint de exposição (webapp)" continua válida — atualizar o caminho do tools para `agents/violet/tools.py`.

---

## Parte D — Atualizar `README.md`

- Seção **"### Journal — diário pessoal"** → **"### Violet — diário pessoal"**. Trocar "Agente interno (sem personalidade própria)" por descrição da Violet Evergarden (Auto Memory Doll que transcreve sentimentos), mantendo a lista de funcionalidades.
- **Bloco de estrutura de arquivos** (`└── journal/`): renomear para `violet/` e corrigir o conteúdo para refletir a realidade — `tools.py`, `agent.py # violet_agent (singleton, não ligado)`, `CLAUDE.md`. **Remover** a linha `schema_pg.sql` (esse arquivo não existe; as tabelas são criadas em `tools.py` via `_ensure_tables()`).
- Linha 45 (tabela de features "Diário"), linha 184 (`journal.py # /api/journal/*`): a rota REST continua `/api/journal/` — manter, ajustando só o texto que cita o agente para "Violet".
- Linha 105 ("Amiga" da Kurisu para diário): deixar como está — a Kurisu continua tratando diário hoje (Violet não está ligada). Sem mudança de roteamento.

---

## Arquivos NÃO alterados (importante)

- `coordinator/agent.py` e `coordinator/main.py` — Violet **não** entra como sub_agent (escopo "sem ligar"). Nenhum domínio de sessão novo.
- `webapp/backend/main.py` e a rota `/api/journal/*` — camada REST intacta.
- `agents/violet/tools.py` lógica — só o docstring muda; nenhuma tool nova nem alteração de comportamento.

---

## Verificação

1. **Imports do webapp resolvem após o rename:**
   ```bash
   cd /opt/makima_personal_agent
   python -c "from webapp.backend.routers import journal"   # deve importar sem erro
   ```
   (Confirma que `routers/journal.py` acha `agents.violet.tools`.)
2. **O novo agente importa e instancia:**
   ```bash
   python -c "from agents.violet.agent import violet_agent; print(violet_agent.name, len(violet_agent.tools))"
   # esperado: violet_agent 7
   ```
   > `agents/violet/tools.py` importa `webapp.backend.config.DATABASE_URL` e chama `_ensure_tables()` na importação — precisa de `DATABASE_URL` no ambiente (ou um banco acessível). Sem Postgres local, validar ao menos a sintaxe com `python -m py_compile agents/violet/agent.py`.
3. **Nenhuma referência órfã a `agents/journal` / `agents.journal`:**
   ```bash
   grep -rn "agents\.journal\|agents/journal" --include="*.py" --include="*.md" . | grep -v __pycache__
   # esperado: nada (a rota REST /api/journal/ é intencional e permanece)
   ```
4. **Webapp sobe e a aba Diário continua funcionando** (golden path): criar/editar bullet, ver heatmap, buscar — comportamento idêntico ao de antes do rename.
