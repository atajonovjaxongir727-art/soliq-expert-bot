$files = @(
  "src/server/routes/paymentRoutes.ts",
  "src/server/routes/questionRoutes.ts",
  "src/server/routes/serviceRoutes.ts"
)

foreach ($f in $files) {
  $content = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
  $content = $content.Replace("parseInt(req.params.id, 10)", "parseInt(req.params.id as string, 10)")
  [System.IO.File]::WriteAllText($f, $content, [System.Text.Encoding]::UTF8)
}

Write-Host "Updated req.params.id typing"
