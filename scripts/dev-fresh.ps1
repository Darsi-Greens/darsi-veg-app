# dev-fresh.ps1 - guaranteed "run the latest code in the right app"
#
# Why this exists: a recurring time-sink is editing JS but seeing OLD behaviour
# because (a) Metro served a cached bundle, or (b) the emulator opened the
# standalone APK (com.nrbveg.*) which has its own embedded bundle and ignores
# Metro. This script removes both traps in one shot.
#
# Usage:
#   npm run dev:fresh                 # staging env config
#   npm run dev:fresh -- development  # dev env config
#   npm run dev:fresh -- production   # prod env config
#
# Note: in Expo Go, EXPO_PUBLIC_* still come from .env.development (Expo dev
# mode). For a true env build, use "npm run ship -- <profile>".

param(
  [ValidateSet('development','staging','production')]
  [string]$AppEnv = 'staging'
)

$ErrorActionPreference = 'Continue'

# Locate adb (Android SDK platform-tools)
$adb = @(
  "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  "$env:ANDROID_HOME\platform-tools\adb.exe",
  "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

Write-Host "==> dev:fresh ($AppEnv)" -ForegroundColor Cyan

# 1. Uninstall any standalone build so the emulator can only open Expo Go.
if ($adb -and (& $adb devices | Select-String 'device$')) {
  foreach ($pkg in 'com.nrbveg.dev','com.nrbveg.staging','com.nrbveg.app') {
    $installed = & $adb shell pm list packages $pkg
    if ($installed) {
      Write-Host "    uninstalling standalone $pkg" -ForegroundColor Yellow
      & $adb uninstall $pkg | Out-Null
    }
  }
} else {
  Write-Host "    (no adb / no device - skipping standalone cleanup)" -ForegroundColor DarkGray
}

# 2. Start Metro fresh (cleared cache) for the chosen env.
#    --clear guarantees no stale bundle. It auto-opens on a connected device.
Write-Host "==> starting Metro with cleared cache (APP_ENV=$AppEnv)" -ForegroundColor Cyan
$env:APP_ENV = $AppEnv
& npx expo start --clear --android
