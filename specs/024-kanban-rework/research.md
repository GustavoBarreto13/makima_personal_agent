# Research — 024 Kanban "Vidro" + Views

Decisões técnicas que resolvem os itens **Deferred/Outstanding** da spec e as escolhas de stack. Formato: Decisão · Racional · Alternativas rejeitadas.

## R-1. Onde avaliar o filtro da view (client vs server)

**Decisão:** Avaliação **server-side**, reusando `agents/kaguya/tools_filters._build_where_from_rules`. Nova função de lógica `list_board_tasks(project_id, rules=None)` que escopa por `t.project_id = %(pid)s` e aplica os fragmentos da DSL. Quando a view ativa **não** tem filtro, o frontend continua usando `listTasks(projectId)` (caminho atual, intocado).

**Racional:** O DSL já tem um tradutor regra→SQL parametrizado e testado (SC-003 da fatia 013). Reimplementar isso em TS duplicaria a semântica (datas relativas `today`/`Nd`, `tag has/not_has`, `text ILIKE`) e abriria divergência. Reuso = fonte única.

**Alternativas rejeitadas:**
- *Filtro client-side em TS* — duplica o motor, risco de divergência de semântica e de regressão silenciosa quando o DSL evoluir.
- *Sempre passar pelo endpoint filtrado* — desnecessário no caso comum (view "Completa" sem filtro) e mexeria no caminho de carga já otimizado.

## R-2. Default "só abertas" do DSL vs board (que mostra concluídas na coluna done)

**Decisão:** `_build_where_from_rules` hoje injeta `AND completed_at IS NULL` quando não há condição `state`. Para o board isso é **errado** (a coluna "concluído" precisa exibir tarefas concluídas). Refator mínimo: extrair a montagem da base para aceitar um parâmetro `default_open: bool = True`; `list_board_tasks` chama com `default_open=False`. As smart-lists continuam com `default_open=True` (comportamento atual inalterado).

**Racional:** Mudança cirúrgica que preserva 100% do comportamento das smart-lists (gate `test_kaguya_filters` continua verde) e dá ao board a semântica correta. O board gerencia open/done pela coluna, não pelo filtro.

**Alternativas rejeitadas:**
- *Sempre injetar `state` no rules do board* — frágil; o usuário pode querer um filtro que mexa em state.
- *Duplicar `_build_where_from_rules`* — viola DRY/fonte única.

## R-3. Preservar as otimizações DnD ao introduzir filtro/reload

**Decisão:** O `handleDragEnd` mantém o **optimistic update** + **reload silencioso**. O reload silencioso passa a chamar `listTasks` **ou** `list_board_tasks` conforme a view ativa tenha filtro — a função de carga vira um `useCallback` que escolhe a fonte. `firstLoad`/spinner, `PointerSensor`, `DragOverlay`, `SortableContext` e o fluxo de drop em "concluído" ficam idênticos (R19).

**Racional:** A troca de fonte de dados acontece só no ponto de fetch; a mecânica de drag não muda. Sem regressão.

## R-4. Performance do `backdrop-filter: blur` durante o drag (R20)

**Decisão:** (a) Aplicar blur só nas 3 superfícies do design (coluna, card, rodapé) — não aninhar blurs; (b) o **DragOverlay** renderiza um card **sem** `backdrop-filter` (usa fundo sólido equivalente) para não recompor blur a cada frame; (c) usar `will-change: transform` apenas no card arrastado; (d) `contain: paint` nas colunas para isolar repaint. Critério de aceite: ~60fps com ≥30 cards (R20/A6).

**Racional:** `backdrop-filter` é caro quando reavaliado por frame sob elementos em movimento. Tirar o blur do overlay e isolar paint por coluna elimina o gargalo sem perder o visual (a coluna estática mantém o glass).

**Alternativas rejeitadas:**
- *Blur no board inteiro* — força recomposição global a cada movimento de card.
- *Desligar blur durante o drag* — flicker visual perceptível.

## R-5. Carregamento das fontes (Hanken Grotesk / DM Sans / DM Mono)

**Decisão:** Adicionar as 3 famílias via o pipeline já usado pelos outros shells (import no CSS do domínio / `<link>` no `index.html` conforme o padrão atual do projeto), escopadas para o shell Kaguya. Confirmar no plano de tasks qual mecanismo os outros domínios usam e seguir o mesmo (consistência).

**Racional:** Fidelidade tipográfica é parte de A1; sem as fontes corretas o board não fica pixel-fiel. Reusar o mecanismo existente evita um novo pipeline (Minimal Footprint).

**Alternativas rejeitadas:** *Fontes do sistema* — quebra a fidelidade; *novo pipeline de self-host* — footprint desnecessário se já existe um.

## R-6. Cor do capacity meter / dot da coluna (Q-B da spec)

**Decisão:** Usar o **accent ativo** dos `Tweaks` (`--kg` e variações por accent). Colunas não têm campo de cor no schema e adicioná-lo está fora do escopo. Coluna "concluído" usa `--done` no dot; o capacity meter fica oculto nela (R6).

**Racional:** Sem schema novo, visual coeso com o accent escolhido pelo usuário.

## R-7. Persistência da view ativa por lista

**Decisão:** localStorage, chave `kaguya:kanban:active-view:<project_id>` → `view_id`. Ao abrir o board: se a chave existir e a view ainda existir no backend, ativa-a; senão cai na built-in "Completa". Segue o padrão dos `Tweaks` (estado local de UI, não server-side).

**Racional:** Preferência de visualização por lista é estado de UI; não justifica coluna no banco. Coerente com a decisão de clarify (views globais, ativa lembrada por lista).

## R-8. Seed e proteção da view built-in "Completa"

**Decisão:** Seed via `INSERT ... ON CONFLICT DO NOTHING` no `schema_tasks_pg.sql` (idempotente), com `is_builtin = true`. `update`/`delete` na camada de lógica retornam `{"status":"error"}` se o alvo for `is_builtin` (HTTP 400 no router). A migração one-time roda dentro do container `makima-web` via `setup_schemas.py` (host não resolve o hostname do Postgres do Swarm).

**Racional:** Garante o baseline de fidelidade (A1/A8) sempre presente e imutável.

## Resumo dos NEEDS CLARIFICATION

| Item | Status |
|---|---|
| Avaliação do filtro (client/server) | Resolvido (R-1: server, reuso do DSL) |
| Default "só abertas" no board | Resolvido (R-2: base parametrizável) |
| Otimizações DnD com filtro | Resolvido (R-3) |
| Performance do blur | Resolvido (R-4) |
| Fontes | Resolvido (R-5; mecanismo exato → confirmar nas tasks) |
| Cor da coluna (Q-B) | Resolvido (R-6: accent) |
| Memória de view ativa | Resolvido (R-7: localStorage por lista) |
| Built-in seed/proteção | Resolvido (R-8) |
