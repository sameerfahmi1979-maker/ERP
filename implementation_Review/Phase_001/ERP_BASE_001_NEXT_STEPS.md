# ERP_BASE_001 — Next Steps

**Date:** 2026-05-27  
**Updated:** 2026-05-27 12:05 PM — **SUCCESSFULLY DEPLOYED TO PRODUCTION** ✅

---

## Deployment Status

✅ **Migration successfully pushed to Supabase Cloud**
- Project: mmiefuieduzdiiwnqpie
- Tables created: 8/8
- RLS enabled: 8/8
- Seed data: Roles (16), Permissions (27), Role-Permissions (54)
- All security hardenings applied (001A, 001B, 001C)

See `ERP_BASE_001_DEPLOYMENT_REPORT.md` for full details.

---

## Immediate Post-Deployment Actions (Required Now)

### 1. Configure Environment Variables

Get your keys from Supabase Dashboard and create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://mmiefuieduzdiiwnqpie.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 2. Create First Admin User

```bash
# 1. Sign up via the app at /signup
# 2. Run bootstrap script
npm run bootstrap:admin -- your.email@company.com
```

This will assign the `system_admin` role with global null scope to your user.

### 3. Disable Public Signup (Production Security)

In Supabase Dashboard:
- Go to Authentication → Providers
- Disable "Enable email signup"
- Use invite-only for production

### 4. Generate TypeScript Types

```bash
npx supabase gen types typescript --project-id mmiefuieduzdiiwnqpie > src/types/supabase.ts
```

This will create type-safe database types for your application.

---

## Testing the Deployment

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:3000/signup`
3. Create your admin account
4. Run bootstrap script
5. Login and verify dashboard access

---

## Phase 002 Planning — Organization & User Admin

1. **Organizations & branches CRUD** — forms + server actions with audit logging
2. **User admin service queries** — list auth emails via server-only admin API (never expose service role to client)
3. **Invite-only auth** — disable public signup in Supabase dashboard
4. **Generate Supabase types** — `supabase gen types typescript`
5. **HR module** (or Fleet) as first business module on BIGINT schema
6. **Playwright smoke tests** — login, dashboard, admin guard
7. **Azure/Vercel hosting** pipeline (when ready)

---

## Known risks

| Risk | Notes |
|------|-------|
| Existing Supabase tables | Migration may conflict if names exist — review remote schema first |
| OneDrive sync | Can slow `node_modules`; prefer local non-synced dev folder |
| Corporate TLS | shadcn registry needed `NODE_TLS_REJECT_UNAUTHORIZED=0` temporarily |
| Windows `&` in path | Breaks npm `.bin` shims; use `node .../next` directly |

---

## Clear next phase

**Prompt 002 — Organization & User Admin completion:** CRUD for `owner_companies` and `branches`, user role assignment UI, audit log listing, and Supabase type generation after migration is live.
