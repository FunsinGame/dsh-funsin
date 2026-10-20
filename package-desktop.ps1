<#
.SYNOPSIS
  Builds a local unsigned Windows x64 Desktop installer with the next build version.

.DESCRIPTION
  Derives the next build version (product version + today's date + sequence), validates the
  packaging configuration and toolchain, runs the full unsigned packaging pipeline, then reports
  the artifact path, size and SHA-256 and copies the installer plus a checksum file into the
  distribution directory (default dist/desktop, which .gitignore excludes).

  Build versions follow apps/desktop/packaging/README.zh.md: product version 0.2.1-rc.2 becomes
  0.2.1-rc.2.<yyyyMMdd>.<sequence>, with the sequence starting at 1 each day.

  Overwriting an installation requires three values to stay constant: DSH_DESKTOP_APP_ID (owned by
  apps/desktop/.env.windows), the installation directory, and the Windows account that installs.
  This script therefore creates .env.windows only when it is missing and never rewrites it.

  Every build revalidates the Electron archive over the network, so a failed download stage is
  retried, and a mirror is used automatically when github.com is unreachable.

  Double-click build-desktop.cmd to run this script without a command line.

  Runs on Windows PowerShell 5.1 and PowerShell 7.

.PARAMETER BuildVersion
  Explicit build version instead of the derived one; must be <product version>.<yyyyMMdd>.<sequence>.

.PARAMETER OutDir
  Distribution directory, relative to the repository root or absolute. Pass an empty string to keep
  the artifact only under .desktop-build.

.PARAMETER CheckOnly
  Validate the configuration and toolchain without packaging.

.PARAMETER SkipBuild
  Skip the build and only hash and distribute the existing artifact of the resolved version.

.PARAMETER SkipCheck
  Skip the pre-build configuration check.

.PARAMETER Retry
  Extra attempts for the packaging pipeline after a failure.

.PARAMETER ElectronMirror
  ELECTRON_MIRROR base URL for the Electron archive, used for every attempt. The archive is still
  checksum-validated against that mirror's SHASUMS256.txt.

.PARAMETER FallbackMirror
  Mirror used for one extra attempt when a download stage failed and no -ElectronMirror was given.

.PARAMETER NoMirrorFallback
  Do not fall back to a mirror after a download stage failure.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\package-desktop.ps1

.EXAMPLE
  build-desktop.cmd

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\package-desktop.ps1 -CheckOnly

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\package-desktop.ps1 -BuildVersion 0.2.1-rc.2.20261030.1
#>
[CmdletBinding()]
param(
  [string]$BuildVersion,
  [string]$OutDir = 'dist/desktop',
  [switch]$CheckOnly,
  [switch]$SkipBuild,
  [switch]$SkipCheck,
  [int]$Retry = 1,
  [string]$ElectronMirror,
  [string]$FallbackMirror = 'https://registry.npmmirror.com/-/binary/electron/',
  [switch]$NoMirrorFallback
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$LASTEXITCODE = 0

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
  throw 'package-desktop: this script only builds the Windows x64 target; use package:desktop:mac:arm64 on macOS.'
}

$root = $PSScriptRoot
$desktopDir = Join-Path $root 'apps/desktop'
$artifactsDir = Join-Path $desktopDir '.desktop-build/targets/win-x64/unsigned-artifacts'
$runsDir = Join-Path $desktopDir '.desktop-build/packaging-runs'
$envFile = Join-Path $desktopDir '.env.windows'

# Prefer the native pnpm shim so $LASTEXITCODE reflects the real exit status.
$pnpmCommand = Get-Command -Name 'pnpm.cmd', 'pnpm' -CommandType Application -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($null -eq $pnpmCommand) { $pnpmCommand = Get-Command -Name 'pnpm' -ErrorAction SilentlyContinue }
if ($null -eq $pnpmCommand) {
  throw 'package-desktop: pnpm not found; install the version pinned by the root package.json packageManager field.'
}

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & $pnpmCommand.Source --dir $desktopDir @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "package-desktop: pnpm $($Arguments -join ' ') exited with $LASTEXITCODE"
  }
}

