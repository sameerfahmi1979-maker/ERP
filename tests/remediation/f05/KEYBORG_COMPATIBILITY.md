# Fluent focus runtime compatibility

The scoped npm override in the root package.json pins `@fluentui/react-tabster`'s
`tabster` dependency to **8.8.0**. This satisfies Fluent's declared `^8.8.0` range.
Fluent 9.26.18 uses Keyborg `^2.14.1`; Tabster 8.8.0 uses `^2.14.0`, so both
resolve the same Keyborg 2.14.1 module.

Tabster 8.8.1 instead brought Keyborg 3.498.0 alongside Fluent's 2.14.1. Both
versions keep module-local `k1`, `k2`, ... counters but share `window.__keyborg`.
Two instances therefore overwrite the same reference. Reproduction demonstrated
lost keyboard-state callbacks and `Keyborg instance k1 is being disposed incorrectly`.
The warning is development-only; the ownership collision is not solved by hiding it.

Keep StrictMode, Fast Refresh, console errors and Fluent keyboard accessibility
enabled. Do not patch node_modules, disable SSR, replace the provider with a no-op,
or force an unsupported Keyborg major into Tabster 8.8.1.

Tabster 8.8.0's legacy CommonJS main also needs named-export interop in native
Node test runners. The shared `fluent-test-config.mts` transforms the real Fluent
and Tabster modules through Vite in the F04/F05/combined remediation configurations.
It does not mock dependencies, skip assertions or hide runtime errors. This is
separate from the application fix; both Next production build and Turbopack
browser checks run without that test-runner setting. Upstream missing source-map
files can produce a tooling warning in Vite; retain it, do not suppress it.

Remove/revise the override only when upstream Fluent/Tabster versions resolve a
compatible single Keyborg runtime, and both the installed-graph/lifecycle tests
and actual Turbopack development browser journeys pass.

Regression commands from the ERP root (all generated evidence stays under C:\dev):

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'
node node_modules/vitest/vitest.mjs run --config tests/remediation/f05/vitest.config.mts tests/remediation/f05/keyborg-lifecycle.test.ts
node tests/remediation/f05/dev-focus-browser.cjs after
```

The browser fixture copies the exact ERP provider/dialog/theme source. Its own
root ThemeProvider, no-backend proxy and sanitized environment keep it independent
of ERP credentials/data. It checks StrictMode, modal focus/return, menu keyboard
navigation, theme changes, keyed remount/unmount, route return, hard reload,
provider Fast Refresh with retained input and keyboard focus indicators. It kills
only its own localhost server; it never changes the user's running ERP server.
