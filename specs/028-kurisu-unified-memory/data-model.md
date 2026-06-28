# Data Model: Kurisu — Memória Unificada (spec 028)

A 028 **não** cria tabelas novas no Postgres. As entidades aqui são (a) os **documentos** que vão para
o corpus operacional do Vertex e (b) o **estado de controle** do sync. As tabelas de origem são lidas
read-only; o destino é o corpus Vertex.

---

## Entidade: Documento de memória (RagFile no corpus operacional)

A unidade indexada. Dois formatos (representação mista — R4), ambos com o mesmo bloco de metadados.

| Campo (metadado) | Tipo | Descrição |
|---|---|---|
| `domain` | str | Domínio de origem: `financas`, `tarefas`, `diario`, `pessoas`, `livros`, `filmes`, `animes`, `series`. |
| `doc_date` | date (UTC-3) | Data local do conteúdo. Base da recência e da citação. Derivada via `AT TIME ZONE 'America/Sao_Paulo'`. |
| `source_ref` | str | Identidade da(s) linha(s) de origem (ex.: `tarefa:123`, `bullet:2026-05-04:cmpl`, `filme:tt0...`). Usado no prune e na citação. |
| `source_type` | str | `resumo` (datado) ou `individual`. |
| `content_hash` | str | Hash do texto renderizado. Detecta alteração → `delete_file`+reimport. |

### Formato A — Documento resumo (datado)

Atividade (tarefas concluídas) e finanças (gastos). Um documento por período (dia/semana).

- **Texto**: render legível em PT — ex.: "Atividade da semana de 2026-05-04 a 05-10: concluídas as
  tarefas X, Y, Z…" / "Gastos da semana de …: R$ … em categoria A, …".
- **`source_type`** = `resumo`; **`source_ref`** = identificador do período + domínio.

### Formato B — Documento individual

Bullet de diário (Violet), item de mídia (Frieren/Akane/Marin/Mai), pessoa (Komi).

- **Texto**: o conteúdo do item em PT — ex.: bullet do diário, "Filme: Duna (visto em 2026-05-03,
  nota 4.5)", ficha curta da pessoa.
- **`source_type`** = `individual`; **`source_ref`** = id da linha de origem.

---

## Entidade: Watermark de sync (estado de controle)

Por domínio, marca até onde o sync já processou. Persistência leve (ver Restrições — tabela própria
pequena OU arquivo de estado; decisão de `/speckit-tasks`).

| Campo | Tipo | Descrição |
|---|---|---|
| `domain` | str (PK) | Domínio. |
| `last_synced_at` | timestamptz | Maior `updated_at`/`created_at` já ingerido. Base do incremental. |
| `doc_count` | int | Nº de documentos do domínio no corpus (base da trava ≤50%). |
| `last_run_at` | timestamptz | Quando o último ciclo rodou (observabilidade). |

---

## Entidade: Domain Exporter (componente, não dado)

Um por domínio. Lê as tabelas do domínio (read-only) e **rende** documentos (Formato A ou B) + metadados.

| Exporter | Lê (read-only) | Produz |
|---|---|---|
| financas | tabelas da Nami | resumos datados de gastos |
| tarefas | tabelas da Kaguya | resumos datados de tarefas concluídas |
| diario | bullets da Violet | documentos individuais (bullet) |
| pessoas | tabelas da Komi | documento individual por pessoa |
| livros/filmes/animes/series | logs de Frieren/Akane/Marin/Mai | documentos individuais por item consumido |

---

## Relações

```
Tabelas Postgres (origem, read-only)
      │  Domain Exporter (1 por domínio) — render + metadados
      ▼
Documento de memória (Formato A ou B)  ──import_files──▶  Corpus operacional Vertex (separado)
      ▲                                                          │
   Watermark de sync (controle incremental + trava ≤50%)        │ retrieval_query (1 de 2)
                                                                 ▼
                              buscar_na_base ──merge+recência──▶ resposta da Kurisu
                                     ▲
                              Corpus da wiki (027) — retrieval_query (2 de 2)
```

---

## Regras de validação (dos requisitos)

- **Read-only** (FR-002): exporters nunca escrevem nas tabelas de origem.
- **Metadados obrigatórios** (FR-004): todo documento tem `domain`, `doc_date`, `source_ref`.
- **UTC-3** (FR-010): `doc_date` é sempre data local; nunca a data UTC do container.
- **Incremental** (FR-006): só linhas novas/alteradas desde o `last_synced_at`/`content_hash`.
- **Prune com trava** (FR-007): remoção >50% dos docs de um domínio num passe → aborta + alerta.
- **Privacidade** (FR-008): corpus operacional privado ao projeto GCP (service account).

## Ciclo de vida do documento

```
novo na origem      → render → import_files → consultável (≤24h, SC-002)
editado na origem   → hash muda → delete_file + reimport → versão nova servida
apagado na origem   → source_ref some → delete_file (se passar a trava ≤50%) → some da memória (SC-003)
```
