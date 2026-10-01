$path = "public/admin/index.html"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$old = '<script src="/admin/admin.js"></script>'
$new = '<script src="/admin/admin.js"></script>' + "`n" + '  <script src="/admin/autosubmit.js"></script>'
if (-not $content.Contains("autosubmit.js")) {
  $content = $content.Replace($old, $new)
  [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
  Write-Host "Added autosubmit.js to index.html"
} else {
  Write-Host "autosubmit.js already in index.html"
}
