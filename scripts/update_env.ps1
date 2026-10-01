$path = ".env"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Replace TELEGRAM_BOT_TOKEN
$content = [System.Text.RegularExpressions.Regex]::Replace($content, 'TELEGRAM_BOT_TOKEN=".*?"', 'TELEGRAM_BOT_TOKEN="8683210487:AAEO4XhsUQUJXGsFMsVY0XNRkQ3IC7kx57o"')

# Replace ADMIN_TELEGRAM_ID
$content = [System.Text.RegularExpressions.Regex]::Replace($content, 'ADMIN_TELEGRAM_ID=".*?"', 'ADMIN_TELEGRAM_ID="794322749"')

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host ".env successfully updated with real token and ID"
