# Data Model: Carga histórica do Letterboxd e correção de dados (Akane)

Nenhuma tabela ou coluna nova. As duas entidades relevantes já existem em
`agents/akane/schema_pg.sql`; esta feature muda **comportamento** (quais campos podem mudar,
por qual caminho, e com que garantia de identidade única), não estrutura.

## Filme (`movies`)

Campos relevantes para esta feature (ver `agents/akane/CLAUDE.md` para a lista completa):

| Campo | Papel nesta feature |
|---|---|
| `tmdb_id` | Passa a ser a **chave primária de identidade** para dedup (FR-010), além de alvo do refresh de metadados. |
| `letterboxd_uri` | Continua chave de dedup quando presente; alvo de "anexar" ao fundir com um filme já cadastrado manualmente. |
| `normalizado` | Fallback de identidade quando não há `tmdb_id` nem `letterboxd_uri` resolvíveis. Recalculado sempre que `title` muda (refresh ou edição manual). |
| `title`, `year`, `director`, `genres`, `runtime`, `overview`, `poster_url`, `backdrop_url`, `poster_palette` | **Campos de catálogo** — sobrescritos por "Buscar Dados" (FR-006) e editáveis manualmente (FR-008). Agora vêm em inglês (FR-005). |
| `status`, `rating`, `rating_source`, `liked`, `tags`, `notes` | **Campos pessoais** — nunca tocados por "Buscar Dados"; editáveis manualmente pelas tools já existentes (`update_movie_status`, `rate_movie`, `set_like`, `set_notes`). |
| `last_watched_date`, `times_watched` | **Agregados derivados do diário** — recalculados sempre que uma sessão é criada, editada ou removida (já valia para create/delete; passa a valer para edit — FR-009). |
| `source`, `letterboxd_uri`, `created_at` | **Proveniência** — nunca tocados por "Buscar Dados" nem pela edição manual de catálogo. |

**Identidade (FR-010)** — ordem de resolução ao adicionar/importar um filme:
1. `letterboxd_uri` exato, se informado.
2. `tmdb_id` exato (informado ou resolvido via enriquecimento), entre não-deletados.
3. `normalizado` + `year` exatos, entre não-deletados (só quando os dois anteriores não
   resolvem nada — ex. `--no-tmdb` ou TMDB sem resultado).

Encontrar um id existente por qualquer via ⇒ **fundir** (preencher só os campos vazios,
nunca sobrescrever um valor já presente) em vez de criar um novo registro.

## Sessão (`diary_entries`)

| Campo | Papel nesta feature |
|---|---|
| `watched_date`, `rating`, `review`, `tags`, `rewatch` | Editáveis individualmente por sessão (FR-009), via atualização parcial. |
| `created_at` | Deixa de ser um timestamp incidental — passa a ser o **desempate contratual** de ordem dentro do mesmo `watched_date` (FR-011). A importação grava um valor explícito e incremental (não `NOW()` implícito); a reordenação manual (FR-012) reescreve este campo para as entradas envolvidas. |
| `movie_id` | Usado para recalcular `movies.last_watched_date`/`times_watched` após qualquer edição de sessão. |

Nenhum campo novo de posição (`position_in_day`) — decisão explícita do usuário na
clarificação, para não exigir migração nem mudar os ~5 `ORDER BY` existentes.

## Regras de validação (reforçadas ou novas nesta feature)

- Editar `diary_entries.watched_date` MUST manter `rating` dentro de `[0.5, 5.0]` passo `0.5`
  se `rating` também for editado na mesma chamada (mesma validação de `_validate_rating` já
  usada por `rate_movie`/`log_watch`).
- `update_movie_catalog` só recalcula `normalizado` quando `title` é um dos campos passados —
  os demais campos não disparam recomputação de nada.
- `refresh_movie_metadata` MUST falhar sem tocar nenhuma coluna quando a fonte externa não
  retorna dados (mesmo contrato de falha gracioso que `_enrich_movie_from_tmdb` já tem hoje na
  criação — aqui estendido para nunca aplicar um `UPDATE` parcial).
- `reorder_diary_entries` MUST validar que todos os ids informados pertencem a
  `diary_entries` com o `watched_date` informado antes de aplicar qualquer mudança —
  operação é tudo-ou-nada.
