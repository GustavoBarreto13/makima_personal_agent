# Quickstart: Violet · Diário — Guia de Validação E2E

**Gerado por**: `/speckit-plan` em 2026-06-09
**Pré-requisitos para rodar**: ver `webapp/CLAUDE.md` para configuração do ambiente.

---

## Pré-requisitos

- `.env` configurado com `DATABASE_URL`, `ALLOWED_EMAIL`, `SECRET_KEY`
- PostgreSQL acessível (local ou via Docker)
- `webapp/frontend/` dependências instaladas: `npm install`
- `webapp/backend/` dependências instaladas: `pip install -r requirements.txt`
- Banco com pelo menos algumas entries de teste (ou seed manual — ver Passo 3)

---

## 1. Subir o ambiente de desenvolvimento

```bash
# Terminal 1 — backend FastAPI
cd webapp/backend
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend Vite (proxia /api para :8000)
cd webapp/frontend
npm run dev
# → http://localhost:5173
```

---

## 2. Verificar extensão do schema

O schema deve ser migrado automaticamente ao subir o backend (via `_ensure_tables()` em
`agents/journal/tools.py`). Verificar no banco:

```sql
-- Deve existir a coluna kind em journal_bullets
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'journal_bullets' AND column_name = 'kind';
-- Esperado: kind | text | bullet

-- Deve existir a coluna dream em journal_pages
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'journal_pages' AND column_name = 'dream';
-- Esperado: dream | text
```

---

## 3. Seed de dados de teste (se banco vazio)

Aceder `GET /api/journal/page?date=2026-06-09` para criar a entry de hoje.
Usar os endpoints para adicionar bullets de cada tipo:

```bash
# Autenticar primeiro via browser (Google OIDC) em http://localhost:5173/login
# Depois os cookies são enviados automaticamente

# Bullet simples
curl -sb /tmp/cookies.txt -X POST http://localhost:8000/api/journal/bullets \
  -H "Content-Type: application/json" \
  -d '{"page_id": 1, "position": 1000, "content": "Manhã produtiva.", "kind": "bullet"}'

# Destaque
curl -sb /tmp/cookies.txt -X POST http://localhost:8000/api/journal/bullets \
  -H "Content-Type: application/json" \
  -d '{"page_id": 1, "position": 2000, "content": "Almoço com @Pedro — momento especial.", "kind": "highlight"}'

# Sabedoria
curl -sb /tmp/cookies.txt -X POST http://localhost:8000/api/journal/bullets \
  -H "Content-Type: application/json" \
  -d '{"page_id": 1, "position": 3000, "content": "Escrever não é guardar o dia. É descobrir o que ele significou.", "kind": "wisdom"}'

# Sonho da entrada
curl -sb /tmp/cookies.txt -X PUT http://localhost:8000/api/journal/page/dream \
  -H "Content-Type: application/json" \
  -d '{"page_id": 1, "dream": "Estava numa estação que não terminava."}'
```

---

## 4. Validação por tela (cenários E2E)

### P1 — Tela Write

1. Abrir `http://localhost:5173/journal` → deve renderizar o VioletShell (sidebar própria, tema
   marfim claro, topbar, sem a sidebar global do Makima).
2. O cabeçalho deve exibir: mês+dia em DM Sans/accent-deep, dia-da-semana em Newsreader
   56px, `#N · Hoje`.
3. O prompt de sonho deve aparecer com ícone lua. Digitar um sonho e clicar fora → deve salvar
   (verificar `GET /api/journal/page?date=...` que o campo `dream` foi persistido).
4. Clicar no chip "Destaque" e digitar → novo bullet com coração ♥ garnet e fundo gradiente lateral.
5. Clicar no chip "Sabedoria" e digitar → bullet com gem violeta e fonte Newsreader itálico.
6. Digitar `@Pedro` em um bullet → "Pedro" deve ficar em verde emerald após salvar.
7. Digitar `#corrida` → deve ficar em azul accent-deep.
8. Usar `‹` para navegar para o dia anterior → cabeçalho muda, bullets do dia anterior aparecem.
9. Usar `«` quando na entrada mais antiga → botão deve estar desabilitado.
10. Clicar em "Lista" no footer → deve ir para a tela Journal.

