#Requires -Version 5.1

<#
.SYNOPSIS
    Compatibility wrapper for 0-1 CLI C drive cleanup.

.DESCRIPTION
    The maintained implementation now lives in the TypeScript CLI path:
    hi --clear -d

    This script remains for users who already bookmarked scripts/clean-c-drive.ps1.
#>

param(
    [switch]$NoBuild = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is required. Install Node.js 18+ first: https://nodejs.org/"
    exit 1
}

if (-not $NoBuild) {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed."
        exit 1
    }
}

if (Get-Command hi -ErrorAction SilentlyContinue) {
    hi --clear -d
    exit $LASTEXITCODE
}

node dist/index.js --clear -d
