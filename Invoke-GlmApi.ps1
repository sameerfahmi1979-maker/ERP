param(
    [Parameter(Mandatory=$false)]
    [string]$Prompt = "Hello, who are you?",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiKey = "47bf259d2e8741808eb6133977d9192a.iDUvd2iUCMVTaBAg"
)

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    Write-Host "Error: Zhipu API Key is not set. Please provide it via -ApiKey parameter or set the ZHIPU_API_KEY environment variable." -ForegroundColor Red
    exit 1
}

$url = "https://api.z.ai/api/coding/paas/v4/chat/completions"

$headers = @{
    "Authorization" = "Bearer $ApiKey"
    "Content-Type" = "application/json"
}

$body = @{
    model = "glm-5-turbo"
    messages = @(
        @{
            role = "user"
            content = $Prompt
        }
    )
} | ConvertTo-Json -Depth 10

# Note: PowerShell 5.1 sometimes struggles with UTF8 encoding in Invoke-RestMethod bodies natively.
# Encoding the body to UTF8 bytes is a safe way to ensure non-ASCII characters work correctly.
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)

Write-Host "Sending request to GLM-5-turbo..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $bodyBytes -ContentType "application/json; charset=utf-8" -ErrorAction Stop
    $reply = $response.choices[0].message.content
    Write-Host "`nResponse from GLM-5-turbo:" -ForegroundColor Green
    Write-Host $reply
}
catch {
    Write-Host "An error occurred while calling the GLM API:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)"
    }
    elseif ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $errBody = $reader.ReadToEnd()
        Write-Host "Response Body: $errBody" -ForegroundColor Yellow
    }
}
