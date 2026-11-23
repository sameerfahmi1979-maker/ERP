param(
    [Parameter(Mandatory)][string]$SigningKey,
    [Parameter(Mandatory)][string]$SigningPasswordFile,
    [string]$KeyAlias = 'algt-mobile-dms',
    [string]$UploadSigningKey,
    [string]$UploadSigningPasswordFile,
    [string]$UploadKeyAlias,
    [ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$PlayUploadCertificateSha256,
    [string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$PublicErpConfig = 'C:\dev\agt-erp\.env.local',
    [string]$Bundletool = 'C:\dev\.cache\mobile-enhancement-20261123\bundletool\bundletool-all-1.18.3.jar',
    [switch]$FirebaseConfigured,
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'
$employeeCertificate = '9a3131f646424868959a99c1e1f25ff00c52f7b6046dd58377dd9330ccccb234'
$bundletoolSha256 = 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29'
$wrapperSha256 = '81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f'
$cacheRoot = 'C:\dev\.cache\mobile-enhancement-20261123'

if (!$UploadSigningKey -and !$UploadSigningPasswordFile -and !$UploadKeyAlias) {
    $UploadSigningKey = $SigningKey
    $UploadSigningPasswordFile = $SigningPasswordFile
    $UploadKeyAlias = $KeyAlias
} elseif (!$UploadSigningKey -or !$UploadSigningPasswordFile -or !$UploadKeyAlias) {
    throw 'Supply the upload key, its protected password input and its alias together.'
}
if (!$PlayUploadCertificateSha256 -and
    ($UploadSigningKey -ne $SigningKey -or $UploadKeyAlias -ne $KeyAlias)) {
    throw 'A separate upload signer requires its expected Play upload certificate SHA-256.'
}
$expectedUploadCertificate = $employeeCertificate
if ($PlayUploadCertificateSha256) { $expectedUploadCertificate = $PlayUploadCertificateSha256 }

$buildTools = Join-Path $Sdk 'build-tools\36.0.0'
$java = Join-Path $env:JAVA_HOME 'bin\java.exe'
$jarsigner = Join-Path $env:JAVA_HOME 'bin\jarsigner.exe'
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
$aapt = Join-Path $buildTools 'aapt2.exe'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'
$gradle = Join-Path $PSScriptRoot 'gradlew.bat'
$wrapper = Join-Path $PSScriptRoot 'gradle\wrapper\gradle-wrapper.jar'
$platform = Join-Path $Sdk 'platforms\android-36\android.jar'
$verifyNative = Join-Path $PSScriptRoot 'Verify-MobileDmsNative.py'

foreach ($inputPath in @($SigningKey, $SigningPasswordFile, $UploadSigningKey,
        $UploadSigningPasswordFile, $PublicErpConfig, $Bundletool, $wrapper, $platform,
        $java, $jarsigner, $keytool, $aapt, $zipalign, $apksigner, $gradle, $verifyNative)) {
    if (!(Test-Path -LiteralPath $inputPath -PathType Leaf)) {
        throw 'Required Android build input is missing. Check the JDK, SDK, bundletool and protected signer arguments.'
    }
}
if ((Get-FileHash -LiteralPath $Bundletool -Algorithm SHA256).Hash -ne $bundletoolSha256) {
    throw 'Bundletool checksum mismatch.'
}
if ((Get-FileHash -LiteralPath $wrapper -Algorithm SHA256).Hash -ne $wrapperSha256) {
    throw 'Gradle wrapper checksum mismatch.'
}
$javaVersion = @(& $java -version 2>&1 | ForEach-Object ToString) -join [Environment]::NewLine
if ($LASTEXITCODE -ne 0 -or $javaVersion -notmatch '(?m)^(?:openjdk|java) version "17[.]') {
    throw 'The Android release build requires JAVA_HOME to point to JDK 17.'
}
$python = (Get-Command python -CommandType Application | Select-Object -First 1).Source

function Invoke-Checked([string]$Tool, [string[]]$Arguments) {
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw ('{0} failed with exit code {1}.' -f (Split-Path -Leaf $Tool), $LASTEXITCODE)
    }
}

function Invoke-ProtectedSigner([string]$PasswordFile, [string]$Tool, [string[]]$Arguments) {
    $securePassword = $null
    $pointer = [IntPtr]::Zero
    $previousPassword = $env:ALGT_MOBILE_SIGN_STORE_PASS
    try {
        $securePassword = ConvertTo-SecureString ([IO.File]::ReadAllText($PasswordFile).Trim())
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $env:ALGT_MOBILE_SIGN_STORE_PASS = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        Invoke-Checked $Tool $Arguments
    } finally {
        $env:ALGT_MOBILE_SIGN_STORE_PASS = $previousPassword
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
        if ($null -ne $securePassword) { $securePassword.Dispose() }
    }
}

function Get-OnlyArtifact([string]$Directory, [string]$Filter) {
    $artifacts = @(Get-ChildItem -LiteralPath $Directory -File -Filter $Filter)
    if ($artifacts.Count -ne 1) { throw "Expected one unsigned release artifact of type $Filter." }
    return $artifacts[0].FullName
}

$environment = @{
    ANDROID_HOME = [IO.Path]::GetFullPath($Sdk)
    ANDROID_SDK_ROOT = [IO.Path]::GetFullPath($Sdk)
    ANDROID_USER_HOME = Join-Path $cacheRoot 'android-user'
    GRADLE_USER_HOME = Join-Path $cacheRoot 'gradle'
    TEMP = Join-Path $cacheRoot 'tmp'
    TMP = Join-Path $cacheRoot 'tmp'
}
$originalEnvironment = @{}
foreach ($name in $environment.Keys) {
    $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name)
    [Environment]::SetEnvironmentVariable($name, $environment[$name])
}
$null = New-Item -ItemType Directory -Path $environment.ANDROID_USER_HOME, $environment.TEMP -Force
try {
    $gradleArgs = @('--project-dir', $PSScriptRoot, '--no-daemon', '--console=plain',
        "-PalgtPublicErpConfig=$PublicErpConfig", "-PalgtFirebaseConfigured=$($FirebaseConfigured.IsPresent.ToString().ToLowerInvariant())",
        'testReleaseUnitTest', 'assembleRelease', 'bundleRelease')
    if ($Offline) { $gradleArgs += '--offline' }
    Invoke-Checked $gradle $gradleArgs

    $apk = Get-OnlyArtifact (Join-Path $PSScriptRoot 'build\outputs\apk\release') '*-unsigned.apk'
    $aab = Get-OnlyArtifact (Join-Path $PSScriptRoot 'build\outputs\bundle\release') '*.aab'
    $runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $stage = Join-Path $PSScriptRoot "build\candidates\$runId"
    $null = New-Item -ItemType Directory -Path $stage
    $aligned = Join-Path $stage 'aligned-unsigned.apk'
    $signedApk = Join-Path $stage 'ALGT-ERP-System-1.0-12-candidate.apk'
    $signedAab = Join-Path $stage 'ALGT-ERP-System-1.0-12-upload-candidate.aab'
    $splitSet = Join-Path $stage 'bundletool-verification.apks'

    Invoke-Checked $zipalign @('-f', '-P', '16', '4', $apk, $aligned)
    Invoke-ProtectedSigner $SigningPasswordFile $apksigner @('sign', '--ks', $SigningKey, '--ks-type', 'PKCS12',
        '--ks-key-alias', $KeyAlias, '--ks-pass', 'env:ALGT_MOBILE_SIGN_STORE_PASS',
        '--key-pass', 'env:ALGT_MOBILE_SIGN_STORE_PASS', '--v1-signing-enabled', 'false',
        '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true', '--v4-signing-enabled', 'false',
        '--out', $signedApk, $aligned)
    Invoke-Checked $zipalign @('-c', '-P', '16', '4', $signedApk)
    $apkSignature = (Invoke-Checked $apksigner @('verify', '--verbose', '--print-certs', $signedApk)) -join [Environment]::NewLine
    $certificates = [regex]::Matches($apkSignature, 'certificate SHA-256 digest: ([a-fA-F0-9]{64})')
    if ($certificates.Count -ne 1 -or $certificates[0].Groups[1].Value -ne $employeeCertificate -or
        $apkSignature -notmatch 'Verified using v2 scheme .+: true' -or
        $apkSignature -notmatch 'Verified using v3 scheme .+: true') {
        throw 'APK signing certificate or signature schemes failed verification.'
    }

    Invoke-ProtectedSigner $UploadSigningPasswordFile $jarsigner @('-keystore', $UploadSigningKey,
        '-storetype', 'PKCS12', '-storepass:env', 'ALGT_MOBILE_SIGN_STORE_PASS',
        '-keypass:env', 'ALGT_MOBILE_SIGN_STORE_PASS', '-signedjar', $signedAab, $aab, $UploadKeyAlias) | Out-Null
    $aabSignature = (Invoke-Checked $jarsigner @('-verify', $signedAab)) -join [Environment]::NewLine
    if ($aabSignature -notmatch '(?m)^\s*jar verified[.]') { throw 'AAB JAR signature failed verification.' }
    $aabCertInfo = (Invoke-Checked $keytool @('-printcert', '-jarfile', $signedAab)) -join [Environment]::NewLine
    $aabCerts = [regex]::Matches($aabCertInfo, '(?m)^\s*SHA256:\s*((?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2})')
    if ($aabCerts.Count -ne 1 -or $aabCerts[0].Groups[1].Value.Replace(':', '') -ne $expectedUploadCertificate) {
        throw 'AAB upload certificate failed verification.'
    }

    $badging = (Invoke-Checked $aapt @('dump', 'badging', $signedApk)) -join [Environment]::NewLine
    foreach ($expected in @(
        "(?m)^package: name='net.algt.mobiledms' versionCode='12' versionName='1[.]0'",
        "(?m)^minSdkVersion:'26'", "(?m)^targetSdkVersion:'36'",
        "(?m)^application-label:'ALGT ERP System'",
        "(?m)^launchable-activity: .*label='ALGT ERP'")) {
        if ($badging -notmatch $expected) { throw 'APK identity, branding or SDK failed verification.' }
    }
    if ($badging -notmatch "(?m)^\s*uses-feature-not-required: name='android[.]hardware[.]location'\s*$" -or
        $badging -match "(?m)^\s*uses-(?:implied-)?feature: name='android[.]hardware[.]location(?:[.][^']+)?'") {
        throw 'APK declares or implies a required location hardware feature.'
    }

    Invoke-Checked $java @('-jar', $Bundletool, 'validate', "--bundle=$signedAab") | Out-Null
    $bundleConfig = (Invoke-Checked $java @('-jar', $Bundletool, 'dump', 'config', "--bundle=$signedAab")) -join [Environment]::NewLine
    if ($bundleConfig -notmatch '\bPAGE_ALIGNMENT_16K\b') { throw 'AAB does not request 16 KiB native ZIP alignment.' }
    [xml]$manifest = (Invoke-Checked $java @('-jar', $Bundletool, 'dump', 'manifest',
        "--bundle=$signedAab", '--module=base')) -join [Environment]::NewLine
    $androidNamespace = 'http://schemas.android.com/apk/res/android'
    $manifestRoot = $manifest.DocumentElement
    if ($manifestRoot.GetAttribute('package') -ne 'net.algt.mobiledms' -or
        $manifestRoot.GetAttribute('versionCode', $androidNamespace) -ne '12' -or
        $manifestRoot.GetAttribute('versionName', $androidNamespace) -ne '1.0' -or
        $manifestRoot.SelectSingleNode('uses-sdk').GetAttribute('minSdkVersion', $androidNamespace) -ne '26' -or
        $manifestRoot.SelectSingleNode('uses-sdk').GetAttribute('targetSdkVersion', $androidNamespace) -ne '36') {
        throw 'AAB identity or target SDK failed verification.'
    }
    $locationFeatures = @($manifestRoot.SelectNodes('uses-feature') | Where-Object {
        $_.GetAttribute('name', $androidNamespace) -match '^android[.]hardware[.]location(?:[.]|$)'
    })
    if ($locationFeatures.Count -ne 1 -or
        $locationFeatures[0].GetAttribute('name', $androidNamespace) -ne 'android.hardware.location' -or
        $locationFeatures[0].GetAttribute('required', $androidNamespace) -ne 'false') {
        throw 'AAB must declare location hardware as optional.'
    }
    Invoke-Checked $java @('-jar', $Bundletool, 'build-apks', "--bundle=$signedAab", "--output=$splitSet")
    $native = (Invoke-Checked $python @($verifyNative, $signedApk, $splitSet)) -join [Environment]::NewLine | ConvertFrom-Json

    $receipt = [ordered]@{
        status = 'local candidate'
        applicationId = 'net.algt.mobiledms'
        versionName = '1.0'
        versionCode = 12
        compileSdk = 36
        targetSdk = 36
        minSdk = 26
        buildTools = '36.0.0'
        locationHardwareOptional = $true
        firebaseClientConfigured = $FirebaseConfigured.IsPresent
        playUploadCertificateSuppliedByOperator = [bool]$PlayUploadCertificateSha256
        apk = [ordered]@{
            file = (Split-Path -Leaf $signedApk)
            sha256 = (Get-FileHash -LiteralPath $signedApk -Algorithm SHA256).Hash.ToLowerInvariant()
            unsignedSha256 = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
            certificateSha256 = $employeeCertificate
            signatureSchemes = @(2, 3)
        }
        aab = [ordered]@{
            file = (Split-Path -Leaf $signedAab)
            sha256 = (Get-FileHash -LiteralPath $signedAab -Algorithm SHA256).Hash.ToLowerInvariant()
            unsignedSha256 = (Get-FileHash -LiteralPath $aab -Algorithm SHA256).Hash.ToLowerInvariant()
            certificateSha256 = $expectedUploadCertificate.ToLowerInvariant()
            nativeAlignment = 'PAGE_ALIGNMENT_16K'
        }
        native = $native
    }
    $receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $stage 'release-receipt.json') -Encoding utf8
    $badging | Set-Content -LiteralPath (Join-Path $stage 'apk-badging.txt') -Encoding utf8
    $manifest.OuterXml | Set-Content -LiteralPath (Join-Path $stage 'aab-manifest.xml') -Encoding utf8
    Write-Output $stage
} finally {
    foreach ($name in $originalEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name])
    }
}
