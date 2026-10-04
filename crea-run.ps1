<#
  =====================================================================
   NAUCI AI - CREA NOCNI RUN  (Studio -> Crea)
  ---------------------------------------------------------------------
   Pokretanje:
     cd "C:\Users\admin\Desktop\Web Dev Projects\nauciai"
     powershell -ExecutionPolicy Bypass -File .\crea-run.ps1

   Monitor (drugi prozor):
     powershell -ExecutionPolicy Bypass -File .\watch-crea.ps1

   Opcije:
     -From K05            krece od tog koraka
     -Only K02,K03        samo ti koraci (i ako su vec zavrseni / blokirani)
     -BudgetUsd 1500      staje kad ukupna cena predje iznos
     -SkipSelfTest        preskoci proveru CLI-ja (ako je vec prosla)
     -NoBuild             bez `npm run build` posle svakog koraka
     -DryRun              samo ispise plan, ne pokrece Claude

   Bezbednost:
     - Svaka radnja agenta ide kroz auto rezim Claude Code-a (klasifikator).
       NEMA --dangerously-skip-permissions i nema unapred odobrenih alata.
       Ako auto rezim ne dozvoli ni obicnu izmenu fajla, run STAJE.
     - Zabranjeno uvek: git push/commit/reset/clean/checkout/switch/stash/
       rebase/merge, convex deploy/env/import, vercel, stripe, npm publish,
       rm -rf. MCP: samo Playwright (headless, za snimke ekrana) - nijedan
       konektor koji salje poruke, generise ili naplacuje.
     - Commit radi SAMO runner, lokalno, na grani crea-run. Nema push-a ni deploy-a.
     - Dok je ovaj prozor otvoren racunar ne ide na spavanje (podesavanja se ne menjaju).

   Ponasanje:
     - Svaki korak: claude -p (Opus 5.5) sa svojim effortom, rezimom
       (plan / goal / auto) i sesijom (nova / ista).
     - Posle koraka runner SAM pusta: codegen, typecheck, lint, test, build.
       Ako padne, vraca gresku istoj sesiji (2 pokusaja popravke).
     - Ako korak ostane polomljen: rad ide u `git stash`, repo se vraca na
       poslednji dobar commit i run ide dalje.
     - Limit (usage / 429): ceka reset i nastavlja ISTU sesiju.
     - Prekid (Ctrl+C) je bezbedan: ponovno pokretanje nastavlja od prvog
       nezavrsenog koraka (stanje u .crea-run\state.json).
  =====================================================================
#>
param(
  [string] $RepoPath = "C:\Users\admin\Desktop\Web Dev Projects\nauciai",
  [string] $From = "",
  [string] $Only = "",
  [double] $BudgetUsd = 1500,
  [string] $Model = "claude-opus-5-5",
  [string] $Branch = "crea-run",
  [switch] $SkipSelfTest,
  [switch] $NoBuild,
  [switch] $NoCommit,
  [switch] $DryRun
)

$ErrorActionPreference = "Continue"
if (-not (Test-Path -LiteralPath $RepoPath)) { throw "Repo ne postoji: $RepoPath" }
Set-Location -LiteralPath $RepoPath
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $Host.UI.RawUI.WindowTitle = "CREA RUN - ne zatvaraj ovaj prozor" } catch { }
$Utf8  = New-Object System.Text.UTF8Encoding($false)
$IsWin = ($env:OS -eq "Windows_NT")

# Racunar ne sme da zaspi, a klik u prozor ne sme da "zamrzne" run (QuickEdit).
# Vazi samo za ovaj prozor dok je otvoren; podesavanja Windows-a se ne menjaju.
if ($IsWin) {
  try {
    Add-Type -Namespace CreaRun -Name Native -ErrorAction Stop -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int nStdHandle);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
'@
    [void][CreaRun.Native]::SetThreadExecutionState([uint32]2147483649)   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    $hIn = [CreaRun.Native]::GetStdHandle(-10); $cmode = [uint32]0
    if ([CreaRun.Native]::GetConsoleMode($hIn, [ref]$cmode)) {
      [void][CreaRun.Native]::SetConsoleMode($hIn, [uint32](($cmode -band 4294967231) -bor 128))   # bez QuickEdit (0x40), uz EXTENDED_FLAGS (0x80)
    }
  } catch { }
}

$RunDir    = Join-Path $RepoPath ".crea-run"
$LogDir    = Join-Path $RunDir "logs"
$PromptDir = Join-Path $RunDir "prompts"
$StateFile = Join-Path $RunDir "state.json"
$StepsFile = Join-Path $RunDir "steps.json"
$Baseline  = Join-Path $RunDir "baseline.txt"
$McpFile   = Join-Path $RunDir "mcp.json"
$PlanDir   = Join-Path $RepoPath "docs\crea\planovi"
$Progress  = Join-Path $RepoPath "docs\CREA-PROGRESS.md"
New-Item -ItemType Directory -Force -Path $LogDir, $PlanDir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmm"
$Log   = Join-Path $LogDir "crea-run-$Stamp.log"
$FailedTestsJs = Join-Path $LogDir "failed-tests.cjs"

# Radnje koje agent NIKAD ne sme (vaze i u auto rezimu, pre klasifikatora).
$Deny = "Bash(git push:*),Bash(git commit:*),Bash(git reset:*),Bash(git clean:*),Bash(git checkout:*),Bash(git switch:*),Bash(git stash:*),Bash(git rebase:*),Bash(git merge:*),Bash(npx convex deploy:*),Bash(convex deploy:*),Bash(npx convex env:*),Bash(npx convex import:*),Bash(vercel:*),Bash(npx vercel:*),Bash(stripe:*),Bash(npm publish:*),Bash(rm -rf:*),mcp__higgsfield,mcp__Higgsfield,mcp__Higgsfield_MCP,mcp__higgsfield-mcp,mcp__nauci-ai,mcp__nauciai,mcp__Nauci_AI,mcp__nauci_ai,mcp__stripe,mcp__Stripe,mcp__vercel,mcp__Vercel,mcp__claude_ai_Higgsfield_MCP,mcp__claude_ai_Nauci_AI,mcp__claude_ai_Gmail,mcp__claude_ai_Google_Drive,mcp__claude_ai_Google_Calendar"

# Jedini MCP server u runu: Playwright (headless, izolovan profil) za snimke ekrana.
if (-not (Test-Path -LiteralPath $McpFile)) {
  $mcpJson = '{ "mcpServers": { "playwright": { "type": "stdio", "command": "cmd", "args": ["/c", "npx", "-y", "@playwright/mcp@latest", "--headless", "--isolated", "--output-dir", "docs/crea/snimci"] } } }'
  [System.IO.File]::WriteAllText($McpFile, $mcpJson, $Utf8)
}

# Pomocni Node skript: iz vitest JSON izvestaja izvlaci pale testove (radi i za velike izvestaje).
$ftjs = @'
const fs = require("fs"), path = require("path");
let r;
try { r = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); } catch (e) { console.log("PARSE_FAIL"); process.exit(0); }
console.log("PARSED_OK");
for (const f of (r.testResults || [])) {
  const leaf = path.basename(String(f.name || ""));
  const failed = (f.assertionResults || []).filter(a => a.status === "failed");
  for (const a of failed) console.log((leaf + " :: " + (a.fullName || a.title || "")).replace(/\s+/g, " "));
  if (f.status === "failed" && failed.length === 0) console.log(leaf + " :: (greska u fajlu)");
}
'@
[System.IO.File]::WriteAllText($FailedTestsJs, $ftjs, $Utf8)

