#Requires -Version 5.1
<#
  Professional MD reorganization:
  - ChatGPT/         → one folder per module
  - implementation_Review/ → one folder per module
  Does NOT touch: src/, app code, AGENTS.md, CLAUDE.md, README.md, node_modules, .next, .git
#>
$ErrorActionPreference = "Stop"
$Root = "c:\dev\agt-erp"
$Log = Join-Path $Root "_reorg_docs_log.txt"
"" | Set-Content $Log -Encoding UTF8

function Log($msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $msg"
  Add-Content $Log $line
  Write-Host $line
}

function Ensure-Dir($path) {
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
}

function Move-Safe($src, $destDir) {
  if (-not (Test-Path $src)) { return }
  Ensure-Dir $destDir
  $name = Split-Path $src -Leaf
  $dest = Join-Path $destDir $name
  if ((Test-Path $dest) -and ((Resolve-Path $src).Path -eq (Resolve-Path $dest).Path)) { return }
  if (Test-Path $dest) {
    $base = [IO.Path]::GetFileNameWithoutExtension($name)
    $ext  = [IO.Path]::GetExtension($name)
    $i = 2
    do {
      $dest = Join-Path $destDir "${base}__dup$i$ext"
      $i++
    } while (Test-Path $dest)
  }
  Move-Item -LiteralPath $src -Destination $dest -Force
  Log "MOVE  $($src.Replace($Root+'\',''))  →  $($dest.Replace($Root+'\',''))"
}

function Move-TreeContents($srcDir, $destDir) {
  if (-not (Test-Path $srcDir)) { return }
  Ensure-Dir $destDir
  Get-ChildItem -LiteralPath $srcDir -Force | ForEach-Object {
    $target = Join-Path $destDir $_.Name
    if (Test-Path $target) {
      if ($_.PSIsContainer) {
        # merge: move children
        Move-TreeContents $_.FullName $target
        # try remove empty src later
      } else {
        Move-Safe $_.FullName $destDir
      }
    } else {
      Move-Item -LiteralPath $_.FullName -Destination $target -Force
      Log "MOVE  $($_.FullName.Replace($Root+'\',''))  →  $($target.Replace($Root+'\',''))"
    }
  }
}

function Remove-EmptyDirs($path) {
  if (-not (Test-Path $path)) { return }
  Get-ChildItem -LiteralPath $path -Directory -Recurse -Force |
    Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object {
      $items = Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      if (-not $items -or $items.Count -eq 0) {
        Remove-Item -LiteralPath $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
        Log "RMDIR $($_.FullName.Replace($Root+'\',''))"
      }
    }
  # also remove path itself if empty
  if (Test-Path $path) {
    $items = Get-ChildItem -LiteralPath $path -Force -ErrorAction SilentlyContinue
    if (-not $items -or $items.Count -eq 0) {
      Remove-Item -LiteralPath $path -Force -Recurse -ErrorAction SilentlyContinue
      Log "RMDIR $($path.Replace($Root+'\',''))"
    }
  }
}

# ─────────────────────────────────────────────────────────────
# TARGET MODULE FOLDERS (parallel taxonomy)
# ─────────────────────────────────────────────────────────────
$ChatModules = @(
  "00_General","AI_Common","AI_DMS","Branding","Data_Seeding","DMS",
  "Foundation","Global_UI","HR","Notifications","Party_Master","PDF",
  "Platform","Realtime","Reports","Users"
)
$ReviewModules = @(
  "00_Meta","AI_Common","AI_DMS","Audits","Branding","DMS","Foundation",
  "Global_UI","HR","Party_Master","PDF","Platform","Project_Summaries",
  "Realtime","Reports","Users","screenshots"
)

$ChatRoot = Join-Path $Root "ChatGPT"
$ReviewRoot = Join-Path $Root "implementation_Review"

foreach ($m in $ChatModules) { Ensure-Dir (Join-Path $ChatRoot $m) }
foreach ($m in $ReviewModules) { Ensure-Dir (Join-Path $ReviewRoot $m) }

