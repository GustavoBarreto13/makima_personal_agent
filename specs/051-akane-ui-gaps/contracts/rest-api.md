# Contracts: Expor na interface funcionalidades já prontas no backend

Nenhuma rota nova. Todas as rotas abaixo já existem em `webapp/backend/routers/movies.py` e
já são wrapeadas em `akaneApi.ts` — esta spec só passa a **consumi-las** pelo frontend.

| Rota | Método | Já existe? | Wrapper `akaneApi.ts` | Consumida pela UI antes desta spec? |
|---|---|---|---|---|
| `/api/movies/lists/{id}/items` | POST | sim | `addToList` | não |
| `/api/movies/lists/{id}` | PATCH | sim | `updateList` | não |
| `/api/movies/{id}/vault` | POST | sim | `addVault` | não |
| `/api/movies/vault/{id}` | DELETE | sim | `deleteVault` | não |
| `/api/movies/sync-letterboxd` | POST | sim | `syncLetterboxd` | não |
| `/api/movies/heatmap` | GET | sim | `heatmap` | não |
| `/api/movies/{id}` | DELETE | sim | `delete` | não |
| `/api/movies/diary/{id}` | DELETE | sim | `deleteDiary` | não |
| `/api/movies/rewind` | GET | sim (`top_people` já no payload) | `rewind` | sim, mas `top_people` não é renderizado |

Nenhum novo campo de request/response é necessário — os 8 gaps são exclusivamente
consumo de payloads e ações já suportadas ponta a ponta.
