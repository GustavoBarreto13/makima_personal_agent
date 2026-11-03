# 02 — Funções por agente, recursos nativos e melhorias

Tudo que o webapp faz hoje entra no app **automaticamente** pelo Capacitor. A coluna da direita é o
ganho real de ter um app.

## Inventário por agente

| Agente | Hoje (webapp) | O celular acrescenta |
|---|---|---|
| **Makima (hub)** | Painel com resumo | Chat por texto e voz; widget "Meu dia"; atalhos no ícone |
| **Kaguya** | Kanban, Meu Dia, calendário, hábitos, foco, metas, GTD | Push com botões (Concluir · Adiar 1h · Amanhã); timer de foco que não morre + Não Perturbe; tile "Iniciar foco"; widget de hábitos (check-in de um toque); captura por voz; lembrete por lugar |
| **Nami** | Lançamentos, plano do mês, a pagar, estatísticas | Widget "livre pra gastar"; foto do recibo lida pelo Gemini; alerta de orçamento em push; sugestão a partir da notificação do banco |
| **Frieren** | Estante, sessões, MAL | Escanear ISBN; widget "lendo agora" +1 capítulo; timer de leitura |
| **Akane** | Diário de filmes, Letterboxd | Compartilhar link do Letterboxd/IMDb/TMDB → registrar filme; lembrete de sessão |
| **Marin** | Catálogo, MAL | Compartilhar link MAL/AniList; push de episódio novo; widget +1 episódio |
| **Mai** | Séries TMDB | Push de estreia; widget "próximo episódio" |
| **Komi** | Perfis, Memória, aniversários | Importar contatos (regra 0/1/2+); push de aniversário com "Mandar mensagem"; registrar interação após ligação |
| **Violet** | Bullets, @Komi, cartas, emoções, Conselho do Dia | Bloqueio por biometria; widget "escrever agora"; ditado por voz; foto no bullet; Conselho do Dia como notificação matinal |
| **Yato** | Roteiro, mobilidade, orçamento | Modo viagem offline; localização para "próximo item"; gasto em moeda local → Nami |
| **Lucy** | Digest via WhatsApp | Digest como push; tela de leitura no app |
| **Kurisu** | Busca RAG, Tutor de idiomas | Busca por voz; tutor com microfone |

## Recursos nativos do Android

| Recurso | Uso na Makima | Como | Dif. |
|---|---|---|---|
| Push (FCM) | Digests e alertas dos 14 jobs | `@capacitor/push-notifications` + `firebase-admin` | ⭐⭐ |
| Canais de notificação | Silenciar Nami sem silenciar Aniversários | Um canal por agente | ⭐ |
| Ações na notificação | Concluir/Adiar sem abrir | Push com `actions` + chamada à API | ⭐⭐⭐ |
| Notificações locais | Lembretes offline, timer | `@capacitor/local-notifications` | ⭐⭐ |
| Widgets | Meu Dia, livre pra gastar, hábitos, lendo | Kotlin + Jetpack Glance | ⭐⭐⭐ |
| Quick Settings tile | Iniciar foco | Kotlin `TileService` | ⭐⭐⭐ |
| App shortcuts | Nova tarefa/gasto/diário | XML de atalhos | ⭐ |
| Share Target | Receber links de outros apps | `@capgo/capacitor-share-target` | ⭐⭐ |
| Câmera + ML Kit | ISBN, recibo, foto | `@capacitor/camera`, `@capacitor-mlkit/barcode-scanning` | ⭐⭐ |
| Voz | Captura, chat, diário | `@capacitor-community/speech-recognition` | ⭐⭐ |
| Biometria | Trancar app/Violet/Nami | `@aparajita/capacitor-biometric-auth` | ⭐⭐ |
| Armazenamento seguro | Tokens | Keystore | ⭐⭐ |
| Serviço em primeiro plano | Timer de foco | Plugin ou Kotlin | ⭐⭐⭐ |
| Não Perturbe | Durante o foco | Kotlin `NotificationManager` | ⭐⭐⭐ |
| Geofence | Lembrete por lugar, Yato | `@capacitor/geolocation` + plugin | ⭐⭐⭐ |
| Contatos | Importar para a Komi | `@capacitor-community/contacts` | ⭐⭐ |
| Haptics | Vibração ao concluir | `@capacitor/haptics` | ⭐ |
| Offline | Escrever sem internet | Service worker + `OfflineQueue` persistente | ⭐⭐⭐ |
| Deep links | Notificação abre a tarefa certa | `@capacitor/app` + React Router | ⭐⭐ |
| Health Connect | Sono → capacidade do dia / leitura emocional | Plugin Health Connect | ⭐⭐⭐⭐ |
| Leitor de notificações | Banco → sugestão de gasto | Kotlin `NotificationListenerService` | ⭐⭐⭐⭐ |

## Sugestões de melhoria

1. **Captura universal:** um campo/atalho/voz único ("pagar luz amanhã 180") e a Makima decide se é tarefa, gasto ou diário (reaproveita `lib/parseTask.ts` e o `QuickCapture` do DS).
2. **Notificações acionáveis** no lugar de mensagens de WhatsApp; WhatsApp fica como reserva.
3. **Modo foco de verdade:** timer em primeiro plano + Não Perturbe, alimentando as conquistas da spec 062.
4. **Nami sem digitar:** recibo por foto e sugestão da notificação do banco — sempre para **confirmar**, nunca lança sozinho.
5. **Contexto do corpo:** sono (Health Connect) em `violet_context.py` e `capacity.py` ("dormiu 5h — dia mais leve?").
6. **Widgets de um toque:** hábito, +1 capítulo/episódio.
7. **Modo viagem:** Yato baixa roteiro e mobilidade antes do embarque.
8. **Revisão semanal guiada** de domingo, com notificação que abre o fluxo.
9. **Segurança:** biometria e tela de "aparelhos conectados" com revogação.
10. **Atualização sem reinstalar** a interface (live update), para um deploy valer no celular na hora.
