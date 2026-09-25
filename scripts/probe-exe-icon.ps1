$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = 'e:\work\debug\C_Struct_Gplot'
$exe = Join-Path $root 'dist\win-unpacked\c-struct-gplot.exe'
$ico = Join-Path $root 'build\icon.ico'

# 读取 build/icon.ico 中 256 帧的 PNG 数据（offset=118, 由目录项给出）
$icoBytes = [System.IO.File]::ReadAllBytes($ico)
$count = [BitConverter]::ToUInt16($icoBytes, 4)
"icon.ico 帧数: $count"
# 取第一帧(256)的 offset 与 size
$off = [BitConverter]::ToUInt32($icoBytes, 18)
$sz  = [BitConverter]::ToUInt32($icoBytes, 14)
"256帧: offset=$off size=$sz"
$frame = $icoBytes[$off .. ($off + $sz - 1)]

# 取帧中段 512 字节作为指纹（避开 PNG 头/尾的通用字节）
$mid = [int][Math]::Floor($sz/2)
$finger = $frame[$mid .. ($mid + 511)]

# 在 exe 中搜索该指纹
$exeBytes = [System.IO.File]::ReadAllBytes($exe)
"exe 大小: $($exeBytes.Length) bytes，开始搜索新图标指纹…"

function Find-Bytes([byte[]]$hay, [byte[]]$needle) {
    $n = $needle.Length
    $limit = $hay.Length - $n
    $start = 0
    while ($true) {
        $i = [Array]::IndexOf($hay, $needle[0], $start, [Math]::Max(0, $hay.Length - $start))
        if ($i -lt 0 -or $i -gt $limit) { return -1 }
        $ok = $true
        for ($j = 1; $j -lt $n; $j++) {
            if ($hay[$i + $j] -ne $needle[$j]) { $ok = $false; break }
        }
        if ($ok) { return $i }
        $start = $i + 1
    }
}

$pos = Find-Bytes $exeBytes $finger
if ($pos -ge 0) {
    "✓ 在 exe 偏移 $pos 处找到新 logo 的 256 帧 PNG 数据 → 新图标确实已嵌入 exe 资源"
} else {
    "✗ exe 中未找到新 logo 指纹 → exe 内嵌的可能是旧/默认图标"
}
