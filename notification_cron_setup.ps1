# Smart Crops Notification Cron Setup
# Run this script AS ADMINISTRATOR in PowerShell
# Right-click PowerShell -> Run as Administrator, then:
#   powershell -ExecutionPolicy Bypass -File notification_cron_setup.ps1

$projectDir = "E:\project 1\crop-price-tracker"
$python = "$projectDir\venv\Scripts\python.exe"
$manage = "manage.py"

$tasks = @(
    @{ Name = "SmartCrops_Notif_Opportunity"; Mode = "opportunity"; IntervalMin = 10; Desc = "Market opportunity alerts (arbitrage) every 10 min" },
    @{ Name = "SmartCrops_Notif_Price"; Mode = "price"; IntervalMin = 30; Desc = "Price movement alerts every 30 min" },
    @{ Name = "SmartCrops_Notif_Transport"; Mode = "transport"; IntervalMin = 60; Desc = "Transport cost change alerts every 60 min" },
    @{ Name = "SmartCrops_Notif_Personalized"; Mode = "personalized"; IntervalMin = 60; Desc = "User preference-filtered alerts every 60 min" }
)

foreach ($task in $tasks) {
    $action = New-ScheduledTaskAction `
        -Execute $python `
        -Argument "$manage run_notification_engine --mode=$($task.Mode)" `
        -WorkingDirectory $projectDir

    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $task.IntervalMin)

    Register-ScheduledTask `
        -TaskName $task.Name `
        -Action $action `
        -Trigger $trigger `
        -Description $task.Desc `
        -Force

    Write-Host "[OK] $($task.Name) - $($task.Desc)" -ForegroundColor Green
}

Write-Host ""
Write-Host "All notification cron tasks installed." -ForegroundColor Cyan
Write-Host "To check: schtasks /query /tn 'SmartCrops_Notif_*'" -ForegroundColor Yellow
Write-Host "To remove all: schtasks /delete /tn 'SmartCrops_Notif_Opportunity' /f; schtasks /delete /tn 'SmartCrops_Notif_Price' /f; schtasks /delete /tn 'SmartCrops_Notif_Transport' /f; schtasks /delete /tn 'SmartCrops_Notif_Personalized' /f" -ForegroundColor Yellow
