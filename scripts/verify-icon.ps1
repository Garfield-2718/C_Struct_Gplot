$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Get-AvgHash($bmp) {
    # 缩放到 8x8 计算平均灰度，生成 64 位感知哈希（aHash）
    $small = New-Object System.Drawing.Bitmap(8, 8)
    $g = [System.Drawing.Graphics]::FromImage($small)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($bmp, 0, 0, 8, 8)
    $g.Dispose()
    $sum = 0.0; $vals = @()
    for ($y = 0; $y -lt 8; $y++) {
        for ($x = 0; $x -lt 8; $x++) {
            $c = $small.GetPixel($x, $y)
            $lum = 0.299*$c.R + 0.587*$c.G + 0.114*$c.B
            $vals += $lum; $sum += $lum
        }
    }
    $small.Dispose()
    $avg = $sum / 64.0
    $bits = ''
    foreach ($v in $vals) { $bits += $(if ($v -ge $avg) { '1' } else { '0' }) }
    # 转 64bit hex
    $hash = [Convert]::ToUInt64($bits, 2)
    return ('{0:x16}' -f $hash)
}

function HammingDistance([string]$a, [string]$b) {
    $xa = [Convert]::ToUInt64($a, 16); $xb = [Convert]::ToUInt64($b, 16)
    $x = $xa -bxor $xb
    $d = 0; while ($x) { $d += $x -band 1; $x = $x -shr 1 }
    return $d
}

$root = 'e:\work\debug\C_Struct_Gplot'

# 1) exe 中提取的图标
$exe = Join-Path $root 'dist\win-unpacked\c-struct-gplot.exe'
$ico = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
$exeBmp = $ico.ToBitmap()
$exeHash = Get-AvgHash $exeBmp
$exeBmp.Save((Join-Path $root 'dist\_extracted_exe_icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
"exe 图标尺寸: $($exeBmp.Width)x$($exeBmp.Height)  aHash=$exeHash  (已导出: dist\_extracted_exe_icon.png)"

# 2) 源 logo
$logo = [System.Drawing.Image]::FromFile((Join-Path $root 'resources\icon.png'))
$logoBmp = New-Object System.Drawing.Bitmap($logo)
$logoHash = Get-AvgHash $logoBmp
"logo.png    aHash=$logoHash"

# 3) build/icon.ico 首帧（256）
$buildIco = New-Object System.Drawing.Icon((Join-Path $root 'build\icon.ico'), 48, 48)
$buildBmp = $buildIco.ToBitmap()
$buildHash = Get-AvgHash $buildBmp
"build/icon.ico(48) aHash=$buildHash"

$logo.Dispose(); $logoBmp.Dispose(); $exeBmp.Dispose(); $buildBmp.Dispose()

""
$d1 = HammingDistance $exeHash $logoHash
$d2 = HammingDistance $exeHash $buildHash
"exe vs logo.png      汉明距离 = $d1 / 64"
"exe vs build/icon.ico 汉明距离 = $d2 / 64"
if ($d1 -le 10 -and $d2 -le 10) { "结论: exe 图标与新 logo 高度一致 → 新图标已正确嵌入 ✓" }
else { "结论: 差异较大，exe 可能仍为旧/默认图标 ✗" }
