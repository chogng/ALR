param(
  [string]$ProductName = "ALR Renamer",
  [string]$Arch = "x64",
  [string]$OutDir = "portable"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$exeSrc = Join-Path $root "src-tauri\\target\\release\\app.exe"

if (-not (Test-Path $exeSrc)) {
  throw "Release exe not found: $exeSrc. Run `npm run build:portable` first."
}

$outRoot = Join-Path $root $OutDir
$payloadDir = Join-Path $outRoot "$ProductName Portable ($Arch)"
New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null

$exeDst = Join-Path $payloadDir "$ProductName.exe"
Copy-Item -Force $exeSrc $exeDst

$readmeSrc = Join-Path $root "README-PORTABLE.md"
if (Test-Path $readmeSrc) {
  Copy-Item -Force $readmeSrc (Join-Path $payloadDir "README-PORTABLE.md")
}

$zipName = ("{0}-portable-win-{1}.zip" -f ($ProductName -replace " ", "-"), $Arch)
$zipPath = Join-Path $outRoot $zipName
if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path $payloadDir -DestinationPath $zipPath -Force
Write-Host "Portable zip created: $zipPath"

