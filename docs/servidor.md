# Marela en el servidor

Guía para instalar y mantener Marela en el servidor de casa: una Raspberry Pi con Docker y Tailscale, que puede alojar también otras aplicaciones. Hay dos entornos independientes, cada uno con su clon del repositorio, su `.env`, su base de datos, su proyecto de Compose y su puerto:

| Entorno | Código | Directorio | Proyecto de Compose | Puerto | Datos |
|---|---|---|---|---|---|
| Pruebas | último `develop` | `/opt/marela/pruebas` | `marela-pruebas` | 8444 | de ejemplo (seed), desechables |
| Producción | un tag `vX.Y.Z` de `main` | `/opt/marela/pro` | `marela-pro` | 9444 | reales |

Solo se accede por la red de Tailscale, con HTTPS y el certificado que da Tailscale, necesario para instalar la PWA en el móvil. El único contenedor que publica un puerto es el proxy de cada entorno; la base de datos y el backend quedan en la red interna de Docker. No se usan los puertos 80 y 443, así que no hay conflicto con otras aplicaciones que los ocupen.

```
/opt/marela/
├── pruebas/         clon del repositorio (develop) y su .env
├── pro/             clon del repositorio (tag) y su .env
├── certs/           cert.pem y key.pem de Tailscale (si no se comparten con otra aplicación)
├── backups/         copias de la base de datos y de los archivos
└── deploys.log      registro de despliegues
```

En esta guía, el nombre del servidor en la tailnet es `raspberry.tail1234.ts.net`: cámbialo por el tuyo.

## 1. Requisitos

En la Raspberry (sistema de 64 bits, `aarch64`):

- **Docker** con el plugin de Compose (`docker compose version` ≥ 2.20). El usuario que despliega tiene que poder usar Docker sin `sudo` (estar en el grupo `docker`).
- **Tailscale**, conectado a la tailnet.
- **git**, **curl** y **openssl**.

En la consola de Tailscale (*Settings › DNS*), activados **MagicDNS** y **HTTPS Certificates**. El nombre del servidor en la tailnet aparece en:

```bash
tailscale status --self --peers=false
```

Los puertos 8444 y 9444 tienen que estar libres. Para ver los que están en uso:

```bash
sudo ss -tlnp | grep LISTEN
```

## 2. Directorios y clones

```bash
sudo mkdir -p /opt/marela
sudo chown "$USER": /opt/marela
cd /opt/marela
git clone --branch develop https://github.com/PabloCastroCastro/marela.git pruebas
git clone --branch develop https://github.com/PabloCastroCastro/marela.git pro
mkdir -p backups
```

## 3. Configuración de cada entorno

Cada clon tiene su `.env`, que nunca se versiona:

```bash
cp pruebas/.env.example pruebas/.env
cp pro/.env.example pro/.env
chmod 600 pruebas/.env pro/.env
```

Valores que hay que cambiar (el resto, como en `.env.example`):

