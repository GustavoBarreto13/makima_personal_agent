# Etapa 6 — Escrever sem internet

**Dificuldade:** ⭐⭐⭐ · **Tempo:** 2–3 semanas · **Quem faz:** Claude

## O que é e por quê
Metrô, avião, viagem: criar tarefa, gasto ou bullet sem sinal e sincronizar quando voltar.
A porta `OfflineQueue` já existe em `design/core/ports.ts`, mas hoje só vive na memória (some ao fechar).

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
