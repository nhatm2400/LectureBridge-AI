param(
    [string]$ApiBase = "http://localhost:8000",
    [string]$FrontendBase = "http://localhost:3000",
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"

function Test-JsonEndpoint {
    param(
        [string]$Name,
        [string]$Url
    )

    Write-Host "Checking $Name -> $Url"
    $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 15
    if ($null -eq $response) {
        throw "$Name returned an empty response."
    }
    return $response
}

try {
    $health = Test-JsonEndpoint -Name "API health" -Url "$ApiBase/api/health"
    if ($health.status -ne "healthy") {
        throw "API health is not healthy: $($health | ConvertTo-Json -Compress)"
    }

    $deep = Test-JsonEndpoint -Name "Deep health" -Url "$ApiBase/api/health/deep"
    if (-not $deep.checks.database) {
        throw "Deep health does not include database check."
    }

    $metrics = Test-JsonEndpoint -Name "Metrics" -Url "$ApiBase/api/metrics"
    if ($null -eq $metrics.request_count) {
        throw "Metrics does not include request_count."
    }

    if (-not $SkipFrontend) {
        Write-Host "Checking frontend -> $FrontendBase"
        $frontend = Invoke-WebRequest -Uri $FrontendBase -Method Get -TimeoutSec 15
        if ($frontend.StatusCode -lt 200 -or $frontend.StatusCode -ge 400) {
            throw "Frontend returned status $($frontend.StatusCode)."
        }
    }

    Write-Host "QA smoke passed."
    exit 0
} catch {
    Write-Error "QA smoke failed: $_"
    exit 1
}
