# Draws the installer's banner (493x58), welcome image (493x312) and icon from public/logo.png. Run once; the outputs are committed.
Add-Type -AssemblyName System.Drawing
$dark = [System.Drawing.ColorTranslator]::FromHtml('#0d1117'); $blue = [System.Drawing.ColorTranslator]::FromHtml('#4d8cf5'); $line = [System.Drawing.ColorTranslator]::FromHtml('#d0d7de')
$logo = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot '..\public\logo.png'))
$ff = New-Object System.Drawing.FontFamily 'Segoe UI'
function Draw-Logo($g, $x, $y, $w) { $h = $w * $logo.Height / $logo.Width; $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($logo, [single]$x, [single]$y, [single]$w, [single]$h) }

# banner: white, logo at the right
$b = New-Object System.Drawing.Bitmap 493, 58; $g = [System.Drawing.Graphics]::FromImage($b)
$g.Clear([System.Drawing.Color]::White); $g.SmoothingMode = 'AntiAlias'
Draw-Logo $g 428 5 58
$g.DrawLine((New-Object System.Drawing.Pen $line), 0, 57, 493, 57)
$b.Save((Join-Path $PSScriptRoot 'banner.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp); $g.Dispose(); $b.Dispose()

# welcome / finish: dark side panel with the logo and name
$b = New-Object System.Drawing.Bitmap 493, 312; $g = [System.Drawing.Graphics]::FromImage($b)
$g.Clear([System.Drawing.Color]::White); $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.FillRectangle((New-Object System.Drawing.SolidBrush $dark), 0, 0, 164, 312)
$g.FillRectangle((New-Object System.Drawing.SolidBrush $blue), 0, 0, 3, 312)
Draw-Logo $g 16 40 136
$f1 = New-Object System.Drawing.Font $ff, 19, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$f2 = New-Object System.Drawing.Font $ff, 12, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'
$g.DrawString('Kookaburrow', $f1, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 3, 190, 161, 30), $sf)
$g.DrawString('Threat hunting platform', $f2, (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#a3adba'))), (New-Object System.Drawing.RectangleF 3, 220, 161, 20), $sf)
$b.Save((Join-Path $PSScriptRoot 'dialog.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp); $g.Dispose(); $b.Dispose()

# icon: PNG-compressed frames, 16 to 256
$sizes = 16, 24, 32, 48, 64, 128, 256
$frames = foreach ($s in $sizes) {
  $bm = New-Object System.Drawing.Bitmap $s, $s, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb); $gg = [System.Drawing.Graphics]::FromImage($bm)
  $gg.Clear([System.Drawing.Color]::Transparent); $gg.InterpolationMode = 'HighQualityBicubic'; $gg.SmoothingMode = 'AntiAlias'
  $h = $s * $logo.Height / $logo.Width; $gg.DrawImage($logo, [single]0, [single](($s - $h) / 2), [single]$s, [single]$h)
  $ms = New-Object System.IO.MemoryStream; $bm.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $gg.Dispose(); $bm.Dispose()
  , $ms.ToArray()
}
$out = New-Object System.IO.MemoryStream; $w = New-Object System.IO.BinaryWriter $out
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $d = if ($s -ge 256) { 0 } else { $s }
  $w.Write([byte]$d); $w.Write([byte]$d); $w.Write([byte]0); $w.Write([byte]0); $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$frames[$i].Length); $w.Write([uint32]$offset); $offset += $frames[$i].Length
}
foreach ($f in $frames) { $w.Write($f) }
[System.IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'kookaburrow.ico'), $out.ToArray())
$logo.Dispose()
