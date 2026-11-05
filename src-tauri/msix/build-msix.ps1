# Packs the Tauri build into an MSIX for the Microsoft Store (the Store signs it: no SmartScreen warning).
# Usage: pwsh src-tauri/msix/build-msix.ps1 -Version 0.2.0 [-IdentityName ...] [-Publisher "CN=..."] [-PublisherDisplayName ...]
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$IdentityName = 'ScriptZ.ScriptZ',
  [string]$Publisher = 'CN=ScriptZ',
  [string]$PublisherDisplayName = 'ScriptZ',
  [string]$Out = 'src-tauri/target/msix'
)
$ErrorActionPreference = 'Stop'
if (-not $IdentityName) { $IdentityName = 'ScriptZ.ScriptZ' }
if (-not $Publisher) { $Publisher = 'CN=ScriptZ' }
if (-not $PublisherDisplayName) { $PublisherDisplayName = 'ScriptZ' }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$layout = Join-Path $Out 'layout'
Remove-Item -Recurse -Force $Out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $layout | Out-Null

# The app is a single executable (the web UI is embedded).
$exe = Get-ChildItem 'src-tauri/target/release' -Filter *.exe | Where-Object { $_.Name -notmatch 'build|setup|uninstall' } | Sort-Object Length -Descending | Select-Object -First 1
if (-not $exe) { throw 'No se encontró el ejecutable en src-tauri/target/release' }
Copy-Item $exe.FullName (Join-Path $layout 'ScriptZ.exe')
Copy-Item -Recurse (Join-Path $here 'Assets') (Join-Path $layout 'Assets')

# MSIX versions have four parts and the last one must be 0 for the Store.
$v = ($Version -replace '^v', '' -replace '-.*$', '').Split('.')
while ($v.Count -lt 3) { $v += '0' }
$msixVersion = "$($v[0]).$($v[1]).$($v[2]).0"
$manifest = Get-Content (Join-Path $here 'AppxManifest.xml') -Raw
$manifest = $manifest.Replace('__IDENTITY_NAME__', $IdentityName).Replace('__PUBLISHER__', [Security.SecurityElement]::Escape($Publisher)).Replace('__PUBLISHER_DISPLAY_NAME__', [Security.SecurityElement]::Escape($PublisherDisplayName)).Replace('__VERSION__', $msixVersion)
Set-Content -Path (Join-Path $layout 'AppxManifest.xml') -Value $manifest -Encoding UTF8

# Windows SDK tools.
$sdk = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Directory | Where-Object { $_.Name -match '^10\.' } | Sort-Object Name -Descending | Select-Object -First 1
$bin = Join-Path $sdk.FullName 'x64'
$makeappx = Join-Path $bin 'makeappx.exe'
$makepri = Join-Path $bin 'makepri.exe'

# Resource index so Windows picks the right icon size for the taskbar and Start.
Push-Location $layout
& $makepri createconfig /cf priconfig.xml /dq es-ES /pv 10.0.0 /o | Out-Null
& $makepri new /pr . /cf priconfig.xml /of resources.pri /o | Out-Null
Remove-Item priconfig.xml -ErrorAction SilentlyContinue
Pop-Location

$name = "ScriptZ_$($Version -replace '^v','')_x64.msix"
& $makeappx pack /o /d $layout /p (Join-Path $Out $name)
if ($LASTEXITCODE -ne 0) { throw "makeappx falló ($LASTEXITCODE)" }
Write-Host "MSIX: $(Join-Path $Out $name) (identidad $IdentityName, $Publisher, versión $msixVersion)"
if ($env:GITHUB_ENV) { "MSIX_PATH=$(Resolve-Path (Join-Path $Out $name))" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8 }
