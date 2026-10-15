# Registers the morning start and evening stop tasks and the Desktop shortcut.
$ErrorActionPreference = 'Stop'
$AppDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

# The start task runs node from Program Files or the PATH, and serves the built app.
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (-not (Test-Path $node) -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js was not found. Install Node 24 or newer from https://nodejs.org, then run this again.'
  exit 1
}
if (-not (Test-Path (Join-Path $AppDir 'client\dist\index.html'))) {
  Write-Host 'The app has not been built yet. Run "npm run setup" first, then run this again.'
  exit 1
}

$common = @{ AllowStartIfOnBatteries = $true; DontStopIfGoingOnBatteries = $true }
$startSettings = New-ScheduledTaskSettingsSet @common -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 72)
$startAction = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$AppDir\windows\start-server.vbs`"" -WorkingDirectory $AppDir
Register-ScheduledTask -TaskName 'The Grimoire - Start Morning' -Description 'Starts The Grimoire server at 5:30 AM.' `
  -Trigger (New-ScheduledTaskTrigger -Daily -At '5:30AM') -Action $startAction -Settings $startSettings -Force | Out-Null

# No StartWhenAvailable here: a stop missed overnight must not run the next morning and kill the fresh server.
$stopSettings = New-ScheduledTaskSettingsSet @common -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$stopAction = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$AppDir\windows\stop-server.vbs`"" -WorkingDirectory $AppDir
Register-ScheduledTask -TaskName 'The Grimoire - Stop 9 PM' -Description 'Backs up and stops The Grimoire server at 9 PM.' `
  -Trigger (New-ScheduledTaskTrigger -Daily -At '9:00PM') -Action $stopAction -Settings $stopSettings -Force | Out-Null

$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $desktop 'The Grimoire Dashboard.lnk'))
$lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$lnk.Arguments = "`"$AppDir\windows\Launch The Grimoire.vbs`""
$lnk.WorkingDirectory = $AppDir
$lnk.IconLocation = "$AppDir\windows\the-grimoire.ico,0"
$lnk.Description = 'Open The Grimoire'
$lnk.Save()

Write-Host 'The Grimoire is set up: tasks at 5:30 AM and 9 PM, and a Desktop shortcut.'