# ─────────────────────────────────────────────────────────────
# CLASSIFIERS
# ─────────────────────────────────────────────────────────────
function Classify-ChatName([string]$name, [string]$relPath) {
  $n = $name
  $p = $relPath

  if ($p -match '(?i)AI_Module') { return "AI_Common" }
  if ($p -match '(?i)AI_ENHANCMENT|AI_ENHANCEMENT') { return "AI_DMS" }
  if ($p -match '(?i)Antigravity_Ui_Ux|UiUx_Enhancment') { return "Global_UI" }
  if ($p -match '(?i)Data_seeding') { return "Data_Seeding" }
  if ($p -match '(?i)Global_Reporting') { return "Reports" }
  if ($p -match '(?i)HR_Module') { return "HR" }
  if ($p -match '(?i)Users_Module|User Module') { return "Users" }
  if ($p -match '(?i)Phase_001|Phase_002') { return "Foundation" }
  if ($p -match '(?i)Report_Design_Branding') {
    if ($n -match '(?i)REALTIME') { return "Realtime" }
    if ($n -match '(?i)BRANDING|EXECUTIVE_LEDGER|TEMPLATES_BRANDING') { return "Branding" }
    return "Reports"
  }
  if ($p -match '(?i)DMS_Enhancment|DMS_Phases') {
    if ($n -match '(?i)NOTIFICATIONS_1') { return "Notifications" }
    if ($n -match '(?i)SETTINGS_|COMMON_MD') { return "Platform" }
    if ($n -match '(?i)NEW_CHAT_HANDOFF|FULL_PROJECT') { return "00_General" }
    return "DMS"
  }

  # filename-based
  if ($n -match '(?i)^ERP_COMMON_AI|^CURSOR_PROMPT_ERP_COMMON_AI|^CURSOR_PROMPT_AUDIT_ERP_COMMON_AI|^CURSOR_PROMPT_PLAN_ONLY_ERP_COMMON_AI|^CURSOR_PROMPT_GENERATE_ERP_AI|^CURSOR_PROMPT_UPDATE_ERP_AI|^CURSOR_PROMPT_FULL_AI_MODULE|^ERP_AI_ROADMAP|^ERP_FULL_AI|^ERP_AI_STABILIZATION|^ERP_AI_EXISTING|^ERP_AI_FULL') { return "AI_Common" }
  if ($n -match '(?i)DMS_AI|ERP_DMS_AI|DMS_AI_META|ORCH_1') { return "AI_DMS" }
  if ($n -match '(?i)^DMS_|^ERP_DMS_|CURSOR_PROMPT_ERP_DMS|CURSOR_PROMPT_UPDATE_DMS|CURSOR_PROMPT_UPDATE_FULL_DMS|CURSOR_PROMPT_UPDATE_COMMON_MD') {
    if ($n -match '(?i)NOTIFICATIONS_1') { return "Notifications" }
    if ($n -match '(?i)SETTINGS_|COMMON_MD') { return "Platform" }
    return "DMS"
  }
  if ($n -match '(?i)^HR_|^CURSOR_PROMPT_HR|^CURSOR_PROMPT_UPDATE_HR|^ALGT_ERP_HR') { return "HR" }
  if ($n -match '(?i)PARTY|Party') { return "Party_Master" }
  if ($n -match '(?i)USERS|USER_') { return "Users" }
  if ($n -match '(?i)BRANDING|EXECUTIVE_LEDGER|TEMPLATES_BRANDING') { return "Branding" }
  if ($n -match '(?i)REPORT_DESIGNER|REPORT_[0-9]|GLOBAL_REPORT|Global_Reporting') { return "Reports" }
  if ($n -match '(?i)NOTIFICATION|EMAIL_DELIVERY') { return "Notifications" }
  if ($n -match '(?i)^ERP_PDF|PDF_') { return "PDF" }
  if ($n -match '(?i)REALTIME') { return "Realtime" }
  if ($n -match '(?i)GLOBAL_UI|GLOBAL_CLEANUP|GLOBAL_NAV|GLOBAL_PERF|JETBRAINS|ANTIGRAVITY|UI5|UIUX') { return "Global_UI" }
  if ($n -match '(?i)SETTINGS_|BANK_MASTER|ADMIN_|COMMON_MD') { return "Platform" }
  if ($n -match '(?i)BASE_|FOUNDATION|002F|002E|002D|Phase_00|MASTER_DATA|LOOKUPS') { return "Foundation" }
  if ($n -match '(?i)SEED|INSURANCE|DEPARTMENT_SEED|DESIGNATION_SEED') { return "Data_Seeding" }
  if ($n -match '(?i)HANDOFF|HANDOVER|MASTER_STANDARD|Planning File|CURSOR_STATUS|SOURCE_OF_TRUTH_GUIDE|IMPLEMENTATION_GUIDE|028_cursor') { return "00_General" }
  return "00_General"
}

