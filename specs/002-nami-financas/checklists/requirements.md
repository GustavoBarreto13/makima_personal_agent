# Requirements Checklist: Nami · Finanças

**Purpose**: Verificar cobertura e qualidade dos requisitos da spec fiel ao design handoff.
**Created**: 2026-06-09
**Feature**: [spec.md](../spec.md)
**Design Handoff**: `docs/claude_design/design_handoff_nami_financas/README.md`

---

## Shell e Navegação

- [ ] CHK001 A sidebar define corretamente os 3 grupos de navegação (Visão geral, Dia a dia, Planejamento) com todos os 8 itens do handoff §5
- [ ] CHK002 Os badges de valor laterais estão especificados para Contas, Cartões e Assinaturas (FR-002)
- [ ] CHK003 O item ativo tem tokens de cor e peso definidos explicitamente (FR-003)
- [ ] CHK004 A topbar especifica quais telas exibem o seletor de mês (Dashboard, Transações, Contas, Cartões, Orçamentos) e quais não exibem (Assinaturas, Empréstimos, Financiamentos) — handoff §8
- [ ] CHK005 O deep-link por hash está especificado como requisito (FR-006) e os sub-itens da sidebar principal do Makima roteiam corretamente (FR-007)
- [ ] CHK006 A SummBar do rodapé está especificada como presente em todas as telas (FR-005)

## Lançamento de Transação

- [ ] CHK007 A Quick-Add inline especifica: toggle tipo com mudança de cor, 5 chips de despesa e 4 chips de receita, botão "Lançar" só com valor > 0, Enter salva, reset + foco após salvar (FR-008)
- [ ] CHK008 O AddModal especifica os 3 pontos de entrada (sidebar, SummBar, atalho `A`/`+`) com foco automático no valor (FR-009)
- [ ] CHK009 O AddModal especifica todos os campos obrigatórios: toggle tipo, valor, grid 4×N de categorias, descrição, conta/cartão, data (FR-010)
- [ ] CHK010 A reatividade pós-save especifica exatamente quais elementos são atualizados sem reload (FR-011)
- [ ] CHK011 O toast especifica posição, estilo pill e duração 2600 ms (FR-021)

## Dashboard

- [ ] CHK012 O hero especifica `nami-hero.png` com `align-self: flex-end`, drop-shadow e glow radial — fiel ao handoff §6.1
- [ ] CHK013 O número do saldo do mês especifica `clamp(42px, 5.5vw, 62px)` Bricolage bold (FR-012)
- [ ] CHK014 Os 4 stat cards especificam conteúdo exato: Receitas (total+contagem), Despesas (total+sparkline+variação), Saldo (total+taxa de economia), Patrimônio (total+disponível líquido) — handoff §6.1
- [ ] CHK015 A sparkline de barras do card "Despesas" está especificada (FR-013)
- [ ] CHK016 O gráfico de fluxo de caixa especifica barras duplas (verde/coral) com mês atual destacado (FR-014)
- [ ] CHK017 O donut "Para onde foi" especifica geração SVG no front-end com legenda % + nome + valor absoluto (FR-015)
- [ ] CHK018 "Próximos vencimentos" especifica combinação de assinaturas + empréstimos + financiamentos, ordenados por dias restantes (FR-016)

## Contas e Assinaturas — IconField

- [ ] CHK019 O IconField especifica upload via FileReader (Data URL) E cola de URL externa como dois caminhos distintos (FR-020)
- [ ] CHK020 O preview circular em tempo real está especificado para ambos os caminhos do IconField (FR-020)
- [ ] CHK021 O fallback de sigla sobre fundo colorido está especificado como comportamento quando `img_url` é nulo (FR-020, US4 AC5)
- [ ] CHK022 O `<img onError>` para URL inválida está coberto nos Edge Cases
- [ ] CHK023 A persistência de `icon_url` no backend está especificada nas Key Entities (Account, Subscription) e nas Assumptions (extensões de backend)

## Contas

- [ ] CHK024 O card de conta especifica: barra de acento lateral 4px, logo circular 40px, saldo Bricolage 28px, entradas/saídas do mês no rodapé (US4 AC1)
- [ ] CHK025 O FormModal de conta especifica todos os campos: nome, tipo, saldo, sigla, cor (7 swatches), IconField (US4 AC2)
- [ ] CHK026 O painel de composição do patrimônio (barra segmentada) está especificado (US4 AC7, FR-002 badges)
- [ ] CHK027 A extensão de backend `accounts` está declarada nas Assumptions (color, short, icon_url)

## Cartões

- [ ] CHK028 O plástico especifica: aspect-ratio 1.586, gradiente configurável, chip EMV SVG, número mascarado `•••• 4471`, bandeira (FR-001 + US5 AC1)
- [ ] CHK029 A barra de uso especifica: laranja < 80% e coral ≥ 80% (US5 AC3)
- [ ] CHK030 O FormModal de cartão especifica todos os campos: nome, bandeira (enum 4 opções), final 4 dígitos, limite, dia fechamento, dia vencimento, gradiente (US5 AC2)
- [ ] CHK031 A extensão de backend `credit_cards` está declarada nas Assumptions (brand, last4, grad)

