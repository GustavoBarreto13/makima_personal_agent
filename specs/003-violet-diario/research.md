# Research: Violet · Diário

**Fase 0 — Todas as decisões técnicas resolvidas**
**Gerado por**: `/speckit-plan` em 2026-06-09

---

## Decisão 1: Arquitetura de shell — auto-contido ou react-router nested

**Decision**: Shell auto-contido (`VioletShell`) com roteamento interno por `useState<{view, param}>`,
espelhando `FrierenShell` (`webapp/frontend/src/pages/frieren/FrierenShell.tsx`).

**Rationale**: O FrierenShell é um precedente direto e maduro neste mesmo codebase. O padrão:
sidebar própria, dispatcher `switch (route.view)` no `renderView()`, `scrollRef.current.scrollTop = 0`
ao navegar — elimina a necessidade de aprender um padrão diferente ou sincronizar URLs com cada
sub-tela do diário. A sidebar da Violet tem IAs muito específicas (grupos de nav com contadores,
"Escrever hoje" em destaque, "Voltar à Makima") que não cabem no roteador global.

**Alternatives considered**:
- React Router nested routes (`/journal/write`, `/journal/reflect`, etc.): adiciona URL bookmarkable
  por tela, mas o design do handoff não pressupõe isso e o FrierenShell prova que não é necessário
  para o nível de complexidade desta feature.
- Reusar o `<Journal />` existente com Layout global: incompatível com a sidebar própria da Violet
  e com o tema claro que não pode vazar para o resto do app escuro.

---

## Decisão 2: CSS — tokens OKLCH escopados vs. globais

**Decision**: Tokens em `.vl-app { … }` e `.vl-app[data-theme='dark'] { … }` — **sem** tocar
`:root`, `html` ou `body`.

**Rationale**: O `frieren.css` declara tokens em `:root` e estiliza `html/body` — vazamento que
funciona só porque o FrierenShell toma conta do viewport inteiro. A Violet substitui `/journal`
dentro de uma SPA onde outras rotas (Dashboard, Transactions, etc.) usam o tema escuro global de
`index.css` (hex tokens `--bg-app`, `--t1`–`--t4`). Escopar em `.vl-app` garante isolamento total:
os tokens OKLCH da Violet não afetam nenhuma outra página, e o tema claro padrão não inverte o
dark global ao navegar de volta.

**Alternatives considered**:
- Escopar via `:where(.vl-app)` para menor especificidade: correto, mas sem ganho prático aqui pois
  todos os seletores internos já qualificam elementos dentro de `.vl-app`.
- CSS Modules por componente: mais granular, mas fragmenta o sistema de tokens num projeto onde
  `frieren.css` provou que um único arquivo CSS por shell é suficiente.

---

## Decisão 3: Rota — `/journal/*` reutiliza URL ou nova `/diario/*`

**Decision**: Manter `/journal/*` — trocar o elemento do route em `App.tsx` de `<Journal />`
(em Layout) para `<VioletShell />` (bypassing Layout), sem mudar a URL.

**Rationale**: O `Layout.tsx` já tem o item de nav do diário apontando para `/journal`. Mudar a
URL exigiria atualizar o Layout (e possivelmente links salvos), sem benefício — a substituição
é total. Wildcard `/*` no path (`"/journal/*"`) garante que rotas internas do shell não sejam
interceptadas pelo catch-all.

**Alternatives considered**:
- `/diario/*` como nova rota: mais limpo semanticamente, mas exige atualizar todos os links
  internos e o nav do Layout.

---

## Decisão 4: Schema — migration file separado ou ALTER dentro de `_ensure_tables`

**Decision**: Adicionar os `ALTER TABLE … ADD COLUMN IF NOT EXISTS` dentro de
`agents/journal/tools.py::_ensure_tables()`, seguindo exatamente o padrão já estabelecido pelo
próprio journal e pelos outros agentes.

**Rationale**: Não existe arquivo de migration neste projeto — o schema é criado/migrado via
`_ensure_tables()` chamado automaticamente na importação do módulo. `ADD COLUMN IF NOT EXISTS` é
idempotente, seguro para rodar em produção com dados existentes, e não requer nenhum script de
execução separado. Bullets existentes (sem `kind`) receberão o default `'bullet'`; pages existentes
(sem `dream`) receberão `NULL` — ambos semanticamente corretos.

**Alternatives considered**:
- Arquivo `migrations/VVVV_violet.sql` separado: mais rastreável, mas introduz um padrão novo que
  nenhum agente adota e que requer um script de execução manual no VPS. Custo maior que o benefício
  para um projeto single-user.

---

## Decisão 5: Heatmap — palavras no servidor ou no cliente

**Decision**: Calcular palavras **no servidor**, em `agents/journal/tools.py::list_heatmap()`.
O endpoint retorna `{"YYYY-MM-DD": word_count}` (em vez de `{"YYYY-MM-DD": bullet_count}` atual).

