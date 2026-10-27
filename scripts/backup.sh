#!/usr/bin/env bash
# Copia de seguridad de un entorno (docs/servidor.md).
#
#   scripts/backup.sh pruebas|pro
#
# 1. Base de datos: pg_dump comprimido desde el contenedor de PostgreSQL, comprobado antes de darlo
#    por bueno, en /opt/marela/backups/marela-<entorno>-AAAAMMDD-HHMMSS.sql.gz.
# 2. Archivos (fotos y adjuntos): copia incremental del volumen uploads en
#    /opt/marela/backups/uploads-<entorno>/; solo se copian los archivos nuevos o cambiados.
# 3. Espacio en disco: avisa si quedan menos de MARELA_MIN_LIBRE_GB (5 por defecto).
#
# Lo usa deploy.sh antes de desplegar en producción. Los fallos salen con «ERROR» y los avisos con
# «AVISO». La copia diaria automática, la rotación y la copia fuera del servidor llegan con GH-42.

set -euo pipefail

main() {
  local entorno=${1:-}
  local raiz=${MARELA_RAIZ:-/opt/marela}
  local minimo=${MARELA_MIN_LIBRE_GB:-5}
  local dir="$raiz/$entorno"
  local destino="$raiz/backups"

  [[ "$entorno" =~ ^(pruebas|pro)$ ]] || error "Uso: $0 pruebas | pro"
  [[ -d "$dir" ]] || error "No existe $dir"
  mkdir -p "$destino"
  registro "Copia de $entorno"

  # 1. Base de datos
  local archivo
  archivo="$destino/marela-$entorno-$(date '+%Y%m%d-%H%M%S').sql.gz"
  temporal="$archivo.parcial"
  # Usuario y base de datos del propio contenedor: no hace falta leer el .env
  # shellcheck disable=SC2016 # las variables se expanden dentro del contenedor
  (cd "$dir" && docker compose -p "marela-$entorno" -f docker-compose.yml -f docker-compose.servidor.yml \
    exec -T db sh -c 'pg_dump --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"') | gzip >"$temporal" ||
    error "pg_dump ha fallado"
  # Una copia que no se puede descomprimir o sin datos no sirve: se descarta
  gzip --test "$temporal" || error "La copia está dañada"
  zcat "$temporal" | grep -q 'PostgreSQL database dump complete' || error "La copia está incompleta"
  mv "$temporal" "$archivo"
  chmod 600 "$archivo"
  registro "Base de datos: $archivo ($(du -h "$archivo" | cut -f1))"

  # 2. Archivos: el volumen, de solo lectura, en un contenedor con el usuario del servidor. cp -u
  # copia solo lo nuevo o cambiado; lo borrado se conserva en la copia.
  local uploads="$destino/uploads-$entorno"
  mkdir -p "$uploads"
  docker run --rm --user "$(id -u):$(id -g)" --entrypoint cp \
    -v "marela-${entorno}_uploads:/origen:ro" -v "$uploads:/destino" \
    postgres:18-alpine -a -u /origen/. /destino/ ||
    error "La copia de los archivos ha fallado"
  registro "Archivos: $uploads ($(du -sh "$uploads" | cut -f1))"

  # 3. Espacio libre
  local libre
  libre=$(df -BG --output=avail "$raiz" | tail -1 | tr -dc '0-9')
  if ((libre < minimo)); then
    registro "AVISO: quedan $libre GB libres en el disco del servidor (mínimo $minimo GB)"
  else
    registro "Disco: $libre GB libres"
  fi
}

registro() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
  rm -f "${temporal:-}"
  exit 1
}

temporal=''
main "$@"
exit
