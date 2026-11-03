# Riscos e validação

## Riscos principais

| Risco | Impacto | Mitigação |
|---|---|---|
| Falha no login mobile | Expõe finanças e diário | Token curto + refresh rotativo + revogação por aparelho + biometria |
| Android matando processos (Xiaomi, Samsung) | Timer/widget param | Serviço em primeiro plano; isenção de bateria; push de alta prioridade |
| Avisos em dobro (WhatsApp + push) | Ruído | `NOTIFY_DEFAULT_CHANNELS` por canal |
| WebView lenta em listas grandes (Kanban, estante) | UX ruim | Virtualizar listas antes de culpar o Capacitor |
| Permissões sensíveis (notificações de outros apps, localização, saúde) | Bloqueio na Play Store | Uso pessoal por sideload; opt-in explícito |
| Fuso horário | Lembretes no dia errado | Sempre `America/Sao_Paulo` (regra do `CLAUDE.md`) |
| Perder a chave de assinatura do APK | Não consegue atualizar o app | Guardar em dois lugares seguros |
| Cache offline com dados sensíveis | Vazamento se o celular for perdido | Limitar rotas em cache; limpar no logout; biometria |

## Como validar cada etapa

| Etapa | Teste |
|---|---|
| 1 | Lighthouse PWA sem pendências; modo avião abre telas já vistas |
| 2 | APK instalado; reabrir no dia seguinte sem login; `chrome://inspect` sem erros; `npm test` e `npm run audit:design` verdes; pytest de `/auth/mobile` e bearer |
| 3 | `python -m scheduler.main --run kaguya_digest` gera notificação; *Concluir* marca a tarefa |
| 4 | Escanear livro real; compartilhar link do Letterboxd; recibo → confirmação |
| 5 | Tarefa criada no PC aparece no widget; foco de 25 min com tela apagada conclui |
| 6 | Modo avião → criar itens → reconectar sem duplicar |
| 7 | Mesma resposta no app e no WhatsApp |

## Regras de documentação ao entregar cada etapa

`ROADMAP.md` (status) · `webapp/docs/API.md` (rotas novas) · `docs/referencia/POSTGRES.md` (`push_devices`,
aparelhos) · árvore do `CLAUDE.md` · `webapp/docs/FRONTEND.md` · `src/design/conformance.json` para telas novas.
