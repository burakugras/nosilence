# SPDX-License-Identifier: AGPL-3.0-only
#
# Runs a command inside the Visual Studio C++ build environment, so that native
# dependencies (argon2_elixir) find nmake and cl.exe on Windows. Only needed when
# such a dependency is compiled: after `mix deps.get` of a new version or a clean.
#
#   .\scripts\with-msvc.ps1 mix deps.compile
#   $env:MIX_ENV = "test"; .\scripts\with-msvc.ps1 mix deps.compile

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath |
  Select-Object -First 1
if (-not $vs) {
  Write-Error "Visual Studio Build Tools with C++ are not installed."
  exit 1
}
$vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvars64.bat"
cmd /c "`"$vcvars`" >nul && $($args -join ' ')"
exit $LASTEXITCODE
