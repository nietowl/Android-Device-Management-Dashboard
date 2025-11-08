# Setup Script for Android Device Management Dashboard
# This script helps you create the .env.local file

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Android Device Management Dashboard" -ForegroundColor Cyan
Write-Host "Environment Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env.local already exists
if (Test-Path ".env.local") {
    Write-Host "⚠️  .env.local already exists!" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Setup cancelled." -ForegroundColor Red
        exit
    }
}

Write-Host "Please enter your Supabase credentials:" -ForegroundColor Green
Write-Host ""
Write-Host "You can find these values at:" -ForegroundColor Yellow
Write-Host "https://supabase.com/dashboard/project/_/settings/api" -ForegroundColor Cyan
Write-Host ""

$supabaseUrl = Read-Host "Enter your Supabase Project URL"
$supabaseKey = Read-Host "Enter your Supabase Anon Key"

if ([string]::IsNullOrWhiteSpace($supabaseUrl) -or [string]::IsNullOrWhiteSpace($supabaseKey)) {
    Write-Host "❌ Error: Both values are required!" -ForegroundColor Red
    exit 1
}

# Create .env.local file
$envContent = @"
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$supabaseKey
"@

$envContent | Out-File -FilePath ".env.local" -Encoding utf8

Write-Host ""
Write-Host "✅ .env.local file created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run the database migration: supabase/migrations/001_initial_schema.sql" -ForegroundColor White
Write-Host "2. Start the development server: npm run dev" -ForegroundColor White
Write-Host ""

