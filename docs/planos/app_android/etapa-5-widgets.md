# Etapa 5 — Widgets, tile e timer de foco

**Dificuldade:** ⭐⭐⭐ · **Tempo:** 3–4 semanas · **Quem faz:** Claude (Kotlin + backend) + você (testar e ajustar bateria)

## O que é e por quê
Widgets são blocos na tela inicial; no Android são **sempre código nativo** (Kotlin + Jetpack Glance),
independentemente de o app ser Capacitor ou outro. É a única parte do projeto fora de TypeScript/Python.

## Passo a passo

1. **Backend:** criar `GET /api/widgets/today|finance|habits|reading` (ver `01-backend-necessario.md` §4) —
   respostas mínimas para poupar bateria e dados.
2. **Autenticação nativa:** o código Kotlin lê o token do Keystore (o mesmo da Etapa 2).
3. **Widgets** (`webapp/frontend/android/app/src/main/java/.../widgets/`):
   1. *Meu Dia* (Kaguya): próximas tarefas, toque conclui.
   2. *Livre pra gastar* (Nami).
   3. *Hábitos:* bolinhas de check-in com um toque.
   4. *Lendo/assistindo agora:* +1 capítulo / +1 episódio.
4. **Atualização:** a cada 30 min (WorkManager) e quando chega um push de "dados mudaram".
5. **Tile no painel rápido** (`TileService`): *Iniciar foco*.
6. **Timer de foco que não morre:** serviço em primeiro plano (notificação fixa com o tempo correndo); ao
   terminar, registra a sessão na Kaguya (`tools_focus.py`) e conta para as conquistas (spec 062).
   Opcional: ligar o Não Perturbe (exige permissão especial concedida por você uma vez).
7. *(você)* Configurações do Android → Apps → Makima → Bateria → **Sem restrições**.

## Como saber que deu certo
- Criar uma tarefa no PC e o widget atualizar no celular.
- Iniciar foco pelo tile, apagar a tela por 25 minutos e a sessão concluir normalmente.

## Riscos
- Fabricantes que matam serviços: pedir isenção de bateria e testar no seu aparelho real.
- Widget com dado desatualizado: mostrar "atualizado às HH:MM".
