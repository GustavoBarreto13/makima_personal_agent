# Etapa 3 — Notificações push

**Dificuldade:** ⭐⭐ · **Tempo:** 1–2 semanas · **Quem faz:** Claude + você (Firebase)

## O que é e por quê
Hoje os avisos (digest da Kaguya, alerta de orçamento, revisão semanal…) saem pelo WhatsApp. Com push eles
chegam como notificação do Android, com **botões** que agem sem abrir o app.

> **Adiantado:** tabela `push_devices`, rotas `/api/devices/push` e o canal `"push"` em `notify_channels.py` (itens 3 e parte do 4).
> **Falta:** itens 1, 2, 5, 6 (Firebase, permissão no app, botões de ação) — dependem do Firebase e do celular.

## Passo a passo

1. *(você)* No Firebase: adicionar app Android com o `appId` da Etapa 2 → baixar `google-services.json`
   → entregar ao Claude (vai para `webapp/frontend/android/app/`). Gerar também a chave de conta de serviço
   (para o backend enviar) e guardar como segredo no Dokploy.
2. Instalar `@capacitor/push-notifications`; pedir permissão de notificação no primeiro uso.
3. O app registra o token do aparelho em `POST /api/devices/push` (tabela `push_devices`).
4. Backend: `scheduler/notify_channels.py` ganha o canal `"push"` (via `firebase-admin`). Os 14 jobs de
   `scheduler/registry.py` passam a poder usar push **sem mudar a lógica deles**.
5. **Canais Android por agente:** Kaguya, Nami, Aniversários, Violet, Lucy, Sistema. Você silencia um sem
   silenciar os outros (nas configurações do próprio Android).
6. **Botões de ação** na notificação:
   - Tarefa: *Concluir · Adiar 1h · Amanhã* (chamam a API da Kaguya direto).
   - Aniversário: *Mandar mensagem* (abre o WhatsApp).
   - Conselho do Dia / revisão semanal: toque abre o fluxo via deep link.
7. *(você)* Decidir `NOTIFY_DEFAULT_CHANNELS`: só push, ou push + WhatsApp (para não receber em dobro).
8. Horários seguem `America/Sao_Paulo` (regra do `CLAUDE.md`).

## Como saber que deu certo
- `python -m scheduler.main --run kaguya_digest` → a notificação chega no celular.
- Tocar em *Concluir* marca a tarefa no PostgreSQL.
- Silenciar o canal "Nami" no Android não silencia o da Kaguya.

## Riscos
- Celulares que matam apps (Xiaomi, Samsung): push de alta prioridade resolve a maior parte.
- Token FCM expira: o backend remove tokens inválidos quando o FCM os recusa.