# Build version dates use China Standard Time on the packaging machine; fall back to local time.
function Get-ChinaDate {
  try {
    $zone = [TimeZoneInfo]::FindSystemTimeZoneById('China Standard Time')
  }
  catch [TimeZoneNotFoundException] {
    $zone = [TimeZoneInfo]::Local
  }
  [TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow, $zone).ToString('yyyyMMdd')
}

# The sequence continues after the highest one already present for today, so versions are never reused.
function Get-NextBuildVersion {
  param([string]$ProductVersion, [string]$Date)
  $prefix = "$ProductVersion.$Date."
  $next = 1
  if (Test-Path -LiteralPath $artifactsDir) {
    $pattern = '^deepseek-harness-' + [regex]::Escape($prefix) + '(?<n>\d+)-win-x64-unsigned\.exe$'
    $seen = @(
      Get-ChildItem -LiteralPath $artifactsDir -Filter '*.exe' -File | ForEach-Object {
        if ($_.Name -match $pattern) { [int]$Matches['n'] }
      }
    )
    if ($seen.Count -gt 0) { $next = ($seen | Measure-Object -Maximum).Maximum + 1 }
  }
  "$prefix$next"
}

function Get-LatestRun {
  if (-not (Test-Path -LiteralPath $runsDir)) { return $null }
  Get-ChildItem -LiteralPath $runsDir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

# A failed download stage is the one failure an Electron mirror can recover.
function Test-DownloadStageFailed {
  param($Run)
  if ($null -eq $Run) { return $false }
  $events = Join-Path $Run.FullName 'events.jsonl'
  if (-not (Test-Path -LiteralPath $events)) { return $false }
  $hit = Select-String -LiteralPath $events -Pattern '"stage":"download:[^"]+".*"success":false' -ErrorAction SilentlyContinue
  return [bool]$hit
}

function Invoke-PackagingPipeline {
  param([string]$Version)
  $attempts = [Math]::Max(1, $Retry + 1)
  for ($attempt = 1; $attempt -le $attempts; $attempt++) {
    try {
      Invoke-Pnpm 'run' 'package:win:x64:unsigned' '--build-version' $Version
      return
    }
    catch {
      # Without a mirror a failed download means the network path is wrong, not transient: let the
      # caller switch mirrors instead of repeating the same seven minutes of packaging.
      if ((Test-DownloadStageFailed (Get-LatestRun)) -and -not $env:ELECTRON_MIRROR) { throw }
      if ($attempt -ge $attempts) { throw }
      Write-Host "package-desktop: attempt $attempt of $attempts failed; retrying in 15s" -ForegroundColor Yellow
      Start-Sleep -Seconds 15
    }
  }
}

if (-not (Test-Path -LiteralPath $envFile)) {
  $lines = @(
    '# Created by package-desktop.ps1: local unsigned packaging settings (Git ignored).',
    '# Placeholder policy origin: mandatory updates and update checks stay inert.',
    'DSH_DESKTOP_APP_ID=com.deepseek.harness',
    'DSH_DESKTOP_AUTO_UPDATE_ENV=production',
    'DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN=https://policy.example.com'
  )
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($envFile, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, $utf8)
  Write-Host "package-desktop: created $envFile with a placeholder policy origin; changing its app ID breaks overwrite installs" -ForegroundColor Yellow
}

$productVersion = (Get-Content -LiteralPath (Join-Path $desktopDir 'package.json') -Raw | ConvertFrom-Json).version
$resolved = if ($BuildVersion) { $BuildVersion } else { Get-NextBuildVersion -ProductVersion $productVersion -Date (Get-ChinaDate) }

$commit = (git -C $root rev-parse --short HEAD 2>$null)
$dirty = if ((git -C $root status --porcelain 2>$null)) { 'dirty' } else { 'clean' }
Write-Host "package-desktop: product $productVersion, building $resolved (source $commit/$dirty)" -ForegroundColor Cyan

$previousMirror = $env:ELECTRON_MIRROR
$mirrorApplied = $false
if ($ElectronMirror) {
  $env:ELECTRON_MIRROR = $ElectronMirror
  $mirrorApplied = $true
  Write-Host "package-desktop: resolving the Electron archive from $ElectronMirror" -ForegroundColor Yellow
}

try {
  if (-not $SkipCheck) {
    Invoke-Pnpm 'run' 'package:win:x64:unsigned' '--check' '--build-version' $resolved
  }
  if ($CheckOnly) {
    Write-Host 'package-desktop: validation only; no installer was produced.' -ForegroundColor Green
    return
  }
  if (-not $SkipBuild) {
    try {
      Invoke-PackagingPipeline -Version $resolved
    }
    catch {
      $run = Get-LatestRun
      if ($NoMirrorFallback -or $ElectronMirror -or -not $FallbackMirror -or -not (Test-DownloadStageFailed $run)) {
        throw
      }
      Write-Host "package-desktop: a download stage failed, so github.com is probably unreachable; retrying once from $FallbackMirror" -ForegroundColor Yellow
      $env:ELECTRON_MIRROR = $FallbackMirror
      $mirrorApplied = $true
      Invoke-PackagingPipeline -Version $resolved
    }
  }
}
catch {
  $run = Get-LatestRun
  if ($null -ne $run) {
    Write-Host "package-desktop: packaging failed; stage logs are in $($run.FullName)" -ForegroundColor Red
    if (Test-DownloadStageFailed $run) {
      Write-Host 'package-desktop: the Electron download failed and the mirror fallback did not help; check the proxy and rerun with -ElectronMirror <url>.' -ForegroundColor Yellow
    }
  }
  throw
}
finally {
  if ($mirrorApplied) {
    if ($null -eq $previousMirror) { Remove-Item Env:\ELECTRON_MIRROR -ErrorAction SilentlyContinue }
    else { $env:ELECTRON_MIRROR = $previousMirror }
  }
}

$artifact = Join-Path $artifactsDir "deepseek-harness-$resolved-win-x64-unsigned.exe"
if (-not (Test-Path -LiteralPath $artifact)) {
  throw "package-desktop: artifact not found at $artifact; check that the version matches the artifacts on disk."
}

$item = Get-Item -LiteralPath $artifact
$hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
$sizeMiB = [math]::Round($item.Length / 1MB, 1)

Write-Host ''
Write-Host 'Installer' -ForegroundColor Green
Write-Host "  path   $($item.FullName)"
Write-Host "  version $resolved"
Write-Host "  size   $sizeMiB MiB"
Write-Host "  sha256 $hash"
Write-Host '  signing unsigned (SmartScreen shows an unknown-publisher warning)'

if ($OutDir) {
  $dest = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $root $OutDir }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -LiteralPath $artifact -Destination $dest -Force
  "$hash *$($item.Name)" | Set-Content -LiteralPath (Join-Path $dest "$($item.Name).sha256") -Encoding Ascii
  Write-Host "  share  $dest (checksum file alongside)"
}

Write-Host ''
Write-Host 'Distribution and upgrades' -ForegroundColor Green
Write-Host '  - First install: run the installer; the target directory must be empty.'
Write-Host '  - Overwrite upgrade: quit the app from the tray first, run the new installer, keep the same'
Write-Host '    installation directory. %APPDATA% shell and browser data and the ~/.dsh home (sessions,'
Write-Host '    credentials, plugins) are preserved.'
Write-Host '  - Never uninstall before installing: uninstalling removes the %APPDATA% desktop data.'
Write-Host '  - Silent install: installer.exe /S'
