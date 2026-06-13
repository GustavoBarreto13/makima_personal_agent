# Design Guide — Webapp que guia a construção do Projeto (020)

Este guia descreve a UX da camada de planejamento na webapp. O princípio inegociável (e
critério de sucesso SC-001) é: **a tela conduz o usuário pela mão — nunca um formulário
vazio**. Tudo reusa os tokens OKLCH e os primitivos do shell Kaguya já existente
(`webapp/frontend/src/pages/kaguya/kaguya.css`): não há biblioteca de UI nova nem protótipo
de alta fidelidade; o desenho é descrito aqui em texto + esquemas ASCII.

## Princípios de UX (governam todas as telas desta fatia)

1. **Wizard, não formulário.** Construir um projeto é uma sequência de perguntas, uma por
   vez, na ordem natural do GTD. Cada passo é pulável.
2. **Empty states que ensinam.** Toda área vazia diz o próximo movimento ("defina por que
   este projeto existe →"). Nunca uma tela morta.
3. **Divulgação progressiva.** O básico fica na frente; datas, estimativa, brainstorm só
   aparecem quando o usuário pede ("+ detalhes").
4. **Próxima ação sempre visível.** O cabeçalho do projeto destaca a próxima tarefa aberta —
   o usuário nunca olha o plano sem saber o que executar agora.
5. **Ações diretas.** Promover, mover entre baldes, reordenar fases por arrastar ou botão
   óbvio — seguindo os padrões já usados na Kaguya (drag-and-drop de tarefas, modais).

## 1. Sidebar reestruturada (PARA)

A sidebar passa a ter **baldes de topo** fixos. Grupos (pastas) aninham dentro de um balde;
Listas sem grupo aparecem direto sob o balde. O Inbox segue no topo, fora dos baldes.

```
┌──────────────────────────┐
│  📥 Inbox                 │
│  🔎 Buscar...             │
├──────────────────────────┤
│  PROJETOS                 │  ← balde (para_type='project')
│   ▸ 🎯 Churn 2026   🟡 42%│     Lista promovida: selo de saúde + %
│   ▸ 🎯 Dashboard NPS 🟢 70%│
├──────────────────────────┤
│  ÁREAS                    │  ← balde (para_type='area')
│   ▾ 📁 Trabalho           │     Grupo (pasta) dentro do balde
│      • Reuniões           │
│      • Acompanhamentos    │
│   ▾ 📁 Casa               │
│      • Compras            │
├──────────────────────────┤
│  🗄  Arquivo (12)          │  ← derivado de archived_at (colapsado)
└──────────────────────────┘
```

- O balde **Recursos** não é exibido nesta fase (reservado — research D6).
- Cada Lista comum tem, no hover/menu, **"Promover a Projeto"** (abre o wizard já vinculado).
- Mover entre baldes: arrastar a Lista para outro balde, ou menu "Mover para → Projetos/Áreas".
- Projetos exibem selo de saúde (🟢/🟡/🔴) + % ao lado do nome.

## 2. ProjectWizard — o fluxo guiado (peça central)

Aberto por "Novo projeto" ou "Promover a Projeto". **Uma pergunta por passo**, barra de
progresso do wizard no topo, botões "Pular" e "Voltar" sempre disponíveis.

```
Passo 1/5 ── ●────○────○────○────○
┌───────────────────────────────────────────┐
│  Que tipo de projeto é esse?                │
│                                             │
│  [ 📊 Data Science ]  [ 📈 Dashboard BI ]   │   ← cards de template (project_templates)
│  [ 💻 Código       ]  [ ✨ Pessoal       ]   │
│                                             │
│  "Vou montar as fases iniciais pra você.    │   ← microcopy que explica o efeito
│   Dá pra ajustar tudo depois."              │
│                              [ Pular ]  [ → ]│
└───────────────────────────────────────────┘
```

| Passo | Pergunta (microcopy) | Campo | Efeito |
|---|---|---|---|
| 1 | "Que tipo de projeto é esse?" | cards de template | semeia as fases do molde; "Pessoal" = genérico |
| 2 | "Por que você quer fazer isso?" | `proposito` (1 linha, placeholder real ex.: "Reduzir cancelamentos no próximo trimestre") | grava o propósito |
| 3 | "Como vai ser quando estiver pronto?" | `visao` (opcional, com exemplo) | grava a visão |
| 4 | "Estas são as fases sugeridas — ajuste se quiser." | lista editável de fases (+ data-alvo opcional por fase) | cria/edita `project_phases` |
| 5 | "Qual é a primeira coisa a fazer?" | `title` de uma tarefa | cria a tarefa **e** já a adiciona ao Meu Dia |

- **Cada passo é pulável**: nome + tipo já bastam para criar (SC-002: projeto pessoal em ≤10s).
- O passo 1 traz `nome` do projeto no topo (sempre presente).
- Ao concluir, vai direto para a **tela do Projeto** já populada.

## 3. ProjectScreen — a tela do Projeto

```
┌────────────────────────────────────────────────────────┐
│  🎯 Churn 2026                         [ Editar ] [ ⋯ ] │
│  Propósito: Reduzir cancelamentos previstos no trim.    │
│  🟡 Em risco · 42% concluído · 01/jun → 30/ago          │  ← HealthBadge + ProgressBar ponderada
│  ▶ Próxima ação: baixar extrato de churn   [ + Meu Dia ]│  ← sempre visível (FR-013)
├──────────────[ Quadro de fases | Linha do tempo ]───────┤  ← alternador de view
│                                                          │
│  ▾ Entender dados      🟢 60% ── marco: 15/jun           │
│     ▢ baixar extrato de churn                            │
│     ▢ explorar nulos                                     │
│  ▾ Modelar             ⚪ 0%                              │
│     "Adicione a primeira ação desta fase"   [ + ]        │  ← empty state que ensina
│  ▾ (sem fase)          ▢ tarefas soltas...               │
└────────────────────────────────────────────────────────┘
```

- **Cabeçalho**: nome, propósito (clicável para expandir visão/brainstorm — divulgação
  progressiva), `HealthBadge` (🟢/🟡/🔴) + `ProgressBar` (ponderada por estimativa), datas, e a
  **próxima ação** com botão "+ Meu Dia".
- **Empty state do cabeçalho** (projeto sem propósito): "Comece definindo *por que* este
  projeto existe →" abrindo o editor.
- **PhaseBoard**: cada fase é uma seção (`PhaseColumn`) com sua mini-barra e, se datada, o
  marco; tarefas listadas dentro (reusa o `TaskRow` existente). Fase vazia → empty state.
  Tarefas sem fase caem numa seção "(sem fase)".
- **Adicionar tarefa numa fase**: o quick-add da fase já nasce com `phase_id` setado.
- **Status do projeto** (planejado/ativo/pausado/concluído): seletor no menu "⋯"; concluir
  sugere arquivar (mover para o balde Arquivo).

## 4. TimelineView — Gantt-leve

```
        jun        jul        ago
        │          │          │
Entender dados  ▓▓▓◆                          ◆ = marco (target_date)
Preparar dados      ▓▓▓▓
Modelar                 ▓▓▓▓▓◆
Avaliar                       ▓▓
Deploy                          ▓▓◆
        └─ hoje ▏
```

- Régua horizontal entre `start_date` e `target_date` do projeto.
- Cada fase é uma barra; fases **com `target_date`** ganham o losango de **marco** (◆).
- Fases **sem data** aparecem sequenciais (estimativa visual), sem quebrar a régua.
- Linha "hoje" marcada; barras de fase atrasada em tom de alerta (reusa a cor de vencido do
  shell).
- Desenhada com `div`/CSS-grid e os tokens do shell — **sem biblioteca de Gantt** (Minimal
  Footprint).

## 5. Tokens e primitivos reusados

- Cores/tipografia/densidade: do `kaguya.css` (OKLCH, acento configurável, `data-density`).
- `HealthBadge`: 🟢 `--ok` / 🟡 `--warn` / 🔴 `--danger` (mapear nos tokens existentes de
  prioridade/estado; sem novas variáveis se já houver equivalente).
- `ProgressBar`: barra simples preenchida pelo `pct_concluido` (ponderado).
- `TaskRow`/`QuickAdd`/chips/modais: reaproveitados como estão — a tela do Projeto é uma nova
  composição sobre primitivos conhecidos, não um novo sistema visual.

## 6. Critério de aceite de UX (liga ao SC-001)

A tela passa quando **uma pessoa que nunca planejou um projeto** consegue, só seguindo o
wizard e os empty states, terminar com um projeto que tem fases e uma primeira ação — sem
pedir ajuda e sem encarar um formulário vazio. Validado por UAT no `quickstart.md` (V3).
