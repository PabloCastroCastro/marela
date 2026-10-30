#!/usr/bin/env bash
# Rotación de las copias de la base de datos de un entorno (docs/operacion.md).
#
#   scripts/rotar-copias.sh pruebas|pro
#
# De las copias marela-<entorno>-AAAAMMDD-HHMMSS.sql.gz de /opt/marela/backups conserva la más
# reciente de cada uno de los últimos 7 días con copia, de las últimas 4 semanas y de los últimos 6
# meses; borra las demás. Las fechas salen del nombre, no de cuándo se modificó el archivo, así que
# una copia traída de otro sitio cuenta por el día en que se hizo. La copia de los archivos
# (uploads-<entorno>/) es incremental y no se rota.
#
# Lo ejecuta el cron de la copia diaria, después de backup.sh.

set -euo pipefail

DIARIAS=7
SEMANALES=4
MENSUALES=6

main() {
  local entorno=${1:-}
  local raiz=${MARELA_RAIZ:-/opt/marela}
  local destino="$raiz/backups"

  [[ "$entorno" =~ ^(pruebas|pro)$ ]] || error "Uso: $0 pruebas | pro"
  [[ -d "$destino" ]] || error "No existe $destino"

  # De la más reciente a la más antigua: el nombre lleva la fecha y la hora, así que basta con
  # ordenarlo al revés
  local copias=()
  mapfile -t copias < <(find "$destino" -maxdepth 1 -type f -name "marela-$entorno-*.sql.gz" \
    -printf '%f\n' | grep -E "^marela-$entorno-[0-9]{8}-[0-9]{6}\.sql\.gz$" | sort -r)
  if ((${#copias[@]} == 0)); then
    registro "Rotación de $entorno: no hay copias"
    return
  fi

  # Por cada copia, su día, su semana (ISO) y su mes. La primera de cada periodo es la más reciente.
  declare -A conservar=() dias=() semanas=() meses=()
  local copia dia semana mes
  for copia in "${copias[@]}"; do
    dia=${copia#"marela-$entorno-"}
    dia=${dia:0:8}
    semana=$(date -d "$dia" '+%G-%V')
    mes=${dia:0:6}
    if [[ -z "${dias[$dia]:-}" ]] && ((${#dias[@]} < DIARIAS)); then
      dias[$dia]=1
      conservar[$copia]=1
    fi
    if [[ -z "${semanas[$semana]:-}" ]] && ((${#semanas[@]} < SEMANALES)); then
      semanas[$semana]=1
      conservar[$copia]=1
    fi
    if [[ -z "${meses[$mes]:-}" ]] && ((${#meses[@]} < MENSUALES)); then
      meses[$mes]=1
      conservar[$copia]=1
    fi
  done

  local borradas=0
  for copia in "${copias[@]}"; do
    if [[ -z "${conservar[$copia]:-}" ]]; then
      rm -f "$destino/$copia"
      borradas=$((borradas + 1))
    fi
  done
  registro "Rotación de $entorno: se conservan ${#conservar[@]} copias y se borran $borradas"
}

registro() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
  exit 1
}

main "$@"
exit
