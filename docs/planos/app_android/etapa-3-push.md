# Etapa 3 — Notificações push

**Dificuldade:** ⭐⭐ · **Tempo:** 1–2 semanas · **Quem faz:** Claude + você (Firebase)

## O que é e por quê
Hoje os avisos (digest da Kaguya, alerta de orçamento, revisão semanal…) saem pelo WhatsApp. Com push eles
chegam como notificação do Android, com **botões** que agem sem abrir o app.

> **Adiantado (código pronto, branch `feat/app-android-etapa2-cd`):**
> - Backend: tabela `push_devices`, `/api/devices/push`, canal `"push"`; notificações de Nami/Violet/Lucy saem com
>   `visibility=private` (conteúdo oculto na tela de bloqueio); os 8 scripts do scheduler agora mandam `agent`, título e
>   `link` (deep link `makima://…`).
> - App (`src/native/push.ts`, `pushChannels.ts`): pede permissão, cria 8 canais por agente, registra o token em
>   `/api/devices/push`, toque na notificação abre a tela pelo deep link, logout remove o registro. Sem
>   `google-services.json` o registro só loga um aviso — o app segue normal.
>
> **Falta (depende de você):** itens 1 e 7 abaixo (Firebase + `FIREBASE_CREDENTIALS_JSON` + `NOTIFY_DEFAULT_CHANNELS`).
> **Falta (código, depois do Firebase):** botões de ação *Concluir · Adiar* (o plugin do Capacitor não desenha botões em
> push: exige mensagem só de dados + notificação local ou código nativo).

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
