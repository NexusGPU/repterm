$ErrorActionPreference = 'Stop'

$BaseUrl = if ($env:REPTERM_BASE_URL) { $env:REPTERM_BASE_URL } else { 'https://cdn.tensor-fusion.ai/archive/repterm' }
$Version = if ($env:REPTERM_VERSION) { $env:REPTERM_VERSION } else { 'latest' }
$InstallDir = if ($env:REPTERM_INSTALL_DIR) { $env:REPTERM_INSTALL_DIR } else { Join-Path $env:USERPROFILE '.repterm\bin' }

$archName = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
$arch = switch ($archName) {
  'X64' { 'x64' }
  'Arm64' { throw 'Windows Arm64 binary is not published yet. Please use x64 environment.' }
  default { throw "Unsupported architecture: $archName" }
}

if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
  throw 'install.ps1 only supports Windows. Use install.sh on Linux/macOS.'
}

$binaryName = "repterm-windows-$arch.exe"
$url = "$BaseUrl/$Version/$binaryName"

Write-Host "[INFO] Downloading $url"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$targetPath = Join-Path $InstallDir 'repterm.exe'
Invoke-WebRequest -Uri $url -OutFile $targetPath

Write-Host "[INFO] Installed repterm to $targetPath"
Write-Host "[INFO] Add $InstallDir to your PATH if needed"
Write-Host '[INFO] Verify with: repterm --help'
