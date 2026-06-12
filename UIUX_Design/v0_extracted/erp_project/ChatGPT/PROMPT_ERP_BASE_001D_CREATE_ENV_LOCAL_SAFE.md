# PROMPT_ERP_BASE_001D — Create Local Environment File Safely

Act as a senior Next.js runtime tester, Supabase security reviewer, and SaaS secret-management auditor.

## Purpose

Create the local `.env.local` file for the ERP Base project and verify that the app can read the Supabase environment variables.

Do not print secrets in terminal output, logs, reports, screenshots, or markdown files.

Do not commit `.env.local`.

Do not push anything to GitHub.

## Current Supabase Project

Project URL:

```env
NEXT_PUBLIC_SUPABASE_URL=https://mmiefuieduzdiiwnqpie.supabase.co
```

Project ref:

```text
mmiefuieduzdiiwnqpie
```

## Required File

Create this file in the project root:

```text
.env.local
```

Use the Supabase anon key and service-role key provided by the user in the local Cursor chat/session.

Important:

- Do not store these keys anywhere except `.env.local`.
- Do not paste them into reports.
- Do not paste them into source code.
- Do not paste them into `.env.local.example`.
- Do not expose the service-role key to frontend/client code.

## Required `.env.local` Structure

The file must contain exactly these variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://mmiefuieduzdiiwnqpie.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<PASTE_USER_PROVIDED_ANON_KEY_HERE>
SUPABASE_SERVICE_ROLE_KEY=<PASTE_USER_PROVIDED_SERVICE_ROLE_KEY_HERE>
```

Only add `SUPABASE_DB_PASSWORD` if it is required for Supabase CLI database push and the user provides it separately:

```env
SUPABASE_DB_PASSWORD=<PASTE_DB_PASSWORD_ONLY_IF_REQUIRED>
```

Do not invent a database password.

## Git Ignore Verification

Check `.gitignore`.

Ensure it contains:

```gitignore
.env.local
.env*.local
```

If missing, add them.

Do not add `.env.local` to Git.

Run:

```bash
git status --short
```

Confirm `.env.local` is not staged.

## Runtime Verification

After creating `.env.local`, verify the app can read environment variables safely.

Use checks that only confirm presence, never print values.

Example safe check:

```bash
node -e "console.log({ url: !!process.env.NEXT_PUBLIC_SUPABASE_URL, anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service: !!process.env.SUPABASE_SERVICE_ROLE_KEY })"
```

Expected output must only be booleans, not actual secret values.

## Supabase CLI Link and Migration Push

If the database migration was already approved by the user, run:

```bash
supabase link --project-ref mmiefuieduzdiiwnqpie
supabase db push
```

If Supabase CLI requests a database password and it is not available, stop and ask the user for the database password. Do not guess it.

Do not use the service-role key as the database password.

## First Admin Bootstrap

After migration push succeeds and after the first user exists in Supabase Auth, run:

```bash
npm run bootstrap:admin -- <USER_EMAIL>
```

Replace `<USER_EMAIL>` with the actual email that should become system admin.

For Sameer, use the email only if the user confirms which email should be the first admin.

## Required Report

Create:

```text
ERP_BASE_001D_ENV_SETUP_REPORT.md
```

The report must include:

- `.env.local` created: yes/no
- `.gitignore` verified: yes/no
- Secret values printed anywhere: must be no
- Supabase variables present: yes/no using boolean status only
- Migration pushed: yes/no
- If migration push failed, exact error summary without secrets
- Admin bootstrap completed: yes/no
- If admin bootstrap failed, exact error summary without secrets

## Strict Rules

Do not:

- Print the anon key.
- Print the service-role key.
- Commit `.env.local`.
- Put service-role key into any frontend file.
- Put service-role key into `NEXT_PUBLIC_*`.
- Use service-role key in browser/client components.
- Store secrets in reports.
- Store secrets in markdown documentation.
- Push to GitHub.
- Run Phase 002.

## Final Instruction

Create `.env.local` locally, verify safely, and generate the report.

Stop after the report unless the user explicitly asks to continue.
