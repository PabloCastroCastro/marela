# Test de traer-copias.ps1 (lo ejecuta la CI con pwsh): ssh y scp se sustituyen por funciones que
# leen una carpeta local, que hace de servidor. Necesita bash y find de GNU (Linux o Git Bash).
#
#   pwsh -File scripts/test/traer-copias.test.ps1

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot '../traer-copias.ps1'
$raiz = Join-Path ([IO.Path]::GetTempPath()) "traer-copias-$([guid]::NewGuid())"
$servidor = Join-Path $raiz 'servidor'
$pc = Join-Path $raiz 'pc'
$fallos = 0

function Comprobar([bool] $condicion, [string] $texto) {
  if (-not $condicion) {
    Write-Output "FALLO: $texto"
    $script:fallos++
  }
}

# ssh ejecuta la orden en bash, como en la Raspberry; scp copia de la carpeta del servidor
$global:sinRed = $false
function ssh {
  if ($global:sinRed) { $global:LASTEXITCODE = 255; return }
  bash -c $args[-1]
}
# Como el de verdad, falla con un argumento que no es una opción ni un origen del servidor
function scp {
  $destino = $args[-1]
  $global:LASTEXITCODE = 0
  for ($i = 0; $i -lt $args.Count - 1; $i++) {
    $a = $args[$i]
    if ($a -eq '-o') { $i++ }
    elseif ($a -in '-p', '-q') { }
    elseif ($a -is [string] -and $a.StartsWith('srv:')) { Copy-Item -LiteralPath $a.Substring(4) -Destination $destino }
    else { $global:LASTEXITCODE = 1 }
  }
}

function Copia([datetime] $fecha) { "marela-pro-$($fecha.ToString('yyyyMMdd-HHmmss')).sql.gz" }
function Traer { & $script -Servidor srv -Destino $pc -Remoto ($servidor -replace '\\', '/') | Out-Null; $LASTEXITCODE }

try {
  New-Item -ItemType Directory -Force (Join-Path $servidor 'uploads-pro/e1'), (Join-Path $pc 'uploads-pro/e1') | Out-Null
  $ahora = Get-Date
  $enServidor = @((Copia $ahora.AddHours(-1)), (Copia $ahora.AddDays(-1)), (Copia $ahora.AddDays(-8)))
  foreach ($c in $enServidor) { Set-Content (Join-Path $servidor $c) "copia $c" }
  Set-Content (Join-Path $servidor 'uploads-pro/e1/a.jpg') 'foto completa'
  Set-Content (Join-Path $servidor 'uploads-pro/e1/b.pdf') 'factura'
  Set-Content (Join-Path $servidor 'marela-pruebas-20261001-030000.sql.gz') 'otro entorno'
  # En el PC: una copia que el servidor ya ha rotado, una foto a medias y otra borrada en el servidor
  Set-Content (Join-Path $pc 'marela-pro-20200101-030000.sql.gz') 'vieja'
  Set-Content (Join-Path $pc 'uploads-pro/e1/a.jpg') 'fo'
  Set-Content (Join-Path $pc 'uploads-pro/e1/borrada.jpg') 'se conserva'

  # Sin conexión: falla y no borra nada
  $global:sinRed = $true
  Comprobar ((Traer) -eq 1) 'sin conexión debería terminar con 1'
  Comprobar (Test-Path (Join-Path $pc 'marela-pro-20200101-030000.sql.gz')) 'sin conexión ha borrado copias'
  $global:sinRed = $false

  Comprobar ((Traer) -eq 0) 'debería terminar con 0'
  $locales = @(Get-ChildItem $pc -Filter 'marela-*.sql.gz' | ForEach-Object Name | Sort-Object)
  Comprobar (($locales -join ',') -eq (($enServidor | Sort-Object) -join ',')) "copias en el PC: $($locales -join ', ')"
  Comprobar ((Get-Content (Join-Path $pc 'uploads-pro/e1/a.jpg')) -eq 'foto completa') 'no ha vuelto a traer la foto a medias'
  Comprobar (Test-Path (Join-Path $pc 'uploads-pro/e1/b.pdf')) 'no ha traído la factura'
  Comprobar (Test-Path (Join-Path $pc 'uploads-pro/e1/borrada.jpg')) 'ha borrado un archivo que ya no está en el servidor'

  # Un solo archivo nuevo, lo normal cada día
  $nueva = Copia $ahora.AddMinutes(-5)
  Set-Content (Join-Path $servidor $nueva) "copia $nueva"
  Comprobar ((Traer) -eq 0) 'con un solo archivo nuevo debería terminar con 0'
  Comprobar (Test-Path (Join-Path $pc $nueva)) 'no ha traído el único archivo nuevo'
  Remove-Item (Join-Path $servidor $nueva)

  # Sin copia en las últimas 26 horas: aviso
  Remove-Item (Join-Path $servidor $enServidor[0]), (Join-Path $servidor $enServidor[1])
  Comprobar ((Traer) -eq 2) 'una copia antigua debería terminar con 2'
  Comprobar ((Get-Content (Join-Path $pc 'traer-copias.log') -Raw) -match 'AVISO') 'no ha dejado el aviso en el registro'
}
finally {
  Remove-Item -Recurse -Force $raiz -ErrorAction SilentlyContinue
}

if ($fallos -gt 0) { exit 1 }
Write-Output 'traer-copias: OK'
