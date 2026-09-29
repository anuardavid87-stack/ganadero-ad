Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path (Get-Location) "icon.png"
if (-not (Test-Path $srcPath)) {
    Write-Error "icon.png not found"
    exit 1
}

$srcBitmap = [System.Drawing.Bitmap]::FromFile($srcPath)

function Resize-Image($src, $targetWidth, $targetHeight, $isRound = $false, $isForeground = $false) {
    $bmp = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($isRound) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $targetWidth, $targetHeight)
        $g.SetClip($path)
        $g.DrawImage($src, 0, 0, $targetWidth, $targetHeight)
        $path.Dispose()
    } elseif ($isForeground) {
        # Foreground canvas is targetWidth x targetHeight. Icon is drawn in safe area (72% center)
        $iconSize = [int]($targetWidth * 0.72)
        $offset = [int](($targetWidth - $iconSize) / 2)
        $g.DrawImage($src, $offset, $offset, $iconSize, $iconSize)
    } else {
        $g.DrawImage($src, 0, 0, $targetWidth, $targetHeight)
    }

    $g.Dispose()
    return $bmp
}

# 1. PWA 192x192
$pwa192 = Resize-Image $srcBitmap 192 192
$pwa192.Save("icon-192.png", [System.Drawing.Imaging.ImageFormat]::Png)
$pwa192.Save("frontend/public/icon-192.png", [System.Drawing.Imaging.ImageFormat]::Png)
if (Test-Path "www") {
    $pwa192.Save("www/icon-192.png", [System.Drawing.Imaging.ImageFormat]::Png)
}
$pwa192.Dispose()
Write-Host "[OK] icon-192.png generado para PWA"

# 2. Android densities
$densities = @{
    "mdpi" = @{ launcher = 48; foreground = 108 }
    "hdpi" = @{ launcher = 72; foreground = 162 }
    "xhdpi" = @{ launcher = 96; foreground = 216 }
    "xxhdpi" = @{ launcher = 144; foreground = 324 }
    "xxxhdpi" = @{ launcher = 192; foreground = 432 }
}

$resBase = "android/app/src/main/res"

foreach ($d in $densities.Keys) {
    $targetDir = Join-Path $resBase "mipmap-$d"
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }

    $launcherSize = $densities[$d].launcher
    $fgSize = $densities[$d].foreground

    # ic_launcher.png
    $launcherBmp = Resize-Image $srcBitmap $launcherSize $launcherSize
    $launcherBmp.Save((Join-Path $targetDir "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $launcherBmp.Dispose()

    # ic_launcher_round.png
    $roundBmp = Resize-Image $srcBitmap $launcherSize $launcherSize -isRound $true
    $roundBmp.Save((Join-Path $targetDir "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $roundBmp.Dispose()

    # ic_launcher_foreground.png
    $fgBmp = Resize-Image $srcBitmap $fgSize $fgSize -isForeground $true
    $fgBmp.Save((Join-Path $targetDir "ic_launcher_foreground.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $fgBmp.Dispose()

    Write-Host "[OK] mipmap-$d generado (launcher: $launcherSize px, round: $launcherSize px, foreground: $fgSize px)"
}

$srcBitmap.Dispose()
Write-Host "[OK] Todos los iconos de Android generados exitosamente"
