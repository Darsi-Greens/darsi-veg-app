# ship.ps1 — EAS build -> wait -> download APK -> install on device -> launch
#
# Turns the manual "build, watch the dashboard, download, adb install" dance
# into one command. Polls the build until it's finished, then installs the
# real APK (correct env, real .env.* config — unlike Expo Go which always
# loads .env.development).
#
# Usage:
#   npm run ship -- staging        # build + install the staging APK
#   npm run ship -- development
#   npm run ship -- production      # asks for confirmation first

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('development','staging','production')]
  [string]$Profile
)

$ErrorActionPreference = 'Stop'

if ($Profile -eq 'production') {
  $ok = Read-Host "Build & install PRODUCTION (real shop data)? Type 'yes' to continue"
  if ($ok -ne 'yes') { Write-Host "Aborted."; exit 1 }
}

$pkg = @{ development = 'com.nrbveg.dev'; staging = 'com.nrbveg.staging'; production = 'com.nrbveg.app' }[$Profile]

Write-Host "==> Building $Profile APK on EAS (this can take a while)..." -ForegroundColor Cyan
# --json --non-interactive --no-wait returns immediately with the build id
$created = npx eas-cli@latest build -p android --profile $Profile --non-interactive --no-wait --json | ConvertFrom-Json
$buildId = $created[0].id
if (-not $buildId) { Write-Host "Could not get build id." -ForegroundColor Red; exit 1 }
Write-Host "    build id: $buildId" -ForegroundColor DarkGray

# Poll until finished
Write-Host "==> Waiting for build to finish..." -ForegroundColor Cyan
do {
  Start-Sleep -Seconds 30
  $b = npx eas-cli@latest build:view $buildId --json | ConvertFrom-Json
  Write-Host ("    status: {0}" -f $b.status)
} while ($b.status -notin @('finished','errored','canceled'))

if ($b.status -ne 'finished') {
  Write-Host "Build $($b.status). See: https://expo.dev/accounts/nrbvegetables-darsi/projects/nrb-vegetables/builds/$buildId" -ForegroundColor Red
  exit 1
}

# Download the APK
$url = $b.artifacts.applicationArchiveUrl
$apk = Join-Path $env:TEMP "nrbveg-$Profile-$buildId.apk"
Write-Host "==> Downloading APK..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $url -OutFile $apk

# Install on the connected device
$adb = @(
  "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  "$env:ANDROID_HOME\platform-tools\adb.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($adb -and (& $adb devices | Select-String 'device$')) {
  Write-Host "==> Installing on device..." -ForegroundColor Cyan
  & $adb install -r $apk
  & $adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 | Out-Null
  Write-Host "==> Installed & launched: $pkg" -ForegroundColor Green
} else {
  Write-Host "No device connected. APK downloaded to: $apk" -ForegroundColor Yellow
}
