# Etapa 6 — Escrever sem internet

**Dificuldade:** ⭐⭐⭐ · **Tempo:** 2–3 semanas · **Quem faz:** Claude

## O que é e por quê
Metrô, avião, viagem: criar tarefa, gasto ou bullet sem sinal e sincronizar quando voltar.
A porta `OfflineQueue` já existe em `design/core/ports.ts`, mas hoje só vive na memória (some ao fechar).

> **Adiantado (06/nov/2026, código pronto — falta testar no celular):**
> - Fila persistente (`design/core/offlineQueue.ts`) ligada em `src/lib/offlineWrites.ts` (`writeOrQueue`): tenta enviar na hora e, sem rede,
>   guarda no aparelho **com o mesmo id** usado na tentativa. Reenvia ao abrir, no evento `online` e quando o app volta ao primeiro plano.
> - **Servidor não duplica:** o id vai no cabeçalho `Idempotency-Key` (`webapp/backend/idempotency.py`, tabela `idempotency_keys`) — se a resposta
>   se perdeu, o reenvio recebe a resposta guardada.
> - **Ligado a:** criar tarefa (`+ Adicionar tarefa`), concluir tarefa (sem "Desfazer" offline), gasto/receita simples da Nami, check-in de hábito
>   (com a data de hoje gravada na hora do toque) e **momento novo do diário** (o diário não fica salvo para leitura offline; sem internet a tela
>   oferece guardar um momento, que entra no fim do dia quando a conexão voltar — `POST /api/journal/bullets` aceita `date`).
> - Selo "N alterações aguardam a internet" e aviso de itens recusados (com "Descartar") em `pwa/PwaPrompt.tsx`; telas recarregam sozinhas após o envio.
>   Sair do app (logout) apaga a fila.
> - **Falta:** editar/excluir offline, gasto parcelado e transferência, estimativa de duração na criação offline, e o modo viagem da Yato.
> - **Antes de usar:** rodar `setup_schemas.py` no `makima-web` (cria `idempotency_keys`).

## Passo a passo

1. Implementar `OfflineQueue` **persistente** (SQLite via plugin ou Preferences) em `design/headless/native.ts`.
2. Escopo inicial de escritas offline: criar/concluir tarefa (Kaguya), lançar gasto (Nami), escrever bullet
   (Violet), check-in de hábito. Demais telas ficam só leitura.
3. Cada item entra na fila com **id único** (idempotência: reenviar nunca duplica) e aparece na tela com selo
   "pendente".
4. Ao voltar a conexão, a fila envia na ordem. Em conflito (item alterado no PC), vale "o mais recente vence"
   e o app avisa o que mudou.
5. Datas sempre em UTC-3 (regra do `CLAUDE.md`): o horário é gravado no momento em que o usuário agiu, não
   no do envio.
6. **Modo viagem (Yato):** botão "baixar para offline" do roteiro e da mobilidade do destino.

## Como saber que deu certo
Modo avião → criar 3 tarefas e 1 gasto → fechar o app → desligar o modo avião → tudo aparece no PC, sem duplicar.

## Riscos
Conflitos de edição e duplicidade: por isso a idempotência por id e a política simples de "mais recente vence".
