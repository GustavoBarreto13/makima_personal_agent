# Research — Tutor de Idiomas na Violet (031)

Todas as incógnitas do Technical Context estão resolvidas abaixo. Nenhum `NEEDS CLARIFICATION`
remanescente.

## R1 — Como chamar o Gemini fora do loop ADK (análise one-shot estruturada)

- **Decision**: Usar o SDK `google-genai` (`from google import genai`) com uma chamada síncrona
  `client.models.generate_content(model="gemini-2.5-flash", contents=prompt, config={...})`,
  pedindo `response_mime_type="application/json"` + `response_schema` para forçar JSON validado.
  Autenticar com `genai.Client(api_key=os.environ["GEMINI_API_KEY"])`.
- **Rationale**: O webapp nunca instancia ADK (routers chamam funções puras — `webapp/CLAUDE.md`).
  A análise é uma tarefa one-shot com saída estruturada, não uma conversa multi-turno; um `Agent`
  ADK seria peso desnecessário. `google-genai` já é dependência transitiva do `google-adk`
  (fixaremos explícito em `requirements.txt` por robustez). O modelo e a chave são os mesmos da
  constituição (`gemini-2.5-flash` via `GEMINI_API_KEY`).
- **Alternatives considered**:
  - *Rodar um `Agent` ADK a partir do webapp* — rejeitado: quebra o padrão webapp-não-usa-ADK e
    adiciona runner/sessão para um único turno.
  - *`google-generativeai` (SDK legado)* — rejeitado: `google-genai` é o SDK unificado atual e o
    que a ADK já usa por baixo; evita conflito de versões.

## R2 — Modelo de progresso por conceito (maestria + tendência)

- **Decision**: Reusar o padrão "motor puro EMA" de `agents/kaguya/habit_strength.py`. Sinal binário
  por (análise × conceito): `1` = usado corretamente, `0` = erro. Maestria = EMA cronológica dos
  sinais (peso `0.3`). Tendência = 2 EMAs (rápida `0.5` / lenta `0.2`) comparadas com limiar; só
  exibida com ≥3 sinais (senão `null`/"poucos dados"). **Sem decaimento por ausência**: a maestria
  só muda quando o conceito reaparece (decisão de clarificação). Fonte da verdade = tabela de
  events; `journal_tutor_skills` é cache materializado, recomputável dos events.
- **Rationale**: Consistência com o modelo de hábitos (perdoa deslizes, dá 3 dimensões), testável
  isolado, determinístico. Peso maior que o `0.1` dos hábitos porque escrita melhora mais rápido e
  o volume de amostras é menor.
