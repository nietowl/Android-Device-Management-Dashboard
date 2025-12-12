# PowerShell script to run the development server
# This script handles execution policy and directory navigation

# Set execution policy for current process (allows npm to run)
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Get the script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Kill all Node.js processes first (they might be holding the port)
Write-Host "Stopping any running Node.js processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        Write-Host "Killed Node.js process $($_.Id)" -ForegroundColor Green
    } catch {
        Write-Host "Could not kill Node.js process $($_.Id)" -ForegroundColor Red
    }
}

# Wait for processes to fully terminate
Start-Sleep -Seconds 2

# Kill any remaining processes using port 3000
Write-Host "Checking for processes on port 3000..." -ForegroundColor Yellow
$portProcesses = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($portProcesses) {
    foreach ($pid in $portProcesses) {
        try {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Write-Host "Killed process $pid on port 3000" -ForegroundColor Green
        } catch {
            Write-Host "Could not kill process $pid" -ForegroundColor Red
        }
    }
    Start-Sleep -Seconds 3
} else {
    Write-Host "Port 3000 is free" -ForegroundColor Green
}

# Verify port is free before starting
$stillInUse = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if ($stillInUse) {
    Write-Host "Warning: Port 3000 may still be in use. Trying anyway..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}

# Run the development server
Write-Host "Starting development server..." -ForegroundColor Green
Write-Host "Project directory: $scriptPath" -ForegroundColor Cyan
Write-Host ""

npm run dev

