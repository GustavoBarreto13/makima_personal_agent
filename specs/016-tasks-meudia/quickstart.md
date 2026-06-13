# Quickstart / Verificação — Meu Dia + Time-blocking (fatia 016)

Como validar a fatia end-to-end quando implementada. Pré-requisito: schema da Fase 1 aplicado
(`my_day_date`, `start_at`, `end_at`, `duration_min` já existem) e Fases 1–3 (011/012/013) no ar.

## Motor de capacity (teste puro — SC-001)
Escrever `tests/agents/test_kaguya_capacity.py` exercitando a função pura `(estimativas, eventos,
janela) → stats`:
- soma de estimativas + agenda recortada à janela;
- `folga_min` negativa quando o plano excede a janela livre;
- `calendar_ok=false` zera `agenda_min` sem quebrar.

```bash
.venv\Scripts\python -m pytest tests/agents/test_kaguya_capacity.py -q
```

## Camada de lógica (integração)
`tests/agents/test_kaguya_meudia.py` contra um Postgres de teste:
- `add_to_my_day(id)` / `remove_from_my_day(id)` mudam só `my_day_date`;
- `reschedule_pending(id, "later")` → `my_day_date=NULL`, tarefa preservada (SC-004);
- `set_time_block(id, start_at, duration_min=30)` deriva `end_at` e respeita a CHECK
  (`set_time_block` sem `start_at` → erro amigável, não 500) — SC-003;
- `list_my_day(date)` separa `plano` / `pendencias_ontem` / `sugestoes` corretamente.

## Paridade pelos dois canais (SC-002)
1. Telegram: "põe 'comprar café' no meu dia" → abrir o webapp em **Meu Dia** e ver a tarefa no plano.
2. Webapp: arrastar uma tarefa de 30min para as 14h → `start_at=14:00`, `end_at=14:30`; abrir a view
   **Calendário** (semana) e confirmar o bloco no dia/horário certos (SC-003).
3. Telegram: "meu dia cabe?" → o total de capacity bate com a CapacityBar do webapp para o mesmo dia.

## Degradação do Calendar (SC-005)
Simular o MCP do Calendar indisponível (sem credencial / erro): `GET /api/tasks/my-day` retorna
`capacity.calendar_ok=false`, `agenda_min=0`, e a tela abre com o aviso — sem erro 500.

## Checklist de aceitação
- [ ] Pendências de ontem aparecem (aberta, `my_day_date<hoje`) com Hoje/Amanhã/Depois.
- [ ] "+ Puxar" das Sugestões (≤7 dias) coloca a tarefa no plano de hoje.
- [ ] CapacityBar reflete estimativas + agenda vs janela 8h–22h e marca o excedente em vermelho.
- [ ] Time-block aparece também no Calendário; remover horário tira da timeline e mantém no plano.
- [ ] Tudo executável pelos dois canais com o outro desligado.