## Assinaturas

- [ ] CHK032 Os 3 stat cards de Assinaturas estão especificados: por mês, por ano, próxima cobrança (US6 AC1)
- [ ] CHK033 O FormModal de assinatura especifica: serviço, valor, dia cobrança, ciclo, categoria, cor, IconField (US6 AC3)
- [ ] CHK034 A extensão de backend `subscriptions` está declarada nas Assumptions (color, icon_url, next_billing_day)

## Orçamentos

- [ ] CHK035 A barra de progresso especifica as 3 faixas de cor: categoria até 85%, ouro entre 85–99%, coral se ultrapassou — fiel ao handoff §6.5
- [ ] CHK036 O select de "Novo orçamento" especifica que só exibe categorias sem orçamento no mês corrente (US7 AC3, FR-022)

## Empréstimos (pessoa-a-pessoa)

- [ ] CHK037 O formulário especifica o campo `direction` como segment "Emprestei"/"Peguei emprestado" — fiel ao handoff §6.7
- [ ] CHK038 O campo `person_name` está especificado como obrigatório no formulário (US8 AC3)
- [ ] CHK039 Os dots de parcelas especificam: ✓ verde para pagas, número cinza para pendentes (FR-026)
- [ ] CHK040 Os stat cards "A receber" (lent) e "A pagar" (borrowed) estão definidos com agregação correta (FR-027)
- [ ] CHK041 A incompatibilidade com o modelo atual `loans` (PRICE/SAC) está declarada nas Assumptions com decisão adiada ao plano

## Financiamentos (entidade separada)

- [ ] CHK042 A entidade `Financing` está definida em Key Entities como **nova** (sem tabela/endpoint no backend atual)
- [ ] CHK043 A separação completa de Empréstimos × Financiamentos está em FR-028 e no SC-008 como critério mensurável
- [ ] CHK044 O card de financiamento especifica: descrição, credor, saldo devedor calculado, taxa descritiva (FR-029, US9 AC2)
- [ ] CHK045 Os endpoints `GET/POST/DELETE /api/finances/financings*` estão declarados nas Assumptions como a criar

## Fidelidade Visual — Tokens de Design

- [ ] CHK046 Todos os tokens CSS do handoff §2 (tipografia, paleta clara, paleta escura, radius, sombras) estão em FR-030
- [ ] CHK047 A escala tipográfica (Bricolage/DM Sans/DM Mono com tamanhos específicos) está refletida nos FRs de componentes (FR-002, FR-012, FR-017, FR-018)
- [ ] CHK048 `tabular-nums` está especificado para valores monetários em listas (FR-031)
- [ ] CHK049 O formato compacto `1,2k` está especificado para badges na sidebar e espaços reduzidos (FR-032)
- [ ] CHK050 A verificabilidade dos tokens via inspetor CSS está nos Success Criteria (SC-009, SC-010)

## Tema Escuro e Privacidade

- [ ] CHK051 O tema escuro especifica `data-theme="dark"` no elemento raiz sem alterar HTML (FR-033)
- [ ] CHK052 Os valores específicos dos tokens escuros (`--paper: #1A1E2A`, `--tang: #E08840`, etc.) estão em US10 AC1
- [ ] CHK053 O modo privacidade especifica `data-privacy="on"`, classes `.amount`/`.priv`, blur 7px e reveal no hover (FR-034)
- [ ] CHK054 As 4 opções de acento especificam os valores oklch/hex exatos do handoff §8 (FR-035)
- [ ] CHK055 A persistência via `localStorage` com chave prefixada `nami:` está especificada (FR-036)

## Responsividade

- [ ] CHK056 Os 3 breakpoints do handoff §9 estão em FR-037, FR-038, FR-039: < 880px sidebar colapsa, < 900px grids 1-col, < 760px portrait some

## Qualidade de Requisitos

- [ ] CHK057 Todo FR usa linguagem normativa MUST/MUST NOT (sem "should" ou "can")
- [ ] CHK058 Todos os SC-xxx são mensuráveis e verificáveis sem ambiguidade (não contêm "rápido", "bom", "adequado")
- [ ] CHK059 Todas as extensões de backend necessárias (6 itens nas Assumptions) estão documentadas explicitamente e não há FR que implique mudança de backend sem Assumption correspondente
- [ ] CHK060 Nenhuma User Story assume dados mock como dados reais — todos os ACs referenciam endpoints de backend

## Notes

- Marcar como `[x]` ao verificar cada item durante a revisão da spec.
- Ao encontrar divergência com o handoff, anotar inline: `[x] ~~divergência encontrada:~~ ...`
- O checklist cobre a spec reescrita em 2026-06-09; não reflete a spec anterior (2026-06-08).
- Próximo passo após fechar este checklist: `/speckit-plan` para detalhamento técnico das extensões de backend.
