# 从 resources/icon.png 生成多尺寸 build/icon.ico（PNG 压缩帧）
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPng = Join-Path $root 'resources\icon.png'
$buildDir = Join-Path $root 'build'
$outIco = Join-Path $buildDir 'icon.ico'

if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }

$sizes = @(256, 128, 64, 48, 32, 24, 16)
$src = [System.Drawing.Image]::FromFile($srcPng)

$frames = @()
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $s, $s)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $frames += ,@($s, $ms.ToArray())
    $ms.Dispose()
}
$src.Dispose()

# 组装 ICO 二进制
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($out)
$bw.Write([UInt16]0)              # reserved
$bw.Write([UInt16]1)              # type: icon
$bw.Write([UInt16]$frames.Count)  # count

$offset = 6 + 16 * $frames.Count
foreach ($f in $frames) {
    $s = $f[0]; $data = $f[1]
    $dim = if ($s -ge 256) { 0 } else { $s }   # 0 表示 256
    $bw.Write([Byte]$dim)         # width
    $bw.Write([Byte]$dim)         # height
    $bw.Write([Byte]0)            # color count
    $bw.Write([Byte]0)            # reserved
    $bw.Write([UInt16]1)          # planes
    $bw.Write([UInt16]32)         # bit count
    $bw.Write([UInt32]$data.Length)  # bytes in resource
    $bw.Write([UInt32]$offset)       # image offset
    $offset += $data.Length
}
foreach ($f in $frames) { $bw.Write($f[1]) }
$bw.Flush()

[System.IO.File]::WriteAllBytes($outIco, $out.ToArray())
$bw.Dispose(); $out.Dispose()

Write-Host "已生成: $outIco ($((Get-Item $outIco).Length) bytes, 帧: $($sizes -join ','))"
