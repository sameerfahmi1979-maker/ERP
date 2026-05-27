# PROMPT_ERP_BASE_001F_FONT — Apply Inter Font Globally Across ERP App

Act as a senior Next.js App Router frontend engineer, enterprise ERP UI/UX designer, Tailwind CSS specialist, and production UI quality auditor.

## Purpose

Change the entire ERP application font to **Inter** globally.

This is a UI styling change only.

Do not modify Supabase Auth.

Do not modify middleware.

Do not modify RLS policies.

Do not modify database migrations.

Do not modify backend/server query logic.

Do not start Phase 002.

## Required Font

Use:

```text
Inter
```

Apply it globally across the entire app:

- dashboard
- sidebar
- topbar/header
- admin pages
- tables
- forms
- buttons
- cards
- dialogs
- auth pages
- profile/settings pages
- all protected and auth routes

## Preferred Next.js Method

Use the official Next.js font optimization method:

```ts
import { Inter } from "next/font/google"
```

Recommended configuration:

```ts
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})
```

Apply it in the root layout, usually:

```text
src/app/layout.tsx
```

or the correct global root layout file used by this project.

The body should include the Inter variable/class globally.

Example pattern:

```tsx
<body className={`${inter.variable} font-sans antialiased`}>
```

## Tailwind Configuration

If the project uses Tailwind configuration for fonts, update it so `font-sans` resolves to Inter.

Depending on current Tailwind version/config, update one of the following safely:

- `tailwind.config.ts`
- global CSS theme variables
- `src/app/globals.css`

Preferred font stack:

```ts
fontFamily: {
  sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
}
```

If Tailwind v4 is being used with CSS variables, apply the equivalent CSS variable approach.

Do not break existing Tailwind setup.

## Global CSS

Check global CSS file, likely:

```text
src/app/globals.css
```

Ensure no conflicting font-family overrides are forcing another font.

Remove or override old font references safely.

Do not add external `<link>` tags to Google Fonts if `next/font/google` is used.

Do not import fonts manually in CSS using `@import`.

## UI Consistency Check

After applying Inter, review these pages visually:

```text
http://localhost:3000/dashboard
http://localhost:3000/admin/users
http://localhost:3000/admin/organizations
http://localhost:3000/admin/roles
http://localhost:3000/login
```

Check that:

- table text uses Inter
- sidebar text uses Inter
- topbar/search uses Inter
- buttons use Inter
- auth pages use Inter
- no old serif/browser default font remains
- font weights look balanced
- spacing still looks correct

## Safety Rules

Do not touch:

```text
supabase/migrations/**
supabase/config.toml
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
scripts/bootstrap-admin.mjs
.env.local
.env.local.example
src/server/queries/**
```

Do not add:

- new UI framework
- new auth provider
- external font package
- CSS font import from CDN

## Validation Required

Run from clean path:

```text
C:\dev\agt-erp
```

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

## Required Report

Create:

```text
ERP_BASE_001F_FONT_INTER_REPORT.md
```

The report must include:

- files modified
- where Inter was imported
- how Inter was applied globally
- whether Tailwind `font-sans` uses Inter
- validation results
- confirmation that auth/RLS/database/backend files were untouched
- screenshots path if screenshots were created

## Acceptance Criteria

This change is complete only if:

- Inter is applied globally.
- All major pages inherit Inter.
- No manual CDN font links are used.
- No CSS `@import` for Google Fonts is used.
- Lint passes.
- Typecheck passes.
- Build passes.
- No auth/RLS/database/backend files changed.

## Final Instruction

Apply Inter globally and stop after validation/report.

Do not start Phase 002.
