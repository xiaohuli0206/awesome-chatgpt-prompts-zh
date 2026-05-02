param(
  [string]$OutputDir = "..\dist\windows",
  [string]$ExeName = "LegalRemoteAssist.exe"
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir '..')
$TemplateSed = Join-Path $ScriptDir 'iexpress\LegalRemoteAssist.sed'
$BatPath = Join-Path $ScriptDir 'LegalRemoteAssist.bat'

if (!(Test-Path $BatPath)) { throw "Missing launcher bat: $BatPath" }
if (!(Get-Command iexpress.exe -ErrorAction SilentlyContinue)) {
  throw "iexpress.exe not found. Please run this on Windows."
}

$AbsOutputDir = Resolve-Path -Path (Join-Path $ScriptDir $OutputDir) -ErrorAction SilentlyContinue
if (-not $AbsOutputDir) {
  $AbsOutputDir = New-Item -ItemType Directory -Path (Join-Path $ScriptDir $OutputDir) -Force
}
$AbsOutputDir = $AbsOutputDir.Path

$TargetExe = Join-Path $AbsOutputDir $ExeName
$TempSed = Join-Path $env:TEMP "legal-remote-assist-iexpress.sed"

$sed = Get-Content $TemplateSed -Raw
$sed = $sed.Replace('__TARGET_EXE__', $TargetExe)
$sed = $sed.Replace('__SOURCE_DIR__', $ScriptDir)
Set-Content -Path $TempSed -Value $sed -Encoding ASCII

Write-Host "[INFO] Building EXE: $TargetExe"
Start-Process -FilePath iexpress.exe -ArgumentList "/N", "/Q", $TempSed -Wait

if (!(Test-Path $TargetExe)) {
  throw "EXE build failed: $TargetExe not created"
}

Write-Host "[OK] EXE created: $TargetExe"
