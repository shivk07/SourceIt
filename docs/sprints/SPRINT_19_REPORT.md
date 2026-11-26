# Sprint 19 — Web app typechecking, verification page states, route guard

**Dates:** 2026-11-25 → 2026-11-25  ·  **Status:** Complete

## 1. Objective

`apps/web` was written in `.tsx` but never type-checked: it had no
`tsconfig.json`, no `typecheck` script, and wasn't part of the root
`typecheck`. Vite strips type annotations at build time without checking them,
so a type error in the frontend never failed anything. This sprint brought the
web app under the same checks as the backend packages, then used that footing
for two frontend hardening items:

- the `/verification-result/:articleId` page had no real loading, not-found or
  error states, and never cancelled a superseded request;
- the signed-in pages (portals, saved articles, edit history) had no route
  guard at all — anyone could open any of them, and an expired session left
  the user on a page whose API calls would fail.

Decisions confirmed with the user during the sprint: (1) add role checks to
the guard, not just a signed-in check; (2) admins may open every portal;
(3) look the role up once per signed-in visit rather than on every page.

## 2. Changes from Previous Sprint

- **`apps/web` is now type-checked and tested.** New `tsconfig.json`,
  `vitest.config.ts`, and `typecheck` / `test` scripts; both are now part of
  the root `typecheck` and `test` chains.
- **`VerificationResult.tsx`** — explicit loading / loaded / not-found / error
  states, request cancellation, and a retry button.
- **New route guard** (`components/auth/RequireAuth.tsx`) wrapping every
  signed-in page, with per-role groups.
- **`lib/roles.ts`** — the role → portal map, now shared by the login page and
  the guard (`AuthPage.tsx`'s own `switch` replaced).
- **Two existing type errors fixed** in `LoginForm.tsx` and
  `PublisherPortal.tsx` (see §3).
- **Context:** several frontend commits landed on `main` after the Sprint 18
  report without a sprint report of their own (publisher dashboard on real
  data, Clerk sign-out fixes, landing-page redirect for signed-in users,
  article-rejection reasons, the admin screen and publisher verification
  queue, the worker as a scheduled one-shot). This report covers only this
  sprint's changes.
- **Carried over, unchanged:** no admin re-queue for `anchor_failed`; the
  Sprint 16 chain provider's live testnet run; no real bucket provisioned
  (Sprint 17); no backend search; the remaining hardcoded frontend components.

## 3. Key Enhancements

### Typechecking `apps/web`

- `tsconfig.json` matches the backend packages' strictness (`strict`,
  `noUncheckedIndexedAccess`, `noImplicitAny`) plus `DOM` libs, `react-jsx`,
  `noEmit`, and `paths` for the `@/*` alias Vite already defines.
- **`allowImportingTsExtensions`** is on because `main.tsx` imports
  `./app/App.tsx` with its extension — normal for Vite, allowed only with
  `noEmit`.
- **`src/imports` is excluded.** `src/imports/pasted_text/publisher-dashboard.tsx`
  is a plain-English design brief saved with a `.tsx` extension; it isn't
  imported anywhere and produced 575 of the first run's 579 errors.
- **No `baseUrl`.** VS Code's bundled TypeScript (6.x) reports `baseUrl` as a
  deprecation error even though the project's 5.7.2 compiler accepts it;
  `paths` works without it under `moduleResolution: "Bundler"`.
- New devDependencies: `typescript` 5.7.2 (same as `apps/api`), `@types/react`
  / `@types/react-dom` 18.3.0 (matching React 18.3.1), and for tests `vitest`
  2.1.8 (same as `apps/api`), `jsdom` 25.0.1, `@testing-library/react` 16.1.0,
  `@testing-library/dom` 10.4.0.
- **The two real type errors found, and their fixes:**
  - `LoginForm.tsx` — `completeSignIn` called Clerk's `setActive`, which is
    `undefined` until Clerk loads, without the `isLoaded` check every other
    sign-in step has. It now returns early when not loaded. In practice it is
    only reached after a successful sign-in, so behaviour is unchanged.
  - `PublisherPortal.tsx` — `data.publisherIds[0]` is `string | undefined`
    under `noUncheckedIndexedAccess`. It now destructures the first id and
    checks it, replacing the separate length check; the "isn't a member of any
    publisher yet" message is unchanged.

