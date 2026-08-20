# Generates the PWA icon set for Answer It, matching the existing favicon's look
# (dark rounded square + purple "?"). Run once from repo root:
#   pwsh scripts/make-icons.ps1
# Regenerate any time the brand colors in the favicon (index.html <link rel="icon">) change.
Add-Type -AssemblyName System.Drawing

$bg = [System.Drawing.Color]::FromArgb(255, 0x15, 0x15, 0x1b)   # --panel dark, matches favicon bg
$fg = [System.Drawing.Color]::FromArgb(255, 0x7c, 0x5c, 0xff)   # brand purple, matches favicon glyph

function New-AnswerItIcon {
    param(
        [int]$Size,
        [string]$Path,
        [bool]$Rounded,      # bake rounded corners with transparent margin (standard "any" icon)
        [bool]$Opaque,       # no transparency at all (apple-touch-icon needs this)
        [double]$GlyphScale  # glyph height as a fraction of $Size (smaller = more safe-zone padding for maskable)
    )
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($Rounded) {
        $r = [int]($Size * 0.25)
        $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = $r * 2
        $path2.AddArc(0, 0, $d, $d, 180, 90)
        $path2.AddArc($Size - $d, 0, $d, $d, 270, 90)
        $path2.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
        $path2.AddArc(0, $Size - $d, $d, $d, 90, 90)
        $path2.CloseFigure()
        $brush = New-Object System.Drawing.SolidBrush($bg)
        $g.FillPath($brush, $path2)
    } else {
        $brush = New-Object System.Drawing.SolidBrush($bg)
        $g.FillRectangle($brush, 0, 0, $Size, $Size)
    }

    $glyphPx = [int]($Size * $GlyphScale)
    $font = New-Object System.Drawing.Font("Arial", $glyphPx, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fgBrush = New-Object System.Drawing.SolidBrush($fg)
    $text = "?"
    $textSize = $g.MeasureString($text, $font)
    # Nudge up slightly - Arial's "?" glyph sits low in its own box, this centers it visually
    $x = ($Size - $textSize.Width) / 2
    $y = ($Size - $textSize.Height) / 2 - ($Size * 0.03)
    $g.DrawString($text, $font, $fgBrush, $x, $y)

    if ($Opaque) {
        $flat = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $g2 = [System.Drawing.Graphics]::FromImage($flat)
        $g2.Clear($bg)
        $g2.DrawImage($bmp, 0, 0)
        $g2.Dispose()
        $flat.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
        $flat.Dispose()
    } else {
        $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "wrote $Path"
}

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

New-AnswerItIcon -Size 192 -Path (Join-Path $iconsDir "icon-192.png")          -Rounded $true  -Opaque $false -GlyphScale 0.55
New-AnswerItIcon -Size 512 -Path (Join-Path $iconsDir "icon-512.png")          -Rounded $true  -Opaque $false -GlyphScale 0.55
New-AnswerItIcon -Size 512 -Path (Join-Path $iconsDir "maskable-512.png")      -Rounded $false -Opaque $true  -GlyphScale 0.40
New-AnswerItIcon -Size 180 -Path (Join-Path $iconsDir "apple-touch-icon.png")  -Rounded $false -Opaque $true  -GlyphScale 0.55

Write-Output "done"
