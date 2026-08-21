$filePath = "electron/dist-frontend/patch-notes.json"

$oursRaw   = git show ":2:$filePath" 2>$null
$theirsRaw = git show ":3:$filePath" 2>$null

if (-not $oursRaw -or -not $theirsRaw) {
    Write-Host "ERROR: Could not read both sides of the conflict. Are you still mid-merge?" -ForegroundColor Red
    exit 1
}

try {
    $ours   = $oursRaw   | ConvertFrom-Json
    $theirs = $theirsRaw | ConvertFrom-Json
} catch {
    Write-Host "ERROR: One side is not valid JSON. Raw content below for manual review:" -ForegroundColor Red
    Write-Host "--- OURS ---"
    Write-Host $oursRaw
    Write-Host "--- THEIRS ---"
    Write-Host $theirsRaw
    exit 1
}

Write-Host "OURS version:   $($ours.version)   - $($ours.title)"
Write-Host "THEIRS version: $($theirs.version) - $($theirs.title)"

function Parse-Version($v) {
    try { return [version]$v } catch { return [version]"0.0.0" }
}

$oursVer   = Parse-Version $ours.version
$theirsVer = Parse-Version $theirs.version

if ($oursVer -ge $theirsVer) {
    Write-Host "Keeping OURS ($($ours.version)) - it is newer or equal." -ForegroundColor Green
    $winner = $ours
} else {
    Write-Host "Keeping THEIRS ($($theirs.version)) - it is newer." -ForegroundColor Yellow
    $winner = $theirs
}

$winner | ConvertTo-Json -Depth 10 | Set-Content -Path $filePath -Encoding UTF8

try {
    Get-Content $filePath -Raw | ConvertFrom-Json | Out-Null
    Write-Host "Validation passed - file is valid JSON." -ForegroundColor Green
} catch {
    Write-Host "ERROR: Resulting file is NOT valid JSON. Manual fix required." -ForegroundColor Red
    exit 1
}

git add $filePath
Write-Host ""
Write-Host "Resolved and staged $filePath." -ForegroundColor Green
Write-Host "Run 'git status' to confirm no more unmerged paths, then 'git commit' to finish the merge."
