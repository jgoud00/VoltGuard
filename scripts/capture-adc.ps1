param(
  [ValidateSet('Calibration', 'Compare', 'Averaged')][string]$Mode = 'Calibration',
  [string]$Port = 'COM5',
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [switch]$Disconnected
)
$ErrorActionPreference = 'Stop'
if (-not $Disconnected) { throw 'Confirm the ACS712 current path is physically disconnected and the sensor remains powered before passing -Disconnected.' }
$parent = Split-Path -Parent $OutputPath
if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
$lines = [Collections.Generic.List[string]]::new()
$serial = [IO.Ports.SerialPort]::new($Port, 115200)
$serial.DtrEnable = $false
$serial.RtsEnable = $false
$serial.ReadTimeout = 500
try {
  $serial.Open()
  $readyDeadline = (Get-Date).AddSeconds(20)
  $ready = $false
  while ((Get-Date) -lt $readyDeadline) {
    try {
      $line = $serial.ReadLine().Trim()
      $lines.Add($line)
      if ($line -match 'MQTT=published') { $ready = $true; break }
    } catch [TimeoutException] {}
  }
  if (-not $ready) { throw 'MQTT telemetry not ready; no capture command sent.' }
  $command = if ($Mode -eq 'Calibration') {'CALIBRATE_CURRENT DISCONNECTED'} elseif ($Mode -eq 'Averaged') {'CALIBRATE_CURRENT_AVERAGED DISCONNECTED'} else {'ADC_COMPARE DISCONNECTED'}
  $endMarker = if ($Mode -eq 'Compare') {'[RAW_COMPARE] END'} else {'[RAW_CAL] END'}
  $lines.Add('[HOST] ' + $command + ' at ' + [DateTime]::UtcNow.ToString('o'))
  $serial.WriteLine($command)
  $deadline = (Get-Date).AddSeconds(60)
  $complete = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $line = $serial.ReadLine().Trim()
      $lines.Add($line)
      if ($line -eq $endMarker) { $complete = $true; break }
    } catch [TimeoutException] {}
  }
  if (-not $complete) { throw 'Capture did not finish: inspect the saved log for reset/interruption.' }
  $tailDeadline = (Get-Date).AddSeconds(3)
  while ((Get-Date) -lt $tailDeadline) {
    try { $lines.Add($serial.ReadLine().Trim()) } catch [TimeoutException] {}
  }
  $lines | Where-Object { $_ -match '^\[CAL\]|^\[ADC\]|^\[HOST\]' }
  'Saved complete 256-point capture: ' + $OutputPath
} finally {
  $lines | Set-Content -LiteralPath $OutputPath -Encoding UTF8
  if ($serial.IsOpen) { $serial.Close() }
  $serial.Dispose()
}
