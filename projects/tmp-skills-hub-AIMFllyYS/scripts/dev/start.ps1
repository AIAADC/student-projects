#Requires -Version 5.1
<#
.SYNOPSIS
    skill-hub 一键启动脚本（Windows / PowerShell）。
.DESCRIPTION
    检查环境 → 安装依赖 → 构建全仓 → 运行 skills-hub bootstrap 自动备份/收录/起面板。
    第二次运行时会因为指针文件已存在而直接启动面板,实现幂等“一键”。
.PARAMETER StoreHome
    库存基座目录。默认 ~/.skills-hub。沙箱验证请指向临时目录。兼容 `-Home` 别名。
.PARAMETER Port
    本地面板端口,默认 4321。
.PARAMETER Yes
    非交互环境下显式授权全部写操作(跳过确认)。
.PARAMETER SkipInstall
    跳过 pnpm install,只执行 build + bootstrap。
.PARAMETER Help
    显示本帮助信息。
.EXAMPLE
    .\scripts\dev\start.ps1
    .\scripts\dev\start.ps1 -StoreHome D:\tmp\skill-hub-sandbox -Port 4322 -Yes
    .\scripts\dev\start.ps1 -Home D:\tmp\skill-hub-sandbox -Port 4322 -Yes
#>
param(
    [Alias("Home")]
    [string]$StoreHome,
    [int]$Port = 4321,
    [switch]$Yes,
    [switch]$SkipInstall,
    [switch]$Help
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

if ($Help) {
    Get-Help -Detailed $PSCommandPath
    exit 0
}

$ErrorActionPreference = "Stop"

function Test-CommandAvailable {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-NodeVersion {
    $verString = node --version
    if ($verString -notmatch '^v(\d+)\.') {
        return $false
    }
    $major = [int]$Matches[1]
    return $major -ge 22
}

# 0. 环境检查
Write-Host "== 检查运行环境 =="

if (-not (Test-CommandAvailable "node")) {
    Write-Error "node 未安装。请先安装 Node.js >= 22: https://nodejs.org/"
    exit 1
}

if (-not (Test-NodeVersion)) {
    $current = node --version
    Write-Error "node 版本过低: $current,需要 >= 22。"
    exit 1
}
Write-Host "node: $(node --version)"

if (-not (Test-CommandAvailable "pnpm")) {
    Write-Error "pnpm 未安装。请先安装: npm install -g pnpm"
    exit 1
}
Write-Host "pnpm: $(pnpm --version)"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

# 1. 安装依赖
if (-not $SkipInstall) {
    Write-Host "== 安装依赖 =="
    pnpm install
    if (-not $?) {
        Write-Error "pnpm install 失败"
        exit 1
    }
}

# 2. 构建全仓
Write-Host "== 构建全仓 =="
pnpm build
if (-not $?) {
    Write-Error "pnpm build 失败"
    exit 1
}

# 3. 组装 bootstrap 参数
$bootstrapArgs = @("node", "packages/cli/dist/index.js", "bootstrap", "--port", "$Port")
if ($StoreHome) {
    $bootstrapArgs += @("--home", $StoreHome)
}
if ($Yes) {
    $bootstrapArgs += "--yes"
}

# 4. 一键启动
Write-Host "== 启动 skill-hub =="
Write-Host "执行: $($bootstrapArgs -join ' ')"
& $bootstrapArgs[0] $bootstrapArgs[1..($bootstrapArgs.Length - 1)]