### Verification page states

- **Loading** shows skeleton placeholders. This fixes a real bug: while a
  request was in flight, every panel received `null` and fell back to its
  built-in mock, so the page briefly showed the made-up "Climate Change Impact
  on Global Agriculture" article as if it were the real result.
- **Not found** (HTTP 404, the `{ trustStatus: "notfound" }` body) shows
  "This article is not registered in SourceIt's verification system" with a
  hint to check the link.
- **Error** (any other non-OK status, or a request that fails outright, e.g.
  offline) shows an alert with a **Try again** button that re-runs the fetch.
- **Cancellation.** Each fetch gets an `AbortController`, aborted on effect
  cleanup — when the `:articleId` changes or the page unmounts. A response
  that arrives after its request was aborted is ignored explicitly (not only
  via `fetch` rejecting), so a slow earlier response can never overwrite the
  article now on screen.
- The page without an `:articleId` still renders the static mock and makes no
  request, as before.

### Route guard with role checks

| Pages | Allowed roles |
|---|---|
| `/user-portal`, `/saved-articles` | reader, admin |
| `/publisher-portal`, `/article-edit-history` | publisher, admin |
| `/reviewer-portal` | reviewer, admin |
| `/admin-portal` | admin |

- **Signed out** → redirected to `/`.
- **Session expires on the page** → redirected to `/`. Clerk's `useAuth`
  re-renders the guard when `isSignedIn` flips to false (including a sign-out
  in another tab).
- **Wrong role** → redirected to that user's own portal (the same map login
  uses).
- **Signed in to Clerk but no SourceIt account** (`/me` returns 401) →
  redirected to `/`, where `AuthPage` already explains this case and offers to
  sign out.
- **`/me` lookup fails** (other status, or no connection) → error message with
  **Try again**.
- While Clerk loads or the role is being looked up, a "Checking your
  session…" status shows instead of the page.
- **Left open:** `/`, `/verification-result` and
  `/verification-result/:articleId` (public by design — shareable links), and
  the legacy mock pages `/simple-login` and `/reader-portal` (`SimpleAuth`
  navigates to `/reader-portal` without a real sign-in, so guarding it would
  break that flow).

## 4. Architecture Changes

- **Two-level guard.** `RequireAuth` is one path-less layout route wrapping
  all six signed-in pages: it checks the Clerk session, looks the role up from
  `/me` once, and passes it down via React Router's outlet context. Inside it,
  `RequireRole` groups pages by role and only compares against the
  already-fetched role (admins always pass). Because `RequireAuth` stays
  mounted while the user moves between those pages, the role lookup is
  effectively cached — one `/me` request per signed-in visit, not per page.
  It is looked up again when the Clerk `userId` changes (a different user signs
  in) or when the user returns from a public page.
- **`routes.tsx` exports its `routes` array** (`RouteObject[]`) in addition to
  `router`, so tests can inspect the guard configuration without the
  data-router's narrower internal route type.
- **No backend change, no contract change, no new endpoint.**

## 5. Database Changes

**None.**

## 6. New Components

**`apps/web` new:** `tsconfig.json`, `vitest.config.ts`,
`src/app/components/auth/RequireAuth.tsx` (`RequireAuth` + `RequireRole`),
`src/app/lib/roles.ts`.
**`apps/web` changed:** `package.json` (scripts, devDependencies),
`src/app/routes.tsx`, `src/app/pages/VerificationResult.tsx`,
`src/app/pages/AuthPage.tsx`, `src/app/pages/PublisherPortal.tsx`,
`src/app/components/auth/LoginForm.tsx`.
**`apps/web` test-only (new):** `src/app/pages/VerificationResult.test.tsx`,
`src/app/components/auth/RequireAuth.test.tsx`, `src/app/routes.test.tsx`.
**Root:** `package.json` (`@sourceit/web` added to `typecheck` and `test`),
`pnpm-lock.yaml`.

