$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appUrl = 'http://127.0.0.1:5187/'
function Test-MonsterFusion {
    try {
        $response = Invoke-WebRequest -Uri ($appUrl + '__monsterfusion_health') -UseBasicParsing -TimeoutSec 2
        return $response.Content -eq 'MonsterFusion-local-app-v1'
    } catch { return $false }
}
try {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) {
        throw 'ゲームのビルドがありません。MonsterFusion-UIで npm.cmd run build を実行してください。'
    }
    if (-not (Test-MonsterFusion)) {
        $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
        $serverPath = Join-Path $PSScriptRoot 'local-app-server.mjs'
        $logFolder = Join-Path $env:LOCALAPPDATA 'MonsterFusion'
        New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
        $server = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverPath + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logFolder 'server.log') -RedirectStandardError (Join-Path $logFolder 'server-error.log')
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            if (Test-MonsterFusion) { break }
            if ($server.HasExited) { throw 'ゲームを起動できませんでした。ポート5187が他のアプリで使われている可能性があります。' }
            Start-Sleep -Milliseconds 250
        }
        if (-not (Test-MonsterFusion)) { throw 'ゲームの起動が時間内に完了しませんでした。' }
    }
    Start-Process $appUrl
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'MonsterFusion') | Out-Null
    exit 1
}
