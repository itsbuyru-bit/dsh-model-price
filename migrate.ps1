#requires -Version 5.1
<#
.SYNOPSIS
  Move a DeepSeek Harness workspace (chat history, plugin, plugin settings)
  between computers.

.DESCRIPTION
  Export mode (default when no archive is next to this script):
    Packs the workspace's session logs, workspace registration, the
    dsh-model-price settings and the plugin sources into
    dsh-migration-<machine>-<date>.zip next to this script.

  Import mode (default when dsh-migration-*.zip is next to this script):
    Asks whether to install the archive, then restores sessions, merges the
    workspace registration, copies the settings and extracts the plugin.

  Run it with migrate.cmd (double-click) or:
    powershell -ExecutionPolicy Bypass -File scripts\migrate.ps1

.PARAMETER Workspace
  Workspace path on this machine. Defaults to the current directory.

.PARAMETER ZipPath
  Explicit archive to import. Defaults to the newest dsh-migration-*.zip
  next to the script.

.PARAMETER DshHome
  DSH home directory. Defaults to $env:DSH_HOME or ~/.dsh.

.PARAMETER Export / Import
  Force a mode instead of auto-detection.

.PARAMETER Yes
  Do not ask for confirmation.
#>
[CmdletBinding()]
param(
  [string]$Workspace = '',
  [string]$ZipPath = '',
  [string]$DshHome = '',
  [string]$OutDir = '',
  [switch]$Export,
  [switch]$Import,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$script:ScriptRoot = $PSScriptRoot
$script:Stamp = Get-Date -Format 'yyyyMMdd-HHmm'

function Write-Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Warn([string]$Text) { Write-Host "  ! $Text" -ForegroundColor Yellow }
function Die([string]$Text) { Write-Host "  x $Text" -ForegroundColor Red; exit 1 }

function Ask-Yes([string]$Question) {
  if ($Yes) { return $true }
  $answer = Read-Host "$Question [y/N]"
  return ($answer -match '^(y|yes|д|да)$')
}

function Resolve-DshHome([string]$Given) {
  if ($Given) { return (Resolve-Path $Given).Path }
  if ($env:DSH_HOME) { return (Resolve-Path $env:DSH_HOME).Path }
  $home = Join-Path $env:USERPROFILE '.dsh'
  if (-not (Test-Path $home)) { Die "DSH home not found at $home - pass -DshHome." }
  return (Resolve-Path $home).Path
}

function Get-WorkspaceKey([string]$Path) {
  $trimmed = $Path.TrimEnd('\', '/')
  $flat = $trimmed -replace '[:\\/]+', '-'
  return "--$flat--"
}

function Resolve-Workspace([string]$Given) {
  if ($Given) {
    if (-not (Test-Path $Given)) { Die "Workspace path does not exist: $Given" }
    return (Resolve-Path $Given).Path
  }
  $current = (Get-Location).Path
  if (Test-Path (Join-Path $current 'plugins')) { return $current }
  # The script sits in <workspace>\plugins\<plugin>.
  if (Test-Path (Join-Path $script:ScriptRoot 'package.json')) {
    $pluginsDir = Split-Path $script:ScriptRoot -Parent
    if ((Split-Path $pluginsDir -Leaf) -eq 'plugins') {
      return (Split-Path $pluginsDir -Parent)
    }
  }
  return $current
}

function Find-LocalArchive {
  $candidates = @()
  foreach ($dir in @($script:ScriptRoot, (Join-Path $script:ScriptRoot 'migration'))) {
    if (Test-Path $dir) {
      $candidates += Get-ChildItem $dir -Filter 'dsh-migration-*.zip' -File -ErrorAction SilentlyContinue
    }
  }
  if ($candidates.Count -eq 0) { return '' }
  return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

function Find-Node {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $runtimeRoot = Join-Path (Resolve-DshHome $DshHome) 'dsh-runtimes'
  if (Test-Path $runtimeRoot) {
    $candidate = Get-ChildItem $runtimeRoot -Recurse -Filter 'node.exe' -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
  }
  return ''
}

function Rewrite-SessionCwd([string]$SessionFile, [string]$OldCwd, [string]$NewCwd) {
  $node = Find-Node
  if (-not $node) { Die "Node.js not found: required to rewrite the session cwd. Install Node 22+ or keep the same workspace path." }
  $helper = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-migrate-rewrite-{0}.mjs" -f ([guid]::NewGuid().ToString('N')))
  $code = @'
import fs from 'node:fs'
import zlib from 'node:zlib'
const [file, oldCwd, newCwd] = process.argv.slice(2)
const raw = zlib.zstdDecompressSync(fs.readFileSync(file)).toString('utf8')
const lines = raw.split('\n')
const header = JSON.parse(lines[0])
if (header.cwd === oldCwd) header.cwd = newCwd
lines[0] = JSON.stringify(header)
fs.writeFileSync(file, zlib.zstdCompressSync(Buffer.from(lines.join('\n'))))
'@
  Set-Content -Path $helper -Value $code -Encoding UTF8
  try {
    & $node $helper $SessionFile $OldCwd $NewCwd
    if ($LASTEXITCODE -ne 0) { Die "Session rewrite failed for $SessionFile" }
  } finally {
    Remove-Item $helper -Force -ErrorAction SilentlyContinue
  }
}

function New-MinimalWorkspaceStore([string]$WorkspacePath, [string]$Id, [string[]]$SessionIds) {
  $entry = [ordered]@{
    path = $WorkspacePath
    title = (Split-Path $WorkspacePath -Leaf)
    sessionIds = @($SessionIds)
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  return [pscustomobject]@{
    unit = [pscustomobject]@{ name = 'workspace'; version = 2 }
    global = [pscustomobject]@{
      initialized = $true
      defaultWorkspaceId = $Id
      workspaceIds = @($Id)
      archivedSessionIds = @()
      pinnedSessionIds = @()
    }
    tables = [pscustomobject]@{
      workspaces = [pscustomobject]@{ $Id = [pscustomobject]$entry }
    }
  }
}

function Export-Migration {
  $workspacePath = Resolve-Workspace $Workspace
  $dsh = Resolve-DshHome $DshHome
  $key = Get-WorkspaceKey $workspacePath
  $sessionsDir = Join-Path $dsh (Join-Path 'sessions' $key)
  if (-not (Test-Path $sessionsDir)) {
    Die "No session folder for this workspace: $sessionsDir`nOpen the workspace in DSH once, then retry."
  }

  Write-Step "Exporting $workspacePath"
  $staging = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-migration-{0}" -f ([guid]::NewGuid().ToString('N')))
  New-Item -ItemType Directory -Path $staging -Force | Out-Null

  try {
    $sessionsTarget = Join-Path $staging (Join-Path 'sessions' $key)
    New-Item -ItemType Directory -Path $sessionsTarget -Force | Out-Null
    Copy-Item (Join-Path $sessionsDir '*') $sessionsTarget -Recurse -Force
    Write-Host "  sessions: $(Get-ChildItem $sessionsTarget -Directory | Measure-Object | Select-Object -ExpandProperty Count) folders"

    $workspaceFile = Join-Path $dsh 'storages\workspace.json'
    if (Test-Path $workspaceFile) {
      New-Item -ItemType Directory -Path (Join-Path $staging 'storages') -Force | Out-Null
      Copy-Item $workspaceFile (Join-Path $staging 'storages\workspace.json') -Force
      Write-Host '  workspace registration: copied'
    }

    $spendDir = Join-Path $dsh 'api-spend'
    if (Test-Path $spendDir) {
      $spendTarget = Join-Path $staging 'api-spend'
      New-Item -ItemType Directory -Path $spendTarget -Force | Out-Null
      foreach ($name in @('config.json', 'totals.json')) {
        $file = Join-Path $spendDir $name
        if (Test-Path $file) { Copy-Item $file (Join-Path $spendTarget $name) -Force }
      }
      Write-Host '  plugin settings: copied'
    }

    $pluginRoot = $script:ScriptRoot
    if (Test-Path (Join-Path $pluginRoot 'package.json')) {
      $pluginTarget = Join-Path $staging 'plugin'
      New-Item -ItemType Directory -Path $pluginTarget -Force | Out-Null
      $exclude = @('.git', 'node_modules', 'migration', '.scratch')
      Get-ChildItem $pluginRoot -Force | Where-Object { $exclude -notcontains $_.Name -and $_.Name -notlike 'dsh-migration-*.zip' } | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $pluginTarget $_.Name) -Recurse -Force
      }
      Write-Host '  plugin sources: copied'
    }

    $sessionFolders = @(Get-ChildItem $sessionsTarget -Directory | Where-Object { $_.Name -like 'session-*' } | Select-Object -ExpandProperty Name)
    $pluginVersion = ''
    $pluginManifest = Join-Path $pluginRoot 'package.json'
    if (Test-Path $pluginManifest) {
      $pluginVersion = (Get-Content $pluginManifest -Raw | ConvertFrom-Json).version
    }
    $manifest = [ordered]@{
      format = 1
      createdAt = (Get-Date).ToUniversalTime().ToString('o')
      sourceMachine = $env:COMPUTERNAME
      workspacePath = $workspacePath
      workspaceKey = $key
      sessionIds = @($sessionFolders)
      pluginVersion = $pluginVersion
    }
    Set-Content -Path (Join-Path $staging 'manifest.json') -Value ($manifest | ConvertTo-Json -Depth 10) -Encoding UTF8

    $outDirectory = if ($OutDir) { $OutDir } else { $script:ScriptRoot }
    if (-not (Test-Path $outDirectory)) { New-Item -ItemType Directory -Path $outDirectory -Force | Out-Null }
    $archive = Join-Path $outDirectory ("dsh-migration-{0}-{1}.zip" -f $env:COMPUTERNAME, $script:Stamp)
    if (Test-Path $archive) { Remove-Item $archive -Force }
    Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $archive -CompressionLevel Optimal
    Write-Step "Archive created"
    Write-Host "  $archive"
    Write-Host "  size: $([math]::Round((Get-Item $archive).Length / 1MB, 2)) MB"
    Write-Host ''
    Write-Host 'Copy this archive next to migrate.ps1 on the other PC and run it again.' -ForegroundColor Green
  } finally {
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Merge-WorkspaceStore([string]$SourceFile, [string]$TargetFile, [string]$TargetPath, [string[]]$SessionIds) {
  $source = $null
  if (Test-Path $SourceFile) { $source = Get-Content $SourceFile -Raw | ConvertFrom-Json }
  $target = $null
  if (Test-Path $TargetFile) { $target = Get-Content $TargetFile -Raw | ConvertFrom-Json }

  if (-not $target) {
    $id = [guid]::NewGuid().ToString()
    $target = New-MinimalWorkspaceStore $TargetPath $id $SessionIds
    return $target
  }

  if (-not $target.tables) { $target | Add-Member -NotePropertyName tables -NotePropertyValue ([pscustomobject]@{}) -Force }
  if (-not $target.tables.workspaces) { $target.tables | Add-Member -NotePropertyName workspaces -NotePropertyValue ([pscustomobject]@{}) -Force }

  $existing = $null
  foreach ($prop in $target.tables.workspaces.PSObject.Properties) {
    if ($prop.Value.path -and ($prop.Value.path -ieq $TargetPath)) { $existing = $prop; break }
  }

  if ($existing) {
    $merged = @($existing.Value.sessionIds) + $SessionIds
    $existing.Value.sessionIds = @($merged | Select-Object -Unique)
    $existing.Value.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  } else {
    $id = [guid]::NewGuid().ToString()
    $entry = [pscustomobject]@{
      path = $TargetPath
      title = (Split-Path $TargetPath -Leaf)
      sessionIds = @($SessionIds)
      createdAt = (Get-Date).ToUniversalTime().ToString('o')
      updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $target.tables.workspaces | Add-Member -NotePropertyName $id -NotePropertyValue $entry -Force
    $target.global.workspaceIds = @($target.global.workspaceIds) + $id
    if (-not $target.global.defaultWorkspaceId) { $target.global.defaultWorkspaceId = $id }
  }
  return $target
}

function Import-Migration([string]$Archive) {
  if (-not (Test-Path $Archive)) { Die "Archive not found: $Archive" }
  Write-Step "Archive: $Archive"
  $confirm = Ask-Yes 'Install this chat on this computer?'
  if (-not $confirm) { Write-Host 'Cancelled.'; return }

  $dsh = Resolve-DshHome $DshHome
  $staging = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-import-{0}" -f ([guid]::NewGuid().ToString('N')))
  New-Item -ItemType Directory -Path $staging -Force | Out-Null

  try {
    Expand-Archive -Path $Archive -DestinationPath $staging -Force
    $manifestFile = Join-Path $staging 'manifest.json'
    if (-not (Test-Path $manifestFile)) { Die 'Not a dsh-migration archive: manifest.json is missing.' }
    $manifest = Get-Content $manifestFile -Raw | ConvertFrom-Json
    if ($manifest.format -ne 1) { Write-Warn "Unknown archive format $($manifest.format); trying anyway." }

    $sourcePath = [string]$manifest.workspacePath
    $targetPath = if ($Workspace) { (Resolve-Path $Workspace).Path } else { $sourcePath }
    if (-not (Test-Path $targetPath)) {
      if (Ask-Yes "Workspace $targetPath is missing. Create it?") {
        New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
      } else {
        Die 'Workspace path is required.'
      }
    }
    if ($targetPath -ne $sourcePath) {
      Write-Warn "Session cwd will be rewritten: $sourcePath -> $targetPath"
    }

    $sourceKey = if ($manifest.workspaceKey) { [string]$manifest.workspaceKey } else { Get-WorkspaceKey $sourcePath }
    $sourceSessions = Join-Path $staging (Join-Path 'sessions' $sourceKey)
    if (-not (Test-Path $sourceSessions)) { Die "Archive has no sessions folder for $sourceKey." }
    $sessionIds = @($manifest.sessionIds)
    if ($sessionIds.Count -eq 0) {
      $sessionIds = @(Get-ChildItem $sourceSessions -Directory | Where-Object { $_.Name -like 'session-*' } | Select-Object -ExpandProperty Name)
    }

    if ($targetPath -ne $sourcePath) {
      Get-ChildItem $sourceSessions -Recurse -Filter '*.zstd' -File | ForEach-Object {
        Rewrite-SessionCwd $_.FullName $sourcePath $targetPath
      }
    }

    $targetKey = Get-WorkspaceKey $targetPath
    $targetSessions = Join-Path $dsh (Join-Path 'sessions' $targetKey)
    if (Test-Path $targetSessions) {
      if (-not (Ask-Yes "Sessions for $targetPath already exist. Merge into them?")) { Write-Host 'Cancelled.'; return }
    }
    New-Item -ItemType Directory -Path $targetSessions -Force | Out-Null
    Get-ChildItem $sourceSessions -Force | ForEach-Object {
      $destination = Join-Path $targetSessions $_.Name
      if (Test-Path $destination) { Remove-Item $destination -Recurse -Force }
      Copy-Item $_.FullName $destination -Recurse -Force
    }
    Write-Host "  sessions restored: $($sessionIds.Count)"

    $workspaceFile = Join-Path $dsh 'storages\workspace.json'
    New-Item -ItemType Directory -Path (Split-Path $workspaceFile -Parent) -Force | Out-Null
    if (Test-Path $workspaceFile) {
      Copy-Item $workspaceFile "$workspaceFile.bak-$script:Stamp" -Force
      Write-Host "  backup: $workspaceFile.bak-$script:Stamp"
    }
    $merged = Merge-WorkspaceStore (Join-Path $staging 'storages\workspace.json') $workspaceFile $targetPath $sessionIds
    $merged | ConvertTo-Json -Depth 30 | Set-Content -Path $workspaceFile -Encoding UTF8
    Write-Host '  workspace registration: merged'

    $configSource = Join-Path $staging 'api-spend\config.json'
    if (Test-Path $configSource) {
      $spendTarget = Join-Path $dsh 'api-spend'
      New-Item -ItemType Directory -Path $spendTarget -Force | Out-Null
      $configTarget = Join-Path $spendTarget 'config.json'
      if (Test-Path $configTarget) {
        Copy-Item $configSource (Join-Path $spendTarget "config.imported-$script:Stamp.json") -Force
        Write-Warn 'Existing plugin config kept; imported copy saved as config.imported-*.json'
      } else {
        Copy-Item $configSource $configTarget -Force
      }
      $totalsSource = Join-Path $staging 'api-spend\totals.json'
      if ((Test-Path $totalsSource) -and -not (Test-Path (Join-Path $spendTarget 'totals.json'))) {
        Copy-Item $totalsSource (Join-Path $spendTarget 'totals.json') -Force
      }
      Write-Host '  plugin settings: restored'
    }

    $pluginSource = Join-Path $staging 'plugin'
    if (Test-Path (Join-Path $pluginSource 'package.json')) {
      $pluginTarget = Join-Path $targetPath 'plugins\dsh-model-price'
      if (Test-Path $pluginTarget) {
        Write-Warn "Plugin already exists at $pluginTarget - not overwritten."
      } else {
        New-Item -ItemType Directory -Path (Split-Path $pluginTarget -Parent) -Force | Out-Null
        Copy-Item $pluginSource $pluginTarget -Recurse -Force
        Write-Host "  plugin extracted: $pluginTarget"
      }
    }

    Write-Step 'Done'
    Write-Host "  workspace: $targetPath"
    Write-Host "  sessions : $targetSessions"
    Write-Host ''
    Write-Host 'Next steps:' -ForegroundColor Green
    Write-Host '  1. Start DeepSeek Harness and open the workspace above.'
    Write-Host "  2. Settings -> Plugins -> Add plugin: link:$pluginTarget"
    Write-Host '  3. Sign in to the DeepSeek account again (credentials are not copied).'
  } finally {
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# ----- entry point ---------------------------------------------------------

if (-not $ZipPath) {
  $ZipPath = Find-LocalArchive
}

$mode = $null
if ($Import) { $mode = 'import' }
elseif ($Export) { $mode = 'export' }
elseif ($ZipPath) { $mode = 'import' }
else { $mode = 'export' }

try {
  if ($mode -eq 'import') {
    if (-not $ZipPath) { Die 'No dsh-migration-*.zip found next to the script. Pass -ZipPath.' }
    Import-Migration (Resolve-Path $ZipPath).Path
  } else {
    Export-Migration
  }
} catch {
  Write-Host ''
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
