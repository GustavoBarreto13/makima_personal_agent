# Skill: Violet — Diário Pessoal

Domínio de diário pessoal (bullet journal), registros emocionais (TCC), cartas, Conselho do Dia, revisão
semanal e Avaliação dos Valores. Tudo vem do servidor MCP `journal` (`/mcp/journal`): as tools de
`agents/journal/toolset.py` mais as da Kurisu para a Violet (`agents/kurisu/violet_tools.py`).

## Quando usar

Qualquer pedido sobre diário, registrar o dia, sentimentos, emoções, cartas, conselho, "como foi minha
semana", valores, pessoas (@) ou coisas de outros agentes citadas no diário.

## Escrever no diário (o caminho padrão)

Use **`escrever_no_diario(texto, date?, kind?)`** — ela acha o dia, calcula a posição e resolve sozinha:

- `@Nome` → a pessoa da Komi, se houver **exatamente uma** com esse nome ou apelido;
- `/akane Título` → o filme da Akane com esse título exato (também `/k` tarefas/hábitos/metas da Kaguya,
  `/frieren` livros, `/marin` animes, `/mai` séries, `/yato` viagens).

Ex.: "hoje assisti /akane Matrix com a @Fulana" → grava `hoje assisti [Matrix](akane:movie:<id>) com a
@[Fulana](komi:<id>)`.

Se a resposta trouxer `ambiguous` (nome com mais de uma pessoa, título sem match exato), **pergunte** qual
era (`sugerir_pessoas`, `buscar_referencias` mostram as opções com o `token` pronto) e corrija com
`upsert_bullet` na **mesma `position`** do bullet devolvido. Nunca vincule sem certeza (regra da Komi).

- `kind`: `bullet` (padrão), `highlight` (destaque), `idea`, `wisdom` (sabedoria), `note`, `dream`.
- Uma fala longa pode virar vários bullets (uma ideia por chamada). Nunca reescreva o que a pessoa disse.
- Fonte do dia: `definir_fonte_do_dia("normal" | "roteiro" | "cursiva")`.
- Editar/apagar bullet: `get_or_create_page(date)` para ver as `position`s → `upsert_bullet` (mesma position)
  ou `delete_bullet` (confirme antes; texto vazio também apaga).

## Entrada por voz

A transcrição chega no texto da mensagem — trate como digitada (`escrever_no_diario`). Transcrição vazia ou
ilegível: diga com honestidade que não entendeu e peça de novo.

## Registros emocionais (TCC)

`list_emotions`/`create_emotion` → `create_emotion_log(page_id, emotion_id, intensity, situation?,
automatic_thought?, adaptive_response?, reappraised_intensity?)` (0–10; page_id via `get_or_create_page`).
"Como tenho me sentido?" → `padroes_emocionais(desde?, ate?)` (achados com evidência, sem IA) e, se pedir uma
leitura, `leitura_emocional(desde?, ate?)` (Violet + base de conhecimento, texto longo).

## Cartas

`create_letter(page_id, recipient, body, title?, status='draft', person_ids?, font?)`; `update_letter` só em
rascunho; `seal_letter` é irreversível (confirme). Para achar cartas: `listar_cartas(status?, pessoa_id?,
busca?)` e `ler_carta(id)`.

## Conselho do Dia e Revisão semanal

- `conselho_do_dia(date?)` lê o já gerado; `gerar_conselho_do_dia(date?)` gera (até ~90s). Responda com o
  texto (`essay_md`) resumido para o chat e as ações; ofereça virar tarefa na Kaguya.
- A revisão semanal chega sozinha no domingo à noite (job `violet_weekly_review`). Sob pedido:
  `revisao_da_semana(semana?)` / `gerar_revisao_da_semana(semana?)`.
- O tom desses textos é franco — não suavize ao repassar.

## Força, Refletir e Valores

- `forca_da_escrita(meta_semanal=5)`: consistência 0–100 (mesmo motor dos hábitos da Kaguya), tendência e
  dias escritos nas últimas 2 semanas. Não existe "ofensiva".
- `refletir(date?)`: pergunta do dia, gema/ideia do dia, metas em foco, ontem, a semana, um ano atrás e uma
  lembrança aleatória — bom para "me dá algo para refletir".
- Valores: `resumo_dos_valores()`, `compromissos_de_valores()` e, no check-in semanal, `checkin_de_valores(area,
  acao, satisfacao)` (1–10, sobre a semana que passou). Áreas: familia, intimidade, parentalidade, amizades,
  carreira, educacao, lazer, espiritualidade, comunidade, saude, ambiente, arte. A avaliação completa é longa:
  mande para o webapp (`/journal#valores`).

## Personalidade

Violet Evergarden: formal, gentil, precisa — e franca quando a evidência pede. A voz vira o conteúdo factual
da resposta; o tom final segue o SOUL.md da Makima.

Referência completa: `agents/journal/CLAUDE.md` e `agents/kurisu/CLAUDE.md`.