$EffortOrder = @("low", "medium", "high", "xhigh", "max")
$script:EffortVia = "flag"      # flag | env | none
$script:EffortMap = @{}
$script:PlanOk    = $true
$script:GoalOk    = $true
$script:ResumeOk  = $true
$script:CurrentId = "K00"
$script:ConsecutiveFail = 0
$CommitExclude = @(":(exclude).agents", ":(exclude).claude", ":(exclude).crea-run/logs", ":(exclude).crea-run/state.json", ":(exclude).playwright-mcp")

# ── pomocne ──────────────────────────────────────────────────────────────────
function Write-Log([string]$msg, [string]$color = "Gray") {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  Write-Host $line -ForegroundColor $color
  [System.IO.File]::AppendAllText($Log, $line + "`r`n", $Utf8)
}

function Read-Utf8([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return "" }
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Tail-Text([string]$text, [int]$n = 50) {
  if (-not $text) { return "" }
  $ls = $text -split "`r?`n"
  if ($ls.Count -le $n) { return ($ls -join "`n") }
  return (($ls | Select-Object -Last $n) -join "`n")
}

function Load-State {
  if (Test-Path -LiteralPath $StateFile) {
    try { return (Read-Utf8 $StateFile | ConvertFrom-Json) } catch { Write-Log "state.json nije citljiv - pravim nov" Yellow }
  }
  return [pscustomobject]@{ steps = [pscustomobject]@{}; totalUsd = 0.0; selftest = $null; baseline = $null }
}
function Save-State { [System.IO.File]::WriteAllText($StateFile, ($State | ConvertTo-Json -Depth 10), $Utf8) }
function Get-StepState([string]$id) { if ($State.steps.PSObject.Properties[$id]) { return $State.steps.$id } ; return $null }
function Set-StepState([string]$id, $obj) {
  if ($State.steps.PSObject.Properties[$id]) { $State.steps.$id = $obj }
  else { $State.steps | Add-Member -NotePropertyName $id -NotePropertyValue $obj }
  Save-State
}
function Add-Cost([double]$usd) { $State.totalUsd = [double]$State.totalUsd + $usd; Save-State }
function Fmt-Usd([double]$x) { return $x.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture) }

function Get-Effort([string]$e) {
  if (-not $e) { return "" }
  $hops = 0
  while ($script:EffortMap.ContainsKey($e) -and $hops -lt 6) { $e = [string]$script:EffortMap[$e]; $hops++ }
  return $e
}
function Get-EffortDesc([string]$e) {
  if ($script:EffortVia -eq "none") { return "bez efforta" }
  return "$(Get-Effort $e) ($($script:EffortVia))"
}
function Remap-Effort([string]$bad, [string]$msg) {
  $allowed = @()
  if ($msg -match '(?i)allowed choices are ([a-z, ]+)') { $allowed = @($Matches[1] -split '[,\s]+' | Where-Object { $_ -and $_ -ne 'and' -and $_ -ne 'or' }) }
  $i = [array]::IndexOf($EffortOrder, $bad)
  for ($j = $i - 1; $j -ge 0; $j--) {
    $c = $EffortOrder[$j]
    if ($allowed.Count -eq 0 -or $allowed -contains $c) { return $c }
  }
  return ""
}

function Stop-DevServers {
  if (-not $IsWin) { return }
  # Samo dev procesi OVOG repoa (next/convex dev). Tudji procesi se ne diraju.
  try {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop |
      Where-Object { $_.CommandLine -and $_.CommandLine -match 'nauciai' -and $_.CommandLine -match '(next|convex)[^ ]*["\s]+dev|next[\\/]dist[\\/]server' } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Log "  ugasen zaostali dev proces $($_.ProcessId)" DarkGray }
  } catch { }
  foreach ($port in 3000..3005) {
    try {
      Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | ForEach-Object {
        $pp = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue
        if ($pp -and $pp.CommandLine -match 'nauciai') { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Log "  ugasen proces na portu $port" DarkGray }
      }
    } catch { }
  }
}