### P2 — Tela Journal

1. Na tela Journal, verificar que há cards agrupados por mês em ordem decrescente.
2. Cada card deve exibir: número do dia (Newsreader 30px), excerpt de 2 linhas (ver se trunca),
   pill garnet se tiver highlight, pill gold se tiver dream.
3. Buscar por "Pedro" na topbar → cards filtrados aparecem.
4. Clicar em um card → volta para Write com aquela entry aberta.

### P3 — Coleções

1. Clicar em "Highlights" na sidebar → grid de cards com accent bar garnet, texto dos bullets.
2. Clicar em "Wisdom" → cards com fonte Newsreader itálico e accent bar violeta.
3. Clicar em "Dreams" → lista de sonhos com accent bar gold, tipografia Newsreader itálico.
4. Clicar em "Tags" → nuvem de tags; tags mais frequentes devem ter font-size maior.
5. Clicar em "People" → grid de pessoas com avatar inicial em emerald-tint.
6. Clicar em uma tag → deve filtrar entradas.

### P4 — Insights

1. Clicar em "Insights" → hero com `violet.png` + halo + texto com dados.
2. Aba "Diário": heatmap anual com 5 níveis de cor (verificar que células mudam de tom conforme
   palavras escritas no dia), chips de contagem, área chart de palavras/mês, barras de hora.
3. Big numbers (entradas, total de palavras, média/dia) em Newsreader 48px accent-deep.
4. Clicar nas outras 6 abas → conteúdo da aba muda.

### P5 — Reflect

1. Clicar em "Reflect" → card com pergunta em Newsreader 30px, assinatura "Violet", fundo gradient.
2. Clicar "Outra pergunta" → pergunta muda (cicla entre 4).
3. Seção "Releia-se" deve exibir até 4 itens (1 por tipo com conteúdo).
4. Mesma pergunta selecionada no dia seguinte deve ser diferente.
5. Clicar "Responder hoje" → vai para Write com a entry de hoje.

### P6 — Tweaks

1. Abrir painel de Tweaks → 4 grupos de controles.
2. Trocar para tema Escuro → toda a UI muda para fundo escuro; recarregar → tema escuro persiste.
3. Trocar acento para "Ouro" → sidebar, botões, heatmap, nav ativo mudam de azul para dourado.
4. Ativar modo "Foco" → sidebar colapsa, write-wrap expande para 680px, dia-da-semana 68px.
5. Ativar tipografia "Técnica" → dia-da-semana muda para DM Sans bold; bullets usam DM Mono.
6. Fechar e reabrir → todas as preferências restauradas do localStorage.

---

## 5. Regressão — páginas do webapp não afetadas

Verificar que o resto do webapp não foi afetado pelo VioletShell:

1. `http://localhost:5173/` → Dashboard ainda usa tema escuro global, sidebar Makima visível.
2. `http://localhost:5173/books` → FrierenShell ainda funciona com seu próprio tema claro.
3. Os tokens OKLCH da Violet (`--paper`, `--ink`, etc.) não devem aparecer nas outras rotas.

---

## 6. Responsividade (≤ 900px)

1. Reduzir viewport para 375px.
2. Sidebar deve colapsar para 64px (apenas chips de ícone, sem labels).
3. Write deve ocupar o espaço restante, legível.
4. Hero dos Insights deve colapsar para coluna única (retrato oculto).
5. Big stats: 1 coluna.

---

## Referências

- Contratos de API: [contracts/api.md](contracts/api.md)
- Contratos de UI: [contracts/ui.md](contracts/ui.md)
- Modelo de dados: [data-model.md](data-model.md)
- Spec completa: [spec.md](spec.md)