function Classify-ReviewName([string]$name) {
  $n = $name
  if ($n -match '(?i)^ERP_COMMON_AI|^ERP_AI_ROADMAP|^ERP_AI_FULL|^ERP_AI_STABILIZATION|^ERP_AI_PHASE_18|^ERP_FULL_AI|^ERP_AI_EXISTING') { return "AI_Common" }
  if ($n -match '(?i)DMS_AI|ERP_DMS_AI|DMS_AI_META') { return "AI_DMS" }
  if ($n -match '(?i)^DMS_|^ERP_DMS_|ALGT_ERP_DMS') { return "DMS" }
  if ($n -match '(?i)^HR_|^ERP_HR_|ALGT_ERP_HR') { return "HR" }
  if ($n -match '(?i)PARTY|Party') { return "Party_Master" }
  if ($n -match '(?i)USERS|USER_') { return "Users" }
  if ($n -match '(?i)BRANDING|TEMPLATES_BRANDING') { return "Branding" }
  if ($n -match '(?i)REPORT_DESIGNER|REPORT_[0-9]|GLOBAL_REPORT|HR11_REPORT') { return "Reports" }
  if ($n -match '(?i)NOTIFICATION') { return "Platform" } # notifications engine lives under platform historically
  if ($n -match '(?i)^ERP_PDF|PDF_') { return "PDF" }
  if ($n -match '(?i)REALTIME') { return "Realtime" }
  if ($n -match '(?i)GLOBAL_UI|GLOBAL_CLEANUP|GLOBAL_NAV|GLOBAL_PERF|JETBRAINS|UI5') { return "Global_UI" }
  if ($n -match '(?i)SETTINGS_|BANK_MASTER|ADMIN_|COMMON_MD|NOTIFICATIONS_1') { return "Platform" }
  if ($n -match '(?i)CODE_AUDIT|AUDIT') { return "Audits" }
  if ($n -match '(?i)BASE_|FOUNDATION|002F|002E|002D') { return "Foundation" }
  return "00_Meta"
}

Log "===== START ChatGPT reorganization ====="

