#Requires -Version 5.1

param(
    [string]$InstallDir = "",
    [switch]$SkipConfirm = $false
)

if ($Host.Version.Major -le 5) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
}

$RepoUrl = "https://github.com/AIMFllyYS/0-1-CLI.git"
$DefaultDir = "$env:USERPROFILE\zero-one-cli"
$MinNodeMajor = 18

function Confirm-Step([string]$Message) {
    if ($SkipConfirm) { return $true }
    $response = Read-Host "$Message [Y/n]"
    return ($response -eq "" -or $response -eq "Y" -or $response -eq "y")
}

function Write-Header([string]$Text) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-Success([string]$Text) { Write-Host "[OK] $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "[!] $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host "[X] $Text" -ForegroundColor Red }

function Test-Command([string]$Cmd) {
    return [bool](Get-Command $Cmd -ErrorAction SilentlyContinue)
}

function Get-NodeMajor() {
    try {
        $ver = node --version 2>$null
        if ($ver -match '^v(\d+)') { return [int]$Matches[1] }
    } catch {}
    return 0
}

function Install-WithWinget([string]$Id, [string]$Name) {
    if (-not (Test-Command winget)) {
        Write-Fail "winget is not available. Install $Name manually and rerun this script."
        return $false
    }
    winget install --id $Id -e --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { return $false }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    return $true
}

function Assert-Git() {
    Write-Header "Check Git"
    if (Test-Command git) {
        Write-Success "Git: $(git --version)"
        return
    }
    Write-Warn "Git is missing."
    if ((Confirm-Step "Install Git with winget?") -and (Install-WithWinget "Git.Git" "Git") -and (Test-Command git)) { return }
    Write-Fail "Git is required."
    exit 1
}

function Assert-Node() {
    Write-Header "Check Node.js"
    $nodeMajor = Get-NodeMajor
    if ($nodeMajor -ge $MinNodeMajor -and (Test-Command npm)) {
        Write-Success "Node.js: $(node --version)"
        return
    }
    if ($nodeMajor -gt 0) { Write-Warn "Node.js v$nodeMajor is too old. Need >= $MinNodeMajor." }
    else { Write-Warn "Node.js is missing." }
    if ((Confirm-Step "Install or upgrade Node.js LTS with winget?") -and (Install-WithWinget "OpenJS.NodeJS" "Node.js")) {
        if ((Get-NodeMajor) -ge $MinNodeMajor -and (Test-Command npm)) { return }
    }
    Write-Fail "Node.js >= $MinNodeMajor and npm are required."
    exit 1
}

function Test-RepoRoot([string]$Path) {
    $packagePath = Join-Path $Path "package.json"
    if (-not (Test-Path $packagePath)) { return $false }
    try {
        $pkg = Get-Content -Raw -Encoding UTF8 $packagePath | ConvertFrom-Json
    } catch {
        return $false
    }
    return (
        $pkg.name -eq "coding-cli" -and
        $pkg.bin -and
        $pkg.bin.hi -eq "./dist/index.js" -and
        $pkg.scripts -and
        $pkg.scripts.build
    )
}

function Get-RepoRoot() {
    $scriptPath = $MyInvocation.ScriptName
    if ($scriptPath) {
        $candidate = Resolve-Path (Join-Path (Split-Path $scriptPath) "..") -ErrorAction SilentlyContinue
        if ($candidate -and (Test-RepoRoot $candidate.Path)) { return $candidate.Path }
    }
    $current = (Get-Location).Path
    if (Test-RepoRoot $current) { return $current }
    return ""
}

function Prepare-Repository() {
    Write-Header "Prepare repository"
    $repoRoot = Get-RepoRoot
    if ($repoRoot) {
        Write-Success "Using current repository: $repoRoot"
        Set-Location $repoRoot
        return $repoRoot
    }
    $targetDir = $InstallDir
    if ([string]::IsNullOrWhiteSpace($targetDir)) {
        $targetDir = Read-Host "Install directory [default: $DefaultDir]"
        if ([string]::IsNullOrWhiteSpace($targetDir)) { $targetDir = $DefaultDir }
    }
    if (Test-Path $targetDir) {
        if (Test-RepoRoot $targetDir) {
            Write-Success "Using existing repository: $targetDir"
            Set-Location $targetDir
            return $targetDir
        }
        Write-Fail "Directory already exists: $targetDir"
        Write-Host "Choose another -InstallDir or remove the directory manually."
        exit 1
    }
    if (-not (Confirm-Step "Clone repository to $targetDir?")) { exit 0 }
    git clone $RepoUrl $targetDir
    if ($LASTEXITCODE -ne 0) { Write-Fail "Clone failed."; exit 1 }
    Set-Location $targetDir
    return $targetDir
}

function Run-NpmStep([string]$Title, [string]$Command) {
    Write-Header $Title
    if (-not (Confirm-Step "Run $Command?")) { Write-Warn "Skipped $Command"; return }
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) { Write-Fail "$Command failed."; exit 1 }
    Write-Success "$Command completed."
}

function New-StartupShortcut([string]$ExePath, [string]$WorkingDir) {
    $startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
    if (-not (Test-Path $startupDir)) { New-Item -ItemType Directory -Path $startupDir -Force | Out-Null }
    $shortcutPath = "$startupDir\hi-cli.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $ExePath
    $shortcut.WorkingDirectory = $WorkingDir
    $shortcut.Description = "0-1 CLI"
    $shortcut.Save()
    Write-Success "Startup shortcut created: $shortcutPath"
}

function Maybe-CreateStartup([string]$RepoRoot) {
    Write-Header "Startup shortcut"
    if (-not (Confirm-Step "Create a Windows startup shortcut?")) { return }
    $exePath = Join-Path $RepoRoot "dist\hi.exe"
    if (-not (Test-Path $exePath)) {
        Write-Warn "Missing $exePath. Packaging first."
        npm run pkg
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exePath)) { Write-Fail "Could not create hi.exe."; return }
    }
    New-StartupShortcut -ExePath $exePath -WorkingDir $RepoRoot
}

Write-Header "0-1 CLI Windows installer"
Write-Host "Repository: $RepoUrl"
Write-Host "This script checks dependencies, prepares the repo, builds, and registers the global hi command."
if (-not (Confirm-Step "Start installation?")) { exit 0 }

Assert-Git
Assert-Node
$repoRoot = Prepare-Repository
Run-NpmStep "Install dependencies" "npm install"
Run-NpmStep "Build TypeScript" "npm run build"
Run-NpmStep "Register hi command" "npm link"

Write-Header "Optional package"
if (Confirm-Step "Package dist\hi.exe?") {
    npm run pkg
    if ($LASTEXITCODE -ne 0) { Write-Warn "Packaging failed." } else { Write-Success "Created dist\hi.exe" }
}
Maybe-CreateStartup $repoRoot

Write-Header "Done"
Write-Host "Install directory: $repoRoot" -ForegroundColor Green
Write-Host "Try:"
Write-Host "  hi --help"
Write-Host "  hi --chat"
Write-Host "  hi --paths"
Write-Host "Config file: $repoRoot\.env"
