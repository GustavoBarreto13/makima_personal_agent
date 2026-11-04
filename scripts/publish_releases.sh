#!/usr/bin/env bash
# Publica no GitHub um Release para cada tag vX.Y.Z, usando como descrição a seção
# correspondente do CHANGELOG.md.
#
# Uso:
#   scripts/publish_releases.sh            # simula (só mostra o que faria)
#   scripts/publish_releases.sh --apply    # cria de verdade (precisa do `gh` autenticado)
#   scripts/publish_releases.sh --apply v0.61.0 v0.60.0   # só estas versões
#
# Pula tags que já têm Release, então pode rodar de novo sem duplicar.

set -euo pipefail

# vai para a raiz do repo, onde está o CHANGELOG.md
cd "$(git rev-parse --show-toplevel)"

# modo padrão é simulação, para ninguém publicar sem querer
APPLY=0
if [ "${1:-}" = "--apply" ]; then
  APPLY=1
  shift
fi

# se passaram versões na linha de comando usa elas; senão usa todas as tags v*
if [ "$#" -gt 0 ]; then
  TAGS=("$@")
else
  mapfile -t TAGS < <(git tag --list 'v*' --sort=version:refname)
fi

# extrai do CHANGELOG o corpo da seção "## [X.Y.Z]" (sem o título e sem linhas em branco nas pontas)
notas_da_versao() {
  local ver="${1#v}"
  awk -v v="$ver" '
    $0 ~ "^## \\[" v "\\]" { dentro = 1; next }   # começa na seção da versão
    dentro && /^## \[/      { exit }              # termina na próxima seção
    dentro && /^\[.*\]: http/ { exit }            # ou nos links do rodapé
    dentro                  { print }
  ' CHANGELOG.md | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
}

for tag in "${TAGS[@]}"; do
  notas="$(notas_da_versao "$tag")"
  if [ -z "$notas" ]; then
    echo "!! $tag: sem seção no CHANGELOG, pulando"
    continue
  fi
  if [ "$APPLY" -eq 0 ]; then
    echo "[simulação] $tag ($(echo "$notas" | wc -l) linhas de notas)"
    continue
  fi
  # não recria Release que já existe
  if gh release view "$tag" >/dev/null 2>&1; then
    echo "-- $tag: já tem Release, pulando"
    continue
  fi
  gh release create "$tag" --title "Makima ${tag#v}" --notes "$notas" --verify-tag
  echo "ok $tag"
done