- **Alternatives considered**:
  - *Percentual simples (acertos/total)* — rejeitado: não captura tendência recente; um erro antigo
    pesa igual a um recente.
  - *Decaimento temporal (como caixa d'água diária)* — rejeitado na clarificação: puniria sem
    evidência de piora e exige varrer o calendário.

## R3 — Vocabulário de conceitos gramaticais

- **Decision**: Lista canônica curada (~20–30 conceitos comuns de aprendizes de inglês) como
  constante em `agents/kurisu/tutor.py` (`CONCEPTS_EN`: `slug` + `label` PT-BR). O prompt injeta os
  slugs e instrui o modelo a classificar cada erro/acerto num deles; slugs fora da lista viram
  `outros`. Endpoint `GET /api/journal/tutor/concepts` expõe a lista para a UI do guia.
- **Rationale**: Slugs estáveis são pré-requisito para o acúmulo por conceito (senão "verb to be" e
  "to-be" viram duas trilhas). Curar no código é barato e revisável; `language` no schema permite
  outra lista por idioma depois.
- **Alternatives considered**:
  - *Slugs livres gerados pelo modelo* — rejeitado: instabilidade quebra o histórico.
  - *Taxonomia externa (CEFR/English Grammar Profile)* — adiado: rica porém pesada de mapear agora.

## R4 — Nível estimado (CEFR A1–C2)

- **Decision**: Derivar na leitura a partir da média móvel das **notas** das análises recentes do
  idioma (função pura `estimate_cefr(recent_scores) -> {level, preliminary}`). Faixas de nota →
  CEFR (ex.: <40 A1, 40–54 A2, 55–69 B1, 70–82 B2, 83–92 C1, ≥93 C2 — calibrável). `preliminary=True`
  enquanto houver menos de N análises (ex.: 5).
- **Rationale**: Barato (sem LLM extra), motivador, e naturalmente por idioma. Nota já é produzida
  por análise. Estimativa, não certificação — sinalizada como preliminar cedo.
- **Alternatives considered**: pedir o CEFR ao LLM a cada análise — rejeitado: variância alta entre
  chamadas e custo; a média de notas é mais estável.

## R5 — Sugestão de próximo foco

- **Decision**: Determinística, computada na leitura (`pick_next_focus(skills, guide_targets)` puro):
  prioriza conceitos-alvo do guia ativo com menor maestria; na ausência de guia, o conceito de menor
  maestria com dados suficientes. A frase é montada por template PT-BR na voz Kurisu em `tutor.py`
  (sem chamada de LLM).
- **Rationale**: Fecha o ciclo corrigir→medir→orientar sem custo/latência de LLM extra nem
  variabilidade. Reaproveita os dados de `skills` já materializados.
- **Alternatives considered**: gerar a sugestão via Gemile a cada leitura — rejeitado (custo/latência
  numa tela que abre com frequência).

## R6 — Reescrita natural/idiomática vs correção gramatical

- **Decision**: A análise devolve **dois** textos distintos: `corrected_text` (correção gramatical
  mínima — alimenta o toggle do bullet) e `natural_rewrite` (como um nativo escreveria — exibido só
  no painel/modal). Ambos vêm no mesmo JSON da chamada Gemini.
- **Rationale**: Correção mínima preserva a voz do usuário no toggle; a reescrita natural puxa
  fluência sem "reescrever" o diário. Uma única chamada cobre os dois (sem custo extra).

## R7 — Guia de estudo (foco direcionável)

- **Decision**: Tabela `journal_tutor_guides` com no máximo **um ativo por idioma** (índice único
  parcial `WHERE active`). Campos: `description` (texto livre) + `target_concepts` (JSONB de slugs
  da lista canônica). Quando ativo, `tutor.py` injeta o foco no prompt (ênfase + comentário de
  progresso) e a tela de progresso destaca/filtra os alvos. Editar/remover só afeta análises futuras.
- **Rationale**: Atende "guiável" com o mínimo: um registro editável orienta o prompt e a UI. O
  material do livro é fornecido pelo usuário; puxar da base RAG da Kurisu fica como gancho futuro.
- **Alternatives considered**: currículo estruturado com lições marcáveis — adiado (UI/estado bem
  maiores) conforme clarificação.

## R8 — Toggle sem fetch extra + desacoplamento journal/kurisu

- **Decision**: O endpoint `GET /api/journal/page` continua chamando `get_or_create_page`
  (inalterado em `agents/journal/`); **no router**, após obter os bullets, enriquece cada um com um
  campo `tutor` (`{analysis_id, has_correction, error_count}` ou `null`) via
  `kurisu.tutor.get_bullets_tutor_meta(bullet_ids)` (1 query agregada). O toggle usa
  `GET /api/journal/bullets/{id}/tutor` só quando acionado, para buscar o `corrected_text`.
- **Rationale**: Mantém `agents/journal/` sem dependência da Kurisu (Princípio III); a composição
  vive na camada de router (que já importa tools de vários agentes). Uma query agregada evita N+1.
- **Alternatives considered**: `get_or_create_page` fazer LEFT JOIN nas tabelas do tutor —
  rejeitado: acopla o journal ao domínio da Kurisu.

## R9 — Ciclo de vida / exclusão

- **Decision**: `journal_tutor_analyses.bullet_id` e `journal_tutor_events.analysis_id` com
  `ON DELETE CASCADE`. Excluir um bullet remove análises e events; o cache `skills` é reconciliável
  recomputando dos events (ou, na prática, os skills daquele conceito são recomputados na próxima
  análise; divergência residual é aceitável e recomputável). Reanálise cria nova linha em `analyses`;
  a mais recente por bullet alimenta o toggle.
- **Rationale**: Sem registros órfãos (FR-011) com integridade referencial nativa; simplicidade.
