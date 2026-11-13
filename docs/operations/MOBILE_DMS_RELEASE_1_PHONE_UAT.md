# Mobile DMS Release 1 Android acceptance

Run these checks on Android Chrome against a test ERP environment over HTTPS or a USB forwarded localhost test instance. Use synthetic documents and ordinary pilot accounts with the intended DMS, HR or PRO grants. Record the ERP build ID, device, Android and Chrome versions, test account role, and company and branch scope for each run.

Open `/dms/mobile` in Chrome and sign in. Tap **Install on Android**. If Chrome does not offer an install prompt on the page, use Chrome’s menu to choose **Add to Home screen**, then **Install** if offered. Launch **Mobile DMS** from the Android home screen.

## Local Android test on Windows

With the synthetic ERP running on port 3199 and its synthetic Supabase gateway on port 3198, connect the Android phone by USB. Enable USB debugging on the phone and approve the prompt for your PC. Run the following in PowerShell. If multiple Android devices are connected, add `-s DEVICE_SERIAL` before `reverse`.

```powershell
& 'C:\Android\Sdk\platform-tools\adb.exe' reverse tcp:3198 tcp:3198
& 'C:\Android\Sdk\platform-tools\adb.exe' reverse tcp:3199 tcp:3199
```

Open `http://127.0.0.1:3199/dms/mobile` on the phone and use the synthetic pilot account. The local instance can exercise capture and upload. AI analysis and approval from a real AI result require a test environment with an authorized provider configuration. For the USB connection test, disconnect USB during upload and reapply both forwardings if needed after reconnecting. Use the HTTPS test site for a separate Wi-Fi or mobile signal loss check.

## Acceptance checks

| Check | Steps | Pass condition |
| --- | --- | --- |
| Install and sign in | Install from Android Chrome. Launch from the home screen, then sign out and launch it again. | The launcher icon opens `/dms/mobile` in its own window. A signed out user goes through ERP sign-in and returns to Mobile DMS. |
| Capture two pages | In an employee record, open Documents → Capture on phone. Photograph two marked pages, reverse their order, preview them and upload. Repeat from a work site record. | Each upload contains both pages in the displayed order. The intake shows the correct capture record and the saved document links to that record. |
| Select existing files | Use the Android file picker to select one PDF. Then select two JPEG or PNG photos in a fresh draft. | The original PDF is accepted, and the selected photos can be reordered and uploaded together. |
| Upload with no known record | Open Documents → Mobile DMS → Capture. Add a document and select its permitted company or branch. | The upload uses the chosen ownership scope and has no preselected ERP record. |
| Recover an offline draft | Open Capture while online. Disable connectivity, add or reorder pages, reconnect, then close and reopen the same capture route. | The selected files and order are preserved. A different ERP account cannot see the draft. Removing the final page clears the local draft. |
| Recover an interrupted transfer | Start uploading a synthetic document and interrupt connectivity during transfer. Reconnect, reopen Capture and retry. Start AI processing and recover from a lost or delayed response by checking the existing upload. | The Upload Inbox has one session for the test file. The same session reaches review with one AI analysis. The captured bytes are removed from the local draft after upload confirmation. |
| Review and approve | Open the ready intake. Preview the file, correct an extracted field, confirm the linked record and required file checks, then approve with an authorized account. | The reviewer can complete the flow on the phone. The saved document shows the corrected value and the intended linked record. |
| Browse, preview and download | Search by document number and filter by type. Open a matching record, check its expiry and versions, and preview and download the original. Repeat with an account without the corresponding grant or access to the company, branch or sensitive document. | The authorized account can find the document, see its expiry and version, and open or save the correct original. The unauthorized account is denied the restricted record or action. |

Record pass or fail by device. For an interrupted upload, keep the session code and an authorized test environment check of the analysis count. Use synthetic file names and keep screenshots free of employee data and signed URLs.
