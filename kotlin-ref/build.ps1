# build.ps1 — 编译 Kotlin hash 参考实现为可运行 jar（B-6 跨语言对拍用）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$jdk = Get-ChildItem (Join-Path $env:USERPROFILE '.workbuddy\binaries\jdk') -Directory | Select-Object -First 1
$kotlinc = Join-Path $env:USERPROFILE '.workbuddy\binaries\kotlinc\kotlinc'
$env:JAVA_HOME = $jdk.FullName
$env:Path = "$env:JAVA_HOME\bin;$kotlinc\bin;" + $env:Path

$src  = Join-Path $root 'kotlin-ref\src\hashref\HashRefMain.kt'
$out  = Join-Path $root 'kotlin-ref\out'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$jar  = Join-Path $out 'hash-ref.jar'
if (Test-Path $jar) { Remove-Item $jar }

& "$kotlinc\bin\kotlinc.bat" $src -include-runtime -d $jar
if ($LASTEXITCODE -ne 0) { Write-Error "kotlinc 失败" }
Write-Host "Kotlin 参考实现已编译 -> $jar"