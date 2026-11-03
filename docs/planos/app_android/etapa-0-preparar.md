# Etapa 0 — Preparar o terreno

**Dificuldade:** ⭐ · **Tempo:** meio dia · **Quem faz:** principalmente você (Gustavo)

## O que é e por quê
Antes de qualquer código, o computador e o celular precisam estar prontos para fabricar e testar o app.

## Passo a passo

1. **Celular — modo desenvolvedor** *(você)*
   Configurações → Sobre o telefone → toque 7× em *Número da versão*. Depois, em *Opções do
   desenvolvedor*, ligue **Depuração USB**.
   *Por quê:* permite instalar o app de teste direto do computador.
2. **Android Studio** *(você)*
   Baixe em developer.android.com/studio e instale com as opções padrão. Ele traz Java, o SDK do
   Android e o emulador.
   *Por quê:* é a "fábrica" que transforma o código em app instalável.
3. **Node.js** *(você, se ainda não tiver)* — mesma versão usada no `webapp/frontend`.
4. **Projeto Firebase** *(você)*
   console.firebase.google.com → criar projeto (grátis) com a conta `gustavobarreto1304@gmail.com`.
   Não precisa ativar mais nada agora.
   *Por quê:* é o Firebase que entrega as notificações (Etapa 3).
5. **Conta Google Cloud** *(você)*: no projeto já usado pela Makima, anotar o nome — o login Google do app
   (Etapa 2) vai criar um "OAuth client Android" ali.
6. **Spec no Spec Kit** *(Claude)*: abrir `specs/0xx-app-android/` com `/speckit-specify` cobrindo as Etapas 0–2.

## Como saber que deu certo
- O Android Studio abre sem erro.
- Com o celular no USB, ele aparece na lista de aparelhos (e aceita "Permitir depuração USB").

## Riscos
Nenhum de código. Cuidado apenas ao instalar o Android Studio em disco com pouco espaço (precisa ~10 GB).
