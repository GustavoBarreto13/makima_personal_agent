# Etapa 7 — Conversar com a Makima dentro do app

**Dificuldade:** ⭐⭐⭐ · **Tempo:** 2 semanas · **Quem faz:** Claude

## O que é e por quê
Hoje só se conversa com a Makima pelo Telegram/WhatsApp/Discord (via Hermes). Um chat no app dá a mesma
inteligência com voz, histórico e botões.

## Passo a passo

1. **Investigar** como o Hermes aceita mensagens por HTTP (API própria ou rota dedicada, como as `notify-*`
   descritas em `scheduler/notify_channels.py` e `hermes/CLAUDE.md`). Decisão registrada na spec.
2. Endpoint no webapp que encaminha a mensagem do usuário autenticado e devolve a resposta em **streaming**
   (efeito "digitando").
3. Tela de chat no Design System (seguindo o fluxo Impeccable), com microfone (voz da Etapa 4) e links
   clicáveis para as telas dos agentes (deep links).
4. Histórico local simples; limpar no logout.

## Como saber que deu certo
"Quanto gastei esse mês?" no app devolve a mesma resposta do WhatsApp.

## Riscos
- Custo/latência do modelo: manter o mesmo limite de uso dos outros canais.
- Mensagens pelo app e pelo WhatsApp não compartilham histórico automaticamente — definir isso na spec.