| Variable | Pruebas | Producción |
|---|---|---|
| `ENTORNO` | `pruebas` | `produccion` |
| `PUERTO` | `8444` | `9444` |
| `PUERTO_INTERNO` | `8443` | `8443` |
| `URL_PUBLICA` | `https://raspberry.tail1234.ts.net:8444` | `https://raspberry.tail1234.ts.net:9444` |
| `CERTIFICADOS` | ver el apartado 4 | ver el apartado 4 |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` | otra distinta |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | otra distinta |

- `PUERTO_INTERNO=8443` hace que se publique el HTTPS del proxy en el `PUERTO` del entorno.
- `URL_PUBLICA` debe ser exactamente la dirección desde la que se usa la aplicación, con el puerto: el inicio de sesión solo se acepta desde ella.
- Las contraseñas y secretos son distintos en cada entorno. La de PostgreSQL, solo letras y números, porque va dentro de una URL.

## 4. Certificado HTTPS

El proxy sirve HTTPS con `cert.pem` y `key.pem` del directorio `CERTIFICADOS`. La clave tiene que poder leerla el usuario 101 (nginx sin privilegios).

**Si otra aplicación del servidor ya tiene el certificado de Tailscale** (es el mismo nombre de servidor), basta con apuntar `CERTIFICADOS` a su directorio. Su renovación sirve para Marela; tras renovarlo, reinicia el proxy de cada entorno para que lo lea (o hazlo en el mismo cron).

**Si no**, pídelo para Marela:

```bash
sudo mkdir -p /opt/marela/certs
sudo tailscale cert --cert-file /opt/marela/certs/cert.pem --key-file /opt/marela/certs/key.pem raspberry.tail1234.ts.net
sudo chown 101:101 /opt/marela/certs/key.pem
sudo chmod 600 /opt/marela/certs/key.pem
```

y deja `CERTIFICADOS=/opt/marela/certs`. El certificado caduca a los 90 días: repite esos comandos (por ejemplo, con un cron semanal de root) y reinicia los proxys:

```bash
docker restart marela-pruebas-proxy-1 marela-pro-proxy-1
```

## 5. Desplegar

```bash
/opt/marela/pruebas/scripts/deploy.sh pruebas       # lo último de develop
/opt/marela/pro/scripts/deploy.sh pro v1.0.0         # un tag de main
```

`deploy.sh`:

1. Actualiza el código: `develop` en pruebas; el tag en producción.
2. En producción, antes de nada, hace una copia de seguridad con `backup.sh` (salvo en el primer despliegue, en el que aún no hay base de datos).
3. Compila las imágenes (en la Raspberry tarda unos minutos), levanta los servicios y espera a que estén sanos. El backend aplica las migraciones al arrancar.
4. En pruebas, carga los datos de ejemplo. El seed es idempotente: añade lo que falte sin tocar lo demás.
5. Comprueba `/api/health` por HTTPS.
6. Apunta el despliegue, bien o mal, en `/opt/marela/deploys.log`.

### Primer despliegue

**Pruebas:**

```bash
/opt/marela/pruebas/scripts/deploy.sh pruebas
```

Usuarios de ejemplo, todos con la contraseña `marela-dev`: `propietario`, `ana` (administradora de A Veiga y empleada de O Souto), `xose`, `maria` y `brais`. Están en el README del backend.

**Producción**, sin datos de ejemplo (el seed se niega con `ENTORNO=produccion`). Se crea el propietario de la plataforma, que después crea las explotaciones y sus administradores desde la aplicación:

```bash
/opt/marela/pro/scripts/deploy.sh pro v1.0.0
cd /opt/marela/pro
docker compose -p marela-pro -f docker-compose.yml -f docker-compose.servidor.yml \
  exec backend node dist/scripts/crear-propietario.js
```

Muestra una contraseña temporal, que se pide cambiar en el primer inicio de sesión.

### Volver a una versión anterior

```bash
/opt/marela/pro/scripts/deploy.sh pro v1.0.0
```

Las migraciones no se deshacen: si la versión nueva cambió el esquema, además hay que restaurar la copia de seguridad hecha antes del despliegue.

## 6. Copias de seguridad

```bash
/opt/marela/pro/scripts/backup.sh pro
```

1. **Base de datos:** `pg_dump` comprimido en `/opt/marela/backups/marela-<entorno>-AAAAMMDD-HHMMSS.sql.gz`. Antes de darla por buena comprueba que se descomprime y que está completa; si no, la descarta y termina con `ERROR`.
2. **Archivos** (fotos y adjuntos): copia incremental del volumen `uploads` en `/opt/marela/backups/uploads-<entorno>/`.
3. **Disco:** avisa (`AVISO`) si quedan menos de 5 GB libres.

`deploy.sh pro` la hace antes de cada despliegue. La copia diaria automática, la rotación de copias antiguas, la copia fuera del servidor y la restauración llegan con GH-42.

Para restaurar a mano una copia en un entorno (se pierden los datos actuales de ese entorno):

```bash
cd /opt/marela/pruebas
gunzip -c /opt/marela/backups/marela-pruebas-AAAAMMDD-HHMMSS.sql.gz |
  docker compose -p marela-pruebas -f docker-compose.yml -f docker-compose.servidor.yml \
    exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## 7. Comprobaciones

```bash
curl -s https://raspberry.tail1234.ts.net:8444/api/health      # {"estado":"ok",...}
docker compose -p marela-pruebas ps                            # todos healthy
tail /opt/marela/deploys.log
ls -lh /opt/marela/backups
```

Logs de un entorno (rotados por Docker: 3 archivos de 10 MB por contenedor):

```bash
cd /opt/marela/pruebas
docker compose -p marela-pruebas -f docker-compose.yml -f docker-compose.servidor.yml logs -f backend
```

**Desde el móvil**, con Tailscale activo, abre `https://raspberry.tail1234.ts.net:8444` e instálala:

- **Android (Chrome):** menú ⋮ › *Instalar aplicación*.
- **iPhone (Safari):** *Compartir* › *Añadir a pantalla de inicio*.
