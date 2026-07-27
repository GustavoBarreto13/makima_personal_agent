# Implementation Plan: Expor na interface as funcionalidades de filmes já prontas no backend

**Branch**: `master` | **Date**: 2026-07-27 | **Spec**: `specs/051-akane-ui-gaps/spec.md`

**Input**: Feature specification from `specs/051-akane-ui-gaps/spec.md`

## Summary

Oito lacunas de UI na Akane (agente de filmes) onde o backend já está 100% pronto
(`research.md` confirma tools + rotas REST + `akaneApi.ts` todos existentes e corretos) mas
nenhum componente do webapp os consome: (1) adicionar filme a lista / editar lista; (2)
Cofre editável (add/remove); (3) botão de sincronização manual com o Letterboxd; (4) mapa de
calor de atividade; (5) excluir filme / excluir sessão do diário; (6) bloco "pessoas mais
assistidas" no Rewind (dado já flui, só falta renderizar); (7) distinguir erro de rede de
estado vazio genuíno em Início/Etiquetas/Listas; (8) corrigir a copy do estado vazio da
Watchlist, que hoje referencia um botão ("+ Watchlist") que não existe em lugar nenhum do
shell. Trabalho quase inteiramente frontend — zero rotas novas, zero métodos novos em
`akaneApi.ts`, zero migração de schema.

## Technical Context

**Language/Version**: TypeScript/React (frontend) — stack já em uso; nenhuma mudança de
backend Python nesta spec (exceto nenhuma — todas as tools já existem).

**Primary Dependencies**: Nenhuma nova.

**Storage**: PostgreSQL — nenhuma tabela ou coluna nova; toda a leitura/escrita já passa
pelas tools existentes de `agents/akane/tools.py`.

**Testing**: Sem suíte automatizada no repo (padrão das specs 024–049) — validação por
`quickstart.md` + `tsc -b --force` + `npm run build`.

**Target Platform**: Webapp (React), shell `/movies/*`.

**Project Type**: Web application (frontend puro nesta spec).

**Performance Goals**: Sem exigência nova — todas as chamadas já existem e já são usadas
em outros fluxos (ex.: `deleteList`/`removeFromList` já usados em `ListsScreen.tsx`).

**Constraints**: Não introduzir componentes cross-shell novos (`ErrorState`/`EmptyState`
compartilhado) — cada tela mantém o fix local, consistente com o padrão já observado no
shell Akane (nenhuma extração cross-shell existe hoje, conforme `webapp/CLAUDE.md`).

**Scale/Scope**: Usuário único.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Agent Specialization**: Tudo no domínio Akane (filmes); nenhuma mistura com outro
  agente. **PASS**.
- **II. Hybrid Batch + Agentic**: Feature 100% interativa (webapp); nenhuma automação nova.
  **PASS**.
- **III. Self-Contained Agents**: Nenhuma mudança em `agents/akane/tools.py` — só consumo
  via `akaneApi.ts` já existente. **PASS**.
- **IV. Portuguese-First UX**: Toda a UI nova em português, mesmo tom já usado no shell.
  **PASS**.
- **V. Minimal Footprint**: Zero dependências novas, zero rotas novas, zero tabelas/colunas
  novas — pura exposição de UI sobre backend já pronto. **PASS**.

Nenhuma violação — sem entradas na tabela de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```
specs/051-akane-ui-gaps/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # Fase 0 — R1..R8
├── data-model.md        # Fase 1
├── contracts/
│   └── rest-api.md      # Fase 1
├── quickstart.md         # Fase 1
└── tasks.md              # /speckit-tasks (próximo)
```

### Source Code (arquivos tocados)

```
webapp/frontend/src/pages/akane/
├── modals/
│   └── AddToListModal.tsx      # NOVO — seletor de listas + criar nova, a partir do detalhe
├── screens/
│   ├── ListsScreen.tsx          # CreateListModal ganha modo edição (nome/descrição/cor)
│   ├── MovieDetailScreen.tsx    # botão "Adicionar a lista"; Cofre editável (add/remove);
│   │                            #   excluir filme + excluir sessão (com confirmação)
│   ├── RewindScreen.tsx         # bloco heatmap + TopLista "Pessoas mais assistidas"
│   ├── HomeScreen.tsx           # distingue erro de rede vs. vazio
│   ├── TagsScreen.tsx           # idem
│   ├── ListsScreen.tsx          # idem (mesma tela do R1 acima)
│   └── WatchlistScreen.tsx      # copy do estado vazio corrigida
├── components/
│   └── Heatmap.tsx               # NOVO — porta de frieren/ui/Heatmap.tsx (pages→count)
├── AkaneShell.tsx                # botão "Sincronizar Letterboxd" na sidebar
└── akane.css                     # classes do heatmap (.heat-*, .hm-*) escopadas
                                    #   em .akane-shell + tokens --heat-0..4

webapp/docs/FRONTEND.md            # gaps fechados documentados
ROADMAP.md                          # nova linha fase 051
```
