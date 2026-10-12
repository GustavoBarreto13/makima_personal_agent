"""Avaliação dos Valores — o roteiro e o diagnóstico (spec 076). Motor PURO, sem banco.

A avaliação tem três fases:
    I.  descrição qualitativa das 12 áreas da vida (o "você ideal" em cada uma);
    II. seis notas de 1 a 10 por área (possibilidade, importância atual e geral, ação na semana
        passada, satisfação com essa ação e preocupação);
    III. narrativa (uma frase de direção por área) e ações compromissadas nas áreas críticas.

Aqui vivem o roteiro (textos que o front e o Hermes mostram — uma fonte só) e as contas do
diagnóstico: as "áreas de alerta" (importa muito, a ação satisfaz pouco e preocupa) e o gap.
"""

from __future__ import annotations

from statistics import mean

SCORE_FIELDS = ("possibility", "importance_now", "importance_general", "action", "satisfaction", "concern")

SCORES: tuple[dict, ...] = (
    {"key": "possibility", "label": "Possibilidade",
     "help": "O quanto você acredita que é possível algo muito significativo acontecer nessa área."},
    {"key": "importance_now", "label": "Importância atual",
     "help": "O quanto essa área é importante para você neste exato momento."},
    {"key": "importance_general", "label": "Importância geral",
     "help": "O quanto essa área é importante na sua vida como um todo."},
    {"key": "action", "label": "Ação na semana passada",
     "help": "O quanto você de fato agiu a serviço desse valor na SEMANA PASSADA — não no passado distante."},
    {"key": "satisfaction", "label": "Satisfação com a ação",
     "help": "O quanto você está satisfeito com as atitudes que tomou nessa área na semana passada."},
    {"key": "concern", "label": "Preocupação",
     "help": "O quanto você se preocupa com a possibilidade de essa área não progredir como gostaria."},
)

DOMAINS: tuple[dict, ...] = (
    {"key": "familia", "label": "Relações familiares",
     "about": "O tipo de irmão, filho ou pai/mãe que você quer ser com a família — exceto cônjuge e filhos, que têm áreas próprias.",
     "questions": ("Que tipo de filho, irmão ou parente você gostaria de ser?",
                   "Como você trataria essas pessoas no seu melhor dia?",
                   "Que qualidades você quer que essas relações tenham?")},
    {"key": "intimidade", "label": "Casamento / relações íntimas",
     "about": "A pessoa que você quer ser num relacionamento afetivo e o papel que deseja ter nele. Vale mesmo sem estar num relacionamento agora.",
     "questions": ("Que tipo de parceiro(a) você quer ser?",
                   "Como você quer tratar quem divide a vida com você?",
                   "Que relação você quer construir — e o que você traz para ela?")},
    {"key": "parentalidade", "label": "Parentalidade",
     "about": "O tipo de pai ou mãe que você é ou gostaria de ser, no presente e no futuro.",
     "questions": ("Que tipo de pai/mãe você quer ser?",
                   "O que você quer que um filho sinta ao seu lado?")},
    {"key": "amizades", "label": "Amizades / vida social",
     "about": "O que significa, para você, ser um bom amigo e como você se comporta numa amizade ideal.",
     "questions": ("Que tipo de amigo você gostaria de ser?",
                   "Como seria uma amizade ideal do seu lado da relação?")},
    {"key": "carreira", "label": "Carreira / emprego",
     "about": "O trabalho ideal, por que ele te atrai e como você quer se relacionar com colegas e empregadores.",
     "questions": ("Que tipo de profissional você quer ser?",
                   "Que postura você quer ter com colegas e com quem te emprega?",
                   "O que te atrai no trabalho ideal?")},
    {"key": "educacao", "label": "Educação / desenvolvimento pessoal",
     "about": "O aprendizado (formal ou não) e os treinamentos que você quer buscar — e por quê.",
     "questions": ("O que você quer aprender ou dominar?",
                   "Que tipo de aprendiz você quer ser?")},
    {"key": "lazer", "label": "Recreação / diversão",
     "about": "O estilo de vida recreativo: hobbies, esportes e atividades de lazer que você quer ter.",
     "questions": ("Como você gostaria de se divertir e descansar?",
                   "Que hobbies ou atividades fazem você se sentir você?")},
    {"key": "espiritualidade", "label": "Espiritualidade",
     "about": "O que espiritualidade significa para você — da comunhão com a natureza à religião organizada — e como quer vivê-la.",
     "questions": ("O que é espiritualidade para você?",
                   "Como você gostaria de vivenciá-la no dia a dia?")},
    {"key": "comunidade", "label": "Vida em comunidade",
     "about": "Participação em causas sociais, voluntariado, preservação ou grupos de apoio.",
     "questions": ("Que contribuição você quer dar para a sua comunidade?",
                   "Que causas importam para você?")},
    {"key": "saude", "label": "Autocuidado físico / saúde",
     "about": "Cuidar do próprio corpo: sono, alimentação, exercício, abandonar o que faz mal.",
     "questions": ("Como você quer cuidar do seu corpo?",
                   "Como seria a sua rotina de saúde no seu melhor dia?")},
    {"key": "ambiente", "label": "Ambiente / sustentabilidade",
     "about": "Valores ligados à preservação do planeta e ao seu impacto ambiental.",
     "questions": ("Que impacto você quer ter no ambiente?",
                   "Que atitudes refletiriam esse cuidado?")},
    {"key": "arte", "label": "Arte / estética",
     "about": "Sua relação com arte, música, literatura, artesanato e formas de beleza — criando ou apreciando.",
     "questions": ("Que lugar a arte e a beleza têm na sua vida?",
                   "Você quer criar, apreciar, ou os dois?")},
)
DOMAIN_KEYS = tuple(d["key"] for d in DOMAINS)

