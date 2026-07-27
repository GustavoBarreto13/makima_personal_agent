# Contracts: Correções de bugs da Akane

Nenhuma rota nova. Um único campo adicionado a uma rota existente; o restante são correções
de bug internas sem mudança de contrato observável (exceto o conteúdo passar a estar certo).

## `GET /api/movies/tmdb/search?q=...` (US3, FR-006)

Cada item do array retornado ganha dois campos novos (aditivo, não quebra consumidores
existentes que ignoram campos desconhecidos):

```jsonc
{
  "tmdb_id": 129,
  "title": "Perfect Blue",
  "year": 1997,
  "poster_url": "https://...",
  "director": [],
  "local_id": 42,       // NOVO: id em `movies` se já catalogado, senão null
  "in_catalog": true    // NOVO: atalho booleano equivalente a local_id != null
}
```

## `GET /api/movies/home` (US1/US2 — FR-001, FR-002, FR-003)

Shape inalterado — a correção é que `recent_activity[].liked` reflete o valor real do filme
(antes: erro 500) e que os buckets do histograma (`histogram["1.0"]`..`histogram["5.0"]`)
agora aparecem no frontend (o backend já produzia essas chaves; só o `HomeScreen.tsx` que
lia a chave errada).

## `GET /api/movies/rewind/{year}` (US2 — FR-004)

Shape inalterado — `top_people[].name` passa a ser o nome de exibição (`movie_people.name`)
em vez do normalizado (`movie_people.normalizado`).

## `POST /api/movies` (log/add) (US3 — FR-006)

Sem mudança de contrato — a correção acontece antes desta chamada (o frontend só chama esta
rota quando o filme genuinamente não está no catálogo; quando já está, o fluxo de log usa a
rota de sessão de diário diretamente com o `local_id` recebido da busca).
