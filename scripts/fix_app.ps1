$path = "src/server/app.ts"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$old = "app.get(['/admin/*', '/admin'], (req, res) => {"
$new = "app.get(['/admin', '/admin/{*splat}'], (req, res) => {"
$content = $content.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "app.ts updated for Express 5"
