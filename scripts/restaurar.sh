#!/usr/bin/env bash
# Restauración de una copia de seguridad en un entorno (docs/operacion.md).
#
#   scripts/restaurar.sh pruebas|pro COPIA [--subidas DIRECTORIO] [--produccion]
#
#   COPIA          marela-<entorno>-AAAAMMDD-HHMMSS.sql.gz, de backup.sh (de cualquier entorno: una
#                  copia de producción se puede restaurar en pruebas para probarla)
#   --subidas      también los archivos (fotos y adjuntos): la copia de uploads, p. ej.
#                  /opt/marela/backups/uploads-pro. Se añaden al volumen; no se borra nada de él
#   --produccion   obligatorio para restaurar en producción, que además pide confirmarlo escribiendo
#                  «restaurar producción»
#
# 1. Comprueba la copia antes de tocar nada: que se descomprime y que está completa.
# 2. En producción, hace antes una copia del estado actual con backup.sh, para poder volver atrás.
# 3. Para el backend, borra la base de datos del entorno, la crea vacía y carga la copia, en una sola
#    transacción. Crea antes el rol marela_app si no existe (un servidor nuevo): es de todo el servidor
#    de PostgreSQL y pg_dump no lo copia.
# 4. Copia los archivos al volumen uploads, si se indica.
# 5. Levanta el entorno (el backend aplica las migraciones que le falten a la copia), comprueba
#    /api/health por HTTPS y cuenta lo restaurado.
#
# Apunta cada restauración, bien o mal, en /opt/marela/restauraciones.log.

set -euo pipefail

main() {
  (($# >= 2)) || error "Uso: $0 pruebas|pro COPIA [--subidas DIRECTORIO] [--produccion]"
  local entorno=$1
  local copia=$2
  shift 2
  local subidas='' produccion=false
  while (($# > 0)); do
    case "$1" in
      --subidas)
        subidas=${2:-}
        [[ -n "$subidas" ]] || error "Falta el directorio de --subidas"
        shift 2
        ;;
      --produccion)
        produccion=true
        shift
        ;;
      *) error "Opción desconocida: $1" ;;
    esac
  done

  [[ "$entorno" =~ ^(pruebas|pro)$ ]] ||
    error "Uso: $0 pruebas|pro COPIA [--subidas DIRECTORIO] [--produccion]"
  if [[ "$entorno" == pro && "$produccion" != true ]]; then
    error "Restaurar producción sustituye sus datos actuales por los de la copia. Si es lo que quieres, repite la orden con --produccion"
  fi

  local raiz=${MARELA_RAIZ:-/opt/marela}
  local dir="$raiz/$entorno"
  [[ -d "$dir" ]] || error "No existe el entorno $entorno en $dir"
  [[ -f "$dir/.env" ]] || error "Falta $dir/.env"
  local puerto
  puerto=$(grep -E '^PUERTO=' "$dir/.env" | cut -d= -f2)
  [[ -n "$puerto" ]] || error "Falta PUERTO en $dir/.env"

  # 1. La copia, antes de tocar nada
  [[ -f "$copia" ]] || error "No existe la copia $copia"
  gzip --test "$copia" 2>/dev/null || error "La copia está dañada: no se descomprime"
  zcat "$copia" | grep -q 'PostgreSQL database dump complete' ||
    error "La copia está incompleta: no termina como un pg_dump completo"
  if [[ -n "$subidas" ]]; then
    [[ -d "$subidas" ]] || error "No existe el directorio de los archivos $subidas"
    subidas=$(cd "$subidas" && pwd)
  fi

  if [[ "$entorno" == pro ]]; then
    echo "Vas a sustituir los datos de PRODUCCIÓN por los de $(basename "$copia")."
    local respuesta=''
    read -r -p "Escribe «restaurar producción» para continuar: " respuesta || true
    [[ "$respuesta" == 'restaurar producción' ]] || error "No se ha confirmado: no se ha tocado nada"
  fi

  cd "$dir"
  local compose=(docker compose -p "marela-$entorno" -f docker-compose.yml -f docker-compose.servidor.yml)
  trap 'apuntar "$raiz" "$entorno" "$copia" FALLO; echo "La restauración ha fallado" >&2' ERR

  # 2. En producción, el estado actual por si hay que volver atrás
  if [[ "$entorno" == pro ]] && "${compose[@]}" ps --status running --services | grep -qx db; then
    registro "Copia del estado actual antes de restaurar"
    "$dir/scripts/backup.sh" pro
  fi

  # 3. La base de datos
  registro "Restaurando $(basename "$copia") en $entorno"
  "${compose[@]}" up -d --wait db
  "${compose[@]}" stop backend
  # shellcheck disable=SC2016 # las variables se expanden dentro del contenedor
  "${compose[@]}" exec -T db sh -c '
    psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)" \
      -c "CREATE DATABASE \"$POSTGRES_DB\"" \
      -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '"'"'marela_app'"'"') THEN CREATE ROLE marela_app NOLOGIN; END IF; END \$\$" \
      -c "GRANT marela_app TO CURRENT_USER"'
  # shellcheck disable=SC2016
  zcat "$copia" | "${compose[@]}" exec -T db sh -c \
    'psql -v ON_ERROR_STOP=1 -q --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
  registro "Base de datos restaurada"

  # 4. Los archivos, con el usuario del backend (node, 1000) como dueño
  if [[ -n "$subidas" ]]; then
    docker run --rm --entrypoint sh \
      -v "marela-${entorno}_uploads:/destino" -v "$subidas:/origen:ro" \
      postgres:18-alpine -c 'cp -a /origen/. /destino/ && chown -R 1000:1000 /destino'
    registro "Archivos restaurados desde $subidas"
  fi

  # 5. El entorno, en marcha y respondiendo
  "${compose[@]}" up -d --wait --wait-timeout 300
  # El certificado es del nombre del servidor en Tailscale, no de localhost: -k solo aquí
  curl --fail --silent --show-error --insecure --max-time 10 "https://localhost:$puerto/api/health" >/dev/null
  local recuento
  # shellcheck disable=SC2016
  recuento=$("${compose[@]}" exec -T db sh -c 'psql -At -F " " -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    select (select count(*) from organization), (select count(*) from \"user\"),
      (select count(*) from animales), (select count(*) from fincas)"')
  read -r explotaciones usuarios animales fincas <<<"$recuento"
  registro "Restaurado: $explotaciones explotaciones, $usuarios usuarios, $animales animales y $fincas fincas. /api/health responde"
  apuntar "$raiz" "$entorno" "$copia" OK
  trap - ERR
}

registro() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
  exit 1
}

# fecha · entorno · copia · resultado
apuntar() {
  printf '%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$2" "$(basename "$3")" "$4" >>"$1/restauraciones.log"
}

main "$@"
exit
