#!/usr/bin/env bash
# Test de rotar-copias.sh (lo ejecuta la CI): diez meses de copias diarias a las 03:00, más una de un
# despliegue el último día, y lo que tiene que quedar.
#
#   scripts/test/rotar-copias.test.sh

set -euo pipefail

raiz=$(mktemp -d)
trap 'rm -rf "$raiz"' EXIT
copias="$raiz/backups"
mkdir -p "$copias/uploads-pro"

# Del 1 de enero al 30 de octubre de 2026 (un viernes), una copia diaria de cada entorno
dia=2026-01-01
while [[ "$dia" < 2026-10-31 ]]; do
  touch "$copias/marela-pro-${dia//-/}-030000.sql.gz" "$copias/marela-pruebas-${dia//-/}-030000.sql.gz"
  dia=$(date -d "$dia + 1 day" '+%F')
done
# La copia de un despliegue, más tarde el mismo día; otra a medias, y archivos que no son copias
touch "$copias/marela-pro-20261030-100000.sql.gz" \
  "$copias/marela-pro-20261030-110000.sql.gz.parcial" \
  "$copias/uploads-pro/foto.jpg" \
  "$copias/marela-pro-notas.sql.gz"

MARELA_RAIZ="$raiz" "$(dirname "$0")/../rotar-copias.sh" pro

esperado=(
  # Diarias: la más reciente de cada uno de los últimos 7 días (el 30, la del despliegue)
  marela-pro-20261030-100000.sql.gz
  marela-pro-20261029-030000.sql.gz
  marela-pro-20261028-030000.sql.gz
  marela-pro-20261027-030000.sql.gz
  marela-pro-20261026-030000.sql.gz
  marela-pro-20261025-030000.sql.gz
  marela-pro-20261024-030000.sql.gz
  # Semanales: la del domingo de cada una de las 3 semanas anteriores (la actual ya está)
  marela-pro-20261018-030000.sql.gz
  marela-pro-20261011-030000.sql.gz
  # (la del 25, domingo de la semana 43, ya está entre las diarias)
  # Mensuales: la del último día de cada uno de los 5 meses anteriores
  marela-pro-20260930-030000.sql.gz
  marela-pro-20260831-030000.sql.gz
  marela-pro-20260731-030000.sql.gz
  marela-pro-20260630-030000.sql.gz
  marela-pro-20260531-030000.sql.gz
)

fallos=0
quedan=$(cd "$copias" && find . -maxdepth 1 -type f -name 'marela-pro-*.sql.gz' -printf '%f\n' |
  grep -E '^marela-pro-[0-9]{8}-[0-9]{6}\.sql\.gz$' | sort)
deberian=$(printf '%s\n' "${esperado[@]}" | sort)
if [[ "$quedan" != "$deberian" ]]; then
  echo "FALLO: no quedan las copias esperadas" >&2
  diff <(echo "$deberian") <(echo "$quedan") >&2 || true
  fallos=1
fi

# Lo que no es una copia de producción no se toca
for archivo in marela-pro-20261030-110000.sql.gz.parcial uploads-pro/foto.jpg marela-pro-notas.sql.gz; do
  [[ -e "$copias/$archivo" ]] || {
    echo "FALLO: ha borrado $archivo" >&2
    fallos=1
  }
done
pruebas=$(find "$copias" -maxdepth 1 -name 'marela-pruebas-*' | wc -l)
((pruebas == 303)) || {
  echo "FALLO: ha tocado las copias de pruebas (quedan $pruebas de 303)" >&2
  fallos=1
}

# Una segunda vuelta no borra nada más
MARELA_RAIZ="$raiz" "$(dirname "$0")/../rotar-copias.sh" pro >/dev/null
otra=$(cd "$copias" && find . -maxdepth 1 -type f -name 'marela-pro-*-*.sql.gz' -printf '%f\n' | sort)
[[ "$otra" == "$deberian" ]] || {
  echo "FALLO: la segunda vuelta ha borrado más copias" >&2
  fallos=1
}

((fallos == 0)) && echo "rotar-copias: OK"
exit "$fallos"
