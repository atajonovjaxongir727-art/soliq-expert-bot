$path = ".env"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$content = [System.Text.RegularExpressions.Regex]::Replace($content, 'PAYMENT_CARD_NUMBER=".*?"', 'PAYMENT_CARD_NUMBER="5614681420273934"')
$content = [System.Text.RegularExpressions.Regex]::Replace($content, 'PAYMENT_CARD_HOLDER=".*?"', 'PAYMENT_CARD_HOLDER="Atajonov Jaxongir"')
[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host ".env card details updated"
