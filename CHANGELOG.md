# Changelog

Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem
[SemVer](https://semver.org/lang/pt-BR/) (0.x = ainda sem promessa de estabilidade).
O status detalhado das specs vive no [ROADMAP.md](ROADMAP.md).

- **MINOR** (`0.N.0`): entrega de funcionalidade (agente novo, spec concluída, bloco coeso de features).
- **PATCH** (`0.N.x`): só correção, sem funcionalidade nova.

As versões 0.1.0–0.61.0 foram marcadas retroativamente sobre o histórico da `master`.

## [Unreleased]

### Added
- Violet: **Não ditos** — um lugar para registrar o que você queria dizer a alguém e não pode, não quer ou não consegue. Escolha a pessoa (Komi), escreva, diga o porquê com um toque e depois marque *acabei falando* ou *deixei ir*. O texto fica borrado até tocar; na Komi aparece só "Algo não dito", sem o conteúdo; a Violet usa como contexto sem citar. Funciona no site e no app (inclusive sem internet e por atalho do ícone).
- App Android: botões *Concluir · Adiar 1h · Amanhã* direto na notificação do lembrete de tarefa.
- App Android: criar tarefa, concluir tarefa, lançar gasto, marcar hábito e escrever um momento no diário **sem internet** — ficam no aparelho (com aviso "N aguardam a internet") e são enviados quando a conexão volta, sem duplicar.
- App Android: atalhos ao segurar o ícone (nova tarefa, novo gasto, diário, iniciar foco), *Compartilhar → Makima* (links do Letterboxd, TMDB, MyAnimeList, AniList e Google Livros) e microfone na captura rápida.

### Fixed
- App Android: o **topo das telas não fica mais cortado** pela barra de status/câmera (Design System, Hub, Mai e Yato reservam a área segura em cima e embaixo; rodapé de modais, avisos e barra de gestos também).
- App Android (menus): lupa no topo abre busca e comandos (antes sumiam no celular); "Mais" marca a seção atual; a gaveta prende o foco e leva "Voltar à Makima/Trocar de agente" para o topo; menus "…" não saem mais pela direita; captura rápida ganhou *Salvar* e *Formulário completo*; Voltar, abas e remover filtro com alvo de toque de 44px; barra de baixo e botão flutuante saem da frente quando o teclado abre.
- App Android (Kaguya): arrastar cartão do Kanban só começa após segurar o dedo; botões da lista de calendários sempre visíveis no toque; Espaço no topo só com ícones.
- Mai e Yato no celular: "Voltar à Makima" na Mai, barra de abas na Mai, ícones com rótulo no Yato; Hub com atalhos da Kaguya direto na ação e contagem de agentes correta.
- App Android: tocar numa notificação ou link com o app já aberto na mesma tela agora abre o destino.

## [0.61.0] - 2026-10-29

### Added
- Frieren acompanha capítulos e volumes (mangá e audiobook), com troca de unidade mesmo com sessões e capítulo/volume inicial para numeração contínua.
- Sincronização de mangás com o MyAnimeList (pull e push).

## [0.60.0] - 2026-10-20

### Added
- Status do Kanban e do GTD lidos pelo que significam (Homolog, Blocked, Backlog, aguardando, algum dia).
- Gerenciar e reordenar por arrasto as colunas de cada lista.
- Duração e horário sincronizados, com relógio 24h no lugar do TimePicker.

## [0.59.0] - 2026-10-19

### Added
- Conversa no Conselho do Dia: responder e a Violet responde.
- Backfill retroativo das @menções do diário para a Komi.

### Fixed
- Editar um momento mostra só o nome dos chips e respeita a fonte do dia.

## [0.58.1] - 2026-10-19

### Fixed
- Tipo de `komiApi.search` restaurado (quebrava o build do front).

## [0.58.0] - 2026-10-18

### Added
- Komi no Design System (spec 077): três nomes, espaço Pessoal/Trabalho, aniversário como evento com lembrete (sem tarefa), interações, anotações com IA, mesclar, relações e grupos.
- Contrato de integração `agents/komi/integration.py` para qualquer agente se ligar às pessoas.
- Frieren: quadrinhos não somam páginas nas estatísticas, mas contam dias lidos.

## [0.57.1] - 2026-10-14

### Added
- Fluxo Impeccable obrigatório sobre o Design System.

### Fixed
- Botão Adicionar livro sempre visível em Início, Biblioteca, Quero ler e Wishlist.

## [0.57.0] - 2026-10-12

### Added
- Violet no Design System (spec 076): escrever no celular, @Komi, `/referências`, fontes de escrita, Cartas, Emoções, Refletir, força da escrita e Insights.
- Heatmap de favoritos e escrever direto no bullet.

### Fixed
- Cliente do Gemini da IA da Violet mantido vivo.

## [0.56.0] - 2026-10-12

### Added
- Matriz de Eisenhower como visão de lista e de grupo, com busca, filtros e ordenação.
- Modal único de Filtros (Tipo, "todas menos estas" e regras avançadas) na Lista, no Quadro, nas Matrizes e no Calendário.

## [0.55.1] - 2026-10-12

### Fixed
- Cards da Matriz de Eisenhower voltam a ter estilo e o calendário ocupa a largura toda no espaço Trabalho.

## [0.55.0] - 2026-10-11

### Added
- Kaguya no Design System (spec 075): shell novo com Meu Dia, listas e visões, Kanban, Eisenhower, Calendário, Hábitos, Foco, Metas, Experimentos, Inbox e revisão semanal.
- Espaços Trabalho e Pessoal em todas as consultas, agenda de trabalho, dois tempos livres, dependências entre tarefas, edição em massa com desfazer, logbook, lixeira completa e templates.
- Estatísticas de tarefas e planejamento; paridade no Telegram/Hermes; arte "Shuchiin".

### Changed
- "Hoje" sempre em America/Sao_Paulo (`agents/kaguya/tz.py`); excluir lista deixa de ser arquivar.

### Fixed
- Cascata em todos os níveis, recorrência sem perda de dados e espelho do Google Calendar sem eventos órfãos.

### Removed
- Shell legado da Kaguya.

## [0.54.0] - 2026-10-08

### Added
- Marin no Design System (spec 074): coração, favoritos, data de abandono e estatísticas no `StatsPayload`.
- Arte "Neon kawaii" e ícones de anime; telas de Início, Catálogo, Quero assistir, Diário, Lançamentos, detalhe, listas e etiquetas.

## [0.53.0] - 2026-10-07

### Added
- Frieren no Design System (spec 073): troca do shell, arte élfica e remoção do legado.

### Fixed
- Estrelas douradas alinhadas às vazias e meia estrela exata.

## [0.52.1] - 2026-10-04

### Fixed
- Cadastro de cinema/streaming ao logar e na página do filme.
- Concluir subtarefa pelo modal usa complete/reopen.

## [0.52.0] - 2026-10-04

### Added
- Akane no Design System (spec 072): estatísticas no contrato `StatsPayload`, arte "Cinema noir", novo shell com Início, Logar, Filmes, Quero ver, Diário, detalhe, listas e etiquetas.

### Removed
- Shell legado da Akane.

## [0.51.0] - 2026-10-02

### Added
- Nami no Design System (specs 070 e 071): plano do mês, faturas derivadas, renda recorrente, captura financeira, arte "Carta náutica", cartões, recorrentes e resumo.

### Changed
- Transferências com sinal e fatura tratada como transferência, com saldos reais.

### Removed
- Telas antigas da Nami (rotas redirecionadas).

## [0.50.1] - 2026-10-02

### Fixed
- `tokens:check` ignora CRLF (o git converte fim de linha no Windows).

## [0.50.0] - 2026-10-02

### Added
- Fundação do Design System Makima: tokens `--ds-*`, componentes e página de referência `/design`.

## [0.49.0] - 2026-10-02

### Added
- `makima-mcp` publicado no loopback do host (túnel SSH) e `/mcp/kaguya` exposto publicamente com token externo escopado.

## [0.48.0] - 2026-09-07

### Added
- Compromissos pedidos ao Hermes passam a ser criados na Kaguya; o Google Calendar vira só leitura.
- Visão de Lista reformada, com o mesmo visual e capacidades em toda lista.
- TaskModal como modal único de tarefa, com título com parser, horários, Pessoas e GTD na criação.

### Fixed
- A data "hoje" congelava na criação da sessão do Hermes.

## [0.47.1] - 2026-09-05

### Fixed
- Adicionar livro sempre usava a 1ª edição da busca.

## [0.47.0] - 2026-09-02

### Added
- Calendar Hub espelhado em calendários dedicados do Google Calendar (spec 069), com a seção "Kaguya - Hábitos" na sidebar.

## [0.46.0] - 2026-08-28

### Added
- Alertas de hábito no Google Calendar e seleção de hábitos para o Meu Dia (spec 067).
- Título e favicon próprios por agente na aba do navegador.
- Nami: CRUD completo e confirmação de exclusão padronizada em todas as telas.

## [0.45.0] - 2026-08-22

### Added
- Yato, agente de viagens (spec 066): roteiro dia a dia, dossiê de mobilidade, checklist e orçamento, com backend e webapp.
- Excluir viagem, item de roteiro, checklist e gasto.

### Changed
- Documentação centralizada no CLAUDE.md (removido o AGENTS.md global).

## [0.44.0] - 2026-08-15

### Added
- Digest matinal da Kaguya (tarefas e agenda) via WhatsApp, com rodapé de modelo, tokens e custo.
- Modo férias, que oculta o contexto Trabalho no Meu Dia e no digest.

### Fixed
- Lucy não arquiva mais a inbox ao gerar o digest; wiki sempre representada no RAG da Kurisu, com retry de quota.

## [0.43.1] - 2026-08-14

### Fixed
- Fuso horário do Hermes passou de UTC para America/Sao_Paulo.

## [0.43.0] - 2026-08-14

### Added
- Voz e imagem funcionando no Hermes (E5).
- Notificações multicanal por webhooks do Hermes e SKILL.md para os 7 domínios que faltavam.
- Lembretes de tarefa como alarme pontual de 5 minutos, no lugar do resumo a cada 4h.

### Fixed
- Pareamento do WhatsApp em modo bot e reforço do SOUL.md contra vazamento de tool calls.

## [0.42.0] - 2026-08-09

### Added
- Hermes Agent em produção (spec 064): host MCP HTTP `makima-mcp` com um servidor por domínio e ponte legada para o ADK.
- Telegram migrado para o Hermes (allowlist, dashboard, modelo Gemini 3.6 flash) e Etapa E6, que levou os 7 domínios restantes para MCP nativo e ativou a Violet.
- Preparação da Etapa E4 (WhatsApp e Discord).

### Fixed
- Proteção anti-DNS-rebinding desligada no `makima-mcp` e vários ajustes de deploy e allowlist.

## [0.41.1] - 2026-08-05

### Changed
- Akane: seletores de contexto redesenhados no idioma visual do shell.

### Fixed
- Sessões legadas, contrato da watchlist, ordenação do diário e quebras de linha em anotações e reviews.

## [0.41.0] - 2026-08-05

### Added
- Kurisu: sync incremental do corpus da wiki no Vertex AI RAG.
- Akane: contexto por sessão (acompanhantes e local).

### Fixed
- Nami: vincular assinatura/conta fixa a conta ou cartão.

## [0.40.0] - 2026-07-30

### Added
- Marin: correção de bugs, sync bidirecional com o MyAnimeList e gaps de UI (052–054); botão "Atualizar Dados".
- Kaguya: foco gameficado, com floresta, hábitos e overview de falhas (spec 062).
- Botão "+ Adicionar tarefa" no board de grupo.

## [0.39.0] - 2026-07-28

### Added
- Nami: Parcelamentos (041), Dashboard com health score e pagamento de fatura (042), QoL com edição, exportação e filtros (043), Contas Fixas (044), Lista de Compras (045) e dívidas unificadas, cross-agent e jobs agendados (046–048).
- Akane: reforma hi-fi do front seguindo o design handoff.

### Fixed
- Usos de `date.today()` (UTC) no router de finanças; telas brancas e estrelas da Akane; classes CSS prefixadas com `ak-`.

## [0.38.0] - 2026-07-27

### Added
- Akane: carga histórica do Letterboxd (050), funcionalidades do backend expostas na UI (051), caixa de pesquisa contextual e busca em "Escolher favoritos".

### Fixed
- Dez bugs de backend, sync e webapp (049); diário vem só do `diary.csv`, `reviews.csv` passa a ser importado.

## [0.37.0] - 2026-07-27

### Added
- Revisão semanal guiada (035), Metas e Hábitos cross-agent (036), Foco/Pomodoro (037), Meu Dia com contexto Trabalho/Pessoal (038) e arquivar listas com localização nos eventos (039).

## [0.36.0] - 2026-07-26

### Added
- GTD core na Kaguya: status reais, contextos e views de mercado (spec 034).
- Violet: Conselho do Dia, com persona Kurisu, RAG e Gemini (spec 061), contagem de tokens e toggle de expandir.

### Fixed
- Fuso ao empurrar tarefas para o Google Calendar e dois erros que quebravam o build/migração.

## [0.35.1] - 2026-07-07

### Fixed
- Nami: fuso de São Paulo, `GROUP BY` seguro e assinaturas com `account_id`/`card_id` (spec 040).
- Kaguya: permitir limpar a descrição de uma tarefa.

## [0.35.0] - 2026-07-06

### Added
- Frieren: página do livro editável com marcações coloridas, gestão de estantes, Biblioteca unificada por status e editor de resenha inline (spec 033).

### Fixed
- Heatmap com meses em linha única e ano completo (Frieren e Violet).

## [0.34.0] - 2026-07-06

### Added
- Scheduler de jobs recorrentes (container `makima-scheduler`), spec 032.
- Lucy, agente de email (Gmail), somente leitura.
- Favicon da Makima nas abas do navegador.

## [0.33.1] - 2026-07-03

### Fixed
- Editar um bullet já analisado não reverte a análise; novo botão de re-analisar.

## [0.33.0] - 2026-07-03

### Added
- Tutor de Idiomas na Violet, com análise de escrita via Gemini (spec 031).
- Kaguya lembra, por lista, a ordenação, o filtro de prioridade, "mostrar concluídas" e a visão (Lista × Kanban).
- Indicador de nota na lista e editor Markdown redimensionável e colapsável.

## [0.32.0] - 2026-07-01

### Added
- Tiny Experiments na Kaguya (spec 029): schema, motor puro de aderência, lógica, REST e UI.
- Metas na Kaguya (spec 030): áreas, marcos, vínculos e progresso, com vínculo de experimentos a metas.

## [0.31.0] - 2026-06-30

### Added
- Memória unificada da Kurisu (spec 028): busca multi-corpus com ponderação por recência, exporters de diário e tarefas, sync incremental por hash e serviço `kurisu-sync`.
- Subtarefas com data aparecem no calendário e no Meu Dia.

## [0.30.1] - 2026-06-28

### Fixed
- HTML do Telegram: tags `ul`/`li` não suportadas viram bullets.
- Ingester completa os arquivos que faltaram depois de truncar o import.

## [0.30.0] - 2026-06-28

### Added
- Kurisu: base de conhecimento ativa no Vertex AI RAG (modo Serverless).

## [0.29.1] - 2026-06-28

### Fixed
- Backup do PostgreSQL, que nunca tinha funcionado.
- Busca de pessoa nas Cartas da Violet.

## [0.29.0] - 2026-06-27

### Added
- Sidebar com listas e grupos reordenáveis por arrasto e grupos recolhíveis.
- Violet: seção de Cartas na tela Escrever.

### Fixed
- Limpar a data de uma tarefa agora persiste.

## [0.28.1] - 2026-06-26

### Fixed
- Mover e redimensionar tarefas no calendário (drag, fantasma, atualização sem piscar).
- Ordenar e mostrar concluídas em tarefas e subtarefas.

## [0.28.0] - 2026-06-26

### Added
- Eventos do Google Calendar na timeline do Meu Dia, integrados à capacidade do dia.
- Campo de duração com alça de resize na timeline e no calendário; arrastar em espaço vazio abre o modal de nova tarefa.

### Changed
- `gcal_sync` em fire-and-forget e `list_events` em paralelo.

### Fixed
- Tarefas 3h adiantadas no calendário (UTC vs UTC-3) e offset duplicado no drag.

## [0.27.1] - 2026-06-23

### Fixed
- Datas aceitam MM-DD, fim do loop de sync Komi↔Kaguya, erro de data inválida no cadastro e `updated_at` duplicado em `update_person`.

## [0.27.0] - 2026-06-23

### Added
- Sync bidirecional de aniversários entre Komi e Kaguya (spec 026).
- Skills do Spec Kit adicionadas ao repo.

## [0.26.1] - 2026-06-22

### Fixed
- Textarea do bullet da Violet cresce com o conteúdo, sem barra de rolagem.
- Plano da spec 026 (sync de aniversários) registrado.

## [0.26.0] - 2026-06-22

### Added
- Pickers de data e hora próprios do tema.
- Editor de notas Markdown nas tarefas, com @menções e `[[tarefas]]`.
- Kanban de Grupo (board agregado por status), visão de Lista do grupo e cópia de colunas entre boards.
- Marin, Mai e Komi como fontes do Calendar Hub.

### Changed
- Cache do Google Calendar (TTL de 60s/300s).

## [0.25.1] - 2026-06-20

### Fixed
- Crash do `AssigneePicker` e HTTP 400 ao criar subtarefa inline na árvore.

## [0.25.0] - 2026-06-19

### Added
- Eisenhower, Lista e Meu Dia migrados para `@dnd-kit` (spec 025).
- Árvore hierárquica de tarefas com N níveis e pessoas atribuídas.

### Fixed
- Violação de Rules of Hooks no `TodayScreen` e flash do spinner ao soltar cards.

## [0.24.0] - 2026-06-18

### Added
- Kanban reescrito com `@dnd-kit` (drag fluido, atualização otimista, reordenação) e reskin "vidro" (spec 024).
- Views de Kanban configuráveis, com seletor, filtros, edição e exclusão de colunas e seletor de lista.

### Fixed
- Editar tarefa não joga mais o card para a primeira coluna; HTTP 500 no Meu Dia.

## [0.23.1] - 2026-06-17

### Fixed
- Bullets escritos depois das 21h caíam no dia seguinte (UTC vs UTC-3).

## [0.23.0] - 2026-06-17

### Added
- Makima Hub: tela inicial em `/` sem sidebar, alimentada pelo endpoint agregador `/api/hub/summary` (spec 023).

## [0.22.1] - 2026-06-16

### Fixed
- CSS da Frieren isolado em `.frieren-shell`, evitando colisão entre shells.

## [0.22.0] - 2026-06-15

### Added
- Komi (pessoas e contatos): shell com 7 telas, `PersonPicker` reutilizável e entrada na sidebar global.
- Calendar Hub reescrito no tema "ágora" e com calendários do Google separados por conta.
- Violet: botão de calendário para abrir qualquer data.

### Fixed
- Datetimes do Google Calendar normalizados para UTC-3.

## [0.21.0] - 2026-06-15

### Added
- Marin: reescrita pixel-perfect do frontend, 7 telas fiéis ao design handoff.
- Mai: paridade de design (Início e Estatísticas), checkbox de episódios com marcação cumulativa e por temporada, sincronização automática de temporadas e episódios.

### Changed
- TMDB passa de Bearer v4 para api_key v3 (Akane, Marin e Mai).

## [0.20.1] - 2026-06-14

### Added
- Retratos da Mai e da Marin no hero e na sidebar; script de enriquecimento em lote pós-sync do MAL.

### Fixed
- Classes CSS da Mai e CSS completo do shell de animes, que estava quebrado.

## [0.20.0] - 2026-06-13

### Added
- Akane (filmes, estilo Letterboxd), spec 015.
- Marin (animes), spec 021, agente + webapp.
- Mai Sakurajima (séries de TV), spec 022.

## [0.19.0] - 2026-06-13

### Added
- Calendar Hub: agregador de calendários com day/week/month, sidebar de calendários e seletor de variante.
- Espelho de tarefas no Google Calendar (`gcal_sync`), com agenda pessoal e aviso quando o token é revogado.
- Providers do Calendar Hub para Nami, Frieren e Diário.
- Command Palette ⌘K, atalhos e recorrência no quick-add (fatia 018).

### Fixed
- Migração idempotente de `google_event_id`, cores OKLCH dos eventos e nomes na sidebar.

## [0.18.0] - 2026-06-13

### Added
- Meu Dia com time-blocking (capacidade do dia) e Matriz de Eisenhower (fatias 016 e 017).
- Documentação completa do PostgreSQL.

## [0.17.1] - 2026-06-12

### Changed
- Score do hábito reescrito no modelo "caixa d'água", com 3 dimensões.

## [0.17.0] - 2026-06-12

### Added
- Hábitos na Kaguya: check-ins, "força" do hábito e UI no webapp (fatia 014).

## [0.16.0] - 2026-06-12

### Added
- Tags nas tarefas, com seletor de cor no modal.
- Smart-lists (filtros salvos) e calendário de tarefas, incluindo built-ins GTD.

## [0.15.0] - 2026-06-11

### Added
- Datas e recorrência (RRULE) nas tarefas, no webapp e no agente.
- Criação e gestão de grupos de lista no webapp.

### Fixed
- Tarefas apareciam e podiam ser criadas direto no Kanban.

## [0.14.0] - 2026-06-11

### Added
- Kaguya própria sobre PostgreSQL (Tasks MVP): schema, lógica de tarefas, rotas `/api/tasks/*`, shell React no webapp e agente reescrito.
- Pagamento atômico: completar a tarefa e lançar a despesa na mesma transação.

### Removed
- Dependência do TickTick.

## [0.13.0] - 2026-06-10

### Added
- Violet: registro emocional TCC (spec 006), heatmap que pinta os dias com favorito (008) e abre o dia ao clicar (009).
- Frieren: carrossel rolável e busca no registro de leitura, editar e apagar logs.

## [0.12.1] - 2026-06-10

### Fixed
- Imagens das personagens servidas da raiz do `dist`.
- Heatmap da Frieren com grade contínua.

## [0.12.0] - 2026-06-09

### Added
- Violet: diário em formato bullet journal (spec 003).
- Nami: SPA de finanças refeita com fidelidade ao design de referência (spec 002).
- Kaguya: spec e planejamento da seção de tarefas no webapp.

### Fixed
- Heatmap da Violet por mês no estilo GitHub, HTTP 400 ao lançar na Nami e Dashboard travado em junho.

## [0.11.0] - 2026-06-09

### Added
- Novo shell da Frieren com 9 telas (Início, Catálogo, Detalhe, Quero ler, Wishlist, Estantes, Atividade, Resenhas, Estatísticas).
- Modal de adicionar livro com busca no Google Books, exclusão com confirmação inline e seletor de data ao registrar leitura.

## [0.10.0] - 2026-06-08

### Added
- Tema escuro com sidebar de personagens para todo o webapp.
- Redesign do Diário (literary noir, depois layout "Journalistic" com sidebar à direita).
- CRUD completo: exclusão em todas as entidades do webapp e edição/remoção pelo Telegram.
- Novos status de livro (estante/wishlist), com preço e link de loja.

## [0.9.1] - 2026-06-07

### Fixed
- `books.py` migrado para PostgreSQL; conversão de `Decimal` para `float` e schema de `transactions`.

## [0.9.0] - 2026-06-07

### Changed
- Banco migrado do BigQuery para PostgreSQL: módulo de conexão compartilhado, schemas da Nami e da Frieren, script de migração e tools reescritas.

### Added
- Edição de metadados do livro (PATCH `/api/books/{id}/metadata`), abas Estante e Lista de Desejos.
- Adminer e serviço de backup do PostgreSQL.

## [0.8.1] - 2026-06-06

### Fixed
- Heatmap do diário com 52 semanas, como especificado.
- Memory leak, closure velha e busca no frontend do diário.
- Fuso horário de `todayISO`/`calcStreak` e validação do formato de data na API.

## [0.8.0] - 2026-06-06

### Added
- Webapp de Livros (Frieren), Fatia 3.
- Diário pessoal (Violet), Fatia 4: backend e frontend.

### Fixed
- Sete problemas de robustez apontados em revisão de código do diário.

## [0.7.1] - 2026-06-06

### Fixed
- Campos trocados entre API e telas de Dashboard, Cartões, Orçamentos e Contas.
- `vite-env.d.ts` para o import de CSS compilar no TypeScript.

## [0.7.0] - 2026-06-06

### Added
- Primeira versão do webapp: interface web de finanças (Fatias 0, 1 e 2).

## [0.6.0] - 2026-06-05

### Added
- Nami expandida: parcelas, cartões de crédito, empréstimos (PRICE/SAC, simulações, avalanche), orçamento por envelope e score de saúde financeira de 0 a 100.
- Contas dinâmicas (tabela `accounts`) no lugar da lista fixa; cartões vinculados a contas correntes.
- Wizards `/criar_conta` e `/criar_cartao` com botões inline.

### Changed
- `transactions` passa a ser a única fonte da verdade do saldo dos cartões.

## [0.5.0] - 2026-06-04

### Added
- Menu interativo de livros no Telegram com botões inline e capa via `send_photo`.
- Busca por ISBN-10/13, filtro por editora e `finish_book` com datas retroativas.
- Sessões por domínio no coordinator, mais os comandos `/tokens` e `/limpar`.

### Fixed
- Busca normaliza acentos e pontuação e tenta o título por segmentos quando o subtítulo atrapalha.

## [0.4.1] - 2026-06-04

### Changed
- Sessões migradas para o PostgreSQL gerenciado pelo Dokploy (driver asyncpg, rede `dokploy-network`).
- Modelo atualizado para `gemini-2.5-flash`.

### Added
- Tool `update_book_pages` para corrigir o total de páginas.

### Fixed
- Texto de eventos não finais dos sub-agentes agora é capturado; recuperação automática de `SessionNotFoundError`.

## [0.4.0] - 2026-06-04

### Added
- Frieren, agente de livros: catálogo e logs de leitura (BigQuery), busca na Google Books API, `add_book`, `log_reading` com cálculo de delta, `finish_book`, estatísticas.
- Frieren registrada como sub-agente da Makima.

## [0.3.1] - 2026-06-02

### Fixed
- `VertexAiRagRetrieval` atualizado para a nova API do ADK.
- Containers renomeados para não conflitar com instâncias anteriores.

## [0.3.0] - 2026-06-02

### Added
- Kurisu, agente de base de conhecimento (Vertex AI RAG), ligada ao coordinator.
- Persistência de sessão em PostgreSQL.
- Script de status do TickTick para o hook de início de sessão.

## [0.2.0] - 2026-05-31

### Added
- Kaguya (tarefas) integrada ao TickTick por um servidor MCP próprio com 14 tools genéricas.
- Tools cruzadas Kaguya + Nami: `complete_payment_task` e `create_expense_reminder`.
- Servidor MCP do Google Calendar (lê todos os calendários, escreve só no principal) e script de autorização OAuth.

### Changed
- Kaguya passou a consumir as tools via `McpToolset`, com o coordinator inicializando o MCP de forma assíncrona.

### Fixed
- Token mascarado nos logs, expiração de credencial e fuso no Calendar MCP.

## [0.1.0] - 2026-05-30

### Added
- Coordinator Makima em Google ADK, atendendo pelo Telegram, com a personalidade inspirada em Chainsaw Man e o prefixo **Makima:** nas respostas.
- Nami (finanças) com tools de lançamento, consulta, resumo de gastos, tendência e assinaturas, usando BigQuery.
- Testes unitários das tools de consulta e de assinaturas.

### Fixed
- A Makima voltou a usar `sub_agents` (o `AgentTool` quebrava a resposta final).
- Nami salva na hora, sem pedir confirmação; credenciais GCP passam a vir de `GCP_CREDENTIALS_JSON`.

[Unreleased]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.61.0...HEAD
[0.61.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.60.0...v0.61.0
[0.60.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.59.0...v0.60.0
[0.59.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.58.1...v0.59.0
[0.58.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.58.0...v0.58.1
[0.58.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.57.1...v0.58.0
[0.57.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.57.0...v0.57.1
[0.57.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.56.0...v0.57.0
[0.56.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.55.1...v0.56.0
[0.55.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.55.0...v0.55.1
[0.55.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.54.0...v0.55.0
[0.54.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.53.0...v0.54.0
[0.53.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.52.1...v0.53.0
[0.52.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.52.0...v0.52.1
[0.52.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.51.0...v0.52.0
[0.51.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.50.1...v0.51.0
[0.50.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.50.0...v0.50.1
[0.50.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.49.0...v0.50.0
[0.49.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.48.0...v0.49.0
[0.48.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.47.1...v0.48.0
[0.47.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.47.0...v0.47.1
[0.47.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.46.0...v0.47.0
[0.46.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.45.0...v0.46.0
[0.45.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.44.0...v0.45.0
[0.44.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.43.1...v0.44.0
[0.43.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.43.0...v0.43.1
[0.43.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.42.0...v0.43.0
[0.42.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.41.1...v0.42.0
[0.41.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.41.0...v0.41.1
[0.41.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.40.0...v0.41.0
[0.40.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.39.0...v0.40.0
[0.39.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.38.0...v0.39.0
[0.38.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.37.0...v0.38.0
[0.37.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.36.0...v0.37.0
[0.36.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.35.1...v0.36.0
[0.35.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.35.0...v0.35.1
[0.35.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.34.0...v0.35.0
[0.34.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.33.1...v0.34.0
[0.33.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.33.0...v0.33.1
[0.33.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.32.0...v0.33.0
[0.32.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.31.0...v0.32.0
[0.31.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.30.1...v0.31.0
[0.30.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.30.0...v0.30.1
[0.30.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.29.1...v0.30.0
[0.29.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.29.0...v0.29.1
[0.29.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.28.1...v0.29.0
[0.28.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.28.0...v0.28.1
[0.28.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.27.1...v0.28.0
[0.27.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.27.0...v0.27.1
[0.27.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.26.1...v0.27.0
[0.26.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.26.0...v0.26.1
[0.26.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.25.1...v0.26.0
[0.25.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.25.0...v0.25.1
[0.25.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.23.1...v0.24.0
[0.23.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.23.0...v0.23.1
[0.23.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.22.1...v0.23.0
[0.22.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.22.0...v0.22.1
[0.22.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.20.1...v0.21.0
[0.20.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.20.0...v0.20.1
[0.20.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.17.1...v0.18.0
[0.17.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.12.1...v0.13.0
[0.12.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/GustavoBarreto13/makima_personal_agent/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/GustavoBarreto13/makima_personal_agent/releases/tag/v0.1.0
