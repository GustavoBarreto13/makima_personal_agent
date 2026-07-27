# Data Model: Expor na interface funcionalidades já prontas no backend

Nenhuma tabela nova, nenhuma coluna nova, nenhuma rota REST nova, nenhum método novo em
`akaneApi.ts`. Todos os 8 gaps são pura exposição de UI sobre backend já funcional.

| FR | Backend (já existe, sem mudança) | Frontend (o que muda) |
|---|---|---|
| FR-001 | `add_to_list`, rota `POST /lists/{id}/items`, `akaneApi.addToList` | novo `AddToListModal.tsx` a partir de `MovieDetailScreen` |
| FR-002 | `update_list`, rota `PATCH /lists/{id}`, `akaneApi.updateList` | `CreateListModal` em `ListsScreen.tsx` ganha modo edição |
| FR-003 | `add_vault_item`/`delete_vault_item`, rotas já existem, `akaneApi.addVault`/`deleteVault` | `MovieDetailScreen.tsx` — seção Cofre ganha form inline + botão remover |
| FR-004 | `run_sync`, rota `POST /sync-letterboxd`, `akaneApi.syncLetterboxd` | botão na sidebar do `AkaneShell.tsx` |
| FR-005 | `get_heatmap`, rota `GET /heatmap`, `akaneApi.heatmap` | novo `components/Heatmap.tsx` (porta de `frieren/ui/Heatmap.tsx`) + bloco em `RewindScreen.tsx` |
| FR-006 | `delete_movie`, rota `DELETE /{id}`, `akaneApi.delete` | botão + confirmação em `MovieDetailScreen.tsx` |
| FR-007 | `delete_diary_entry`, rota `DELETE /diary/{id}`, `akaneApi.deleteDiary` | botão + confirmação por linha do histórico em `MovieDetailScreen.tsx` |
| FR-008 | `get_rewind` já retorna `top_people` (corrigido spec 049) | `<TopLista titulo="Pessoas mais assistidas" lista={data.top_people} />` em `RewindScreen.tsx` |
| FR-009 | — (frontend puro) | `HomeScreen.tsx`/`TagsScreen.tsx`/`ListsScreen.tsx` distinguem erro de rede vs. vazio |
| FR-010 | — (frontend puro) | copy de `WatchlistScreen.tsx` corrigida para referenciar o botão real ("Logar filme") |

## Entidades

- **Lista**: sem mudança de shape — `MovieList`/`MovieListDetail` já têm `name`,
  `description`, `accent`, `ranked`. A UI passa a permitir editar os 3 primeiros campos.
- **Item do Cofre**: sem mudança de shape — `VaultItem` já tem `type` (`video`/`article`/
  `essay`/`review`), `title`, `url`, `source`. A UI passa a permitir criar/remover.
- **Mapa de calor**: `HeatmapDay {date, count}` já é o shape retornado por `get_heatmap` e
  já tipado em `types.ts` — mesmo shape do `HeatmapDay` da Frieren, exceto o nome do campo
  (`count` vs. `pages`), então o componente portado troca só esse nome.

## Contratos

Nenhum contrato novo — ver `contracts/rest-api.md` (confirma que as ~12 rotas envolvidas já
existem e documenta apenas o consumo do lado do frontend).
