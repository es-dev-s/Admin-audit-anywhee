# Audit Dashboard — E2E Verification, UI/UX & Redesign Context Report

**Generated:** 2026-04-18  
**Project folder:** `Audit-dashboard/studious-dollop/` (Next.js app name in `package.json`: `audit-dashboard`)  
**Purpose:** Give assistants (e.g. Claude) a **single document** that explains **what the product is**, **how users move through it end-to-end**, **how the UI is built**, and **what must stay stable** during a **UI/UX refinement or visual redesign**—without breaking auth, signaling, or API contracts.

---

## How to use this document (for humans & AI)

1. **Product intent:** Read [Product snapshot](#product-snapshot) and [Primary user journeys (E2E)](#primary-user-journeys-end-to-end-verification).
2. **Visual redesign:** Use [UI system & experience audit](#ui-system--experience-audit) and [Redesign priorities & safe boundaries](#redesign-priorities--safe-boundaries).
3. **Behavioral truth:** Treat [Logic & contracts to preserve](#logic--contracts-to-preserve-non-ui) and the referenced files as **immutable unless you add tests / parity checks**.
4. **Verification:** Use the E2E tables as a **manual QA checklist** or to derive automated tests.

---

## Product snapshot

**Audit Dashboard** is a **web console for auditors / team leads** to observe **organization (team) rosters**, **live screen streams** (WebRTC via a signaling layer), **browser/extension analytics** for a selected member, **screen captures** with date filters, and **access-sharing** workflows. Authentication is **custom JWT** in cookies, with **middleware** refresh and optional **enterprise IP allowlisting**. The shell is **sidebar + topbar**; **“cinema mode”** hides chrome on the **numeric** member stream route `/audit/:teamId/:memberId`.

---

## Tech stack (authoritative)

| Layer | Choice |
|-------|--------|
| Framework | Next.js **16.2.3** (App Router only; no `pages/`) |
| UI | React **19.2.4**, TypeScript **5** |
| Styling | **Tailwind CSS v4** (`@import "tailwindcss"` in `app/globals.css`), design tokens as **CSS variables** |
| State | **Zustand** (`store/*`) + **React Context** (`context/*`) |
| Motion | **framer-motion** |
| Icons | **lucide-react** |
| Backend (app) | Next.js **Route Handlers** under `app/api/**` |
| Data | **Supabase** server client (`lib/server/supabase.ts` and helpers) |
| Realtime | **WebSocket signaling** + WebRTC client logic in `context/audit-signaling-context.tsx` |

**Not used in practice:** No React Query/SWR; no chart library; `@base-ui/react` / `shadcn` deps may be present but **not** the primary component system in reviewed UI.

---

## Repository layout (high level)

```
studious-dollop/
├── app/                      # Routes, layouts, globals.css
│   ├── api/                  # REST handlers (auth, audit, teams, invites, …)
│   ├── audit/                # Main product surface
│   ├── login/, register/, invite/[token]/
│   ├── team-lead/
│   └── blocked/
├── components/               # Feature + layout + ui (mostly "use client")
├── context/                  # Auth + AuditSignalingProvider
├── hooks/                    # e.g. useSignalingStreamAuth
├── lib/                      # Clients, types, server helpers, edge token utils
├── store/                    # uiStore, recentStore, auditStore
└── middleware.ts             # IP allowlist + JWT gate + silent refresh
```

---

## Route map & server/client split

| Path | Role | Notes |
|------|------|--------|
| `/` | Server redirect | → `/audit` |
| `/activity` | Server redirect | Legacy → `/audit` |
| `/audit/multi-screen` | Server redirect | Legacy → `/audit` |
| `/login`, `/register` | Client | Public auth |
| `/invite/[token]` | Client | Invite redemption / scope |
| `/blocked` | Client | **Enterprise IP block** artwork; middleware sends here when IP not allowed |
| `/audit/*` | Client-heavy | Wrapped by `AuthGuard` + `AuditSignalingProvider` + `AppShell` |
| `/team-lead` | Client-heavy | Same shell stack as `/audit` |
| `/audit` | Client | Org grid (“dashboard”), signaling-derived stats |
| `/audit/live` | Client | Multi-card live feed |
| `/audit/members` | Client | Member management UI |
| `/audit/organizations` | Client | Org management UI |
| `/audit/captures` | Client | Fetches `/api/audit-captures`, date range, lightbox |
| `/audit/timeline` | Client | **Placeholder** UI (verify product intent before polishing) |
| `/audit/[teamId]` | Client | Team directory + stream side panel patterns |
| `/audit/[teamId]/[memberId]` | Client | **Cinema mode** (sidebar/topbar hidden in `AppShell`) |
| `/audit/[teamId]/[memberId]/analytics` | Client | Extension analytics; `useSignalingStreamAuth` gate |

**Cinema mode nuance:** `AppShell` treats **only** the exact path `/audit/{numericTeamId}/{numericMemberId}` as cinema (`pathname.match(/^\/audit\/\d+\/\d+$/)`). Sub-routes such as **`/audit/…/analytics` keep the normal shell** (sidebar + topbar). Redesigns should not assume “all member pages” are fullscreen.

**There are no `loading.tsx` / `error.tsx` files** under `app/` in this tree—consider them for UX hardening.

---

## Runtime & environment (for E2E setup)

Configure **local** `.env` (do not commit secrets). Typical **public** variables used by the client include:

| Variable | Role |
|----------|------|
| `NEXT_PUBLIC_ANYWHERE_SIGNALING_WSS` | WebSocket URL for the signaling server (`wss://…`) |
| `NEXT_PUBLIC_WS_CONNECT_TOKEN` | Token sent when opening the signaling connection (must match server policy) |
| `NEXT_PUBLIC_APP_URL` | Canonical app base URL where referenced |

**ICE / WebRTC:** Default STUN is `stun:stun.l.google.com:19302` in `audit-signaling-context.tsx` (`DEFAULT_ICE`). TURN or custom ICE is an infra concern outside this doc.

**E2E prerequisites:** Valid user in Supabase (or your auth backend), signaling server reachable from the browser, and extension/clients if testing live streams or analytics.

---

## Middleware & security UX

- **Protected:** `/audit/*`, `/team-lead/*`, and API prefixes listed in `middleware.ts` (`needsAuthMiddleware`).
- **Cookies:** `access_token`, `refresh_token`; failed/refresh path clears cookies and redirects to `/login?from=…`.
- **Headers:** Valid JWT injects `x-user-id`, `x-user-role` for API handlers.
- **Enterprise IP:** Optional allowlist; blocked users hit **`/blocked`** (full-screen image UI, devtools shortcuts discouraged in-page—**not** a security boundary alone).

---

## Primary user journeys (end-to-end verification)

Use these as **manual test scripts**. Preconditions assume a working backend, signaling server, and env vars where applicable.

### A. Authentication

| Step | Action | Expected UI | Backend / notes |
|------|--------|-------------|-----------------|
| A1 | Visit `/audit` logged out | Redirect to `/login?from=/audit` | Middleware |
| A2 | Login with valid credentials | Land on `/audit` (or `from`) | `POST /api/auth/login`, cookies set |
| A3 | Reload with valid refresh | Stay authenticated | Silent refresh via `POST /api/auth/refresh` in middleware |
| A4 | Register new user | Success path to login or app per UI | `POST /api/auth/register` |
| A5 | Open invite link `/invite/[token]` | Invite UI works, redeem flow | `app/api/invites/**` |

### B. Audit shell & navigation

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| B1 | On `/audit`, observe layout | Sidebar + topbar, max width content | `AppShell` |
| B2 | Resize to mobile width | Sidebar off-canvas; open via topbar control | `Sidebar` |
| B3 | Collapse sidebar (desktop) | Narrow rail; nav tooltips/labels behavior | `--sidebar-collapsed-width` |
| B4 | Press **⌘/Ctrl+K** | Command palette opens | `Topbar` + `CommandSearch` |
| B5 | Recent streams (if any) | Sidebar “recent” list | `recentStore` persisted |
| B6 | Open notifications | `NotificationDrawer` (pending count from mock store for team-lead flows) | `Topbar` + `useAuditStore` |
| B7 | Profile menu → Logout | Session cleared; redirect to login | `ProfileMenuPanel`, `POST /api/auth/logout` |

### C. Organizations overview (`/audit`)

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| C1 | Load page | Table/grid of orgs with totals/online/live columns | Data from `useAuditSignaling` aggregation |
| C2 | Toggle filters | “All” vs “Active” (or equivalent) | Local state in page |
| C3 | Team lead: share / access | `ShareAccessModal` opens, lists resolve | `api` + `resolveSupabaseOrg` |
| C4 | Empty/error states | Clear copy when no orgs or connection issues | Verify messaging for redesign |

### D. Team directory & stream overlay (`/audit/[teamId]`)

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| D1 | Open a team | Member directory vs signaling roster merge | See `matchDirectoryMember` logic in page |
| D2 | Start stream from panel | `StreamSidePanel` / stream UX | API `team-lead-org-access` where relevant |
| D3 | Navigate to member | Route to cinema or sub-routes | Preserve numeric IDs |

### E. Cinema live view (`/audit/[teamId]/[memberId]`)

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| E1 | URL matches **numeric** `/audit/\d+/\d+` | **No** sidebar/topbar | `AppShell` cinema detection |
| E2 | Stream loads | Video surface, toolbar, flags, FPS, etc. | `LiveScreenPanel`, `acquireStream` / `releaseStream` |
| E3 | Switch displays | `MultiDisplaySelector` updates source | WebRTC/signaling |
| E4 | Leave page | Stream released, no leaked tracks | Context `releaseStream` |

### F. Browser analytics (`/audit/.../analytics`)

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| F1 | Open analytics | Loading → panel or denial | `useSignalingStreamAuth` |
| F2 | Denied | “Access denied” + back link | Do not redesign away recovery paths |
| F3 | Granted | `ExtensionAnalyticsPanel` data | Tied to signaling snapshot |

### G. Live feed (`/audit/live`)

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| G1 | Grid of live cards | Lazy connection pattern (`shouldConnect` etc.) | Avoid redesign that forces all streams at once |

### H. Captures (`/audit/captures`)

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| H1 | Load | List/grid of captures | `GET /api/audit-captures` |
| H2 | Date range | Filter refreshes list | Query params `from` / `to` |
| H3 | Open lightbox | Modal / metadata | Keyboard and focus for a11y on redesign |

### I. Team lead (`/team-lead`)

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| I1 | Pending approvals | List/cards driven by **mock store** | `auditStore` + `lib/mockData` — **not** production source of truth unless wired |

### J. Enterprise block

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| J1 | Disallowed IP | Redirect to `/blocked` | Full-screen artwork |
| J2 | Authenticated user hits `/blocked` | Middleware redirects away | See `middleware.ts` |

### K. Legacy redirects

| URL | Result |
|-----|--------|
| `/`, `/activity`, `/audit/multi-screen` | → `/audit` |

### L. Signaling & stream authorization (cross-cutting)

| Step | Action | Expected UI | Notes |
|------|--------|-------------|-------|
| L1 | After login on `/audit/*` | Connection status reflected in UI (e.g. live vs reconnect) | `AuditSignalingProvider` WebSocket |
| L2 | Open a stream-eligible view | Brief “checking access” if applicable | `GET /api/audit/signaling-stream-auth` via `useSignalingStreamAuth` / client |
| L3 | Acquire stream | Video element attached, toolbar usable | `acquireStream` in context |
| L4 | Navigate away | Tracks released | `releaseStream` |

---

## UI system & experience audit

### Layout & density

- **Shell:** Sidebar (240px expanded, 48px collapsed) + sticky **glass** topbar (`--topbar-height`); main column `max-w-[1400px]`, padding via `AppShell`.
- **Cinema:** `--color-bg-stream` full viewport; no nav chrome.
- **Risk:** Some routes add **extra horizontal padding** on top of `AppShell`—watch **double padding** when redesigning (notably views that set their own `max-w` + `px-*`).

### Color, type, theme

- **Tokens:** Centralized in `app/globals.css` (`:root`): background, surfaces, text, accent, borders, scrim.
- **Font:** Plus Jakarta Sans via stylesheet in `globals.css` (not `next/font`—opportunity for optimization).
- **Dark mode:** **Not implemented**; `layout` may set `colorScheme: light`—explicit decision needed for redesign.

### Components worth knowing

| Area | Files | UX notes |
|------|-------|----------|
| Layout | `AppShell`, `Sidebar`, `Topbar` | Navigation active state logic includes `/audit` prefix rules |
| Overlays | `Modal`, `CommandSearch`, `NotificationDrawer`, `ProfileMenuPanel` | Modals use focus trap + reduced motion awareness |
| Stream | `LiveScreenPanel`, `StreamToolbar`, `FlagModal` | High sensitivity: video pipeline + ergonomics |
| Access | `ShareAccessModal` | Multi-tab flows; keep clear success/failure feedback |
| Captures | `app/audit/captures/page.tsx` | Complex lightbox/meta interactions—preserve keyboard users |
| Duplication | `components/audit/StatusBadge.tsx` vs `components/ui/StatusBadge.tsx` | Consolidate on redesign |

### Accessibility & semantics

- **Strengths:** Some `aria-label`s, modal focus handling, labels on auth forms.
- **Gaps:** Dashboard “table” may be **CSS grid divs**—improve **table semantics** or documented pattern; verify contrast on small badges/buttons; video elements need intentional labeling if exposed.

### Animation

- **framer-motion** for nav, modals, page enter (`AnimatedPage`).
- **`tw-animate-css`** in dependencies—confirm if used before relying on it.

---

## Redesign priorities & safe boundaries

### High-impact surfaces (visual priority)

1. **`/audit`** — First screen; org table and filters.
2. **`/audit/[teamId]`** and **`/audit/[teamId]/[memberId]`** — Core value; cinema experience.
3. **`/audit/live`** — Dense grid; performance-sensitive.
4. **`/audit/captures`** — Evidence review; lightbox UX.
5. **Auth pages** — Brand and trust.
6. **`/team-lead`** — Confirm data source before investing in UI tied to mock counts.

### Safe-to-evolve (mostly visual)

- Spacing scale, radii, shadows, typography scale (keep **contracts** for modals: focus trap, escape).
- Sidebar/topbar **appearance** while preserving **routes** and **active state** rules.
- Loading skeletons, empty states, illustrations—**align** with token colors (avoid one-off grays in `AuthGuard` loading).

### Logic & contracts to preserve (non-UI)

**Do not change behavior without parity tests:**

- `middleware.ts` — matcher paths, IP gate, refresh, `x-user-id` / `x-user-role`.
- `context/audit-signaling-context.tsx` — connection lifecycle, roster, `acquireStream` / `releaseStream`, scope filters (`lib/auditScopeFilter.ts`).
- `hooks/useSignalingStreamAuth.ts` — gate before stream acquisition.
- `lib/authClient.ts`, `lib/signalingStreamAuthClient.ts` — request shapes and cookies.
- `app/api/**` handlers for auth, `audit/signaling-stream-auth`, `access-share`, `team-lead-org-access`, `audit-members`, `audit-organizations`, `audit-captures`, `invites/*`, `members/[id]/screen`, `teams/*`, `superadmin/audit-org-access`, `audit-timeline`.
- Domain transforms: `orgStats` on `/audit`, directory merge on `[teamId]` page, `resolveSupabaseOrg` for sharing.

---

## API surface (inventory)

Route handlers live under `app/api/` (22 `route.ts` files), including:

- **Auth:** `auth/login`, `auth/register`, `auth/logout`, `auth/me`, `auth/refresh`
- **Audit:** `audit/signaling-stream-auth`, `audit-organizations`, `audit-members`, `audit-members/[id]`, `audit-captures`, `audit-captures/[id]/image`, `audit-timeline`
- **Teams / members:** `teams`, `teams/[id]/members`, `members/[id]/screen`
- **Invites:** `invites`, `invites/[token]`, `invites/[token]/redeem`, `invites/[token]/scope`
- **Access:** `access-share`, `team-lead-org-access`, `superadmin/audit-org-access`

Use these paths when tracing **E2E failures** from UI → network.

---

## Known gaps & product questions

| Item | Issue |
|------|--------|
| `/audit/timeline` | Placeholder; **Filter/Export** may be unwired—confirm product intent before UI polish |
| `/team-lead` | Mock-driven approvals—align UI with real API before launch messaging |
| Charts | No chart library; timeline/analytics visuals may need new deps if product requires graphs |
| Duplicate badges | Two `StatusBadge` implementations—drift risk |

---

## Quick reference — state stores

| Store | Responsibility |
|-------|----------------|
| `uiStore` | Page title/subtitle for `Topbar` |
| `recentStore` | Persisted recent streams (sidebar) |
| `auditStore` | Mock audit statuses / team-lead notifications |

---

## Summary for AI assistants

**In one paragraph:** This app is a **Next.js App Router** audit console with **JWT auth**, optional **enterprise IP blocking**, **Supabase-backed APIs**, and a **signaling/WebRTC** layer for **live screens** and **analytics**. The UI is **Tailwind v4 + CSS variables**, with a **sidebar/topbar shell** and a **full-screen stream mode** on `/audit/:teamId/:memberId` (numeric IDs **only** on that exact path—sub-routes like `/analytics` keep the shell). **Redesign work** should prioritize **visual cohesion, accessibility, and empty/loading states** while preserving **middleware, signaling context, stream authorization, and REST payloads**. Use the **E2E tables** above to validate flows after UI changes.

---

## Redesign readiness (quick scores)

Use these to prioritize design work vs. engineering risk (10 = highest effort or gap).

| Area | Score | Note |
|------|-------|------|
| Layout & navigation | 4 | Shell is stable; tune typography and spacing |
| Color & tokens | 3 | Strong CSS variables; fix one-off grays in loading states |
| Typography | 5 | Consider `next/font` + documented type scale |
| Stream / cinema UX | 5 | High visibility; do not break video or toolbar contracts |
| Dark mode | 10 | Not present; requires token audit + component pass |
| Data truth on `/team-lead` | 8 | Mock store—UI must not assume production parity |
| `/audit/timeline` | 7 | Placeholder; clarify product before heavy UI |

---

## Key source files (navigation aid)

| Concern | Entry points |
|---------|----------------|
| Auth UX | `app/login/page.tsx`, `app/register/page.tsx`, `context/auth-context.tsx`, `components/auth/AuthGuard.tsx` |
| Gate & refresh | `middleware.ts`, `lib/edgeTokenUtils.ts` |
| Signaling & streams | `context/audit-signaling-context.tsx`, `hooks/useSignalingStreamAuth.ts`, `lib/signalingStreamAuthClient.ts` |
| Shell & chrome | `components/layout/AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx` |
| Org overview | `app/audit/page.tsx` |
| Member stream | `app/audit/[teamId]/[memberId]/page.tsx`, `components/members/LiveScreenPanel.tsx` |
| API | `app/api/**/route.ts` |

---

**End of report.** For non-visual behavior, cross-check `middleware.ts`, `context/audit-signaling-context.tsx`, `lib/authClient.ts`, and the relevant `app/api/**` handlers.
