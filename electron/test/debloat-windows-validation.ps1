[CmdletBinding()]
param(
  [string]$OutputPath = ".\debloat-windows-evidence.json"
)

$ErrorActionPreference = "Stop"

function New-Record {
  param(
    [string]$Type,
    [string]$Target,
    [scriptblock]$Probe,
    [scriptblock]$Independent
  )

  $raw = $null
  $probeError = $null
  try {
    $raw = & $Probe
  } catch {
    $probeError = $_.Exception.Message
  }

  $independentRaw = $null
  $independentError = $null
  try {
    $independentRaw = & $Independent
  } catch {
    $independentError = $_.Exception.Message
  }

  $state = "unknown"
  if ($probeError) {
    $state = "unknown"
  } elseif ($Type -eq "appx") {
    $state = if (@($raw).Count -gt 0) { "present" } else { "absent" }
  } elseif ($Type -eq "registry") {
    $state = if ($null -eq $raw) { "absent" } elseif ([string]$raw -eq "0") { "absent" } else { "present" }
  } elseif ($Type -eq "service") {
    $state = if ($null -eq $raw) { "absent" } elseif ([string]$raw.StartMode -eq "Disabled") { "absent" } else { "present" }
  } else {
    $states = @($raw | ForEach-Object { if ($_.State -eq "Disabled") { "absent" } else { "present" } })
    $state = if ($states.Count -eq 0) { "unknown" } elseif ($states -contains "present") { "present" } else { "absent" }
  }

  $independentState = "unknown"
  if (-not $independentError) {
    if ($independentRaw -and $independentRaw.PSObject.Properties["state"]) {
      $independentState = [string]$independentRaw.state
    } elseif ($Type -eq "appx") {
      $independentState = if (@($independentRaw).Count -gt 0) { "present" } else { "absent" }
    } else {
      $independentState = "unknown"
    }
  }

  $conclusion = if ($state -eq "unknown" -or $independentState -eq "unknown") {
    "unknown"
  } elseif ($state -eq $independentState) {
    "yes"
  } else {
    "no"
  }

  [pscustomobject]@{
    type = $Type
    target = $Target
    rawProbeOutcome = if ($probeError) { @{ error = $probeError } } else { $raw }
    independentWindowsOutcome = if ($independentError) { @{ error = $independentError } } else { $independentRaw }
    normalizedProbeState = $state
    independentState = $independentState
    conclusion = $conclusion
  }
}

$records = @(
  (New-Record "appx" "Microsoft.WindowsFeedbackHub" `
    { @(Get-AppxPackage -Name "Microsoft.WindowsFeedbackHub" -ErrorAction Stop | Select-Object -ExpandProperty Name) } `
    { @(Get-AppxPackage -Name "Microsoft.WindowsFeedbackHub" -ErrorAction Stop | Select-Object -ExpandProperty PackageFullName) }),

  (New-Record "registry" "HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo\Enabled" `
    {
      if (!(Test-Path -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo" -ErrorAction Stop)) {
        $null
      } else {
        try { (Get-ItemProperty -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo" -Name "Enabled" -ErrorAction Stop).Enabled }
        catch [System.Management.Automation.PSArgumentException] { $null }
      }
    } `
    {
      $line = & reg.exe query "HKCU\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo" /v Enabled 2>&1
      if ($LASTEXITCODE -ne 0) { $null }
      elseif (($line | Select-String "Enabled").ToString() -match "0x0\b") {
        [pscustomobject]@{ state = "absent"; raw = ($line -join "`n") }
      } else {
        [pscustomobject]@{ state = "present"; raw = ($line -join "`n") }
      }
    }),

  (New-Record "service" "DiagTrack" `
    { Get-CimInstance Win32_Service -Filter "Name='DiagTrack'" -ErrorAction Stop | Select-Object -First 1 StartMode, State } `
    {
      $lines = @(sc.exe qc DiagTrack 2>&1)
      if ($LASTEXITCODE -ne 0) { $null }
      elseif (($lines -join "`n") -match "START_TYPE\s*:\s*\d+\s+DISABLED") {
        [pscustomobject]@{ state = "absent"; raw = ($lines -join "`n") }
      } else {
        [pscustomobject]@{ state = "present"; raw = ($lines -join "`n") }
      }
    }),

  (New-Record "task" "\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser" `
    { @(Get-ScheduledTask -TaskPath "\Microsoft\Windows\Application Experience\" -TaskName "Microsoft Compatibility Appraiser" -ErrorAction Stop | Select-Object State) } `
    {
      $lines = @(schtasks.exe /Query /TN "\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser" /FO LIST 2>&1)
      if ($LASTEXITCODE -ne 0) { $null }
      elseif (($lines -join "`n") -match "Status\s*:\s+Disabled") {
        [pscustomobject]@{ state = "absent"; raw = ($lines -join "`n") }
      } else {
        [pscustomobject]@{ state = "present"; raw = ($lines -join "`n") }
      }
    })
)

$evidence = [pscustomobject]@{
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  computer = $env:COMPUTERNAME
  windowsVersion = (Get-CimInstance Win32_OperatingSystem).Caption
  records = $records
}
$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
$evidence | ConvertTo-Json -Depth 8