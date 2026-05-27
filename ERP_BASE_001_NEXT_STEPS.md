# ERP_BASE_001 — Next Steps

**Date:** 2026-05-27

---

## Immediate (your action required)

### 1. Approve database migration

Review:

`supabase/migrations/20260527120000_erp_base_foundation.sql`

Then run (after Supabase CLI login + link):

```bash
supabase link --project-ref mmiefuieduzdiiwnqpie
supabase db push
```

**Reply with approval** before pushing if you want the agent to run this step.

### 2. Configure environment

Create `.env.local` from `.env.local.example` with:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server/scripts only)

### 3. First admin bootstrap

1. Create/sign up Auth user
2. `npm run bootstrap:admin -- your.email@company.com`

### 4. Fix build path (recommended)

Move repo to a path **without** `&` characters, e.g. `C:\dev\agt-erp`, then:

```bash
npm run build
```

---

## Phase 002 recommendations

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
