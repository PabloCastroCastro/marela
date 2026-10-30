# Operación de Marela

Copias de seguridad de producción: cada noche en el servidor y, cada día, una copia de todo en el PC. La instalación del servidor y los despliegues están en [servidor.md](servidor.md); en esta guía el servidor es `raspberry.tail1234.ts.net` y el usuario que despliega, `pablo`: cámbialos por los tuyos.

| Qué | Dónde | Cuándo | Script |
|---|---|---|---|
| Copia de la base de datos y de los archivos | `/opt/marela/backups` en el servidor | cada día a las 03:00, y antes de cada despliegue | `scripts/backup.sh pro` |
| Rotación | el mismo directorio | después de cada copia diaria | `scripts/rotar-copias.sh pro` |
| Copia fuera del servidor | `%USERPROFILE%\CopiasMarela` en el PC | cada día, en cuanto el PC está encendido | `scripts/traer-copias.ps1` |
| Restauración | un entorno | cuando haga falta, y de vez en cuando en pruebas para probar las copias | `scripts/restaurar.sh` |

## 1. Copia diaria en el servidor

Un cron del usuario que despliega ejecuta la copia y, si sale bien, la rotación. Todo queda en `/opt/marela/backups.log`. En la Raspberry:

```bash
crontab -e
```

y añade esta línea:

```
0 3 * * * /opt/marela/pro/scripts/backup.sh pro >>/opt/marela/backups.log 2>&1 && /opt/marela/pro/scripts/rotar-copias.sh pro >>/opt/marela/backups.log 2>&1
```

- **Hora:** la del sistema de la Raspberry. Compruébala con `timedatectl` (tiene que ser `Europe/Madrid`; si no, `sudo timedatectl set-timezone Europe/Madrid`).
- **Probarla sin esperar a las 03:00:** ejecuta esa misma orden (lo que va detrás de `0 3 * * *`) y mira el registro.

