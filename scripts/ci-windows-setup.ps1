$ErrorActionPreference = 'Stop'
$browser = Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'
if (!(Test-Path -LiteralPath $browser)) { throw "System Chrome missing at $browser" }
"ORDV_BROWSER=$browser" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append

$fontDirectory = Join-Path $env:LOCALAPPDATA 'Microsoft/Windows/Fonts'
New-Item -ItemType Directory -Path $fontDirectory -Force | Out-Null
$font = Join-Path $fontDirectory 'NotoSansCJKkr-Regular.otf'
$fontSource = 'https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf'
Invoke-WebRequest -Uri $fontSource -OutFile $font
$fontRegistry = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
New-Item -Path $fontRegistry -Force | Out-Null
New-ItemProperty -Path $fontRegistry -Name 'Noto Sans CJK KR (OpenType)' -Value $font -PropertyType String -Force | Out-Null
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CiFonts {
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern int AddFontResourceW(string path);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessageTimeoutW(IntPtr window, uint message, IntPtr wparam, IntPtr lparam, uint flags, uint timeout, out IntPtr result);
}
'@
if ([CiFonts]::AddFontResourceW($font) -eq 0) { throw 'Noto Sans CJK KR could not be registered.' }
$result = [IntPtr]::Zero
[CiFonts]::SendMessageTimeoutW([IntPtr]0xffff, 0x001d, [IntPtr]::Zero, [IntPtr]::Zero, 2, 5000, [ref]$result) | Out-Null

choco install poppler --yes --no-progress --limit-output
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$poppler = Get-ChildItem -LiteralPath (Join-Path $env:ChocolateyInstall 'lib/poppler') -Recurse -Filter pdftotext.exe | Select-Object -First 1
if (!$poppler) { throw 'Poppler installation did not contain pdftotext.exe.' }
$poppler.DirectoryName | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