**Rationale**: A contagem de palavras de todo o histórico de um ano (potencialmente 365 dias × N
bullets) seria pesada para fazer no cliente, exigiria buscar todos os textos de bullets, e precisaria
de um endpoint extra. A tools já itera por data para o heatmap — é a oportunidade natural de somar
`len(content.split())` por bullet + `len(dream.split())` por page. Resultado: mesma interface de
endpoint, dados enriquecidos, zero trabalho extra no cliente.

**Alternatives considered**:
- Contar palavras no cliente: requer um endpoint que retorne todos os textos (dados brutos), que
  seria maior payload e mais processamento no navegador.

---

## Decisão 6: Streaks e "Releia-se" — servidor ou cliente

**Decision**: Ambos calculados **no cliente**, a partir dos dados já retornados por `/api/journal/stats`
(streaks) e `/api/journal/collection/{kind}` + `/api/journal/dreams` (seleção "Releia-se").

**Rationale**: Streaks são uma janela deslizante sobre o heatmap (já disponível via endpoint). O
"Releia-se" usa uma semente `dayOfYear` para selecionar 1 item por coleção — lógica determinística
trivial em TypeScript. Expor endpoints específicos para essas derivações adicionaria surface de API
sem necessidade — Minimal Footprint.

**Alternatives considered**:
- Endpoint `/api/journal/reflect` que retorna os 4 itens do "Releia-se": mais puro do ponto de
  vista de separação, mas desnecessário dado o volume baixo e a trivialidade do cálculo.

---

## Decisão 7: Tweaks — localStorage vs. tabela `violet_preferences`

**Decision**: `localStorage` com chave `vl-tweaks`, valor JSON `{theme, accent, mode, typography}`.
Comportamento e chave idênticos ao padrão do `FrierenShell` (`fr-tweaks`).

**Rationale**: O webapp é single-user e não tem tabela de usuário — `require_user` retorna só
`{email, name}` de um cookie, sem row no banco. Criar uma tabela `violet_preferences` seria a
primeira infra de "por-usuário" do projeto, para um único usuário, quando `localStorage` resolve
perfeitamente o caso de uso (mesmo dispositivo, sessões diferentes persistem). Consistente com
a decisão já tomada para o Frieren.

**Alternatives considered**:
- Tabela `violet_preferences (key TEXT PK, value JSONB)` via `_ensure_tables`: funciona e persiste
  entre dispositivos, mas adiciona complexidade desnecessária para um app single-user, single-device.

---

## Decisão 8: Fontes — substituir ou adicionar ao bundle global

**Decision**: **Adicionar** Newsreader ao `<link>` do Google Fonts em `index.html` (DM Sans e
DM Mono já estão lá). **Não remover** Playfair Display e Archivo Black (usadas em outras páginas).
A Violet usa Newsreader/DM Sans/DM Mono; o resto do app continua com suas fontes.

**Rationale**: `violet.css` é importado apenas dentro do VioletShell — as fontes só aplicam onde
necessário. Remover Playfair/Archivo quebraria o Dashboard, Transactions, o Journal antigo (até ser
removido), etc. Adicionar Newsreader é cirúrgico e não impacta outras rotas.

**Alternatives considered**:
- Font loading lazy por rota (dynamic `<link>` injetado pelo VioletShell): mais granular, mas
  introduz flash e complexidade desnecessária; `<link rel="preconnect">` no `<head>` já é suficiente
  para que apenas as fontes usadas sejam baixadas pelo navegador.

---

## Decisão 9: `num` — coluna ou derivado

**Decision**: `num` (número sequencial `#132`) é derivado na query via
`ROW_NUMBER() OVER (ORDER BY date)` — **sem nova coluna**.

**Rationale**: `num` é uma propriedade da ordenação das entries, não dos dados. Criar uma coluna
seria um denormal que precisaria ser gerenciado (recalcular ao deletar uma entry histórica, etc.).
A query `SELECT *, ROW_NUMBER() OVER (ORDER BY date) AS num FROM journal_pages WHERE type_id = 1`
é trivial e correta por construção.

**Alternatives considered**:
- Coluna `num SERIAL` auto-incrementada: simples, mas produz "buracos" ao deletar entries (o
  que é incomum, mas possível). `ROW_NUMBER()` garante sequência contínua.

---

## Decisão 10: Componente TweaksPanel — reusar `tweaks-panel.jsx` ou reescrever

**Decision**: Reescrever como `TweaksPanel.tsx` em TypeScript dentro de `pages/violet/`, sem
importar o `tweaks-panel.jsx` do handoff (que é código de protótipo, não de produção).

**Rationale**: O `tweaks-panel.jsx` usa `window.*` e o sistema de componentes do protótipo. A
produção usa React com TypeScript tipado. A lógica do TweaksPanel é simples o suficiente (4
controles, localStorage) para ser reescrita em ~100 linhas — o FrierenShell tem o precedente
exato a seguir.

---

## NEEDS CLARIFICATION — resolvidos

Nenhum item `[NEEDS CLARIFICATION]` pendente. Todas as decisões acima foram resolvidas por:
- Exploração do codebase (FrierenShell como precedente).
- Confirmação direta com o usuário (escopo full-stack, tema claro, Tweaks localStorage).
