"""Modelo de IA da Violet (spec 076) — uma constante só.

Todas as chamadas de IA no escopo da Violet (Conselho do Dia, Revisão semanal, leitura
emocional, classificação de distorções, Tutor de Idiomas e o ``violet_agent``) usam este
modelo. Trocar = mudar a env ``VIOLET_GEMINI_MODEL`` (sem redeploy de código).
"""

import os

VIOLET_MODEL = os.environ.get("VIOLET_GEMINI_MODEL", "gemini-3.8-flash")

# Resumo da memória das pessoas (Komi, spec 077): por padrão o mesmo modelo da Violet; trocar =
# mudar a env KOMI_GEMINI_MODEL (sem redeploy de código).
KOMI_MODEL = os.environ.get("KOMI_GEMINI_MODEL", VIOLET_MODEL)
