$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$binaryRoot = Join-Path $env:LOCALAPPDATA 'VoltGuard\mongodb'
$binary = if (Test-Path -LiteralPath $binaryRoot) { Get-ChildItem -LiteralPath $binaryRoot -Filter mongod.exe -Recurse | Select-Object -First 1 }
if (!$binary) { $binary = Get-ChildItem -Path "$env:ProgramFiles\MongoDB\Server\*\bin\mongod.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 }
if (!$binary) { throw 'MongoDB binary not found under LOCALAPPDATA\VoltGuard\mongodb or Program Files\MongoDB\Server.' }
$data = Join-Path $projectRoot 'backend\data\mongodb'
New-Item -ItemType Directory -Force -Path $data | Out-Null
if (!(Get-NetTCPConnection -LocalPort 27018 -State Listen -ErrorAction SilentlyContinue)) {
  $arguments = @('--bind_ip', '127.0.0.1', '--port', '27018', '--replSet', 'voltguard', '--dbpath', ('"' + $data + '"'), '--logpath', ('"' + (Join-Path $data 'mongod.log') + '"'), '--logappend')
  Start-Process -FilePath $binary.FullName -ArgumentList $arguments -WindowStyle Hidden
}
& node (Join-Path $PSScriptRoot 'initialize-mongodb.js')
if ($LASTEXITCODE -ne 0) { throw 'MongoDB initialization failed.' }
