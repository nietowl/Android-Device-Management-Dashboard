# PowerShell script to kill any process using port 9211
Write-Host "Checking for processes using port 9211..." -ForegroundColor Yellow

$connections = Get-NetTCPConnection -LocalPort 9211 -ErrorAction SilentlyContinue | Where-Object {$_.State -eq "Listen"}

if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    Write-Host "Found processes using port 9211: $($pids -join ', ')" -ForegroundColor Red
    
    foreach ($pid in $pids) {
        try {
            $process = Get-Process -Id $pid -ErrorAction Stop
            Write-Host "Killing process $pid ($($process.ProcessName))..." -ForegroundColor Yellow
            Stop-Process -Id $pid -Force -ErrorAction Stop
            Write-Host "✅ Process $pid terminated" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ Could not kill process $pid: $_" -ForegroundColor Red
        }
    }
    
    # Wait a moment for port to be released
    Start-Sleep -Seconds 2
    
    # Verify port is free
    $stillInUse = Get-NetTCPConnection -LocalPort 9211 -ErrorAction SilentlyContinue | Where-Object {$_.State -eq "Listen"}
    if ($stillInUse) {
        Write-Host "❌ Port 9211 is still in use!" -ForegroundColor Red
        exit 1
    } else {
        Write-Host "✅ Port 9211 is now free!" -ForegroundColor Green
    }
} else {
    Write-Host "✅ Port 9211 is already free!" -ForegroundColor Green
}

