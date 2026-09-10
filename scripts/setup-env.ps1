# 提交前确保本机工具链 = 项目固定版本。用法：
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-env.ps1
# 之后每个新 shell 若要使用 Node/Git，先运行本脚本（或加入系统 PATH）。
$ErrorActionPreference = 'Stop'

$nodeRoot = Join-Path $env:USERPROFILE '.workbuddy\binaries\nodejs\node-v18.20.4-win-x64'
$gitRoot  = Join-Path $env:USERPROFILE '.workbuddy\binaries\git'
$jdkHome  = Get-ChildItem (Join-Path $env:USERPROFILE '.workbuddy\binaries\jdk') -Directory | Select-Object -First 1
try { $jdkHome = $jdkHome.FullName } catch { $jdkHome = '' }
$kotlinRoot = Join-Path $env:USERPROFILE '.workbuddy\binaries\kotlinc\kotlinc'

$env:JAVA_HOME = $jdkHome
$env:Path = "$nodeRoot;$gitRoot\bin;$gitRoot\cmd;$jdkHome\bin;$kotlinRoot\bin;" + $env:Path

Write-Host "== Suanming Preview 项目工具链 ==" 
Write-Host "PATH -> nodeRoot : node-v18.20.4 (项目固定)"
Write-Host "GIT  -> portable 2.55.0"
Write-Host "JAVA -> $jdkHome"
Write-Host "KOTLIN-> $kotlinRoot"
Write-Host ""
Write-Host "node : $(node -v)"
Write-Host "npm  : $(npm -v)"
Write-Host "git  : $(git --version)"
Write-Host "java : $(& "$jdkHome\bin\java.exe" -version 2>&1 | Select-Object -First 1)"
Write-Host "kotlinc: $(& "$kotlinRoot\bin\kotlinc.bat" -version 2>&1 | Select-Object -First 1)"

# 校验主版本
$major = (node -v) -replace '^v([0-9]+)\..*','$1'
if ($major -ne '18') {
  Write-Error "Node 主版本必须为 18，当前 $major，请检查 setup-env.ps1 的 nodeRoot。"
}
Write-Host ""
Write-Host "工具链就绪。现在可以在此 shell 内执行 npm / 接入命令。"