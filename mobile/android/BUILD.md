# ALGT ERP Android build

The Android project uses its existing Java and resource directories. Gradle builds the API 36 APK and Play app bundle from the same source. The public release label is **1.0 Build 1**, with Android internal `versionCode` 14 for updates from code 13. Check the highest Play version code before submitting.

## Toolchain and inputs

- JDK 17 with `JAVA_HOME` set, Android SDK platform 36, Build Tools 36.0.0 and NDK r27b (27.1.12297006) with `ANDROID_HOME` set, and Python 3 on `PATH` for package verification.
- Gradle Wrapper 8.13 and Android Gradle Plugin 8.12.2. The wrapper checks the distribution checksum. The dependency lock and verification metadata pin the resolved artifacts.
- Bundletool 1.18.3 from the upstream release. The release wrapper checks its SHA-256 before use. Store it under `C:\dev\.cache\mobile-enhancement-20261123\bundletool` or supply `-Bundletool`. [Official release](https://github.com/google/bundletool/releases/tag/1.18.3)
- The existing public ERP client key file. Pass its path with `-PublicErpConfig` for release signing or `-PalgtPublicErpConfig` for direct Gradle builds. The generator accepts a public publishable key or the approved project's `anon` JWT.
- For signing, supply the protected employee PKCS#12 key and its DPAPI password file paths. The certificate is pinned to the published employee APK. JDK and Android signing subprocesses read the password from a temporary process environment variable.

## Compile and test

From this directory in PowerShell:

```powershell
$env:GRADLE_USER_HOME = 'C:\dev\.cache\mobile-enhancement-20261123\gradle'
$env:ANDROID_USER_HOME = 'C:\dev\.cache\mobile-enhancement-20261123\android-user'
.\gradlew.bat --no-daemon --console=plain testReleaseUnitTest lintRelease assembleRelease bundleRelease
```

Unsigned outputs are in `build\outputs\apk\release` and `build\outputs\bundle\release`.

For the configured push variant, supply the registered `net.algt.mobiledms` Firebase Android client JSON as the ignored `google-services.json` in this module and add `-PalgtFirebaseConfigured=true` to Gradle, or `-FirebaseConfigured` to the release wrapper. The default build carries the messaging SDK and keeps token auto-init off. The configured variant still requires a working server-side FCM identity and authorized device registration. [Firebase Android configuration](https://firebase.google.com/docs/android/setup)

## Produce an isolated signed candidate

```powershell
.\Build-MobileDmsRelease.ps1 `
    -SigningKey $employeeKeystorePath `
    -SigningPasswordFile $employeeDpapiPasswordFile `
    -Sdk $env:ANDROID_HOME
```

The release wrapper creates a unique candidate directory in `build\candidates`. It verifies package identity, API levels, labels, APK signature schemes and certificate, AAB signature and manifest, bundletool validation, and 16 KiB ZIP and 64-bit ELF alignment in the employee APK and generated Play splits. The candidate receipt records both artifacts and their checksums. `-Offline` uses the provisioned Gradle dependency cache.

By default, the candidate bundle is signed with the known employee key for local verification. Once the Play upload certificate is independently confirmed, pass its SHA-256 with `-PlayUploadCertificateSha256`. If it is a separate key, also pass `-UploadSigningKey`, `-UploadSigningPasswordFile` and `-UploadKeyAlias` together. Play must keep the current app-signing certificate for in-place customer updates and existing App Links. [Play App Signing](https://developer.android.com/studio/publish/app-signing)

## Release acceptance

Verify authorized device installation and same-signer update from the current employee release. Check signed-in DMS and HR behavior, App Links, Android 16 insets and back navigation, and physical 16 KiB behavior. Verify Play acquisition and update delivery through an authorized Play track. Confirm the Play account, registration, certificates, policy declarations and owner release approval before submitting.