INTRO: tuple[dict, ...] = (
    {"title": "Não existe certo ou errado",
     "body": "Isto não é um teste moral nem psicológico. É o seu mapa de vida. Responda como se ninguém jamais fosse ler."},
    {"title": "Objetivo não é valor",
     "body": ("Um objetivo tem início, meio e fim — casar, se formar. Um valor é uma direção contínua, sem linha de "
              "chegada — ser um parceiro carinhoso, um estudante dedicado. Você sempre pode ser mais carinhoso, "
              "não importa o quanto já seja. E dá para agir num valor mesmo sem o objetivo: quem não está num "
              "relacionamento pode se preparar para ser um parceiro carinhoso.")},
    {"title": "O mundo ideal",
     "body": ("Responda pensando no que realmente importa num cenário sem obstáculos. Não o que é 'realista', nem o "
              "que os outros acham que você merece: imagine uma varinha mágica e tudo possível. Se uma área não "
              "tem valor para você, pule sem culpa.")},
)

KEY_QUESTION = "O que você pode fazer de concreto ao longo da próxima semana para começar a agir alinhado a este valor e aumentar sua satisfação?"

# Palavras que sugerem objetivo (com fim) em vez de valor (direção) — dica, nunca bloqueio.
_GOAL_HINTS = ("casar", "me formar", "formar", "comprar", "conseguir", "passar em", "ganhar", "ter um", "ter uma",
               "atingir", "chegar a", "virar", "ser promovido", "emagrecer", "perder", "terminar")
# Na área de família, cônjuge e filhos têm áreas próprias.
_FAMILY_SPLIT_HINTS = ("esposa", "esposo", "marido", "mulher", "namorad", "noiv", "cônjuge", "conjuge",
                       "meu filho", "minha filha", "meus filhos", "minhas filhas")


def text_hints(domain_key: str, text: str) -> list[str]:
    """Dicas inline do roteiro (sem IA) para o texto da Fase I de uma área."""
    t = (text or "").lower()
    hints = []
    if domain_key == "familia" and any(h in t for h in _FAMILY_SPLIT_HINTS):
        hints.append("Cônjuge e filhos têm áreas próprias (relações íntimas e parentalidade) — aqui é o resto da família.")
    if any(f" {h}" in f" {t}" for h in _GOAL_HINTS):
        hints.append("Isso parece um objetivo, com linha de chegada. Qual é o jeito de ser por trás disso?")
    return hints


def importance(area: dict) -> int | None:
    vals = [area.get("importance_now"), area.get("importance_general")]
    vals = [v for v in vals if v is not None]
    return max(vals) if vals else None


