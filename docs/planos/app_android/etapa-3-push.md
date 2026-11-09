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
> **Validado no celular (05/nov/2026):** Firebase ligado (`google-services.json` em `android/app/`, fora do git; o
> build detecta o arquivo sozinho e só então liga o push), `FIREBASE_CREDENTIALS_JSON` no Dokploy (makima-web e
> makima-scheduler), token registrado em `push_devices` e **notificação de teste recebida** no aparelho.
> **Falta (depende de você):** item 7 abaixo (`NOTIFY_DEFAULT_CHANNELS`: só push, ou push + WhatsApp).
> **Armadilhas:** (1) o Dokploy guarda só a 1ª linha de uma variável multilinha — colar o JSON em UMA linha
> (`ConvertTo-Json -Compress`); (2) sem o `google-services.json` o plugin lança exceção NATIVA e derruba o app;
> (3) salvar a variável não basta, é preciso Deploy/Reload.
>
> **Lembretes nativos (05/nov/2026, código pronto — falta publicar e validar no celular):** o app passa a avisar sozinho,
> sem depender do Google Calendar. Job `app_reminders` (a cada minuto) → push para tarefas/eventos com hora (antecedência
> configurável por tarefa: campo "Avisar", padrão 10 min), hábitos, aniversários da Komi (9h), reuniões do Google e um
> resumo curto às 07:30. Os espelhos do Google deixam de gravar alertas (`GCAL_ALERTS_ENABLED=false` por padrão; eventos
> antigos: `scripts/strip_gcal_alerts.py --apply`). Detalhes: `agents/kaguya/CLAUDE.md` § "Lembretes nativos do app".
> Digests longos (Kaguya, Lucy, relatório do mês, revisão da Violet) vão para o **Discord** (`NOTIFY_LONG_CHANNELS`, padrão
> `discord`); avisos curtos para o push (`NOTIFY_DEFAULT_CHANNELS`, padrão `push`).
> **Botões *Concluir · Adiar 1h · Amanhã* (06/nov/2026, código pronto — falta publicar e validar no celular):** o lembrete de
> tarefa passa a sair como push **só de dados** com um token assinado de UMA tarefa (36 h). `MakimaMessagingService.java`
> (estende o serviço do plugin e repassa tudo que não é lembrete de tarefa) desenha a notificação com os botões e
> `PushActionReceiver.java` chama `POST /api/push/action` — sem usar a sessão, que gira a cada uso. Subtarefas abertas → o botão
> avisa "abra o app". Detalhes: `agents/kaguya/CLAUDE.md` § "Lembretes nativos do app". **Para testar:** deploy do backend +
> scheduler, `npm run android:sync` → ▶, criar uma tarefa com hora daqui a ~12 min.

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
   - Tarefa: *Concluir · Adiar 1h · Amanhã* (chamam a API da Kaguya direto) — **feito**, ver nota no topo.
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
