[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputDocx,

    [Parameter(Mandatory = $true)]
    [string]$OutputDocx,

    [Parameter(Mandatory = $true)]
    [string]$OutputPdf,

    [ValidateSet("Auto", "WPS", "Word")]
    [string]$Renderer = "Auto",

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-FullOutputPath([string]$PathValue) {
    return [System.IO.Path]::GetFullPath($PathValue)
}

$inputPath = (Resolve-Path -LiteralPath $InputDocx).Path
$docxPath = Get-FullOutputPath $OutputDocx
$pdfPath = Get-FullOutputPath $OutputPdf

if ([System.IO.Path]::GetExtension($inputPath) -ne ".docx") {
    throw "InputDocx must be a .docx file."
}
if ([System.IO.Path]::GetExtension($docxPath) -ne ".docx") {
    throw "OutputDocx must end with .docx."
}
if ([System.IO.Path]::GetExtension($pdfPath) -ne ".pdf") {
    throw "OutputPdf must end with .pdf."
}
if ($inputPath -eq $docxPath) {
    throw "OutputDocx must differ from InputDocx to protect the source."
}
foreach ($target in @($docxPath, $pdfPath)) {
    if ((Test-Path -LiteralPath $target) -and -not $Force) {
        throw "Output already exists: $target. Use a new path or pass -Force."
    }
    $parent = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
}

$candidates = switch ($Renderer) {
    "WPS" { @(@{ Name = "WPS"; ProgId = "KWps.Application" }) }
    "Word" { @(@{ Name = "Microsoft Word"; ProgId = "Word.Application" }) }
    default {
        @(
            @{ Name = "WPS"; ProgId = "KWps.Application" },
            @{ Name = "Microsoft Word"; ProgId = "Word.Application" }
        )
    }
}

$app = $null
$document = $null
$selected = $null
try {
    foreach ($candidate in $candidates) {
        try {
            $app = New-Object -ComObject $candidate.ProgId
            $selected = $candidate.Name
            break
        }
        catch {
            $app = $null
        }
    }
    if ($null -eq $app) {
        throw "No WPS or Microsoft Word COM automation interface is available."
    }

    $app.Visible = $false
    try { $app.DisplayAlerts = 0 } catch { }
    $document = $app.Documents.Open($inputPath)

    # 12 = Office Open XML Document (.docx); 17 = PDF.
    $document.SaveAs2($docxPath, 12)
    $document.ExportAsFixedFormat($pdfPath, 17)
    $document.Close(0)
    $document = $null
    $app.Quit()
    $app = $null

    Write-Output "PASS: Saved DOCX and exported PDF with $selected."
    Write-Output "DOCX: $docxPath"
    Write-Output "PDF:  $pdfPath"
    Write-Output "NOTE: Export success is not visual QA. Render and inspect every final PDF page."
}
finally {
    if ($null -ne $document) {
        try { $document.Close(0) } catch { }
    }
    if ($null -ne $app) {
        try { $app.Quit() } catch { }
    }
}