# Pokrece jednu komandu kroz .cmd (cuva UTF-8 i exit kod), sa vremenskim limitom.
function Run-Cmd([string]$label, [string]$command, [int]$timeoutMin = 30) {
  $out = Join-Path $LogDir ("{0}_{1}.txt" -f $script:CurrentId, $label)
  $bat = Join-Path $LogDir ("{0}_{1}.cmd" -f $script:CurrentId, $label)
  $lines = @(
    "@echo off",
    "chcp 65001 >nul",
    "cd /d `"$RepoPath`"",
    "set `"NODE_OPTIONS=--no-use-system-ca`"",
    "$command > `"$out`" 2>&1",
    "exit /b %ERRORLEVEL%"
  )
  [System.IO.File]::WriteAllText($bat, ($lines -join "`r`n"), $Utf8)
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$bat`"" -PassThru -NoNewWindow
  $null = $p.Handle
  if (-not $p.WaitForExit($timeoutMin * 60 * 1000)) {
    & taskkill /PID $p.Id /T /F 2>&1 | Out-Null
    return [pscustomobject]@{ code = 124; out = $out; text = (Read-Utf8 $out) + "`n[runner] isteklo vreme ($timeoutMin min)" }
  }
  $p.WaitForExit()
  return [pscustomobject]@{ code = $p.ExitCode; out = $out; text = (Read-Utf8 $out) }
}

# ── git ──────────────────────────────────────────────────────────────────────
function Clear-StaleGitLock {
  $lock = Join-Path $RepoPath ".git\index.lock"
  if (-not (Test-Path -LiteralPath $lock)) { return }
  if (@(Get-Process -Name git -ErrorAction SilentlyContinue).Count -gt 0) { return }   # neki git upravo radi - ne diraj
  $dest = "$lock.stale-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  try { Move-Item -LiteralPath $lock -Destination $dest -Force -ErrorAction Stop; Write-Log "  git: zaostali index.lock sklonjen ($(Split-Path $dest -Leaf))" Yellow }
  catch { Write-Log "  git: index.lock postoji i ne mogu da ga sklonim: $_" Red }
}

function Invoke-Git([string[]]$GitArgs) {
  for ($i = 1; $i -le 4; $i++) {
    $out = & git @GitArgs 2>&1
    if ($LASTEXITCODE -eq 0) { return $true }
    if (($out | Out-String) -match 'index\.lock') { Start-Sleep -Seconds (5 * $i); Clear-StaleGitLock; continue }
    Write-Log ("  git {0}: {1}" -f ($GitArgs -join " "), (Tail-Text ($out | Out-String) 3)) DarkYellow
    return $false
  }
  return $false
}

function Commit-Paths([string]$message, [string[]]$pathspec) {
  $null = Invoke-Git (@("add", "-A", "--") + $pathspec)
  $staged = & git diff --cached --name-only 2>$null
  if (-not $staged) { return "" }
  $msgFile = Join-Path $LogDir ("commitmsg-{0}.txt" -f (Get-Date -Format "HHmmssfff"))
  [System.IO.File]::WriteAllText($msgFile, $message, $Utf8)
  $ok = Invoke-Git @("-c", "commit.gpgsign=false", "commit", "-q", "-F", $msgFile)
  if (-not $ok) { $ok = Invoke-Git @("-c", "commit.gpgsign=false", "-c", "user.name=Crea run", "-c", "user.email=crea-run@localhost", "commit", "-q", "-F", $msgFile) }
  if (-not $ok) { return "" }
  return ((& git rev-parse --short HEAD 2>$null) | Out-String).Trim()
}

function Commit-Step([string]$id, [string]$title, [string]$status) {
  if ($NoCommit -or $DryRun) { return }
  $msg = "crea(${id}): $title [$status]`n`nNocni run CREA, korak $id. Detalji: docs/CREA-PROGRESS.md`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`nClaude-Session: https://claude.ai/code/session_017ZaFkZfzZDLTr3LQopobR8`n"
  $h = Commit-Paths $msg (@(".") + $CommitExclude)
  if ($h) { Write-Log "  ${id}: commit $h" DarkGray } else { Write-Log "  ${id}: nema izmena za commit" DarkGray }
}

function Stash-Broken([string]$id) {
  if ($DryRun) { return "" }
  $name = "crea-run BLOKADA $id $(Get-Date -Format 'yyyyMMdd-HHmm')"
  $ok = Invoke-Git @("stash", "push", "-u", "-m", $name, "--", ".", ":(exclude).agents", ":(exclude).claude", ":(exclude).crea-run", ":(exclude).playwright-mcp")
  if ($ok) { Write-Log "  ${id}: polomljen rad sacuvan u git stash ('$name'), repo vracen na poslednji dobar commit" Yellow }
  else { Write-Log "  ${id}: git stash NIJE uspeo - izmene ostaju u radnom stablu" Red; $name = "(stash nije uspeo)" }
  return $name
}

function Append-Progress([string]$text) {
  if (-not (Test-Path -LiteralPath $Progress)) { [System.IO.File]::WriteAllText($Progress, "# CREA - napredak`n`n", $Utf8) }
  [System.IO.File]::AppendAllText($Progress, "`n" + $text + "`n", $Utf8)
}

function Has-ProgressSection([string]$id) {
  $t = Read-Utf8 $Progress
  return ($t -match "(?m)^##\s+$id\b")
}

# ── claude -p ────────────────────────────────────────────────────────────────
# Mode: "auto" (svaka radnja ide kroz klasifikator) ili "plan" (samo citanje).
function Invoke-Claude {
  param(
    [string]$Tag, [string]$PromptText, [string]$Effort, [string]$Mode,
    [string]$ResumeId = "", [int]$TimeoutMin = 120, [string]$UseModel = ""
  )
  if (-not $UseModel) { $UseModel = $Model }
  $base   = Join-Path $LogDir $Tag
  $prompt = "$base.prompt.md"
  $jsonl  = "$base.jsonl"
  $err    = "$base.err.txt"
  $bat    = "$base.cmd"
  [System.IO.File]::WriteAllText($prompt, $PromptText, $Utf8)

  $perm = "--permission-mode auto"
  if ($Mode -eq "plan") { $perm = "--permission-mode plan" }
  $eff = Get-Effort $Effort
  $effortArg = ""; $effortEnv = "set `"CLAUDE_CODE_EFFORT_LEVEL=`""
  if ($eff -and $script:EffortVia -eq "flag") { $effortArg = "--effort $eff" }
  if ($eff -and $script:EffortVia -eq "env")  { $effortEnv = "set `"CLAUDE_CODE_EFFORT_LEVEL=$eff`"" }
  $resumeArg = ""; if ($ResumeId) { $resumeArg = "--resume $ResumeId" }
  $mcpArg = "--strict-mcp-config --mcp-config `"$McpFile`""

  $claudeLine = "call claude -p --model $UseModel $effortArg $perm --output-format stream-json --verbose $mcpArg $resumeArg --disallowedTools `"$Deny`" < `"$prompt`" > `"$jsonl`" 2> `"$err`""
  $lines = @(
    "@echo off",
    "chcp 65001 >nul",
    "cd /d `"$RepoPath`"",
    "set `"NODE_OPTIONS=--no-use-system-ca`"",
    "set `"ENABLE_CLAUDEAI_MCP_SERVERS=false`"",
    $effortEnv,
    $claudeLine,
    "exit /b %ERRORLEVEL%"
  )
  [System.IO.File]::WriteAllText($bat, ($lines -join "`r`n"), $Utf8)

  if ($DryRun) {
    Write-Log "  [dry] $Tag : model=$UseModel effort=$(Get-EffortDesc $Effort) mode=$Mode resume=$ResumeId" DarkGray
    return [pscustomobject]@{ ok = $true; timedOut = $false; exit = 0; sessionId = "dry-$Tag"; cost = 0.0; isError = $false; result = "dry run"; errTail = ""; limit = $false; net = $false; auth = $false; badFlag = ""; denials = 0; minutes = 0; jsonl = $jsonl }
  }

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$bat`"" -PassThru -NoNewWindow
  $null = $p.Handle
  $timedOut = $false
  if (-not $p.WaitForExit($TimeoutMin * 60 * 1000)) {
    & taskkill /PID $p.Id /T /F 2>&1 | Out-Null
    $timedOut = $true
  } else { $p.WaitForExit() }

  $res = [ordered]@{
    ok = $false; timedOut = $timedOut; exit = $null; sessionId = $null; cost = 0.0; isError = $true
    result = ""; errTail = ""; limit = $false; net = $false; auth = $false; badFlag = ""; denials = 0
    minutes = [math]::Round($sw.Elapsed.TotalMinutes, 1); jsonl = $jsonl
  }
  if (-not $timedOut) { $res.exit = $p.ExitCode }

  $all = @()
  if (Test-Path -LiteralPath $jsonl) { $all = [System.IO.File]::ReadAllLines($jsonl, [System.Text.Encoding]::UTF8) }
  $resultLine = $null
  for ($i = $all.Count - 1; $i -ge 0; $i--) { if ($all[$i] -match '"type"\s*:\s*"result"') { $resultLine = $all[$i]; break } }
  foreach ($l in $all) { if ($l -match '"session_id"\s*:\s*"([^"]+)"') { $res.sessionId = $Matches[1]; break } }
  if ($resultLine) {
    try {
      $r = $resultLine | ConvertFrom-Json
      if ($r.session_id) { $res.sessionId = $r.session_id }
      if ($r.total_cost_usd) { $res.cost = [double]$r.total_cost_usd }
      $res.isError = [bool]$r.is_error
      $res.result  = [string]$r.result
      if ($r.permission_denials) { $res.denials = @($r.permission_denials).Count }
      $res.ok = -not $res.isError
    } catch { }
  }
  $errText = Read-Utf8 $err
  $res.errTail = Tail-Text $errText 15
  $hay = "$($res.result)`n$errText"
  $shortResult = ($res.result.Length -lt 400)
  if ($res.isError -or -not $resultLine -or $shortResult) {
    if ($hay -match "(?i)hit your [a-z ]*limit|usage limit|limit reached|out of extra usage|rate_limit_error|resets \d|resets [a-z]{3}|\b429\b") { $res.limit = $true }
  }
  if ($res.isError -or -not $resultLine) {
    if ($hay -match "(?i)oauth (session|token) (has )?expired|failed to authenticate|invalid api key|please run /login|not logged in|authentication_error") { $res.auth = $true }
    if ($errText -match "(?i)(unknown option '[^']+'|unknown argument '[^']+'|option '[^']+' argument[^\r\n]*|argument '[^']+' is invalid[^\r\n]*|invalid value[^\r\n]*)") { $res.badFlag = $Matches[1] }
    if (-not $res.limit -and -not $res.auth -and -not $res.badFlag -and
        $hay -match "(?i)ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|network error|overloaded|\b529\b|\b502\b|\b503\b|connection error") { $res.net = $true }
  }
  if ($res.ok -and $res.limit -and -not $shortResult) { $res.limit = $false }
  return [pscustomobject]$res
}

function Get-ExitPlanText([string]$jsonl) {
  $best = ""
  if (-not (Test-Path -LiteralPath $jsonl)) { return $best }
  foreach ($l in [System.IO.File]::ReadAllLines($jsonl, [System.Text.Encoding]::UTF8)) {
    if ($l -notmatch '"name"\s*:\s*"ExitPlanMode"') { continue }
    try {
      $o = $l | ConvertFrom-Json
      foreach ($c in @($o.message.content)) {
        if ($c.type -eq "tool_use" -and $c.name -eq "ExitPlanMode" -and $c.input.plan) {
          if ($c.input.plan.Length -gt $best.Length) { $best = [string]$c.input.plan }
        }
      }
    } catch { }
  }
  return $best
}

# Koliko minuta do reseta limita (razni formati poruka). Nepoznato -> 15.
function Get-LimitWaitMinutes([string]$text) {
  $now = Get-Date
  if ($text -match 'limit reached\|(\d{10})') {
    $t = ([DateTimeOffset]::FromUnixTimeSeconds([int64]$Matches[1])).LocalDateTime
    return [math]::Ceiling(($t - $now).TotalMinutes) + 3
  }
  $rx = '(?i)resets?\s+(?:at\s+)?(?:(?<mon>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?<day>\d{1,2})(?:st|nd|rd|th)?,?\s+(?:at\s+)?)?(?<h>\d{1,2})(?::(?<m>\d{2}))?\s*(?<ap>[ap]\.?m\.?)?'
  if ($text -match $rx) {
    $h = [int]$Matches['h']; $m = 0; if ($Matches['m']) { $m = [int]$Matches['m'] }
    $ap = [string]$Matches['ap']
    if ($ap) { $ap = $ap -replace '\.', ''; if ($ap -ieq 'pm' -and $h -lt 12) { $h += 12 }; if ($ap -ieq 'am' -and $h -eq 12) { $h = 0 } }
    if ($h -lt 24 -and $m -lt 60) {
      if ($Matches['mon']) {
        $months = @{ jan = 1; feb = 2; mar = 3; apr = 4; may = 5; jun = 6; jul = 7; aug = 8; sep = 9; oct = 10; nov = 11; dec = 12 }
        $mo = [int]$months[$Matches['mon'].ToLower()]; $d = [int]$Matches['day']
        try { $t = New-Object DateTime ($now.Year, $mo, $d, $h, $m, 0) } catch { $t = $now.AddMinutes(60) }
        if ($t -lt $now.AddDays(-2)) { $t = $t.AddYears(1) }
      } else {
        $t = $now.Date.AddHours($h).AddMinutes($m)
        while ($t -lt $now) { $t = $t.AddDays(1) }
      }
      return [math]::Ceiling(($t - $now).TotalMinutes) + 3
    }
  }
  if ($text -match '(?i)\bin\s+(\d+)\s*(h|hr|hrs|hours?)\b') { return ([int]$Matches[1]) * 60 + 3 }
  if ($text -match '(?i)\bin\s+(\d+)\s*(m|min|mins|minutes?)\b') { return ([int]$Matches[1]) + 3 }
  return 15
}

function Wait-ForLimit([string]$text) {
  $wait = Get-LimitWaitMinutes $text
  if ($wait -lt 5) { $wait = 5 }
  if ($wait -gt 360) { $wait = 360 }   # najvise 6 h odjednom, pa ponovo proba
  Write-Log ("LIMIT: cekam {0} min (do {1})" -f $wait, (Get-Date).AddMinutes($wait).ToString("HH:mm")) Yellow
  Start-Sleep -Seconds ($wait * 60)
  Write-Log "LIMIT: nastavljam" DarkGray
}

# Jedan poziv sa ponovnim pokusajima (limit, mreza, nepoznat flag). Vraca rezultat i najnoviji session id.
function Invoke-WithRetry {
  param([string]$TagBase, [string]$PromptText, [string]$Effort, [string]$Mode, [string]$ResumeId, [int]$TimeoutMin, [string]$ContinueText, [string]$UseModel = "")
  $sid = $ResumeId; $text = $PromptText; $net = 0; $lim = 0; $n = 0; $total = 0.0; $flagFix = 0; $authWait = 0
  $netWaits = @(2, 5, 10, 20, 30, 30, 30, 30, 60, 60, 60, 60)
  while ($true) {
    $n++
    $r = Invoke-Claude -Tag "${TagBase}_$n" -PromptText $text -Effort $Effort -Mode $Mode -ResumeId $sid -TimeoutMin $TimeoutMin -UseModel $UseModel
    $total += $r.cost; Add-Cost $r.cost
    if ($r.sessionId) { $sid = $r.sessionId }
    if ($r.auth) {
      # Ne gasi se: ceka da Jovan uradi /login, pa sam nastavlja isti poziv.
      $authWait++
      if ($authWait -eq 1 -or ($authWait % 12) -eq 0) {
        Write-Log "LOGIN: claude CLI nije prijavljen (OAuth istekao). U terminalu pokreni 'claude' i uradi /login - run sam nastavlja (proveravam na 5 min)." Red
      }
      if ($authWait -gt 864) { Write-Log "STOP: 72 h bez prijave - stajem. Posle /login ponovo pokreni .crea-run\pokreni.cmd" Red; Save-State; exit 2 }
      Start-Sleep -Seconds 300
      continue
    }
    if ($authWait -gt 0) { Write-Log "LOGIN: prijava radi - nastavljam" Green; $authWait = 0 }
    if ($r.badFlag -and $flagFix -lt 8) {
      $flagFix++
      if ($r.badFlag -match "(?i)permission.mode") {
        Write-Log "STOP: ova verzija claude CLI-ja ne prihvata --permission-mode auto/plan ($($r.badFlag)). Run namerno ne zaobilazi dozvole - azuriraj Claude Code (claude update) pa pokreni ponovo." Red
        Save-State; exit 4
      }
      if ($r.badFlag -match "(?i)effort") {
        if ($r.badFlag -match "(?i)unknown option" -and $script:EffortVia -eq "flag") {
          $script:EffortVia = "env"; Write-Log "CLI ne zna --effort: effort ide kroz CLAUDE_CODE_EFFORT_LEVEL" Yellow; continue
        }
        $bad = Get-Effort $Effort
        $to = Remap-Effort $bad "$($r.badFlag) $($r.errTail)"
        if ($to -and $bad) { $script:EffortMap[$bad] = $to; Write-Log "CLI ne prihvata effort '$bad' - koristim '$to'" Yellow; continue }
        if ($script:EffortVia -ne "none") { $script:EffortVia = "none"; Write-Log "effort ne radi - nastavljam bez njega ($($r.badFlag))" Yellow; continue }
      }
      Write-Log "CLI greska u argumentima: $($r.badFlag)" Red
    }
    if ($r.limit -and $lim -lt 400) {
      $lim++; Wait-ForLimit "$($r.result) $($r.errTail)"
      if ($sid -and $ContinueText) { $text = $ContinueText }
      continue
    }
    if ($r.net -and $net -lt $netWaits.Count) {
      $w = $netWaits[$net]; $net++
      Write-Log "MREZA pala (pokusaj $net/$($netWaits.Count)) - cekam $w min" Magenta
      Start-Sleep -Seconds ($w * 60)
      Write-Log "MREZA: nastavljam" DarkGray
      if ($sid -and $ContinueText) { $text = $ContinueText }
      continue
    }
    if ($r.denials -ge 3) {
      Write-Log "  $TagBase : auto rezim je odbio $($r.denials) radnji (vidi $(Split-Path $r.jsonl -Leaf))" Yellow
    }
    $r | Add-Member -NotePropertyName totalCost -NotePropertyValue $total -Force
    $r | Add-Member -NotePropertyName lastSession -NotePropertyValue $sid -Force
    $r | Add-Member -NotePropertyName calls -NotePropertyValue $n -Force
    return $r
  }
}

# ── provere (gate) ───────────────────────────────────────────────────────────
function Get-FailedTests([string]$jsonPath) {
  if (-not (Test-Path -LiteralPath $jsonPath)) { return $null }
  $o = Run-Cmd "failedtests" "call node `"$FailedTestsJs`" `"$jsonPath`"" 5
  $lines = @(($o.text -split "`r?`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
  if ($lines.Count -eq 0 -or $lines[0] -ne "PARSED_OK") { return $null }
  $list = New-Object System.Collections.Generic.List[string]
  for ($i = 1; $i -lt $lines.Count; $i++) { $list.Add($lines[$i]) }
  return ,$list.ToArray()
}

function Convex-Changed {
  $st = & git status --porcelain 2>$null
  foreach ($l in $st) { if ($l -match '\sconvex/' -or $l -match '^.. "?convex/') { return $true } }
  return $false
}

function Run-Gates([string]$id, [switch]$IsBaseline) {
  Stop-DevServers
  $fails = New-Object System.Collections.Generic.List[string]
  $summary = ""
  $res = [ordered]@{ codegen = 0; typecheck = 0; lint = 0; test = 0; build = 0; failedTests = @() }

  if ($IsBaseline -or (Convex-Changed)) {
    $c = Run-Cmd "codegen" "call npx convex codegen" 15
    $res.codegen = $c.code
    if ($c.code -ne 0) { $fails.Add("codegen"); $summary += "### npx convex codegen (exit $($c.code))`n" + (Tail-Text $c.text 40) + "`n`n" }
  }
  $t = Run-Cmd "typecheck" "call npm run typecheck" 20
  $res.typecheck = $t.code
  if ($t.code -ne 0) { $fails.Add("typecheck"); $summary += "### npm run typecheck (exit $($t.code))`n" + (Tail-Text $t.text 60) + "`n`n" }

  $l = Run-Cmd "lint" "call npm run lint" 20
  $res.lint = $l.code
  if ($l.code -ne 0) { $fails.Add("lint"); $summary += "### npm run lint (exit $($l.code))`n" + (Tail-Text $l.text 60) + "`n`n" }

  $vjson = Join-Path $LogDir "${id}_vitest.json"
  if (Test-Path -LiteralPath $vjson) { Remove-Item -LiteralPath $vjson -Force }
  $v = Run-Cmd "test" "call npx vitest run --reporter=json --outputFile=`"$vjson`"" 40
  $failed = Get-FailedTests $vjson
  if ($null -eq $failed) {
    $res.test = $v.code
    if ($v.code -ne 0) { $fails.Add("test"); $summary += "### npx vitest run (exit $($v.code), JSON izvestaj nije nastao)`n" + (Tail-Text $v.text 60) + "`n`n" }
  } else {
    $res.failedTests = $failed
    $base = @(); if ($State.baseline -and $State.baseline.failedTests) { $base = @($State.baseline.failedTests) }
    $new = @($failed | Where-Object { $base -notcontains $_ })
    if (-not $IsBaseline -and $new.Count -gt 0) {
      # jedan ponovni pokusaj samo za nove pale fajlove (spori/nestabilni testovi pod opterecenjem)
      $files = @($new | ForEach-Object { ($_ -split ' :: ')[0] } | Select-Object -Unique)
      Write-Log "  test: $($new.Count) novih palih - ponavljam samo te fajlove ($($files -join ', '))" DarkYellow
      $vjson2 = Join-Path $LogDir "${id}_vitest_retry.json"
      if (Test-Path -LiteralPath $vjson2) { Remove-Item -LiteralPath $vjson2 -Force }
      $patterns = ($files | ForEach-Object { "`"$_`"" }) -join " "
      $null = Run-Cmd "test_retry" "call npx vitest run $patterns --reporter=json --outputFile=`"$vjson2`"" 20
      $failed2 = Get-FailedTests $vjson2
      if ($null -ne $failed2) { $new = @($failed2 | Where-Object { $base -notcontains $_ }) }
    }
    if (-not $IsBaseline -and $new.Count -gt 0) {
      $res.test = 1; $fails.Add("test")
      $summary += "### testovi koji padaju (a nisu padali na pocetku runa)`n" + (($new | Select-Object -First 40) -join "`n") + "`n`n" + (Tail-Text $v.text 40) + "`n`n"
    } else { $res.test = 0 }
  }

  if (-not $NoBuild) {
    $b = Run-Cmd "build" "call npm run build" 30
    $res.build = $b.code
    if ($b.code -ne 0) { $fails.Add("build"); $summary += "### npm run build (exit $($b.code))`n" + (Tail-Text $b.text 60) + "`n`n" }
  }

  # Gate koji je pao vec na pocetku runa nije blokirajuci dok jednom ne prodje.
  $blocking = New-Object System.Collections.Generic.List[string]
  foreach ($g in $fails) {
    $wasBad = $false
    if ($State.baseline) { $flag = "${g}Bad"; if ($State.baseline.PSObject.Properties[$flag] -and $State.baseline.$flag) { $wasBad = $true } }
    if ($wasBad -and $g -ne "test") { Write-Log "  $g pada, ali je padao i na pocetku runa - nije blokirajuce" DarkYellow } else { $blocking.Add($g) }
  }
  if ($State.baseline -and -not $IsBaseline) {
    foreach ($g in @("codegen", "typecheck", "lint", "build")) {
      $flag = "${g}Bad"
      if ($State.baseline.PSObject.Properties[$flag] -and $State.baseline.$flag -and $res[$g] -eq 0 -and -not ($fails -contains $g)) {
        if ($g -eq "codegen" -and -not (Convex-Changed)) { continue }
        $State.baseline.$flag = $false; Save-State; Write-Log "  $g je sada zelen - od sada je blokirajuci" DarkGray
      }
    }
  }
  return [pscustomobject]@{ ok = ($blocking.Count -eq 0); fails = $fails.ToArray(); blocking = $blocking.ToArray(); summary = $summary; detail = $res }
}

# ── self-test CLI-ja ─────────────────────────────────────────────────────────
function Self-Test {
  $script:CurrentId = "selftest"
  Write-Log "SELFTEST: proveravam claude CLI (model, effort, auto/plan/goal, nastavak sesije, izmene fajlova)" Cyan
  $ver = Run-Cmd "version" "call claude --version" 2
  Write-Log ("  claude --version: " + ($ver.text -replace "\s+", " ").Trim())

  $q = "Odgovori samo jednom rečju: OK"
  $t1 = Invoke-WithRetry -TagBase "selftest_t1" -PromptText $q -Effort "max" -Mode "auto" -TimeoutMin 10
  if (-not ($t1.ok -and $t1.result -match "OK") -and ("$($t1.result) $($t1.errTail)" -match "(?i)model")) {
    Write-Log "  model '$Model' nije prihvacen - probam alias 'opus'" Yellow
    Set-Variable -Name Model -Value "opus" -Scope Script
    $t1 = Invoke-WithRetry -TagBase "selftest_t1m" -PromptText $q -Effort "max" -Mode "auto" -TimeoutMin 10
  }
  if (-not ($t1.ok -and $t1.result -match "OK")) {
    Write-Log ("STOP: osnovni poziv 'claude -p --permission-mode auto' ne radi: " + (Tail-Text "$($t1.result) $($t1.errTail)" 6)) Red
    Write-Log "      Run namerno NE prelazi na rad bez provere dozvola. Vidi .crea-run\logs\selftest_*.err.txt" Red
    Save-State; exit 3
  }
  Write-Log "  t1 OK: model=$Model, effort max -> $(Get-EffortDesc 'max'), cena USD $(Fmt-Usd $t1.totalCost)" Green

  $t2 = Invoke-WithRetry -TagBase "selftest_t2" -PromptText "Koju si reč napisao u prethodnom odgovoru? Odgovori samo njom." -Effort "xhigh" -Mode "auto" -ResumeId $t1.lastSession -TimeoutMin 10
  $script:ResumeOk = ($t2.ok -and $t2.result -match "OK")
  Write-Log "  t2 nastavak sesije (--resume), effort xhigh -> $(Get-EffortDesc 'xhigh'): $($script:ResumeOk)" $(if ($script:ResumeOk) { "Green" } else { "Yellow" })

  # t3: auto rezim MORA da dozvoli obicnu izmenu fajla u projektu i bezbednu komandu.
  $wf = Join-Path $RunDir "selftest-write.txt"; if (Test-Path -LiteralPath $wf) { Remove-Item -LiteralPath $wf -Force }
  $t3 = Invoke-WithRetry -TagBase "selftest_t3" -PromptText "Test dozvola za noćni run. 1) Napravi fajl .crea-run/selftest-write.txt sa tačno tekstom OK. 2) Pokreni komandu: node --version 3) Odgovori samo izlazom te komande." -Effort "low" -Mode "auto" -TimeoutMin 10
  $writeOk = (Test-Path -LiteralPath $wf) -and ((Read-Utf8 $wf) -match "OK")
  $bashOk  = ([string]$t3.result -match "v\d+\.\d+")
  if (Test-Path -LiteralPath $wf) { Remove-Item -LiteralPath $wf -Force }
  Write-Log "  t3 auto rezim: izmena fajla=$writeOk, komanda=$bashOk (odbijenih radnji: $($t3.denials))" $(if ($writeOk -and $bashOk) { "Green" } else { "Red" })
  if (-not ($writeOk -and $bashOk)) {
    Write-Log "STOP: auto rezim na ovom racunaru ne dozvoljava agentu da menja fajlove ili pokrece komande: $(Tail-Text "$($t3.result) $($t3.errTail)" 4)" Red
    Write-Log "      Run namerno ne zaobilazi dozvole. Detalji: .crea-run\logs\selftest_t3_*.jsonl" Red
    Save-State; exit 3
  }

  $pf = Join-Path $RunDir "selftest-plan.txt"; if (Test-Path -LiteralPath $pf) { Remove-Item -LiteralPath $pf -Force }
  $t4 = Invoke-WithRetry -TagBase "selftest_t4" -PromptText "Test plan režima. Napiši plan u dve tačke kako bi napravio fajl .crea-run/selftest-plan.txt sa tekstom OK. NE pravi fajl, samo opiši plan." -Effort "low" -Mode "plan" -TimeoutMin 10
  $planText = [string]$t4.result; if (-not $planText -or $planText.Length -lt 20) { $planText = Get-ExitPlanText $t4.jsonl }
  $script:PlanOk = ($planText.Length -ge 20 -and -not (Test-Path -LiteralPath $pf))
  if (Test-Path -LiteralPath $pf) { Remove-Item -LiteralPath $pf -Force }
  Write-Log "  t4 plan rezim (bez menjanja fajlova): $($script:PlanOk)" $(if ($script:PlanOk) { "Green" } else { "Yellow" })

  $gf = Join-Path $RunDir "selftest-goal.txt"; if (Test-Path -LiteralPath $gf) { Remove-Item -LiteralPath $gf -Force }
  $null = Invoke-WithRetry -TagBase "selftest_t5" -PromptText "/goal Fajl .crea-run/selftest-goal.txt postoji i sadrži tačno tekst OK. Ako ne uspeš posle 5 pokušaja, stani." -Effort "low" -Mode "auto" -TimeoutMin 15
  $script:GoalOk = (Test-Path -LiteralPath $gf) -and ((Read-Utf8 $gf) -match "OK")
  if (Test-Path -LiteralPath $gf) { Remove-Item -LiteralPath $gf -Force }
  Write-Log "  t5 /goal: $($script:GoalOk)" $(if ($script:GoalOk) { "Green" } else { "Yellow" })

  $State.selftest = [pscustomobject]@{
    at = (Get-Date).ToString("s"); version = ($ver.text -replace "\s+", " ").Trim(); model = $Model
    effortVia = $script:EffortVia; effortMap = $script:EffortMap; resume = $script:ResumeOk; plan = $script:PlanOk; goal = $script:GoalOk
  }
  Save-State
  if (-not $script:PlanOk) { Write-Log "  plan koraci ce ici u auto rezimu sa strogom uputom 'ne menjaj fajlove'" Yellow }
  if (-not $script:GoalOk) { Write-Log "  goal koraci ce posle glavnog poziva dobiti obican nastavak 'zavrsi sve stavke' umesto /goal" Yellow }
  $script:CurrentId = "K00"
}

# ── jedan korak ──────────────────────────────────────────────────────────────
function Run-Step($step) {
  $id = [string]$step.id
  $script:CurrentId = $id
  $title = [string]$step.title
  Write-Log ("{0} | {1}" -f $id, $title) Cyan
  Write-Log ("  effort={0} rezim={1} sesija={2}{3} limit={4} min" -f (Get-EffortDesc ([string]$step.effort)), $step.mode, $step.session, $(if ($step.resumeFrom) { " (" + $step.resumeFrom + ")" } else { "" }), $step.timeoutMin) DarkGray
  $started = Get-Date
  $cost0 = [double]$State.totalUsd

  $body = Read-Utf8 (Join-Path $PromptDir "$id.md")
  if (-not $body) { Write-Log "$id -> GRESKA (0 min, 0 pokusaja, USD 0.00)" Red; Write-Log "  nema .crea-run\prompts\$id.md" Red; return }
  $header = "Ovo je korak $id noćnog runa CREA (Nauči AI). Obavezno pročitaj .crea-run/rules.md pre rada. Izvor istine: docs/CREA-PLAN.md.`r`n`r`n"

  $resumeId = ""
  if ($step.session -eq "ista" -and $step.resumeFrom) {
    $prev = Get-StepState ([string]$step.resumeFrom)
    if ($script:ResumeOk -and $prev -and $prev.sessionId) { $resumeId = [string]$prev.sessionId }
    else {
      Write-Log "  nema sesije od $($step.resumeFrom) (ili --resume ne radi) - nova sesija sa planom iz docs/crea/planovi" Yellow
      $header += "NAPOMENA: ovo je trebalo da bude nastavak sesije koraka $($step.resumeFrom), ali ide nova sesija. Plan tog koraka pročitaj iz docs/crea/planovi/$($step.resumeFrom).md pre svega ostalog.`r`n`r`n"
    }
  }

  $mode = [string]$step.mode
  $callMode = "auto"
  $mainPrompt = $header + $body
  if ($mode -eq "plan") {
    if ($script:PlanOk) { $callMode = "plan" }
    else { $mainPrompt = "REŽIM PLAN: samo čitaj i istražuj. NE menjaj nijedan fajl i ne pokreći komande koje menjaju stanje. Ceo plan vrati kao završni odgovor.`r`n`r`n" + $mainPrompt }
  }
  $continueText = $header + "Nastavi korak $id tačno gde si stao (bio je prekid). Proveri git status i docs/CREA-PROGRESS.md, pa završi zadatak iz .crea-run/prompts/$id.md."

  $r = Invoke-WithRetry -TagBase "${id}_main" -PromptText $mainPrompt -Effort ([string]$step.effort) -Mode $callMode -ResumeId $resumeId -TimeoutMin ([int]$step.timeoutMin) -ContinueText $continueText
  $sid = $r.lastSession
  $calls = $r.calls
  $attempt = 1
  while (-not $sid -and $attempt -lt 3 -and -not $DryRun) {
    Write-Log "  ${id}: poziv nije ni poceo sesiju ($(Tail-Text "$($r.result) $($r.errTail)" 2)) - ponavljam za 5 min" Yellow
    Start-Sleep -Seconds 300
    $attempt++
    $r = Invoke-WithRetry -TagBase "${id}_main_r$attempt" -PromptText $mainPrompt -Effort ([string]$step.effort) -Mode $callMode -ResumeId $resumeId -TimeoutMin ([int]$step.timeoutMin) -ContinueText $continueText
    $sid = $r.lastSession; $calls += $r.calls
  }
  if (-not $sid -and -not $DryRun) {
    $mins = [math]::Round(((Get-Date) - $started).TotalMinutes)
    Write-Log "$id -> GRESKA ($mins min, $calls pokusaja, USD $(Fmt-Usd ([double]$State.totalUsd - $cost0)))" Red
    Set-StepState $id ([pscustomobject]@{ status = "GRESKA"; sessionId = $null; at = (Get-Date).ToString("s") })
    $script:ConsecutiveFail++
    if ($script:ConsecutiveFail -ge 3) { Write-Log "STOP: 3 koraka zaredom nisu ni pocela - nesto nije u redu sa claude CLI-jem. Vidi .crea-run\logs\*.err.txt" Red; Save-State; exit 5 }
    return
  }
  $lastTimedOut = $r.timedOut
  if ($r.timedOut) { Write-Log "  ${id}: glavni poziv je istekao ($($step.timeoutMin) min)" Yellow }
  if (-not $r.ok -and -not $r.timedOut) { Write-Log "  ${id}: glavni poziv vratio gresku: $(Tail-Text $r.result 3)" Yellow }

  # PLAN korak: rezultat ide u docs/crea/planovi/<id>.md
  if ($mode -eq "plan") {
    $planText = [string]$r.result
    $alt = Get-ExitPlanText $r.jsonl
    if ($alt.Length -gt $planText.Length) { $planText = $alt }
    $mins = [math]::Round(((Get-Date) - $started).TotalMinutes)
    $usd = Fmt-Usd ([double]$State.totalUsd - $cost0)
    if ($DryRun) { Write-Log "$id -> OK (0 min, $calls pokusaja, USD 0.00)" DarkGray; return }
    if ($planText.Length -lt 300) {
      Write-Log "$id -> GRESKA ($mins min, $calls pokusaja, USD $usd)" Red
      Set-StepState $id ([pscustomobject]@{ status = "GRESKA"; sessionId = $sid; at = (Get-Date).ToString("s") })
      $script:ConsecutiveFail++
      return
    }
    $script:ConsecutiveFail = 0
    $planFile = Join-Path $PlanDir "$id.md"
    [System.IO.File]::WriteAllText($planFile, "# Plan $id - $title`n`n_Napisao korak $id noćnog runa ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))._`n`n" + $planText, $Utf8)
    Append-Progress "## $id - $title   ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))`n**Plan korak.** Plan je upisan u ``docs/crea/planovi/$id.md``. Nije menjan kod."
    Set-StepState $id ([pscustomobject]@{ status = "OK"; sessionId = $sid; at = (Get-Date).ToString("s"); minutes = $mins })
    Commit-Step $id $title "OK"
    Write-Log "$id -> OK ($mins min, $calls pokusaja, USD $usd)" Green
    return
  }

  # GOAL korak: nastavi istu sesiju sa /goal dok uslov nije ispunjen
  if ($mode -eq "goal" -and $sid) {
    $goal = "Korak $id je završen: (1) svaka stavka iz odeljka 'Prihvatanje' u .crea-run/prompts/$id.md je ispunjena ili upisana kao BLOKADA sa razlogom; (2) npm run typecheck, npm run lint i npm run test prolaze; (3) sekcija '$id' je dopisana u docs/CREA-PROGRESS.md; (4) nijedan dev server nije ostao upaljen. Ako uslov nije moguće ispuniti ni posle 12 pokušaja, upiši BLOKADA u docs/CREA-PROGRESS.md i stani."
    $goalPrompt = "/goal $goal"
    if (-not $script:GoalOk) { $goalPrompt = "Proveri da li je ovo tačno i, ako nije, radi dok ne bude: $goal" }
    $g = Invoke-WithRetry -TagBase "${id}_goal" -PromptText $goalPrompt -Effort ([string]$step.effort) -Mode "auto" -ResumeId $sid -TimeoutMin ([int]$step.timeoutMin) -ContinueText ($header + $goalPrompt)
    if ($g.lastSession) { $sid = $g.lastSession }
    $calls += $g.calls
    $lastTimedOut = $g.timedOut
    if ($g.timedOut) { Write-Log "  ${id}: /goal je istekao ($($step.timeoutMin) min)" Yellow }
  }

  if ($DryRun) { Write-Log "$id -> OK (0 min, $calls pokusaja, USD 0.00)" DarkGray; return }
  $script:ConsecutiveFail = 0

  # Provere posle koraka + do 2 popravke u istoj sesiji
  Write-Log "  ${id}: provera (codegen/typecheck/lint/test$(if (-not $NoBuild) { '/build' }))..." DarkGray
  $gate = Run-Gates $id
  $fix = 0
  while (-not $gate.ok -and $fix -lt 2 -and $sid) {
    $fix++
    Write-Log "  ${id}: provera pala ($($gate.blocking -join ', ')) - popravka $fix/2" Yellow
    $fixPrompt = $header + "Runner je posle koraka $id pustio provere i NISU prošle:`r`n`r`n" + $gate.summary + "`r`nPopravi uzrok bez hakova (po .crea-run/rules.md - ne gasi testove, ne briši assertion-e), pusti iste provere, pa dopuni sekciju $id u docs/CREA-PROGRESS.md."
    $f = Invoke-WithRetry -TagBase "${id}_fix$fix" -PromptText $fixPrompt -Effort ([string]$step.effort) -Mode "auto" -ResumeId $sid -TimeoutMin 90 -ContinueText $fixPrompt
    if ($f.lastSession) { $sid = $f.lastSession }
    $calls += $f.calls
    $gate = Run-Gates $id
  }

  $mins = [math]::Round(((Get-Date) - $started).TotalMinutes)
  $usd = Fmt-Usd ([double]$State.totalUsd - $cost0)
  if ($gate.ok) {
    $status = "OK"
    if (-not (Has-ProgressSection $id)) {
      $status = "DELIMICNO"
      Append-Progress "## $id - $title   ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))`n**Runner:** agent nije dopisao sekciju (verovatno isteklo vreme). Provere prolaze; pogledaj ``git show`` ovog commita i ``.crea-run/logs/${id}_*``."
    }
    if ($lastTimedOut) { $status = "DELIMICNO" }
    Set-StepState $id ([pscustomobject]@{ status = $status; sessionId = $sid; at = (Get-Date).ToString("s"); minutes = $mins })
    Commit-Step $id $title $status
    Write-Log "$id -> $status ($mins min, $calls pokusaja, USD $usd)" Green
  } else {
    $stash = Stash-Broken $id
    Append-Progress "## $id - $title - BLOKADA (runner)   ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))`n**Provere nisu prošle ni posle 2 popravke:** $($gate.blocking -join ', ').`n**Rad je sačuvan u git stash:** ``$stash`` (vrati sa ``git stash list`` / ``git stash apply``).`n**Za Jovana:** pogledaj ``.crea-run/logs/${id}_*.txt``. Sledeći koraci su nastavili od poslednjeg dobrog commita."
    Set-StepState $id ([pscustomobject]@{ status = "BLOKADA"; sessionId = $sid; at = (Get-Date).ToString("s"); minutes = $mins; stash = $stash })
    Commit-Step $id $title "BLOKADA"
    Write-Log "$id -> BLOKADA ($mins min, $calls pokusaja, USD $usd)" Red
  }
}

# ── main ─────────────────────────────────────────────────────────────────────
$State = Load-State
if ($null -eq $State.totalUsd) { $State | Add-Member -NotePropertyName totalUsd -NotePropertyValue 0.0 -Force }
if ($null -eq $State.steps) { $State | Add-Member -NotePropertyName steps -NotePropertyValue ([pscustomobject]@{}) -Force }
# Windows PowerShell 5.1 vraca JSON niz kao JEDAN objekat - zato ga rucno razvijamo.
$parsedSteps = (Read-Utf8 $StepsFile) | ConvertFrom-Json
$Steps = @($parsedSteps | ForEach-Object { $_ })
if ($Steps.Count -lt 1 -or -not $Steps[0].id) { Write-Log "STOP: .crea-run\steps.json nije citljiv" Red; exit 7 }

Write-Log "======================================================" DarkGray
Write-Log " CREA RUN start - model $Model, $($Steps.Count) koraka, budzet USD $BudgetUsd, grana $Branch" Green
Write-Log " auto rezim bez zaobilazenja dozvola; MCP samo Playwright; log: $(Split-Path $Log -Leaf)" DarkGray
Write-Log "======================================================" DarkGray

# grana + pocetni commitovi
if (-not $DryRun) {
  Clear-StaleGitLock
  $cur = ((& git rev-parse --abbrev-ref HEAD 2>$null) | Out-String).Trim()
  if ($cur -ne $Branch) {
    & git show-ref --verify --quiet "refs/heads/$Branch"
    if ($LASTEXITCODE -eq 0) { $null = Invoke-Git @("switch", $Branch) } else { $null = Invoke-Git @("switch", "-c", $Branch) }
    $cur = ((& git rev-parse --abbrev-ref HEAD 2>$null) | Out-String).Trim()
    if ($cur -ne $Branch) { Write-Log "STOP: ne mogu da predjem na granu $Branch (sada: '$cur'). Run nece da commituje na drugu granu." Red; exit 6 }
    Write-Log "grana: $cur" DarkGray
  }
  if (-not (Get-StepState "K00") -and -not $NoCommit) {
    $script:CurrentId = "K00"
    # 1) zatecene lokalne izmene (nisu deo Crea runa) - poseban commit, da istorija ostane cista
    $ours = @(".crea-run", "components/crea", "docs/CREA-PLAN.md", "docs/CREA-PROGRESS.md", "docs/crea", "public/brand", "crea-run.ps1", "watch-crea.ps1")
    $wipSpec = @(".") + $CommitExclude + @($ours | ForEach-Object { ":(exclude)$_" })
    $wipMsg = "chore: zatecene lokalne izmene pre Crea runa`n`nSve sto je bilo izmenjeno u radnom stablu pre pokretanja runa (bez .agents/.claude), sacuvano pre prvog koraka.`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`nClaude-Session: https://claude.ai/code/session_017ZaFkZfzZDLTr3LQopobR8`n"
    $wh = Commit-Paths $wipMsg $wipSpec
    if ($wh) { Write-Log "  zatecene lokalne izmene sacuvane u commit $wh" DarkGray }
    # 2) plan, pravila, logo, run fajlovi
    Commit-Step "K00" "plan, pravila, logo i run fajlovi" "OK"
    Set-StepState "K00" ([pscustomobject]@{ status = "OK"; at = (Get-Date).ToString("s") })
  }
}

# self-test
if ($SkipSelfTest -and $State.selftest) {
  if ($State.selftest.effortVia) { $script:EffortVia = [string]$State.selftest.effortVia }
  if ($State.selftest.effortMap) { foreach ($pr in $State.selftest.effortMap.PSObject.Properties) { $script:EffortMap[$pr.Name] = [string]$pr.Value } }
  $script:ResumeOk = [bool]$State.selftest.resume; $script:PlanOk = [bool]$State.selftest.plan; $script:GoalOk = [bool]$State.selftest.goal
  if ($State.selftest.model) { $Model = [string]$State.selftest.model }
  Write-Log "selftest preskocen (iz stanja): plan=$($script:PlanOk) goal=$($script:GoalOk) resume=$($script:ResumeOk) effort=$($script:EffortVia)" DarkGray
} elseif (-not $DryRun) {
  Self-Test
}

# baseline (jednom po runu)
if (-not $DryRun -and -not $State.baseline) {
  $script:CurrentId = "baseline"
  Write-Log "BASELINE: pustam provere na pocetnom stanju (da znam sta je vec padalo)..." Cyan
  $State | Add-Member -NotePropertyName baseline -NotePropertyValue ([pscustomobject]@{ failedTests = @(); codegenBad = $false; typecheckBad = $false; lintBad = $false; buildBad = $false }) -Force
  $b = Run-Gates "baseline" -IsBaseline
  $State.baseline.failedTests = @($b.detail.failedTests)
  $State.baseline.codegenBad = ($b.detail.codegen -ne 0)
  $State.baseline.typecheckBad = ($b.detail.typecheck -ne 0)
  $State.baseline.lintBad = ($b.detail.lint -ne 0)
  $State.baseline.buildBad = ($b.detail.build -ne 0)
  Save-State
  $bl = "Baseline (pre koraka K01, $(Get-Date -Format 'yyyy-MM-dd HH:mm'))`n" +
        "codegen: $(if ($State.baseline.codegenBad) { 'PADA' } else { 'ok' })`n" +
        "typecheck: $(if ($State.baseline.typecheckBad) { 'PADA' } else { 'ok' })`n" +
        "lint: $(if ($State.baseline.lintBad) { 'PADA' } else { 'ok' })`n" +
        "build: $(if ($State.baseline.buildBad) { 'PADA' } else { 'ok' })`n" +
        "testovi koji su padali i pre runa:`n" + ((@($State.baseline.failedTests) | ForEach-Object { "  - $_" }) -join "`n")
  [System.IO.File]::WriteAllText($Baseline, $bl, $Utf8)
  Write-Log ("BASELINE: typecheck={0} lint={1} build={2}, palih testova: {3}" -f (-not $State.baseline.typecheckBad), (-not $State.baseline.lintBad), (-not $State.baseline.buildBad), @($State.baseline.failedTests).Count) Cyan
}

# koraci
$onlyIds = @(); if ($Only) { $onlyIds = @($Only -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
$startedLoop = $false; if (-not $From) { $startedLoop = $true }
foreach ($s in $Steps) {
  $id = [string]$s.id
  if (-not $startedLoop) { if ($id -eq $From) { $startedLoop = $true } else { continue } }
  if ($onlyIds.Count -gt 0 -and ($onlyIds -notcontains $id)) { continue }
  $st = Get-StepState $id
  if ($onlyIds.Count -eq 0 -and $st -and ($st.status -eq "OK" -or $st.status -eq "DELIMICNO" -or $st.status -eq "BLOKADA")) {
    Write-Log "$id preskocen (vec $($st.status))" DarkGray
    continue
  }
  if ([double]$State.totalUsd -ge $BudgetUsd) {
    Write-Log "BUDZET dostignut (USD $(Fmt-Usd ([double]$State.totalUsd)) >= $BudgetUsd) - stajem. Nastavi sa -BudgetUsd vecim brojem." Red
    break
  }
  Run-Step $s
}

Write-Log "GOTOVO" Green
Write-Log ("Ukupna cena: USD " + (Fmt-Usd ([double]$State.totalUsd))) Green
Save-State
