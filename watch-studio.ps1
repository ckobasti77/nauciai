# =====================================================================
#  NAUCI AI - monitor harness-a
#  ---------------------------------------------------------------
#  Pokreni u DRUGOM PowerShell prozoru, dok run radi u prvom:
#      cd "C:\Users\admin\Desktop\Web Dev Projects\nauciai"
#      powershell -ExecutionPolicy Bypass -File .\watch-studio.ps1
#
#  Iskljucivo cita. Ne dira git, ne pise nista, ne moze da pokvari run.
#  Izlaz: Ctrl+C.
# =====================================================================

param(
  [string] $RepoPath = "C:\Users\admin\Desktop\Web Dev Projects\nauciai",
  [int]    $Every    = 5,
  [string] $Pattern  = "*"
)

if (-not (Test-Path $RepoPath)) { throw "Repo ne postoji: $RepoPath" }
Set-Location -LiteralPath $RepoPath
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$LogDir = Join-Path $RepoPath ".studio-run\logs"
if (-not (Test-Path $LogDir)) { throw "Nema .studio-run\logs - run jos nije startovan." }

function Parse-Clock([string]$hms) {
  # Log pise samo HH:mm:ss. Ako ispadne u buducnosti, run je poceo juce.
  $t = [datetime]::ParseExact($hms, "HH:mm:ss", $null)
  $d = (Get-Date).Date.Add($t.TimeOfDay)
  if ($d -gt (Get-Date).AddMinutes(5)) { $d = $d.AddDays(-1) }
  return $d
}

function Human-Age([timespan]$ts) {
  if ($ts.TotalSeconds -lt 90)  { return ("{0:N0} s"   -f $ts.TotalSeconds) }
  if ($ts.TotalMinutes -lt 90)  { return ("{0:N0} min" -f $ts.TotalMinutes) }
  return ("{0:N1} h" -f $ts.TotalHours)
}

$Bar = "=" * 66

