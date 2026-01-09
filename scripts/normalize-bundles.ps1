param(
  [string]$BundleDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$defaultBundleDir = Join-Path $repoRoot "src-tauri\\target\\release\\bundle"
$bundleRoot = if ([string]::IsNullOrWhiteSpace($BundleDir)) { $defaultBundleDir } else { $BundleDir }

if (!(Test-Path $bundleRoot)) {
  throw "Bundle directory not found: $bundleRoot. Run 'tauri build' first."
}

function Rename-FirstMatchInDir {
  param(
    [string]$Dir,
    [string]$Pattern,
    [string]$NewName
  )
  $candidates = Get-ChildItem -Path $Dir -Recurse -File -Filter $Pattern -ErrorAction SilentlyContinue
  if ($null -eq $candidates) {
    return $false
  }

  $match = $candidates | Where-Object { $_.Name -ine $NewName } | Select-Object -First 1
  if ($null -eq $match) {
    $match = $candidates | Select-Object -First 1
  }
  if ($null -ne $match) {
    if ($match.Name -ieq $NewName) {
      return $true
    }
    $target = Join-Path $match.DirectoryName $NewName
    if (Test-Path $target) { Remove-Item -Force $target }
    Rename-Item -Force -Path $match.FullName -NewName $NewName
    return $true
  }
  return $false
}

Write-Host "Normalizing bundles in: $bundleRoot"

# Keep everything in-place (no export/copy), just create stable filenames.
$didExe = Rename-FirstMatchInDir -Dir $bundleRoot -Pattern "*-setup.exe" -NewName "Renamer-setup.exe"
$didMsi = Rename-FirstMatchInDir -Dir $bundleRoot -Pattern "*.msi" -NewName "Renamer.msi"

if (-not $didExe -and -not $didMsi) {
  Write-Host "No matching installer artifacts found to rename."
} else {
  Write-Host "Done."
}