## 7. Sprint Test Results

**New: `apps/web` — 23/23 across 3 files, verified, no backend needed.**

- `VerificationResult.test.tsx` (8): loading state shown (and the mock *not*
  shown) while in flight; fetched article shown once loaded; not-found state
  for a 404, with no retry button; error state for a 500 and **Try again**
  refetching successfully; error state for a rejected request (offline); the
  old request aborted when the article id changes, with its late response
  ignored; the request aborted when the page is left; no request and the mock
  shown without an id. The API client and the panels are replaced with stubs
  so each state can be driven precisely.
- `RequireAuth.test.tsx` (13): page shown for an allowed role; "Checking your
  session…" while Clerk loads and while the role is being looked up; signed-out
  visitor redirected to `/`; session expiring on the page redirects to `/`;
  wrong role redirected to own portal; no SourceIt account (401) redirected to
  `/`; lookup error with **Try again**; connection failure shows the error;
  admin opens publisher, user and admin portals; a publisher is kept out of
  the admin portal; one `/me` request while moving within and across role
  groups; a new lookup when a different user signs in. Clerk is replaced by a
  small reactive store so session changes re-render like the real `useAuth`.
- `routes.test.tsx` (2): exactly which pages are guarded and with which role;
  login and verification pages stay public.

**Tests checked against deliberate breakage** (each change reverted
afterwards): removing the abort-on-cleanup failed both cancellation tests;
removing the role comparison failed the wrong-role test; removing the admin
bypass and the `userId` dependency failed the admin, cached-lookup and
user-switch tests.

**Verified this session:** the full root `pnpm typecheck` through pnpm (all six
packages, 0 errors), `pnpm --filter @sourceit/web test` (23/23), `apps/web`
`vite build` (succeeds), root `eslint` over the five backend packages (0
errors/warnings — re-run because the lockfile change below touched
`typescript-eslint`'s TypeScript peer).

**Not run this session:** the backend packages' tests and the full root
`pnpm test` chain (the `apps/api` / `apps/worker` suites need a Postgres
instance). No backend source changed.

**Caught before commit:** the `pnpm add` installs rewrote
`apps/web/package.json` and silently dropped the newly added `typecheck` and
`test` scripts, which would have broken the root chains. They were restored and
the root `pnpm typecheck` re-run through pnpm itself, not just the `tsc` binary.

**Lockfile side effects worth knowing:** besides the new packages, the install
re-resolved some existing entries. Several UI packages (`cmdk`, `vaul`,
`react-dnd`, the `react-remove-scroll` family) previously resolved against a
stray `@types/react@19.2.18` and now resolve against 18.3.0, and the root
`typescript-eslint` now resolves its TypeScript peer to 5.7.2 instead of 5.9.3.

## 8. Outcome

**`apps/web` is type-checked and tested, and part of the root `typecheck` /
`test` chains.** The verification page has real loading, not-found and error
states and cancels superseded requests. Every signed-in page sits behind a
guard that checks the session and the role, sends expired sessions back to
login, lets admins into every portal, and looks the role up once per visit.

**Not done, deliberately or blocked:**
- **`apps/web` is not in the root `lint` chain.** Adding it would likely
  surface its own batch of lint issues — a separate piece of work.
- **No "your session expired" message** on the redirect to login. Telling an
  expiry apart from a normal sign-out (which also flips `isSignedIn`) isn't
  straightforward with Clerk's hook alone.
- **A role change made while a user is on a signed-in page** takes effect on
  their next login or page reload, a consequence of the once-per-visit lookup.
- `src/imports/pasted_text/publisher-dashboard.tsx` was excluded, not renamed;
  renaming it to `.md` would be cleaner.
- `LoginForm.tsx` still has its own role → portal `switch` rather than using
  `lib/roles.ts` — left as is to keep the type fix there minimal.

**Known debt incurred:** none.

**Blocked on:** nothing.

**Next steps:** add `apps/web` to the root `lint`; the `anchor_failed` admin
re-queue; the Sprint 16 chain provider's live testnet run; a real object-store
bucket end to end; the remaining hardcoded frontend components.
