# gen-test-pdf.ps1 — regenerate the parent test guide PDF from the markdown.
# Pipeline: PARENT-TEST-GUIDE.md --(marked)--> HTML --(Chrome headless)--> PDF.
# Telugu renders via Windows fonts (Nirmala UI).
#
# Usage: npm run guide:pdf

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$md   = Join-Path $root 'PARENT-TEST-GUIDE.md'
$body = Join-Path $env:TEMP 'guide-body.html'
$html = Join-Path $env:TEMP 'guide.html'
$pdf  = Join-Path $root 'NRB-Vegetables-Parent-Test-Guide.pdf'

if (-not (Test-Path $md)) { Write-Host "Missing $md" -ForegroundColor Red; exit 1 }

Write-Host "==> markdown -> html" -ForegroundColor Cyan
npx -y marked -i $md -o $body

$css = @'
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI','Nirmala UI','Noto Sans Telugu',sans-serif; color:#1a1a1a; font-size:12px; line-height:1.5; }
h1 { color:#1a472a; font-size:23px; margin:0 0 2px; }
h3 { color:#2d6a4f; margin:0 0 12px; font-weight:600; }
h2 { color:#1a472a; font-size:15px; margin:20px 0 6px; border-bottom:2px solid #b7e4c7; padding-bottom:4px; page-break-after:avoid; }
table { border-collapse:collapse; width:100%; margin:8px 0 14px; page-break-inside:avoid; font-size:11.5px; }
th,td { border:1px solid #cde3d5; padding:6px 8px; text-align:left; vertical-align:top; }
th { background:#1a472a; color:#fff; font-weight:700; }
tr:nth-child(even) td { background:#f6fbf7; }
blockquote { background:#fff8e1; border-left:4px solid #f4a261; margin:8px 0; padding:7px 12px; color:#5b4a1f; border-radius:4px; }
hr { border:0; border-top:1px dashed #cde3d5; margin:16px 0; }
code { background:#eef3ee; padding:1px 6px; border-radius:4px; font-weight:700; color:#1a472a; }
strong { color:#1a472a; }
'@

Write-Host "==> wrap with styled template" -ForegroundColor Cyan
$content = Get-Content $body -Raw
$full = "<!doctype html><html lang=""te""><head><meta charset=""utf-8""><style>$css</style></head><body>$content</body></html>"
Set-Content -Path $html -Value $full -Encoding utf8

$chrome = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Host "Chrome/Edge not found." -ForegroundColor Red; exit 1 }

Write-Host "==> html -> pdf (Chrome headless)" -ForegroundColor Cyan
$args = @("--headless=new","--disable-gpu","--no-first-run","--no-pdf-header-footer","--user-data-dir=$env:TEMP\chromepdf","--print-to-pdf=$pdf","file:///$($html -replace '\\','/')")
Start-Process -FilePath $chrome -ArgumentList $args -Wait -NoNewWindow
Start-Sleep -Seconds 2

if (Test-Path $pdf) {
  Write-Host ("==> PDF ready: {0} ({1} KB)" -f $pdf, [math]::Round((Get-Item $pdf).Length/1KB,1)) -ForegroundColor Green
} else {
  Write-Host "PDF generation failed." -ForegroundColor Red; exit 1
}