# 1) Move Report_Design_Branding (md + related docs only; leave .tsx)
$rdb = Join-Path $ChatRoot "Report_Design_Branding"
if (Test-Path $rdb) {
  Get-ChildItem $rdb -File | Where-Object { $_.Extension -match '\.(md|txt|pdf|docx)$' -or $_.Name -match '\.md$' } | ForEach-Object {
    $mod = Classify-ChatName $_.Name ("Report_Design_Branding\" + $_.Name)
    Move-Safe $_.FullName (Join-Path $ChatRoot $mod)
  }
  # leave WeightTicket3.tsx — move to Branding/_assets if present (not app src)
  Get-ChildItem $rdb -File | Where-Object { $_.Extension -eq ".tsx" } | ForEach-Object {
    $assets = Join-Path $ChatRoot "Branding\_assets"
    Ensure-Dir $assets
    Move-Safe $_.FullName $assets
  }
}

# 2) Move General_Prompts
$gp = Join-Path $ChatRoot "General_Prompts"
if (Test-Path $gp) {
  Get-ChildItem $gp -Recurse -File | ForEach-Object {
    Move-Safe $_.FullName (Join-Path $ChatRoot "00_General")
  }
}

# 3) Loose files in ChatGPT root
Get-ChildItem $ChatRoot -File | ForEach-Object {
  $mod = Classify-ChatName $_.Name $_.Name
  Move-Safe $_.FullName (Join-Path $ChatRoot $mod)
}

# 4) Completed Phases — walk all files
$cp = Join-Path $ChatRoot "Completed Phases"
if (Test-Path $cp) {
  Get-ChildItem $cp -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($cp.Length).TrimStart('\')
    # Only move documentation-ish files; skip unknown binaries that aren't docs
    if ($_.Extension -notin @(".md",".txt",".pdf",".docx",".sql",".csv",".png",".jpg") -and $_.Extension -ne "") {
      # keep non-doc files under 00_General/_misc
      $mod = "00_General"
      $dest = Join-Path (Join-Path $ChatRoot $mod) "_misc"
      Move-Safe $_.FullName $dest
      return
    }
    $mod = Classify-ChatName $_.Name $rel
    # Preserve Foundation phase subfolders for readability
    if ($mod -eq "Foundation" -and $rel -match '^(Phase_001|Phase_002|Phase_002F_3E_3B_Planning)\\') {
      $phase = ($rel -split '\\')[0]
      Move-Safe $_.FullName (Join-Path (Join-Path $ChatRoot "Foundation") $phase)
    } else {
      Move-Safe $_.FullName (Join-Path $ChatRoot $mod)
    }
  }
}

# Clean empty ChatGPT dirs (Completed Phases, old folders)
Remove-EmptyDirs $cp
Remove-EmptyDirs (Join-Path $ChatRoot "Report_Design_Branding")
Remove-EmptyDirs (Join-Path $ChatRoot "General_Prompts")
# sweep empties under ChatGPT
Remove-EmptyDirs $ChatRoot
# recreate module dirs if somehow removed empty (they should have files)
foreach ($m in $ChatModules) { Ensure-Dir (Join-Path $ChatRoot $m) }

Log "===== START implementation_Review reorganization ====="

# A) Merge HR + HR_Module + HR_Phases → HR
$hrDest = Join-Path $ReviewRoot "HR"
foreach ($old in @("HR_Module","HR")) {
  $p = Join-Path $ReviewRoot $old
  if (Test-Path $p) {
    Get-ChildItem $p -File | ForEach-Object { Move-Safe $_.FullName $hrDest }
    Get-ChildItem $p -Directory | ForEach-Object {
      Move-TreeContents $_.FullName (Join-Path $hrDest $_.Name)
    }
  }
}
$hrPhases = Join-Path $ReviewRoot "HR_Phases"
if (Test-Path $hrPhases) {
  $destPhases = Join-Path $hrDest "Phases"
  Ensure-Dir $destPhases
  Move-TreeContents $hrPhases $destPhases
}

# B) Merge DMS_Module + DMS_Phases → DMS
$dmsDest = Join-Path $ReviewRoot "DMS"
$dmsMod = Join-Path $ReviewRoot "DMS_Module"
if (Test-Path $dmsMod) {
  Get-ChildItem $dmsMod -File | ForEach-Object { Move-Safe $_.FullName $dmsDest }
}
$dmsPhases = Join-Path $ReviewRoot "DMS_Phases"
if (Test-Path $dmsPhases) {
  $destPhases = Join-Path $dmsDest "Phases"
  Ensure-Dir $destPhases
  Move-TreeContents $dmsPhases $destPhases
}

# C) Split AI_Enhancement → AI_Common + AI_DMS
$aiEnh = Join-Path $ReviewRoot "AI_Enhancement"
if (Test-Path $aiEnh) {
  Get-ChildItem $aiEnh -File | ForEach-Object {
    $mod = Classify-ReviewName $_.Name
    if ($mod -notin @("AI_Common","AI_DMS")) {
      if ($_.Name -match '(?i)COMMON_AI|AI_ROADMAP|AI_FULL|AI_FIX|ORCH|AI_STABILIZATION|FULL_AI') { $mod = "AI_Common" }
      else { $mod = "AI_DMS" }
    }
    Move-Safe $_.FullName (Join-Path $ReviewRoot $mod)
  }
}

# D) Merge Common_AI folder into AI_Common
$commonAi = Join-Path $ReviewRoot "Common_AI"
if (Test-Path $commonAi) {
  Get-ChildItem $commonAi -File | ForEach-Object { Move-Safe $_.FullName (Join-Path $ReviewRoot "AI_Common") }
}

# E) Rename/move Foundation_Phases → Foundation
$fp = Join-Path $ReviewRoot "Foundation_Phases"
if (Test-Path $fp) {
  Move-TreeContents $fp (Join-Path $ReviewRoot "Foundation")
}

# F) Global_Phases + Global_Navigation → Global_UI
$gp2 = Join-Path $ReviewRoot "Global_Phases"
if (Test-Path $gp2) {
  $dest = Join-Path (Join-Path $ReviewRoot "Global_UI") "Phases"
  Ensure-Dir $dest
  Move-TreeContents $gp2 $dest
}
$gn = Join-Path $ReviewRoot "Global_Navigation"
if (Test-Path $gn) {
  Get-ChildItem $gn -File | ForEach-Object { Move-Safe $_.FullName (Join-Path $ReviewRoot "Global_UI") }
}

# G) Party_Master_Phases → Party_Master
$pm = Join-Path $ReviewRoot "Party_Master_Phases"
if (Test-Path $pm) {
  Move-TreeContents $pm (Join-Path $ReviewRoot "Party_Master")
}

# H) Platform_Phases → Platform
$pp = Join-Path $ReviewRoot "Platform_Phases"
if (Test-Path $pp) {
  Move-TreeContents $pp (Join-Path $ReviewRoot "Platform")
}

# I) PDF_Generation → PDF
$pdf = Join-Path $ReviewRoot "PDF_Generation"
if (Test-Path $pdf) {
  Get-ChildItem $pdf -File | ForEach-Object { Move-Safe $_.FullName (Join-Path $ReviewRoot "PDF") }
}

# J) Meta → 00_Meta
$meta = Join-Path $ReviewRoot "Meta"
if (Test-Path $meta) {
  Move-TreeContents $meta (Join-Path $ReviewRoot "00_Meta")
}

# K) Branding / Reports / Realtime / Audits / Project_Summaries / screenshots already named OK
#    (ensure they exist; no rename needed)

# L) Loose files in implementation_Review root (docs only)
Get-ChildItem $ReviewRoot -File | Where-Object {
  $_.Name -notin @("README.md") -and $_.Extension -match '\.(md|sql|docx|png|jpg|csv)$'
} | ForEach-Object {
  $mod = Classify-ReviewName $_.Name
  Move-Safe $_.FullName (Join-Path $ReviewRoot $mod)
}

# M) Repo-root orphan MD plans (not AGENTS/CLAUDE/README)
Get-ChildItem $Root -File -Filter "*.md" | Where-Object {
  $_.Name -notin @("AGENTS.md","CLAUDE.md","README.md")
} | ForEach-Object {
  $mod = Classify-ReviewName $_.Name
  # generic names → Meta
  if ($_.Name -in @("implementation_report.md","uat_report.md")) { $mod = "00_Meta" }
  Move-Safe $_.FullName (Join-Path $ReviewRoot $mod)
}

# N) Phase_002F_3A_Master_Data_Inventory at repo root — move MD only; DO NOT touch nested src
$p3a = Join-Path $Root "Phase_002F_3A_Master_Data_Inventory"
if (Test-Path $p3a) {
  $dest = Join-Path (Join-Path $ReviewRoot "Foundation") "Phase_002F_3A_Master_Data_Inventory"
  Ensure-Dir $dest
  Get-ChildItem $p3a -File | Where-Object { $_.Extension -eq ".md" } | ForEach-Object {
    Move-Safe $_.FullName $dest
  }
  # nested Phase_002F_3A_Master_Data_Inventory folder if only docs
  $nested = Join-Path $p3a "Phase_002F_3A_Master_Data_Inventory"
  if (Test-Path $nested) {
    Get-ChildItem $nested -Recurse -File | Where-Object { $_.Extension -eq ".md" } | ForEach-Object {
      Move-Safe $_.FullName $dest
    }
  }
  # Leave src/ in place under the root folder (user said don't touch app files).
  # If only src remains, leave a note folder — do NOT delete src.
  Log "NOTE  Left Phase_002F_3A_Master_Data_Inventory\\src untouched (app snapshot)"
}

# Clean empty old review folders
foreach ($old in @(
  "HR_Module","HR_Phases","DMS_Module","DMS_Phases","AI_Enhancement","Common_AI",
  "Foundation_Phases","Global_Phases","Global_Navigation","Party_Master_Phases",
  "Platform_Phases","PDF_Generation","Meta"
)) {
  Remove-EmptyDirs (Join-Path $ReviewRoot $old)
}
Remove-EmptyDirs $ReviewRoot

# Ensure module dirs exist
foreach ($m in $ReviewModules) { Ensure-Dir (Join-Path $ReviewRoot $m) }

# Final empty sweep under ChatGPT Completed Phases remnants
Remove-EmptyDirs $ChatRoot

Log "===== DONE ====="
Write-Host "`nLog written to $Log"
