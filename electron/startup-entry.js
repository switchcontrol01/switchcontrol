'use strict';

const crypto = require('crypto');

const DELAY_OPTIONS = Object.freeze({
  PT30S: 'PT30S',
  PT1M: 'PT1M',
  PT2M: 'PT2M',
  PT5M: 'PT5M',
});
const DELAY_TASK_PREFIX = 'SC-Delay-';
const DELAY_DESCRIPTION_PREFIX = 'SCStartupDelay:v1:';

function resolveStartupEntry(location, name) {
  const normalized = String(location || '').replace(/^HKLM:/i, 'HKLM').replace(/^HKCU:/i, 'HKCU').replace(/\//g, '\\').toLowerCase();
  const isRunKey = /\\software\\microsoft\\windows\\currentversion\\run$/.test(normalized);
  const source = isRunKey && /^(?:hklm|hkey_local_machine)(?:\\|$)/.test(normalized)
    ? 'registry-hklm'
    : isRunKey && /^(?:hkcu|hkey_current_user)(?:\\|$)/.test(normalized)
      ? 'registry-hkcu'
      : null;
  if (!source || typeof name !== 'string' || !name.trim() || name.length > 256 || /[\u0000-\u001f]/.test(name)) {
    return { source: null, registryKey: null, registryName: null, delaySupported: false };
  }
  const registryKey = source === 'registry-hklm' ? 'HKLM:' : 'HKCU:';
  return {
    source,
    registryKey,
    registryName: name,
    delaySupported: true,
    taskName: makeDelayTaskName(name, registryKey),
  };
}

function makeDelayTaskName(name, registryKey) {
  const safeName = String(name || '').replace(/[^A-Za-z0-9._ -]/g, '').trim().replace(/\s+/g, '-').slice(0, 48) || 'Entry';
  const digest = crypto.createHash('sha256').update(`${registryKey}|${name}`).digest('hex').slice(0, 10);
  return `${DELAY_TASK_PREFIX}${safeName}-${digest}`;
}

function parseStartupCommand(command) {
  if (typeof command !== 'string' || command.length > 2048 || /[\u0000-\u001f]/.test(command)) return null;
  const value = command.trim();
  const quoted = /^"([^"]+\.exe)"(?:\s+(.*))?$/i.exec(value);
  const unquoted = quoted ? null : /^([A-Za-z]:\\[^"]*?\.exe)(?:\s+(.*))?$/i.exec(value);
  const match = quoted || unquoted;
  if (!match || /[%;&|`<>]/.test(match[1])) return null;
  const executable = match[1].trim();
  if (!/^(?:[A-Za-z]:\\|\\\\)/.test(executable) || executable.split('\\').some(part => part === '..')) return null;
  return { executable, arguments: (match[2] || '').trim() };
}

function startupApprovedPath(registryKey) {
  const hive = registryKey === 'HKLM:' ? 'HKLM:' : registryKey === 'HKCU:' ? 'HKCU:' : null;
  if (!hive) return null;
  return `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run`;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSetEnabledScript({ registryKey, registryName, taskName }, enabled) {
  const path = startupApprovedPath(registryKey);
  if (!path || !registryName || !taskName) throw new Error('This startup entry cannot be changed safely.');
  const flag = enabled ? 2 : 3;
  const task = psQuote(taskName);
  const pathLiteral = psQuote(path);
  const nameLiteral = psQuote(registryName);
  const legacyTask = psQuote(`SC-Delay-${String(registryName).replace(/[^a-zA-Z0-9]/g, '-').slice(0, 64)}`);
  const marker = 'SCSTARTUP_ENABLED:OK';
  return `
$ErrorActionPreference = 'Stop'
$previousBytes = $null
$previousTaskXml = $null
$legacyTaskXml = $null
$changed = $false
try {
  $source = Get-ItemProperty -LiteralPath ${psQuote(`${registryKey}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run`)} -Name ${nameLiteral} -ErrorAction Stop
  if (-not $source.PSObject.Properties[${nameLiteral}]) { throw 'The original startup entry no longer exists.' }
  $runCommand = [string]$source.PSObject.Properties[${nameLiteral}].Value
  $exeMatch = [regex]::Match($runCommand.Trim(), '^(?:"([^"]+\\.exe)"|(.+?\\.exe))(?:\\s|$)', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $runExe = if ($exeMatch.Groups[1].Success) { $exeMatch.Groups[1].Value } else { $exeMatch.Groups[2].Value }
  $legacy = Get-ScheduledTask -TaskName ${legacyTask} -ErrorAction SilentlyContinue
  if ($legacy -and -not $legacy.Description -and $runExe -and [string]$legacy.Actions[0].Execute -eq $runExe) {
    $legacyTaskXml = Export-ScheduledTask -TaskName ${legacyTask} -ErrorAction Stop
  }
  $property = (Get-ItemProperty -LiteralPath ${pathLiteral} -ErrorAction SilentlyContinue).PSObject.Properties[${nameLiteral}]
  if ($property -and $property.Value -is [byte[]]) { $previousBytes = [byte[]]$property.Value }
  $task = Get-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue
  if ($task -and $task.Description -like '${DELAY_DESCRIPTION_PREFIX}*') {
    $previousTaskXml = Export-ScheduledTask -TaskName ${task} -ErrorAction Stop
  }
  if (-not (Test-Path -LiteralPath ${pathLiteral})) { New-Item -Path ${pathLiteral} -Force | Out-Null }
  $value = [byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0)
  Set-ItemProperty -LiteralPath ${pathLiteral} -Name ${nameLiteral} -Value $value -Type Binary -Force -ErrorAction Stop
  $changed = $true
  $verify = (Get-ItemProperty -LiteralPath ${pathLiteral} -Name ${nameLiteral} -ErrorAction Stop).PSObject.Properties[${nameLiteral}].Value
  if (-not $verify -or [int]$verify[0] -ne ${flag}) { throw 'Windows did not confirm the requested StartupApproved state.' }
  if ($previousTaskXml) {
    Unregister-ScheduledTask -TaskName ${task} -Confirm:$false -ErrorAction Stop
    if (Get-ScheduledTask -TaskName ${task} -ErrorAction SilentlyContinue) { throw 'Windows did not remove the delayed task.' }
  }
  if ($legacyTaskXml) { Unregister-ScheduledTask -TaskName ${legacyTask} -Confirm:$false -ErrorAction Stop }
  Write-Output '${marker}'
} catch {
  if ($changed) {
    if ($previousBytes) {
      Set-ItemProperty -LiteralPath ${pathLiteral} -Name ${nameLiteral} -Value $previousBytes -Type Binary -Force -ErrorAction SilentlyContinue
    } else { Remove-ItemProperty -LiteralPath ${pathLiteral} -Name ${nameLiteral} -ErrorAction SilentlyContinue }
    if ($previousTaskXml) { Register-ScheduledTask -TaskName ${task} -Xml $previousTaskXml -Force -ErrorAction SilentlyContinue | Out-Null }
    if ($legacyTaskXml) { Register-ScheduledTask -TaskName ${legacyTask} -Xml $legacyTaskXml -Force -ErrorAction SilentlyContinue | Out-Null }
  }
  Write-Error $_; exit 1
}`;
}

function buildSetDelayScript({ registryKey, registryName, taskName }, executable, args, delayIso, originalCommand) {
  const path = startupApprovedPath(registryKey);
  if (!path || !registryName || !taskName) throw new Error('Choose a supported Run-key startup entry.');
  if (!Object.hasOwn(DELAY_OPTIONS, delayIso)) throw new Error('Choose one of the offered delay times.');
  if (!/^(?:[A-Za-z]:\\|\\\\)/.test(executable) || executable.length > 512) throw new Error('The startup command must use an absolute Windows executable path.');
  const pathLiteral = psQuote(path);
  const nameLiteral = psQuote(registryName);
  const taskLiteral = psQuote(taskName);
  const exeLiteral = psQuote(executable);
  const argsLiteral = psQuote(args);
  const delayLiteral = psQuote(DELAY_OPTIONS[delayIso]);
  const workingDirectory = require('path').win32.dirname(executable);
  const descriptionPrefix = DELAY_DESCRIPTION_PREFIX;
  const legacyTask = psQuote(`SC-Delay-${String(registryName).replace(/[^a-zA-Z0-9]/g, '-').slice(0, 64)}`);
  const identity = registryKey === 'HKLM:'
    ? "$principal = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited"
    : "$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name; $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user; $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited";
  return `
$ErrorActionPreference = 'Stop'
$approvedPath = ${pathLiteral}
$entryName = ${nameLiteral}
$taskName = ${taskLiteral}
$descriptionPrefix = '${descriptionPrefix}'
$taskCreated = $false
$rollbackBytes = $null
$previousTaskXml = $null
$legacyTaskXml = $null
try {
  $source = Get-ItemProperty -LiteralPath ${psQuote(`${registryKey}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run`)} -Name $entryName -ErrorAction Stop
  $sourceCommand = [string]$source.PSObject.Properties[$entryName].Value
  if ($sourceCommand.Trim() -ne ${psQuote(originalCommand ?? `"${executable}"${args ? ` ${args}` : ''}`)}.Trim()) { throw 'The startup command changed. Refresh the startup list before retrying.' }
  $legacy = Get-ScheduledTask -TaskName ${legacyTask} -ErrorAction SilentlyContinue
  if ($legacy -and -not $legacy.Description -and [string]$legacy.Actions[0].Execute -eq ${exeLiteral}) {
    $legacyTaskXml = Export-ScheduledTask -TaskName ${legacyTask} -ErrorAction Stop
  }
  if (-not (Test-Path -LiteralPath $approvedPath)) { New-Item -Path $approvedPath -Force | Out-Null }
  $currentTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($currentTask) {
    if ($currentTask.Description -notlike ($descriptionPrefix + '*')) { throw 'A different task already owns this task name.' }
    $previousTaskXml = Export-ScheduledTask -TaskName $taskName -ErrorAction Stop
  }
  $currentProperty = (Get-ItemProperty -LiteralPath $approvedPath -ErrorAction SilentlyContinue).PSObject.Properties[$entryName]
  if ($currentProperty -and $currentProperty.Value -is [byte[]]) { $rollbackBytes = [byte[]]$currentProperty.Value }
  $backup = $null
  if ($currentTask -and $currentTask.Description -like ($descriptionPrefix + '*')) {
    $backupJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($currentTask.Description.Substring($descriptionPrefix.Length)))
    $backup = $backupJson | ConvertFrom-Json -ErrorAction Stop
  }
  if (-not $backup) {
    $priorBytes = if ($currentProperty -and $currentProperty.Value -is [byte[]]) { [Convert]::ToBase64String($currentProperty.Value) } else { $null }
    $backup = [PSCustomObject]@{ version = 1; registryKey = ${psQuote(registryKey)}; registryName = $entryName; priorBytes = $priorBytes; delayIso = ${delayLiteral} }
  }
  $backup | Add-Member -NotePropertyName delayIso -NotePropertyValue ${delayLiteral} -Force
  $backupJson = $backup | ConvertTo-Json -Compress
  $description = $descriptionPrefix + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($backupJson))
  if (-not (Test-Path -LiteralPath ${exeLiteral})) { throw 'The startup executable was not found.' }
  $action = New-ScheduledTaskAction -Execute ${exeLiteral}${args ? ` -Argument ${argsLiteral}` : ''} -WorkingDirectory ${psQuote(workingDirectory)}
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  ${identity}
  $trigger.Delay = ${delayLiteral}
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $description -Force -ErrorAction Stop | Out-Null
  $taskCreated = $true
  $disabled = [byte[]](3,0,0,0,0,0,0,0,0,0,0,0)
  Set-ItemProperty -LiteralPath $approvedPath -Name $entryName -Value $disabled -Type Binary -Force -ErrorAction Stop
  $verify = (Get-ItemProperty -LiteralPath $approvedPath -Name $entryName -ErrorAction Stop).PSObject.Properties[$entryName].Value
  $verifyTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if (-not $verify -or [int]$verify[0] -ne 3 -or -not $verifyTask) { throw 'Windows did not confirm the delayed startup entry.' }
  $actualDelay = [Xml.XmlConvert]::ToTimeSpan([string]$verifyTask.Triggers[0].Delay).TotalSeconds
  $expectedDelay = [Xml.XmlConvert]::ToTimeSpan(${delayLiteral}).TotalSeconds
  if ($actualDelay -ne $expectedDelay -or [string]$verifyTask.Actions[0].Execute -ne ${exeLiteral} -or [string]$verifyTask.Actions[0].Arguments -ne ${argsLiteral}) { throw 'The delayed task does not match the requested command or delay.' }
  if ($legacyTaskXml) { Unregister-ScheduledTask -TaskName ${legacyTask} -Confirm:$false -ErrorAction Stop }
  Write-Output 'SCSTARTUP_DELAY:OK'
} catch {
  if ($taskCreated) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    if ($rollbackBytes) {
      Set-ItemProperty -LiteralPath $approvedPath -Name $entryName -Value $rollbackBytes -Type Binary -Force -ErrorAction SilentlyContinue
    } else {
      Remove-ItemProperty -LiteralPath $approvedPath -Name $entryName -ErrorAction SilentlyContinue
    }
    if ($previousTaskXml) { Register-ScheduledTask -TaskName $taskName -Xml $previousTaskXml -Force -ErrorAction SilentlyContinue | Out-Null }
    if ($legacyTaskXml) { Register-ScheduledTask -TaskName ${legacyTask} -Xml $legacyTaskXml -Force -ErrorAction SilentlyContinue | Out-Null }
  }
  Write-Error $_
  exit 1
}`;
}

function buildStartupStatusScript(entries) {
  const encoded = Buffer.from(JSON.stringify(entries), 'utf8').toString('base64');
  return `
$ErrorActionPreference = 'Stop'
$entries = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json -ErrorAction Stop
$result = foreach ($entry in $entries) {
  $property = (Get-ItemProperty -LiteralPath $entry.approvedPath -ErrorAction SilentlyContinue).PSObject.Properties[[string]$entry.registryName]
  $enabled = if (-not $property) { $true } elseif ($property.Value -is [byte[]] -and $property.Value.Length -gt 0) { [int]$property.Value[0] -ne 3 } else { $null }
  $match = Get-ScheduledTask -TaskName ([string]$entry.taskName) -ErrorAction SilentlyContinue
  $delayIso = $null
  if ($match -and $match.Description -like '${DELAY_DESCRIPTION_PREFIX}*') {
    try {
      $data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($match.Description.Substring('${DELAY_DESCRIPTION_PREFIX}'.Length))) | ConvertFrom-Json -ErrorAction Stop
      $delayIso = [string]$data.delayIso
    } catch {}
  }
  [PSCustomObject]@{ registryName = $entry.registryName; registryKey = $entry.registryKey; enabled = $enabled; delayIso = $delayIso }
}
$result | ConvertTo-Json -Compress`;
}

module.exports = {
  DELAY_OPTIONS, DELAY_DESCRIPTION_PREFIX, resolveStartupEntry, makeDelayTaskName,
  parseStartupCommand, startupApprovedPath, buildSetEnabledScript,
  buildSetDelayScript, buildStartupStatusScript,
};
