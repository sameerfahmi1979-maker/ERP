---
last_updated: 2026-05-27T08:27:01Z
---

# Architecture Design

## System Overview
Alliance Gulf Transport ERP - a modern enterprise resource planning web application with dashboard, admin panels, and module navigation. Pure frontend SPA with React Router for navigation.

## Tech Stack
- React 18 + TypeScript
- Vite (build tool)
- shadcn/ui component library
- Tailwind CSS (styling)
- React Router (navigation)
- TanStack Query (data fetching ready)

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| Layout | App shell with sidebar + header | AppLayout.tsx, AppSidebar.tsx, AppHeader.tsx |
| Auth | Login page with split-screen design | Login.tsx |
| Dashboard | KPI cards, activity feed, module grid | Dashboard.tsx |
| Admin | User management with data tables | AdminUsers.tsx |
| Theme | Dark/light mode support | theme-provider.tsx, index.css |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Routing | React Router v6 | Standard SPA routing |
| Styling | Tailwind + CSS variables | Theme-able, dark mode support |
| Components | shadcn/ui | Consistent, accessible, customizable |
| State | Local state + context | Simple enough for current scope |

## File Tree Plan
```
src/
├── App.tsx (router setup)
├── index.css (theme variables)
├── components/
│   ├── layout/ (AppLayout, AppSidebar, AppHeader)
│   ├── theme-provider.tsx
│   └── ui/ (shadcn components)
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── AdminUsers.tsx
│   ├── NotFound.tsx
│   └── Index.tsx (redirect)
└── lib/utils.ts
```

## Implementation Guide
- All pages use AppLayout wrapper for consistent sidebar + header
- Login page is standalone (no layout wrapper)
- Theme variables in index.css control all colors
- Images served from CDN (generated assets)