def is_alert(area: dict) -> bool:
    """Área de alerta: importância (atual ou geral) 8–10, satisfação com a ação 1–4 e preocupação alta (7+)."""
    imp, sat, worry = importance(area), area.get("satisfaction"), area.get("concern")
    return (not area.get("skipped") and imp is not None and sat is not None and worry is not None
            and imp >= 8 and sat <= 4 and worry >= 7)


def gap(area: dict) -> int | None:
    """Importância − satisfação com a ação (quanto maior, maior o desalinhamento)."""
    imp, sat = importance(area), area.get("satisfaction")
    return imp - sat if imp is not None and sat is not None else None


def diagnose(areas: list[dict]) -> dict:
    """Diagnóstico das lacunas ("o ponto cego").

    Args:
        areas: Uma por domínio — ``{domain_key, skipped, possibility, importance_now,
            importance_general, action, satisfaction, concern}`` (notas podem faltar).

    Returns:
        ``{"alerts": [domain_key…] (pior primeiro), "ranked": [{domain_key, label, importance,
        satisfaction, action, concern, gap, alert}] por gap desc, "complete": bool,
        "avg_satisfaction", "avg_action"}``.
    """
    labels = {d["key"]: d["label"] for d in DOMAINS}
    active = [a for a in areas if not a.get("skipped")]
    ranked = []
    for a in active:
        g = gap(a)
        ranked.append({
            "domain_key": a["domain_key"], "label": labels.get(a["domain_key"], a["domain_key"]),
            "importance": importance(a), "satisfaction": a.get("satisfaction"), "action": a.get("action"),
            "concern": a.get("concern"), "gap": g, "alert": is_alert(a),
        })
    ranked.sort(key=lambda r: (not r["alert"], -(r["gap"] if r["gap"] is not None else -99), -(r["concern"] or 0)))
    complete = bool(active) and all(all(a.get(f) is not None for f in SCORE_FIELDS) for a in active)
    sats = [a["satisfaction"] for a in active if a.get("satisfaction") is not None]
    acts = [a["action"] for a in active if a.get("action") is not None]
    return {
        "alerts": [r["domain_key"] for r in ranked if r["alert"]],
        "ranked": ranked,
        "complete": complete,
        "avg_satisfaction": round(mean(sats), 1) if sats else None,
        "avg_action": round(mean(acts), 1) if acts else None,
    }


def evolution(versions: list[dict]) -> dict:
    """Evolução por área entre versões da avaliação (mais antiga → mais nova).

    Args:
        versions: ``[{"completed_at", "areas": [...]}]``.

    Returns:
        ``{domain_key: [{"at", "gap", "satisfaction", "action"}]}``.
    """
    out: dict[str, list] = {}
    for v in versions:
        for a in v.get("areas", []):
            if a.get("skipped"):
                continue
            out.setdefault(a["domain_key"], []).append({
                "at": v.get("completed_at"), "gap": gap(a), "satisfaction": a.get("satisfaction"), "action": a.get("action"),
            })
    return out


def checkin_trend(checkins: list[dict]) -> dict:
    """Tendência dos check-ins semanais por área (última semana vs. média das anteriores).

    Args:
        checkins: ``[{"week_start", "domain_key", "action", "satisfaction"}]``.

    Returns:
        ``{domain_key: {"last": {...}, "prev_avg_satisfaction": float|None, "trend": "up"|"down"|"flat"}}``.
    """
    by: dict[str, list] = {}
    for c in sorted(checkins, key=lambda c: str(c["week_start"])):
        by.setdefault(c["domain_key"], []).append(c)
    out = {}
    for k, cs in by.items():
        last = cs[-1]
        prev = [c["satisfaction"] for c in cs[:-1] if c.get("satisfaction") is not None]
        prev_avg = round(mean(prev), 1) if prev else None
        trend = "flat"
        if prev_avg is not None and last.get("satisfaction") is not None:
            d = last["satisfaction"] - prev_avg
            trend = "up" if d >= 1 else "down" if d <= -1 else "flat"
        out[k] = {"last": last, "prev_avg_satisfaction": prev_avg, "trend": trend}
    return out