Cada copia hace lo que explica [servidor.md](servidor.md#6-copias-de-seguridad): la base de datos con `pg_dump`, comprobada antes de darla por buena, y la copia incremental del volumen `uploads` (fotos y adjuntos) en `/opt/marela/backups/uploads-pro/`.

### Rotación

`rotar-copias.sh` conserva de las copias de la base de datos:

- **Diarias:** la más reciente de cada uno de los últimos 7 días con copia.
- **Semanales:** la más reciente de cada una de las últimas 4 semanas.
- **Mensuales:** la más reciente de cada uno de los últimos 6 meses.

Las demás se borran. Las fechas salen del nombre del archivo, así que también cuentan las copias de los despliegues. Los archivos (`uploads-pro/`) no se rotan: la copia es incremental y conserva lo que se borra en la aplicación.

### Espacio en disco

Cada copia apunta en el registro el espacio libre y, si quedan menos de 5 GB, una línea con `AVISO`. Para cambiar el mínimo, en el cron: `MARELA_MIN_LIBRE_GB=10 /opt/marela/pro/scripts/backup.sh pro ...`.

### Comprobarlo

```bash
tail -20 /opt/marela/backups.log
grep -E 'ERROR|AVISO' /opt/marela/backups.log | tail
ls -lh /opt/marela/backups
```

Cada noche deben aparecer tres líneas (base de datos, archivos y disco) y la de la rotación.

## 2. Copia fuera del servidor, en el PC

Si se pierde la Raspberry (la tarjeta, un disco, un robo), las copias del servidor se pierden con ella. Por eso el PC con Windows se trae cada día, por Tailscale, las copias de la base de datos (las mismas que conserva el servidor: rota igual) y lo nuevo de los archivos (lo borrado se conserva).

### Requisitos en el PC

- **Tailscale**, conectado a la misma tailnet.
- **PowerShell 7** (`pwsh`). Con `winget install Microsoft.PowerShell` si no está.
- **El cliente de OpenSSH**, que trae Windows (`ssh -V`).

### Clave ssh

La tarea no puede escribir una contraseña, así que entra con una clave sin frase de paso. En PowerShell:

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519"
# (Enter dos veces, sin frase de paso; si ya tienes esa clave, sáltate este paso)
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" |
  ssh pablo@raspberry.tail1234.ts.net "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
ssh -o BatchMode=yes pablo@raspberry.tail1234.ts.net true   # no debe pedir nada
```

### El script

Cópialo a la carpeta de las copias, para que la tarea no dependa de la rama en la que esté el repositorio:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\CopiasMarela"
Copy-Item scripts\traer-copias.ps1 "$env:USERPROFILE\CopiasMarela\"
pwsh -File "$env:USERPROFILE\CopiasMarela\traer-copias.ps1" -Servidor pablo@raspberry.tail1234.ts.net
```

La primera vez se trae todo (puede tardar, según cuántas fotos haya); después, solo lo nuevo. Si cambia el script en el repositorio, vuelve a copiarlo.

### La tarea programada

Cada día a las 10:00 o, si el PC estaba apagado, en cuanto se encienda. En PowerShell, con tu usuario (no como administrador):

```powershell
$script = "$env:USERPROFILE\CopiasMarela\traer-copias.ps1"
$accion = New-ScheduledTaskAction -Execute 'pwsh.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Servidor pablo@raspberry.tail1234.ts.net"
$cuando = New-ScheduledTaskTrigger -Daily -At 10:00
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName 'Marela - traer copias' -Action $accion -Trigger $cuando -Settings $ajustes
```

Para probarla y ver cómo terminó:

```powershell
Start-ScheduledTask 'Marela - traer copias'
Get-ScheduledTaskInfo 'Marela - traer copias' | Select-Object LastRunTime, LastTaskResult
Get-Content "$env:USERPROFILE\CopiasMarela\traer-copias.log" -Tail 10
```

`LastTaskResult` (también en el Programador de tareas, «Resultado de la última ejecución»):

| Resultado | Qué significa |
|---|---|
| `0` | Todo bien |
| `1` | Ha fallado: el servidor no responde (¿Tailscale?), no hay copias o no se han podido traer. El motivo está en el registro |
| `2` | Aviso: la última copia del servidor tiene más de 26 horas, así que la copia diaria no se está haciendo. Mira `/opt/marela/backups.log` en el servidor |

## 3. Restaurar

`scripts/restaurar.sh` sustituye los datos de un entorno por los de una copia. Se ejecuta con el script del entorno que se restaura:

```bash
/opt/marela/pruebas/scripts/restaurar.sh pruebas COPIA [--subidas DIRECTORIO]
/opt/marela/pro/scripts/restaurar.sh pro COPIA [--subidas DIRECTORIO] --produccion
```

- **`COPIA`:** una copia de la base de datos, `/opt/marela/backups/marela-<entorno>-AAAAMMDD-HHMMSS.sql.gz`. Puede ser de cualquier entorno: una de producción se restaura en pruebas para probarla.
- **`--subidas`:** restaura también los archivos (fotos y adjuntos) desde su copia, `/opt/marela/backups/uploads-<entorno>`. Se añaden al volumen sin borrar nada de él: en la copia incremental están todos.
- **`--produccion`:** sin él no se restaura producción. Además, hay que escribir «restaurar producción» para confirmarlo.

Qué hace:

1. **Comprueba la copia** antes de tocar nada: que se descomprime y que es un `pg_dump` completo. Si no, termina sin cambiar nada.
2. **En producción, copia el estado actual** con `backup.sh pro`, para poder volver atrás si se ha elegido mal la copia.
3. **Restaura la base de datos:** para el backend, borra la base de datos del entorno, la crea vacía y carga la copia en una sola transacción. Si el servidor de PostgreSQL es nuevo, crea antes el rol `marela_app`, que la copia no lleva.
4. **Copia los archivos** al volumen `uploads`, si se indica.
5. **Levanta el entorno y lo comprueba:** el backend aplica las migraciones que le falten a la copia (si es de una versión anterior), se comprueba `/api/health` por HTTPS y se cuentan las explotaciones, usuarios, animales y fincas restaurados.

Cada restauración queda apuntada, bien o mal, en `/opt/marela/restauraciones.log`.

Una copia de una versión **posterior** a la del código desplegado no se puede restaurar sin desplegar antes esa versión: al código le faltarían las tablas de las migraciones nuevas. Despliega primero la misma versión o una más nueva.

### Probar las copias en pruebas

Una copia que nunca se ha restaurado no se sabe si sirve. De vez en cuando (por ejemplo, una vez al mes), restaura la última copia de producción en pruebas:

```bash
ls -t /opt/marela/backups/marela-pro-*.sql.gz | head -1     # la última
/opt/marela/pruebas/scripts/restaurar.sh pruebas /opt/marela/backups/marela-pro-AAAAMMDD-HHMMSS.sql.gz \
  --subidas /opt/marela/backups/uploads-pro
```

Después entra en pruebas (`https://raspberry.tail1234.ts.net:8444`) con tu usuario de producción y comprueba que están tus animales, fincas y facturas, y que se abre algún adjunto.

Pruebas se queda con los datos reales hasta el próximo despliegue, que añade encima los de ejemplo. Para volver a tener solo los de ejemplo:

```bash
cd /opt/marela/pruebas
docker compose -p marela-pruebas -f docker-compose.yml -f docker-compose.servidor.yml down -v
/opt/marela/pruebas/scripts/deploy.sh pruebas
```

### Si se pierde el servidor

Si se estropea la Raspberry o su tarjeta, las copias que quedan son las del PC, en `%USERPROFILE%\CopiasMarela`. Con un servidor nuevo:

1. **Instálalo** siguiendo [servidor.md](servidor.md), apartados 1 a 4: Docker, Tailscale (con el mismo nombre de servidor, o cambia `URL_PUBLICA`), el clon de producción y su `.env`, y el certificado.
   - Si tienes guardado el `.env` antiguo, úsalo. Si no, genera contraseñas y secretos nuevos: solo se cierran las sesiones abiertas.
2. **Despliega** la versión que había, o una más nueva: `/opt/marela/pro/scripts/deploy.sh pro vX.Y.Z`.
3. **Sube las copias desde el PC**, en PowerShell:
   ```powershell
   ssh pablo@raspberry.tail1234.ts.net "mkdir -p /opt/marela/backups"
   scp -r "$env:USERPROFILE\CopiasMarela\uploads-pro" "$env:USERPROFILE\CopiasMarela\marela-pro-AAAAMMDD-HHMMSS.sql.gz" pablo@raspberry.tail1234.ts.net:/opt/marela/backups/
   ```
4. **Restaura** la última copia, con los archivos:
   ```bash
   /opt/marela/pro/scripts/restaurar.sh pro /opt/marela/backups/marela-pro-AAAAMMDD-HHMMSS.sql.gz \
     --subidas /opt/marela/backups/uploads-pro --produccion
   ```
5. **Vuelve a instalar** el cron de la copia diaria (apartado 1) y, si el servidor ha cambiado de nombre, la tarea del PC (apartado 2).

Se pierde lo registrado desde la última copia que se trajo el PC: como mucho, un día.

Guarda el `.env` de producción fuera del servidor, en un sitio seguro como un gestor de contraseñas. No va en las copias, porque lleva las contraseñas.
