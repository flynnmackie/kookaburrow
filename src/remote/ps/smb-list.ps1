# Large transfers, step 3: every file the collection left in its folder, with size and SHA-256.
# Run on the target by src/remote/winrm_helper.py with $arg set to the request (a JSON object). Same steps as the PowerShell remoting path.
$outDir = [string]$arg.outDir
$files = @()
if (Test-Path -LiteralPath $outDir) {
    $base = (Get-Item -LiteralPath $outDir).FullName.TrimEnd('\')
    $files = @(Get-ChildItem -LiteralPath $outDir -Recurse -File -Force | ForEach-Object {
        [pscustomobject]@{ path = $_.FullName.Substring($base.Length + 1); size = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower() } })
}
ConvertTo-Json -InputObject $files -Compress
