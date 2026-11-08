$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct MyVerseAdminCredential
{
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
}

public static class MyVerseCredentialStore
{
    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool Read(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("Advapi32.dll", SetLastError = false)]
    public static extern void CredFree(IntPtr buffer);
}
'@

$credentialTarget = 'MyVerse/Cloudflare/myverse-ai-api/Admin'
$credentialPointer = [IntPtr]::Zero
$credentialBytes = $null
$adminToken = $null
$headers = $null

try {
    if (-not [MyVerseCredentialStore]::Read($credentialTarget, 1, 0, [ref]$credentialPointer)) {
        throw 'The production admin credential is unavailable in Windows Credential Manager.'
    }

    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
        $credentialPointer,
        [type][MyVerseAdminCredential]
    )
    $credentialBytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy(
        $credential.CredentialBlob,
        $credentialBytes,
        0,
        $credentialBytes.Length
    )
    $adminToken = [Text.Encoding]::ASCII.GetString($credentialBytes)
    [Array]::Clear($credentialBytes, 0, $credentialBytes.Length)
    $credentialBytes = $null
    [MyVerseCredentialStore]::CredFree($credentialPointer)
    $credentialPointer = [IntPtr]::Zero

    $headers = @{ Authorization = 'Bearer ' + $adminToken }
    try {
        $status = Invoke-RestMethod `
            -Method Post `
            -Uri 'https://myverse-ai-api.dhomhafiz.workers.dev/internal/budget/status' `
            -Headers $headers `
            -ContentType 'application/json' `
            -Body '{}' `
            -TimeoutSec 20
    }
    catch {
        $response = $_.Exception.Response
        $statusCode = if ($response) { [int]$response.StatusCode } else { 'network' }
        throw "Authenticated production status request failed ($statusCode)."
    }

    if ($status.status -ne 'ok') {
        throw 'The production status endpoint returned an unexpected response.'
    }

    $legacy = $status.legacyReservation
    $summary = [ordered]@{
        status = $status.status
        budgetDay = $status.budgetDay
        activeSlots = $status.activeInferenceSlots
        concurrencyLimit = $status.configuredConcurrencyLimit
        settledNeurons = $status.estimatedSettledNeurons
        reservedNeurons = $status.estimatedReservedNeurons
        unresolvedReservationCount = $status.unresolvedReservationCount
        legacyReservation = if ($legacy) {
            [ordered]@{
                status = $legacy.status
                settlementState = $legacy.settlementState
                reservedNeurons = $legacy.reservedNeurons
                accountedNeurons = $legacy.accountedNeurons
                slotActive = $legacy.slotActive
            }
        } else {
            $null
        }
        recoveryMode = $status.recovery.mode
        uncertaintyExposureAttempts = $status.recovery.exposure.count
        uncertaintyExposureNeurons = $status.recovery.exposure.neurons
    }
    ConvertTo-Json -InputObject $summary -Depth 5 -Compress
}
finally {
    if ($credentialPointer -ne [IntPtr]::Zero) {
        [MyVerseCredentialStore]::CredFree($credentialPointer)
    }
    if ($credentialBytes) {
        [Array]::Clear($credentialBytes, 0, $credentialBytes.Length)
    }
    $headers = $null
    $adminToken = $null
}
