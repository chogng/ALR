param(
  [string]$ReleaseDir = "",
  [string]$OutDir = "",
  [string]$ProductName = "Renamer"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$defaultReleaseDir = Join-Path $repoRoot "src-tauri\\target\\release"
$releaseRoot = if ([string]::IsNullOrWhiteSpace($ReleaseDir)) { $defaultReleaseDir } else { $ReleaseDir }

if (!(Test-Path $releaseRoot)) {
  throw "Release directory not found: $releaseRoot. Build first (e.g. 'npm run build:tauri')."
}

$appExe = Join-Path $releaseRoot "app.exe"
if (!(Test-Path $appExe)) {
  throw "Executable not found: $appExe. Ensure Tauri build completed successfully."
}

$defaultOutDir = Join-Path $releaseRoot "bundle\\portable"
$outRoot = if ([string]::IsNullOrWhiteSpace($OutDir)) { $defaultOutDir } else { $OutDir }

New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

$stageDir = Join-Path $outRoot "_stage"
if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Copy-Item -Force -Path $appExe -Destination (Join-Path $stageDir "$ProductName.exe")

$readme = @"
$ProductName (Portable)

- Run: $ProductName.exe
- Notes:
  - This portable build requires Microsoft Edge WebView2 Runtime on the machine.
  - User data is stored in the standard OS app data locations.
"@
Set-Content -Encoding UTF8 -Path (Join-Path $stageDir "README-PORTABLE.txt") -Value $readme

$zipPath = Join-Path $outRoot "$ProductName-portable-windows-x64.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force

Remove-Item -Recurse -Force $stageDir

Write-Host "Portable zip created: $zipPath"

