# Research: Favoritar Bullet pelo Próprio Ícone

**Feature**: 007-favorite-bullet | **Branch**: `007-favorite-bullet` | **Date**: 2026-06-10

---

## Decisão 1 — Onde armazenar o estado de favorito

**Decisão**: Coluna `favorite BOOLEAN NOT NULL DEFAULT FALSE` na tabela `journal_bullets`
existente — **não** uma tabela separada.

**Rationale**: Favorito é um atributo direto do bullet (Key Entities da spec: "Bullet
(extensão)"). Uma tabela separada adicionaria JOIN desnecessário em cada leitura de página.
O padrão já estabelecido no projeto é exatamente este: a coluna `kind` foi adicionada via
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` após a criação inicial da tabela (ver
`agents/journal/tools.py:132-137`). `DEFAULT FALSE` garante retrocompatibilidade com todos
os bullets existentes (FR-001: padrão "não favorito" na criação).

**Alternativas consideradas**:
- Tabela `journal_favorites (bullet_id)`: overhead de JOIN em cada `get_or_create_page`,
  sem benefício — rejectada.
- Campo no `content` serializado: inviabiliza busca, quebra contagem de palavras — rejectada.

---

## Decisão 2 — Endpoint de alteração do favorito

**Decisão**: `PATCH /api/journal/bullets/{id}/favorite` com body `{favorite: bool}` (estado-alvo
explícito), embrulhando a tool `set_favorite(bullet_id, favorite)`.

**Rationale**: O `upsert_bullet` existente usa `ON CONFLICT (page_id, position) DO UPDATE SET
content = EXCLUDED.content, kind = EXCLUDED.kind` — não inclui `favorite` no `DO UPDATE SET`,
o que é correto para preservar o favorito em edições de texto. Mas isso significa que **não é
possível alterar o favorito pelo upsert sem mudar a sua semântica**. Um endpoint dedicado
(PATCH com o `id` do bullet) isola completamente as duas operações.

**Estado-alvo vs toggle no servidor**: o frontend faz optimistic update antes da resposta.
Se o usuário clicar duas vezes rapidamente (raro mas possível), um `toggle` no servidor
produziria o estado errado quando a resposta chegasse fora de ordem. `set_favorite(id, bool)`
com o estado-alvo explícito é idempotente e correto em qualquer ordem de chegada.

**Alternativas consideradas**:
- `toggle_favorite(id)` sem body: race condition possível com double-click rápido — rejectado.
- Passar `favorite` no `upsert_bullet` body: alteraria a semântica do upsert (edição de texto
  precisaria sempre enviar o estado de favorito) — acoplamento indesejado, rejectado.

---

## Decisão 3 — Aggregação para heatmap (FR-007)

**Decisão**: Tool `list_favorite_days(year) -> list[str]` retornando `["YYYY-MM-DD", ...]`
(apenas datas com ao menos um bullet favorito no ano), exposta como
`GET /api/journal/favorite-days?year=`. Segue o padrão de `list_heatmap`.

**Rationale**: FR-007 exige que o sistema identifique dias com favoritos de forma agregada por
ano — é o insumo direto do heatmap da spec 008. Entregar o endpoint junto com a feature evita
uma segunda migração quando a 008 for implementada. O JOIN `journal_bullets × journal_pages` com
`GROUP BY date HAVING BOOL_OR(b.favorite)` é equivalente ao padrão já usado em `list_heatmap`.

**Alternativas consideradas**:
- Adiar para spec 008: criaria um PR sem o endpoint necessário para quem implementar 008 —
  rejectado pois o requisito é desta spec (FR-007).
- Estender `list_heatmap` para retornar `has_favorite` por dia: mudaria o contrato de
  `list_heatmap` (quebraria frontend existente) — rejectado.

---

## Decisão 4 — Optimistic update no frontend

**Decisão**: Ao clicar no marcador, **inverter `favorite` do bullet imediatamente** no
`useState` local (`setBullets`), **depois** chamar `violetApi.setFavorite()`. No `.catch`,
reverter o bullet ao estado anterior.

**Rationale**: SC-001 exige feedback visual em < 200 ms — impossível com round-trip de rede
antes da atualização visual. O padrão atual do `Write.tsx` não usa optimistic updates (aguarda
a resposta da API antes de atualizar `setBullets`). Para o favorito, o optimistic update é
natural: o estado é booleano e o rollback é trivial (guardar o valor anterior).

**Implementação**: salvar `const anterior = b.favorite` antes do update, reverter com
`setBullets(prev => prev.map(b => b.id === id ? {...b, favorite: anterior} : b))` no `.catch`.

**Alternativas consideradas**:
- Aguardar resposta da API (padrão atual do Write): feedback visual só após round-trip de rede
  (~100-500ms), viola SC-001 — rejectado.
- React Query / SWR para cache e invalidação: overkill para um campo booleano em componente
  local; sem store global a invalidar — rejectado.

---

## Decisão 5 — Feedback visual: cor garnet

**Decisão**: Classe CSS `is-fav` no elemento `.dot` ou `.glyph` dentro de `.b-mark`, com
regras `.b-mark .dot.is-fav { background: var(--garnet) }` e
`.b-mark .glyph.is-fav { color: var(--garnet) }`.

**Rationale**: O token `--garnet` já existe na paleta OKLCH do Violet (definido em
`violet.css:42` para light e `:131` para dark). É a cor já usada para o kind `highlight`
(`violet.css:353`) e para os cartões de emoção (feature 006). A spec cita explicitamente
"vermelho garnet" como cor do favorito. Usar `is-fav` como classe separada — em vez de um
atributo `data-favorite` — segue o padrão de `.glyph` e `.dot` já existentes no CSS.

**Alternativas consideradas**:
- `data-favorite="true"` como seletor CSS: funcional, mas `is-fav` é mais idiomático no CSS
  do projeto (classes utilitárias com `is-*` para estado) — análise de custo-benefício neutra,
  optamos pela classe por consistência com o resto do Tailwind/CSS do projeto.
- Ícone de estrela/coração diferente quando favoritado: a spec é explícita — o marcador
  *existente* muda de cor, não troca de ícone — rejectado.

---

## Decisão 6 — Cursor e affordance no marcador

**Decisão**: `cursor: pointer` em `.b-mark` + atributo `title` no elemento `<div className="b-mark">`
com texto dinâmico "Favoritar" / "Desfavoritar" (FR-004).

**Rationale**: Hoje `.b-mark` não tem `cursor` nem handler — está sem affordance. Adicionar
`cursor: pointer` é suficiente para indicar clicabilidade. O `title` provê a dica textual
exigida por FR-004. Nenhum tooltip customizado necessário: o `title` HTML nativo é suportado
em todos os browsers-alvo e não adiciona dependência.

**Alternativas consideradas**:
- Tooltip customizado (componente React): overkill para um ícone; aumentaria bundle —
  rejectado.
- `aria-label` em vez de `title`: `aria-label` serve para acessibilidade de screen reader,
  `title` para tooltip visual. Podemos usar ambos no mesmo elemento — incluiremos os dois.
