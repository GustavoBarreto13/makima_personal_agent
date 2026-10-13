# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Gustavo, dono e único usuário hoje (acesso restrito ao e-mail dele via Google OAuth). Usa o painel
no celular e no PC, em dois ritmos: registros rápidos do dia a dia (gasto, tarefa, leitura, episódio,
linha no diário) e revisões mais longas (estatísticas, retrospectivas, planejamento, escrita).
Hoje é pessoal, mas a interface não deve assumir para sempre um único usuário: a possibilidade de
abrir para outras pessoas está em aberto (não confirmada).

## Product Purpose
Makima é um conjunto de agentes especialistas por domínio (finanças, tarefas e agenda, livros,
filmes, animes, séries, pessoas, e-mail, diário, viagens e base de conhecimento) com um painel web
que compartilha os mesmos dados do chat (Hermes no Telegram/WhatsApp/Discord). Existe para que a vida
pessoal inteira viva em um só lugar, sob controle do dono, em vez de espalhada em apps separados.
Sucesso: registrar algo leva segundos, e consultar ou refletir sobre os dados é agradável.

## Positioning
Vários agentes especialistas em um só lugar: cada domínio tem personalidade e cor próprias, mas tudo
se cruza (pessoas, gastos, tarefas, livros e diário se ligam entre si) e o chat e a web usam exatamente
os mesmos dados. Um app genérico de produtividade não oferece essa combinação.

## Operating Context
Webapp React servido junto da API FastAPI, em PostgreSQL próprio. Uso alternado entre celular (registro
rápido, captura por linha de texto, atalhos) e desktop (revisão, estatísticas, atalhos estilo Windows
com `Ctrl`). Datas e horas sempre no fuso America/Sao_Paulo (UTC-3).

## Capabilities and Constraints
- Domínios e agentes: Nami (finanças), Kaguya (tarefas e agenda), Frieren (livros), Akane (filmes),
  Marin (animes), Mai (séries), Komi (pessoas), Violet (diário), Yato (viagens), Lucy (e-mail),
  Kurisu (conhecimento).
- Interface em português do Brasil.
- Padrão único de UI: Design System Makima (`webapp/frontend/src/design/`); `DESIGN.md` é gerado dele.
- Páginas ainda `legacy` serão migradas para o Design System uma a uma.
- Decisão em aberto: abrir o painel para outros usuários.

## Brand Commitments
- Cada agente tem identidade própria: personagem (retrato), cor de acento e, quando o usuário escolhe,
  um estilo de arte por página (que muda o visual, nunca a estrutura).
- Todo texto de interface em pt-BR, com tom caloroso e próximo, sem jargão.
- Sem emoji na UI (emoji só como conteúdo do usuário); ícones apenas do registro único Lucide.

## Evidence on Hand
Retratos e imagens dos agentes em `webapp/frontend/public/`. Uso real diário pelo dono, com dados
reais nos domínios já migrados. Não há depoimentos, clientes, métricas públicas nem preços: não
inventar.

## Product Principles
- Registrar é rápido, refletir é prazeroso: captura em segundos, revisão sem fricção.
- Um sistema, muitas personalidades: a estrutura é a mesma em todo agente; só tom e arte mudam.
- Os dados são do dono: tudo no próprio banco, chat e web sobre a mesma fonte.
- Celular é cidadão de primeira classe, não adaptação do desktop.
- Cada tela trata carregando, vazio, erro e dados; ações destrutivas sempre têm Desfazer ou confirmação.

## Accessibility & Inclusion
Contraste WCAG AA em todos os agentes e temas (claro e escuro), foco visível, cor nunca como único
sinal, toda ação por atalho também disponível por botão ou comando, e uso confortável no celular
(alvos de toque adequados, bottom sheet, barra inferior).
