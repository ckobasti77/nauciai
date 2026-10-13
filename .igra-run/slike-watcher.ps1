<#
  IGRA run - prebacivac slika.
  Slike koje Claude nocas napravi u ChatGPT-u stizu u Downloads; ovaj prozor ih
  odmah premesta u .igra-assets\inbox u projektu (folder je u .gitignore).
  Dira SAMO nove slike (png/webp/jpg) nastale posle pokretanja. Zatvaranje
  prozora samo zaustavlja prebacivanje.
#>
$ErrorActionPreference = "Continue"
try { $Host.UI.RawUI.WindowTitle = "IGRA slike - ne zatvaraj" } catch { }
$repo  = Split-Path -Parent $PSScriptRoot
$inbox = Join-Path $repo ".igra-assets\inbox"
New-Item -ItemType Directory -Force -Path $inbox | Out-Null
$dl    = Join-Path $env:USERPROFILE "Downloads"
$start = (Get-Date).AddMinutes(-2)
$seen  = @{}
Write-Host "IGRA slike: nove slike iz $dl idu u $inbox" -ForegroundColor Cyan
Write-Host "Ne zatvaraj ovaj prozor dok traje nocni run." -ForegroundColor Cyan
while ($true) {
  $files = Get-ChildItem -LiteralPath $dl -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -match '^\.(png|webp|jpe?g)$' -and $_.CreationTime -ge $start }
  foreach ($f in $files) {
    $p = $f.FullName
    $len1 = $f.Length
    Start-Sleep -Milliseconds 1200
    $g = Get-Item -LiteralPath $p -ErrorAction SilentlyContinue
    if (-not $g) { continue }
    if ($g.Length -ne $len1 -or $g.Length -eq 0) { continue }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
    $dest = Join-Path $inbox ("$stamp" + $g.Extension.ToLower())
    try {
      Move-Item -LiteralPath $p -Destination $dest -ErrorAction Stop
      Write-Host ("{0}  {1}  ->  {2}" -f (Get-Date -Format "HH:mm:ss"), $g.Name, (Split-Path -Leaf $dest)) -ForegroundColor Green
    } catch {
      if (-not $seen.ContainsKey($p)) { Write-Host "  (jos se snima: $($g.Name))" -ForegroundColor DarkGray; $seen[$p] = $true }
    }
  }
  Start-Sleep -Seconds 2
}
