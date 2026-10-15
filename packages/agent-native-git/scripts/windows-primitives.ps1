#requires -Version 5.1
# Run in a fresh Windows x64 PowerShell process. JSON stdout; exit 0 only for all required proofs.
# This compiles only the adjacent owned inert source into a newly created OS-temp directory.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$report = [ordered]@{
    schemaVersion = 1
    probe = 'windows-primitives'
    status = 'fail'
    checks = @()
    runtime = [ordered]@{ powershell = $PSVersionTable.PSVersion.ToString(); framework = [Environment]::Version.ToString(); processArchitecture = $(if ([Environment]::Is64BitProcess) { 'x64' } else { 'x86' }) }
    limitations = @('NOT PRODUCT SECURITY CERTIFICATION', 'Disposable native feasibility, not product acceptance or hostile same-account isolation.')
}
$fixtureRoot = $null
$createdRoot = $false
$compiler = $null
$exitCode = 1
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitProcess) {
        $report.checks += [ordered]@{ id = 'windows_x64'; status = 'unsupported'; required = $true; details = 'Use Windows x64 PowerShell 5.1/.NET Framework.' }
        throw 'Required Windows x64 host unavailable.'
    }
    $source = Join-Path $PSScriptRoot 'windows-primitives.cs'
    if (-not [IO.File]::Exists($source)) { throw 'Adjacent owned windows-primitives.cs source is missing.' }
    $fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('angit windows primitives ' + [Guid]::NewGuid().ToString('N'))
    if ([IO.Directory]::Exists($fixtureRoot)) { throw 'Refusing an existing fixture directory.' }
    $null = [IO.Directory]::CreateDirectory($fixtureRoot)
    $createdRoot = $true
    $fixtureExe = Join-Path $fixtureRoot 'inert fixture with spaces.exe'
    $compilerPath = Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'csc.exe'
    if (-not [IO.File]::Exists($compilerPath)) {
        $report.checks += [ordered]@{ id = 'framework_compiler'; status = 'blocked'; required = $true; details = @{ path = $compilerPath; reason = 'Installed .NET Framework csc.exe missing; no download or fallback.' } }
        throw 'Local .NET Framework compiler unavailable.'
    }
    Add-Type -AssemblyName System.Web.Extensions
    $jsonAssembly = [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location
    $systemAssembly = [Uri].Assembly.Location
    $coreAssembly = [System.Linq.Enumerable].Assembly.Location
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $compilerPath
    # These are fixed switches and filesystem paths; Windows filenames cannot contain a quote.
    # No shell, response file, task-provided source, or configurable executable is accepted.
    $start.Arguments = '/noconfig /nologo /target:exe /platform:x64 /optimize+ /out:"' + $fixtureExe + '" /reference:"' + $systemAssembly + '" /reference:"' + $coreAssembly + '" /reference:"' + $jsonAssembly + '" "' + $source + '"'
    $start.WorkingDirectory = $fixtureRoot
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $compiler = New-Object Diagnostics.Process
    $compiler.StartInfo = $start
    if (-not $compiler.Start()) { throw 'Failed to start the fixed local framework compiler.' }
    $stdout = $compiler.StandardOutput.ReadToEndAsync()
    $stderr = $compiler.StandardError.ReadToEndAsync()
    if (-not $compiler.WaitForExit(15000)) { throw 'Local fixture compilation exceeded 15-second deadline.' }
    if (-not $stdout.Wait(2000) -or -not $stderr.Wait(2000)) { throw 'Compiler output collection exceeded deadline.' }
    $compilerDetails = [ordered]@{ path = $compilerPath; version = [Diagnostics.FileVersionInfo]::GetVersionInfo($compilerPath).FileVersion; exitCode = $compiler.ExitCode; stdout = $stdout.Result; stderr = $stderr.Result; platform = 'x64' }
    if ($compiler.ExitCode -ne 0) {
        $report.checks += [ordered]@{ id = 'fixture_compilation'; status = 'fail'; required = $true; details = $compilerDetails }
        throw 'Owned native fixture compilation failed; see exact compiler diagnostics.'
    }
    # Load from bytes, not LoadFile: do not lock the disposable executable against finally cleanup.
    $null = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($fixtureExe))
    $json = [AngitWindowsProbe]::Run([string]$fixtureExe, [string]$fixtureRoot)
    $report = $json | ConvertFrom-Json
    $report.runtime | Add-Member -NotePropertyName powershell -NotePropertyValue $PSVersionTable.PSVersion.ToString()
    $report.runtime | Add-Member -NotePropertyName compiler -NotePropertyValue $compilerDetails
    $report.checks += [pscustomobject]@{ id = 'fixture_compilation'; status = 'pass'; required = $true; details = $compilerDetails }
    if ($report.status -eq 'pass') { $exitCode = 0 }
} catch {
    $errorDetails = [ordered]@{ message = $_.Exception.Message; exception = $_.Exception.GetType().FullName }
    if ($_.Exception.InnerException) { $errorDetails.innerMessage = $_.Exception.InnerException.Message; $errorDetails.innerException = $_.Exception.InnerException.GetType().FullName }
    if ($_.Exception -is [ComponentModel.Win32Exception]) { $errorDetails.win32Error = $_.Exception.NativeErrorCode }
    $report.checks += [pscustomobject]@{ id = 'wrapper_failure'; status = 'fail'; required = $true; details = $errorDetails }
    $report.status = 'fail'
    $exitCode = 1
} finally {
    if ($null -ne $compiler) {
        try {
            if (-not $compiler.HasExited) {
                # Only the exact compiler process object we created, never PID/name-wide termination.
                $compiler.Kill()
                if (-not $compiler.WaitForExit(5000)) { throw 'Owned compiler exit deadline exceeded.' }
            }
        } catch {
            $report.checks += [pscustomobject]@{ id = 'compiler_cleanup'; status = 'fail'; required = $true; details = $_.Exception.Message }
            $report.status = 'fail'; $exitCode = 1
        } finally { $compiler.Dispose() }
    }
    if ($createdRoot) {
        try {
            # The sole deletion target is our newly created, fixed-fixture directory.
            # Remove our junction itself before recursive deletion; never follow a retained alias.
            $alias = Join-Path $fixtureRoot 'Junction Alias'
            if ([IO.Directory]::Exists($alias)) { [IO.Directory]::Delete($alias, $false) }
            $timer = [Diagnostics.Stopwatch]::StartNew()
            while ([IO.Directory]::Exists($fixtureRoot)) {
                try { [IO.Directory]::Delete($fixtureRoot, $true) }
                catch { if ($timer.ElapsedMilliseconds -ge 5000) { throw }; Start-Sleep -Milliseconds 50 }
            }
            $report.checks += [pscustomobject]@{ id = 'disposable_directory_cleanup'; status = 'pass'; required = $true; details = @{ onlyCreatedDirectoryDeleted = $true; directoryAbsent = -not [IO.Directory]::Exists($fixtureRoot) } }
        } catch {
            $report.checks += [pscustomobject]@{ id = 'disposable_directory_cleanup'; status = 'fail'; required = $true; details = @{ message = $_.Exception.Message; retainedFixturePath = $fixtureRoot } }
            $report.status = 'fail'; $exitCode = 1
        }
    }
}
[Console]::Out.WriteLine(($report | ConvertTo-Json -Depth 30 -Compress))
exit $exitCode
