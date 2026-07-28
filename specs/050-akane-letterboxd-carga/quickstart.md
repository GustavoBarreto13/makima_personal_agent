# Quickstart: Validação — Carga histórica do Letterboxd e correção de dados (Akane)

Sem suíte automatizada (padrão do repo). Validação manual, contra um banco de teste (nunca
contra o catálogo real do usuário até o passo final de produção).

## Pré-requisitos

- `DATABASE_URL` apontando para um Postgres com o schema da Akane já criado
  (`python -m scripts.setup_schemas`, ou reaproveitar um ambiente de dev já existente).
- `TMDB_API_KEY` válida (para os cenários que envolvem enriquecimento).
- Uma pasta de export de teste do Letterboxd com pelo menos: `diary.csv`, `watchlist.csv`,
  `ratings.csv`, `watched.csv`, contendo:
  - 1 filme só no `watched.csv` (sem diário/nota/resenha).
  - 1 filme presente tanto no `diary.csv` quanto no `watched.csv` (mesma `Letterboxd URI`).
  - 3 linhas de `diary.csv` com a mesma `Date` (para testar ordem no mesmo dia).
- Frontend rodando (`npm run dev` em `webapp/frontend/`) contra o backend local
  (`uvicorn webapp.backend.main:app --reload --port 8000`).

## Cenário 1 — `watched.csv` processado (US1, FR-001)

```bash
python -m scripts.import_letterboxd_csv /caminho/export -v
```
Esperado: o filme presente só em `watched.csv` aparece no catálogo com `status='watched'`,
sem entrada em `diary_entries` para ele. Confirmar via `GET /api/movies?status=watched` no
frontend (aba Filmes).

## Cenário 2 — Idempotência (SC-002)

Rodar o mesmo comando do Cenário 1 de novo. Esperado: contadores de "criados" zerados na
segunda execução; contagem total de filmes e sessões idêntica à primeira.

## Cenário 3 — `--no-tmdb` uniforme (US2, FR-003)

```bash
python -m scripts.import_letterboxd_csv /caminho/export-vazio --no-tmdb -v
```
Esperado (com um export só de `watchlist.csv`): nenhuma chamada de rede ao TMDB — monitorar
logs (nível DEBUG) e confirmar ausência de linhas de busca TMDB; filmes da watchlist ficam
sem pôster/diretor.

## Cenário 4 — Dedup filme manual + Letterboxd (US6, FR-010)

1. Pelo frontend, adicionar manualmente um filme que também está no export de teste
   (mesmo título/ano, sem vínculo Letterboxd).
2. Rodar a importação com esse export.
3. Esperado: catálogo continua com um único registro para esse filme, agora com
   `letterboxd_uri` preenchido; nenhum dado que já estava no registro manual foi perdido.

## Cenário 5 — Metadados em inglês (US4, FR-005/SC-005)

Buscar um filme em `GET /api/movies/tmdb/search?q=<titulo>` (ou pela busca "Logar filme" no
frontend) e confirmar que `overview`/`genres` vêm em inglês.

## Cenário 6 — "Buscar Dados" (US4, FR-006/FR-007/SC-006)

1. Abrir o detalhe de um filme já importado (idealmente um com metadados em português, de
   antes da mudança de idioma).
2. Anotar nota, coração, anotações e sessões atuais.
3. Acionar "Buscar Dados".
4. Esperado: sinopse/gêneros passam a inglês; nota/coração/anotações/sessões inalterados.
5. Repetir para um filme deliberadamente mal-casado (ex.: título ambíguo) e usar a opção de
   trocar candidato — confirmar que o filme correto substitui o anterior sem duplicar o
   registro.
6. Derrubar `TMDB_API_KEY` (valor inválido temporário) e repetir o passo 3 — esperado: erro
   visível, filme permanece com os dados anteriores.

## Cenário 7 — Edição manual (US5, FR-008/FR-009)

1. No detalhe do filme, editar título/ano/diretor/duração/gêneros/sinopse pelo modal novo.
   Esperado: valores persistem após reabrir a tela.
2. Editar uma sessão existente (data para uma data mais recente, nota, resenha, tags,
   revisão). Esperado: `last_watched_date` e `times_watched` do filme refletem a mudança.

## Cenário 8 — Ordem no mesmo dia (US7, FR-011/FR-012/SC-008)

1. Importar o export de teste com as 3 sessões do mesmo dia (Cenário 1).
2. Na tela Diário, confirmar que as 3 aparecem na mesma ordem das linhas do CSV.
3. Reordenar pela interface e recarregar a página — confirmar que a nova ordem persiste.

## Cenário 9 — Carga real em produção (US3, FR-004, SC-004)

Roteiro documentado (a manter em `agents/akane/CLAUDE.md`, seção "Scripts de sincronização"):

```bash
docker cp ~/Downloads/letterboxd_export makima-web:/app/letterboxd_export
docker exec makima-web sh -c "cd /app && python -m scripts.import_letterboxd_csv letterboxd_export -v"
```
Confirmar ao final: contagem de filmes coerente com o perfil público do Letterboxd do
usuário; rodar o mesmo comando de novo e confirmar contagem idêntica (idempotência em
produção).
