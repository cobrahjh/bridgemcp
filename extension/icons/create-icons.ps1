Add-Type -AssemblyName System.Drawing

function Create-BridgeIcon {
    param([int]$size, [string]$path)

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'

    # Background - dark slate
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30, 41, 59))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)

    # Bridge arch - green
    $penWidth = [Math]::Max(1, [int]($size * 0.08))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(34, 197, 94), $penWidth)
    $pen.StartCap = 'Round'
    $pen.EndCap = 'Round'

    $points = @(
        [System.Drawing.PointF]::new($size * 0.15, $size * 0.7),
        [System.Drawing.PointF]::new($size * 0.5, $size * 0.2),
        [System.Drawing.PointF]::new($size * 0.85, $size * 0.7)
    )
    $g.DrawCurve($pen, $points, 0.5)

    # Pillars
    $penWidth2 = [Math]::Max(1, [int]($size * 0.06))
    $pen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(34, 197, 94), $penWidth2)
    $g.DrawLine($pen2, [int]($size * 0.25), [int]($size * 0.5), [int]($size * 0.25), [int]($size * 0.85))
    $g.DrawLine($pen2, [int]($size * 0.75), [int]($size * 0.5), [int]($size * 0.75), [int]($size * 0.85))

    # Center dot - bright green
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(74, 222, 128))
    $dotSize = [int]($size * 0.16)
    $dotX = [int]($size * 0.5 - $dotSize/2)
    $dotY = [int]($size * 0.28 - $dotSize/2)
    $g.FillEllipse($dotBrush, $dotX, $dotY, $dotSize, $dotSize)

    # Small dots on sides
    $smallDot = [Math]::Max(1, [int]($size * 0.07))
    $g.FillEllipse($dotBrush, [int]($size * 0.32 - $smallDot/2), [int]($size * 0.42 - $smallDot/2), $smallDot, $smallDot)
    $g.FillEllipse($dotBrush, [int]($size * 0.68 - $smallDot/2), [int]($size * 0.42 - $smallDot/2), $smallDot, $smallDot)

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created: $path"
}

Create-BridgeIcon 128 'C:\BridgeMCP\extension\icons\icon128.png'
Create-BridgeIcon 48 'C:\BridgeMCP\extension\icons\icon48.png'
Create-BridgeIcon 16 'C:\BridgeMCP\extension\icons\icon16.png'
Write-Host 'All icons saved!'
