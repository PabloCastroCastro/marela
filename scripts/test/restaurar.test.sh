#!/usr/bin/env bash
# Test de restaurar.sh (lo ejecuta la CI): un entorno de pruebas de verdad, con Docker Compose y un
# certificado autofirmado, en un directorio temporal. Se cargan los datos de ejemplo, se hace la copia
# con backup.sh y se restaura como si se hubiera perdido el servidor: sin volúmenes, en un PostgreSQL
# vacío, sin el rol marela_app.
#
#   scripts/test/restaurar.test.sh
#
# Usa el proyecto de Compose marela-pruebas y el puerto 18444: no lo ejecutes en el servidor.

set -euo pipefail

repo=$(cd "$(dirname "$0")/../.." && pwd)
raiz=$(mktemp -d)
export MARELA_RAIZ="$raiz"
dir="$raiz/pruebas"
mkdir -p "$dir" "$raiz/certs"
# El entorno: el código del repositorio con su propio .env
for f in docker-compose.yml docker-compose.servidor.yml backend frontend proxy scripts; do
  ln -s "$repo/$f" "$dir/$f"
done
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -keyout "$raiz/certs/key.pem" -out "$raiz/certs/cert.pem" 2>/dev/null
# nginx corre con el usuario 101: aquí basta con que la clave se pueda leer
chmod 644 "$raiz/certs/key.pem"
cat >"$dir/.env" <<EOF
ENTORNO=pruebas
PUERTO=18444
PUERTO_INTERNO=8443
CERTIFICADOS=$raiz/certs
POSTGRES_PASSWORD=restaurar0prueba
BETTER_AUTH_SECRET=restaurar-sin-valor-real-0123456789abcdef
URL_PUBLICA=https://localhost:18444
EOF

compose=(docker compose -p marela-pruebas -f "$dir/docker-compose.yml" -f "$dir/docker-compose.servidor.yml")
# shellcheck disable=SC2317,SC2329 # se llama desde el trap
recoger() {
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$raiz"
}
trap recoger EXIT

# shellcheck disable=SC2016 # las variables se expanden dentro del contenedor
consulta() { "${compose[@]}" exec -T db sh -c 'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' sh "$1"; }
volumen() { docker run --rm -v marela-pruebas_uploads:/u --entrypoint sh postgres:18-alpine -c "$1"; }

fallos=0
falla() {
  echo "FALLO: $1" >&2
  fallos=1
}

echo "== Entorno con los datos de ejemplo y un archivo"
"${compose[@]}" up -d --build --wait --wait-timeout 300
"${compose[@]}" exec -T backend node dist/db/seed.js >/dev/null
volumen 'mkdir -p /u/prueba && echo hola > /u/prueba/foto.jpg && chown -R 1000:1000 /u'
animales=$(consulta 'select count(*) from animales')
usuarios=$(consulta 'select count(*) from "user"')
((animales > 0)) || falla "el seed no ha creado animales"

echo "== Copia"
"$dir/scripts/backup.sh" pruebas
copia=$(find "$raiz/backups" -maxdepth 1 -name 'marela-pruebas-*.sql.gz' | head -1)
[[ -n "$copia" ]] || falla "backup.sh no ha dejado la copia"

echo "== Lo que se niega a hacer, sin tocar nada"
if salida=$("$dir/scripts/restaurar.sh" pro "$copia" 2>&1); then
  falla "ha restaurado producción sin --produccion"
fi
[[ "$salida" == *--produccion* ]] || falla "no explica que hace falta --produccion: $salida"
if salida=$(echo no | "$dir/scripts/restaurar.sh" pro "$copia" --produccion 2>&1); then
  falla "ha restaurado producción sin escribir la confirmación"
fi
echo 'esto no es un pg_dump' | gzip >"$raiz/incompleta.sql.gz"
if salida=$("$dir/scripts/restaurar.sh" pruebas "$raiz/incompleta.sql.gz" 2>&1); then
  falla "ha restaurado una copia incompleta"
fi
[[ "$salida" == *incompleta* ]] || falla "no dice que la copia está incompleta: $salida"
"${compose[@]}" ps --status running --services | grep -qx backend ||
  falla "una copia rechazada ha parado el backend"

echo "== Servidor perdido: sin volúmenes"
"${compose[@]}" down -v
"$dir/scripts/restaurar.sh" pruebas "$copia" --subidas "$raiz/backups/uploads-pruebas"

[[ "$(consulta 'select count(*) from animales')" == "$animales" ]] || falla "no vuelven los animales"
[[ "$(consulta 'select count(*) from "user"')" == "$usuarios" ]] || falla "no vuelven los usuarios"
[[ "$(consulta "select count(*) from pg_roles where rolname = 'marela_app'")" == 1 ]] ||
  falla "no se ha creado el rol marela_app"
[[ "$(volumen 'cat /u/prueba/foto.jpg; stat -c %u /u/prueba/foto.jpg' | tr '\n' ' ')" == "hola 1000 " ]] ||
  falla "no vuelve el archivo, o no es del usuario del backend"
grep -q "pruebas	$(basename "$copia")	OK" "$raiz/restauraciones.log" ||
  falla "no se ha apuntado en restauraciones.log"
# La aplicación funciona: inicio de sesión con un usuario de ejemplo
curl --fail --silent --insecure -o /dev/null -H 'origin: https://localhost:18444' \
  -H 'content-type: application/json' -d '{"username":"ana","password":"marela-dev"}' \
  https://localhost:18444/api/auth/sign-in/username || falla "no se puede iniciar sesión tras restaurar"

((fallos == 0)) && echo "restaurar: OK"
exit "$fallos"