while ($true) {

  $log = Get-ChildItem -LiteralPath $LogDir -Filter "$Pattern*.log" -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $log) { Write-Host "Nema nijedan .log u $LogDir"; Start-Sleep -Seconds $Every; continue }

  $lines = @(Get-Content -LiteralPath $log.FullName -ErrorAction SilentlyContinue)

  $done    = @()
  $started = @{}
  $curId   = ""
  $curName = ""
  $curFrom = $null
  $netMsg  = ""
  $finished = $false
  $totalTxt = ""

  foreach ($l in $lines) {
    if ($l -match '^\[(\d\d:\d\d:\d\d)\]\s+([A-Z0-9]{1,4})\s+\|\s+(.+?)\s*$') {
      $curId = $Matches[2]; $curName = $Matches[3]; $curFrom = Parse-Clock $Matches[1]
      $started[$curId] = $curFrom
      $netMsg = ""
      continue
    }
    if ($l -match '^\[\d\d:\d\d:\d\d\]\s+([A-Z0-9]{1,4}) -> (\w+)\s+\((\d+) min, (\d+) pokusaja, USD ([\d.,]+)\)') {
      $done += [pscustomobject]@{
        Korak = $Matches[1]; Status = $Matches[2]; Minuta = [int]$Matches[3]
        Pokusaja = [int]$Matches[4]; USD = $Matches[5]
      }
      $curId = ""; $curFrom = $null
      continue
    }
    if ($l -match 'MREZA pala \(pokusaj (\d+)/(\d+)\)') { $netMsg = "mreza pala, pokusaj $($Matches[1])/$($Matches[2]) - ceka" ; continue }
    if ($l -match 'Ukupna cena: USD (.+)$')             { $totalTxt = $Matches[1]; $finished = $true; continue }
    if ($l -match '^\[\d\d:\d\d:\d\d\]\s+GOTOVO')       { $finished = $true; continue }
  }

  $spent = 0.0
  foreach ($d in $done) { $spent += [double]($d.USD -replace ',', '') }

  # Sta je agent poslednje dirao - jedini pouzdan znak da je ziv usred koraka.
  $touched = Get-ChildItem -LiteralPath $RepoPath -Recurse -File `
               -Include *.ts,*.tsx,*.md -ErrorAction SilentlyContinue `
               -Path (Join-Path $RepoPath "convex"), (Join-Path $RepoPath "lib"),
                     (Join-Path $RepoPath "app"),    (Join-Path $RepoPath "docs"),
                     (Join-Path $RepoPath "components") |
             Sort-Object LastWriteTime -Descending | Select-Object -First 6

  Clear-Host
  Write-Host $Bar -ForegroundColor DarkGray
  Write-Host " MONITOR  $($log.Name)" -ForegroundColor Cyan
  Write-Host " $(Get-Date -Format 'HH:mm:ss')   osvezavanje na ${Every}s   Ctrl+C za izlaz" -ForegroundColor DarkGray
  Write-Host $Bar -ForegroundColor DarkGray
  Write-Host ""

  if ($done.Count -gt 0) {
    Write-Host " ZAVRSENO" -ForegroundColor White
    foreach ($d in $done) {
      $c = "Green"
      if ($d.Status -eq "GRESKA")  { $c = "Red" }
      if ($d.Status -eq "BLOKADA") { $c = "Yellow" }
      if ($d.Status -eq "MREZA")   { $c = "Magenta" }
      $line = "  {0,-4} {1,-8} {2,4} min   USD {3,7}   pokusaja {4}" -f $d.Korak, $d.Status, $d.Minuta, $d.USD, $d.Pokusaja
      Write-Host $line -ForegroundColor $c
    }
    Write-Host ("  {0,-4} {1,-8} {2,4} min   USD {3,7}" -f "", "ukupno", ($done | Measure-Object Minuta -Sum).Sum, ("{0:N2}" -f $spent)) -ForegroundColor DarkGray
    Write-Host ""
  }

  if ($finished) {
    Write-Host " RUN JE GOTOV." -ForegroundColor Green
    if ($totalTxt) { Write-Host " Ukupna cena: USD $totalTxt" -ForegroundColor Green }
    Write-Host ""
  }
  elseif ($curId) {
    $el = (Get-Date) - $curFrom
    Write-Host " U TOKU" -ForegroundColor Yellow
    Write-Host "  $curId  -  $curName" -ForegroundColor Yellow
    Write-Host "  traje $(Human-Age $el)" -ForegroundColor DarkGray
    if ($netMsg) { Write-Host "  $netMsg" -ForegroundColor Magenta }
    Write-Host ""
  }
  else {
    Write-Host " Cekam pocetak sledeceg koraka..." -ForegroundColor DarkGray
    Write-Host ""
  }

  if ($touched) {
    Write-Host " POSLEDNJE DIRNUTI FAJLOVI" -ForegroundColor White
    foreach ($f in $touched) {
      $age = (Get-Date) - $f.LastWriteTime
      $rel = $f.FullName.Substring($RepoPath.Length).TrimStart('\')
      $c = "DarkGray"
      if ($age.TotalMinutes -lt 2) { $c = "Green" }
      Write-Host ("  {0,-9} {1}" -f (Human-Age $age), $rel) -ForegroundColor $c
    }
    $newest = ((Get-Date) - $touched[0].LastWriteTime)
    Write-Host ""
    if ($newest.TotalMinutes -gt 12 -and -not $finished) {
      Write-Host " Nista nije pisano $(Human-Age $newest). Agent verovatno cita ili vrti testove." -ForegroundColor DarkYellow
      Write-Host ""
    }
  }

  Write-Host " DNEVNIK (poslednjih 8 redova)" -ForegroundColor White
  $tail = $lines | Where-Object { $_ } | Select-Object -Last 8
  foreach ($t in $tail) { Write-Host "  $t" -ForegroundColor DarkGray }

  Start-Sleep -Seconds $Every
}
