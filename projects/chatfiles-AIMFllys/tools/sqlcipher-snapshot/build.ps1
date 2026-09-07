[CmdletBinding()]
param(
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$toolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $toolRoot '..\..')
$sqliteRoot = Join-Path $repoRoot 'node_modules\better-sqlite3-multiple-ciphers\deps\sqlite3'
$sourcePath = Join-Path $toolRoot 'main.c'
$sqliteSource = Join-Path $sqliteRoot 'sqlite3.c'
$sqliteHeader = Join-Path $sqliteRoot 'sqlite3.h'
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')

foreach ($required in @($sourcePath, $sqliteSource, $sqliteHeader)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required build input is missing: $required"
  }
}

if (-not $OutputPath) {
  $OutputPath = Join-Path $repoRoot "work\tools\sqlcipher-snapshot-helper-$timestamp.exe"
}
$output = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $output) {
  throw "Output already exists: $output"
}

$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) {
  throw 'Visual Studio Installer vswhere.exe was not found.'
}
$installation = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
if (-not $installation) {
  throw 'Visual Studio C++ Build Tools were not found.'
}
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path -LiteralPath $vcvars -PathType Leaf)) {
  throw 'vcvars64.bat was not found.'
}

$objectRoot = Join-Path $repoRoot "work\tools\build\sqlcipher-snapshot-$timestamp"
[void](New-Item -ItemType Directory -Path $objectRoot)
[void](New-Item -ItemType Directory -Path (Split-Path -Parent $output) -Force)

$defines = @(
  'HAVE_INT16_T=1', 'HAVE_INT32_T=1', 'HAVE_INT8_T=1', 'HAVE_STDINT_H=1',
  'HAVE_UINT16_T=1', 'HAVE_UINT32_T=1', 'HAVE_UINT8_T=1',
  'SQLITE_DEFAULT_CACHE_SIZE=-16000', 'SQLITE_DEFAULT_FOREIGN_KEYS=1',
  'SQLITE_DEFAULT_MEMSTATUS=0', 'SQLITE_DEFAULT_WAL_SYNCHRONOUS=1', 'SQLITE_DQS=0',
  'SQLITE_ENABLE_COLUMN_METADATA', 'SQLITE_ENABLE_DBSTAT_VTAB', 'SQLITE_ENABLE_DESERIALIZE',
  'SQLITE_ENABLE_FTS3', 'SQLITE_ENABLE_FTS3_PARENTHESIS', 'SQLITE_ENABLE_FTS4',
  'SQLITE_ENABLE_FTS5', 'SQLITE_ENABLE_GEOPOLY', 'SQLITE_ENABLE_JSON1',
  'SQLITE_ENABLE_MATH_FUNCTIONS', 'SQLITE_ENABLE_PERCENTILE', 'SQLITE_ENABLE_RTREE',
  'SQLITE_ENABLE_STAT4', 'SQLITE_ENABLE_UPDATE_DELETE_LIMIT',
  'SQLITE_LIKE_DOESNT_MATCH_BLOBS', 'SQLITE_OMIT_DEPRECATED',
  'SQLITE_OMIT_PROGRESS_CALLBACK', 'SQLITE_OMIT_SHARED_CACHE',
  'SQLITE_OMIT_TCL_VARIABLE', 'SQLITE_SOUNDEX', 'SQLITE_THREADSAFE=2',
  'SQLITE_TRACE_SIZE_LIMIT=32', 'SQLITE_USER_AUTHENTICATION=0',
  'SQLITE_USE_URI=1', 'WIN32', 'NDEBUG'
)

$responsePath = Join-Path $objectRoot 'cl.rsp'
$arguments = @('/nologo', '/O2', '/MD', '/utf-8')
$arguments += $defines | ForEach-Object { "/D$_" }
$arguments += @(
  "/I`"$sqliteRoot`"",
  "`"$sourcePath`"",
  "`"$sqliteSource`"",
  "/Fe`"$output`""
)
[IO.File]::WriteAllLines($responsePath, $arguments, [Text.UTF8Encoding]::new($false))

$command = "call `"$vcvars`" >nul && cd /d `"$objectRoot`" && cl @`"$responsePath`""
& cmd.exe /d /c $command
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output -PathType Leaf)) {
  throw "Native helper build failed with exit code $LASTEXITCODE."
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $output).Hash
Write-Output "BUILT=$output"
Write-Output "SHA256=$hash"
