# Quickstart — Validação da fatia 012 (Datas e Recorrência)

Roteiro de verificação end-to-end. Os cenários **V1–V3** são o gate automatizável (SC-001/003/004);
**V4–V8** são UAT pelos dois canais (paridade — SC-002).

## Pré-requisitos

- Banco com o schema da Fase 1 aplicado (tabelas `tasks`, `task_recurrences` etc.).
- `python-dateutil` instalado (`pip install -r requirements.txt`).
- Para os testes de integração: `DATABASE_URL` apontando para um Postgres descartável (os testes
  fazem skip se ausente, como na 011).

## V1 — Motor puro: 9 edge cases (gate SC-001)

```bash
pytest tests/agents/test_kaguya_recurrence.py -v
```

Espera-se **verde** em todos os casos da tabela-verdade (`research.md`): reagendar+completar,
adiantado, atrasado (mensal e diário), `after_completion`, fim de série, reset de subtarefas, futuras
não materializadas, editar regra com ocorrência aberta, excluir `this`/`series`, série esgotada,
aniversário anual.

## V2 — Geração na conclusão (SC-003: uma ocorrência, sem acúmulo)

Contra o Postgres descartável (via os testes de integração ou um REPL):

1. Criar "pagar aluguel" `due_date=2026-06-05`, `recurrence=FREQ=MONTHLY;BYMONTHDAY=5` (`fixed`).
2. `complete_task` simulando conclusão tardia (dia 20).
3. Conferir: **uma** linha viva da série, `due_date=2026-07-05`; a linha de 05/06 fica concluída
   (histórico); `task_recurrences.task_id` agora aponta para a nova linha.

## V3 — Histórico preservado (SC-004)

Concluir a mesma série 3 vezes seguidas e conferir **3 linhas com `completed_at`** + **1 viva**.

## V4 — Quick-add com data (webapp)

1. `npm run build` limpo em `webapp/frontend/`.
2. No `/tasks`, quick-add: "ligar pro contador amanhã 9h" → nasce com vencimento amanhã 09:00, título
   "ligar pro contador"; o trecho de data fica destacado (ParseMirror, `tok-date`).
3. "revisar contrato sexta 17h" (numa quarta) → próxima sexta 17:00.
4. "comprar pão #mercado" → `#mercado` permanece visível (reservado p/ tags da 013), título intacto.

## V5 — Recorrência pelo TaskModal (webapp)

1. Abrir uma tarefa com data, escolher recorrência "todo mês no dia 5", modo `fixed`, salvar.
2. A linha exibe o **glyph de recorrência** (ícone `loop`) e o texto "todo dia 5".
3. Concluir pela lista → some da lista de abertas e reaparece a próxima ocorrência (05 do mês
   seguinte).
4. Abrir de novo, "Concluir série" → conclui sem gerar próxima; a regra fica inativa.
5. Excluir uma recorrente → o app pergunta "só esta / a série inteira" e age conforme a escolha.

## V6 — Recorrência pelo Telegram (paridade)

Com o webapp desligado, pela Kaguya:

1. "pagar aluguel todo dia 5" → cria recorrente `fixed`; resposta ecoa "todo dia 5" e a próxima data.
2. "o que tenho pra hoje?" mostra a ocorrência viva quando vencer.
3. "concluir aluguel" → conclui e a Kaguya confirma que a próxima foi agendada.
4. "apaga o aluguel" → a Kaguya pergunta "só esta ou a série inteira?" antes de excluir.

## V7 — Aniversário (US3)

1. Telegram: "anota o aniversário da minha mãe, 16 de setembro" → cria `type=birthday`, recorrência
   anual; ecoa "todo ano, 16/09".
2. Concluir/avançar → próxima ocorrência 16/09 do ano seguinte.

## V8 — `after_completion` (US1.3)

1. "trocar a água do filtro a cada 3 dias, contando de quando eu trocar" → `mode=after_completion`.
2. Concluir num dia X → próxima vence em X+3 (a partir da conclusão real, não da âncora).

## Smoke HTTP (paridade da API)

```bash
# subir o backend, forjar cookie de sessão (padrão dos smokes da 011) e:
curl -XPOST .../api/tasks -d '{"title":"aluguel","due_date":"2026-06-05","recurrence":{"rrule":"FREQ=MONTHLY;BYMONTHDAY=5","mode":"fixed"}}'
curl -XPOST .../api/tasks/<id>/complete            # gera a próxima → generated_task_id
curl -XPOST .../api/tasks/<id>/complete -d '{"end_series":true}'   # encerra a série
curl -XDELETE '.../api/tasks/<id>?scope=series'    # exclui a série
```

## Pós-validação

- Refletir as mudanças no vault do Obsidian (skill `obsidian-vault`).
- Deploy: sem migração de schema (tabelas já existem); ativação em produção depende do rebuild do
  Dokploy a partir da master após o merge.
