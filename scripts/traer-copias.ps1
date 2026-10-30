# Copia fuera del servidor (docs/operacion.md): el PC con Windows se trae por Tailscale las copias de
# un entorno que hace cada noche la Raspberry.
#
#   pwsh -File scripts\traer-copias.ps1 -Servidor pablo@raspberry.tail1234.ts.net
#
# 1. Copias de la base de datos: trae las que faltan y borra las que el servidor ya ha rotado, así que
#    en el PC quedan las mismas (7 diarias, 4 semanales y 6 mensuales).
# 2. Archivos (fotos y adjuntos): trae lo nuevo o cambiado de uploads-<entorno>/; lo borrado se
#    conserva, como en el servidor.
# 3. Avisa si la última copia del servidor tiene más de 26 horas: la copia diaria no se está haciendo.
#
# Usa ssh y scp, que vienen con Windows, con una clave sin contraseña (no puede preguntar nada). Lo
# apunta todo en traer-copias.log, en el destino. Termina con 1 si falla y con 2 si hay aviso, para
# que se vea en el Programador de tareas.

param(
  [Parameter(Mandatory)] [string] $Servidor,
  [string] $Destino = (Join-Path $env:USERPROFILE 'CopiasMarela'),
  [ValidateSet('pro', 'pruebas')] [string] $Entorno = 'pro',
  [string] $Remoto = '/opt/marela/backups'
)

$ErrorActionPreference = 'Stop'
$opciones = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20')
New-Item -ItemType Directory -Force $Destino | Out-Null
$registro = Join-Path $Destino 'traer-copias.log'

function Registro([string] $texto) {
  $linea = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $texto"
  Write-Output $linea
  Add-Content -Path $registro -Value $linea -Encoding utf8
}

function Fallo([string] $texto) {
  Registro "ERROR: $texto"
  exit 1
}

Registro "Copias de $Entorno desde $Servidor"

# Lo que hay en el servidor: ruta relativa y tamaño
$listar = "cd '$Remoto' && find . -maxdepth 1 -type f -name 'marela-$Entorno-*.sql.gz' -printf '%P\t%s\n' && " +
  "if [ -d 'uploads-$Entorno' ]; then find 'uploads-$Entorno' -type f -printf '%p\t%s\n'; fi"
$lineas = & ssh @opciones $Servidor $listar
if ($LASTEXITCODE -ne 0) { Fallo "No se ha podido conectar con $Servidor (¿Tailscale activo?)" }

$remotos = @{}
foreach ($linea in $lineas) {
  $partes = $linea -split "`t"
  if ($partes.Count -eq 2) { $remotos[$partes[0]] = [long] $partes[1] }
}
$copias = @($remotos.Keys | Where-Object { $_ -match "^marela-$Entorno-\d{8}-\d{6}\.sql\.gz$" } | Sort-Object)
if ($copias.Count -eq 0) { Fallo "No hay copias de $Entorno en el servidor" }

# 1 y 2. Lo que falta o está a medias (otro tamaño), por carpetas: un scp por carpeta y no por archivo
$faltan = @($remotos.Keys | Where-Object {
    $local = Join-Path $Destino $_
    -not (Test-Path -LiteralPath $local) -or (Get-Item -LiteralPath $local).Length -ne $remotos[$_]
  })
foreach ($grupo in ($faltan | Group-Object { Split-Path $_ -Parent })) {
  $carpeta = if ($grupo.Name) { Join-Path $Destino $grupo.Name } else { $Destino }
  New-Item -ItemType Directory -Force $carpeta | Out-Null
  # De 50 en 50, para no pasar del límite de la línea de comandos
  for ($i = 0; $i -lt $grupo.Count; $i += 50) {
    # @(): con un solo archivo sería una cadena, y @origenes la pasaría letra a letra
    $origenes = @($grupo.Group[$i..([Math]::Min($i + 49, $grupo.Count - 1))] | ForEach-Object { "${Servidor}:$Remoto/$_" })
    & scp @opciones -p -q @origenes $carpeta
    if ($LASTEXITCODE -ne 0) { Fallo "No se han podido traer los archivos de $($grupo.Name)" }
  }
}
Registro "Traídos $($faltan.Count) archivos nuevos o cambiados"

# 1. Las copias que el servidor ya ha rotado
$rotadas = @(Get-ChildItem -LiteralPath $Destino -File -Filter "marela-$Entorno-*.sql.gz" |
    Where-Object { $_.Name -match "^marela-$Entorno-\d{8}-\d{6}\.sql\.gz$" -and -not $remotos.ContainsKey($_.Name) })
$rotadas | Remove-Item
$total = (Get-ChildItem -LiteralPath $Destino -File -Filter "marela-$Entorno-*.sql.gz").Count
Registro "En el PC: $total copias de la base de datos ($($rotadas.Count) borradas por la rotación)"

# 3. La última copia del servidor
$ultima = $copias[-1]
$fecha = [datetime]::ParseExact($ultima.Substring("marela-$Entorno-".Length, 15), 'yyyyMMdd-HHmmss', $null)
if ((Get-Date) - $fecha -gt [timespan]::FromHours(26)) {
  Registro "AVISO: la última copia del servidor es del $($fecha.ToString('dd/MM/yyyy HH:mm')): la copia diaria no se está haciendo"
  exit 2
}
Registro "Última copia: $ultima"
