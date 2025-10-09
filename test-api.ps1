try {
    Write-Host "🔍 Testing questionnaire progress API..." -ForegroundColor Green
    
    $headers = @{
        "x-admin-key" = "lB2@#mR8!nP6`$hQ7^jX5*vY3`&zK9+wA1"
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/users/questionnaire-progress" -Method GET -Headers $headers
    
    Write-Host "✅ Success! Response received:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 5) -ForegroundColor Yellow
    
} catch {
    Write-Host "❌ Error occurred:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        Write-Host "Status Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
    }
}