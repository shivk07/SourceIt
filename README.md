# SourceIt

**A blockchain-anchored verification and transparency platform for published information.**

SourceIt does not tell you what's true. It makes tampering, silent edits, and unverifiable claims *expensive and visible*, and lets anyone check a publisher's record without trusting SourceIt's own database.

---

## Why this exists

Anyone can publish anything, and anyone can quietly edit it later. There's usually no public record of what a piece of content originally said, who changed it, when, or why, and no independent way to check a publisher's track record over time.

SourceIt is built around one property: **a skeptical third party must be able to verify a piece of content without trusting SourceIt's database.** If SourceIt's Postgres instance were altered maliciously tonight, verification against the underlying chain must still fail tomorrow. Postgres is a cache and an index; the chain is the root of trust.

This is deliberately **not** a fact-checking product. There is no `isTrue` field and no trust score dressed up as a truth score. SourceIt reports what was published, when, by whom, what changed, what evidence backs it, and who disputed it, and leaves the judgment to the reader.

## What it is

SourceIt is a three-sided platform:

- **Publishers** (organizations with member accounts) register content, submit new versions, attach supporting evidence, and respond to disputes. They can append to a piece's history, never edit or delete it.
- **Reviewers** attach structured, attributed, permanent annotations to published versions: confirmations, corrections, context, or formal disputes. A reviewer structurally affiliated with a publisher (a member of it) cannot review that publisher's own content: conflict of interest is enforced in the data model, not just disclosed.
- **Readers** browse and verify content. All reads are public and require no account.

Every version records the hash of the version before it, so history is tamper-evident between anchors, not only at them. Publication timestamps are server-assigned and, once anchored, chain-attested: a client can never supply its own timestamp on a write.

## How it works

```
apps/web      React + Vite frontend: publisher/reviewer/reader dashboards, verification UI
apps/api      Fastify API: the source of truth for reads/writes, auth, authorization
apps/worker   Background worker: batches pending content hashes and anchors them on-chain
packages/
  shared            Drizzle schema, Zod validation, generated OpenAPI spec, shared by api & web
  anchoring         Merkle tree construction + inclusion-proof logic (runs in Node and the browser)
  anchoring-contract The on-chain anchor contract + its deploy tooling
```

**The verification path, end to end:**

1. A publisher submits a version. Its content is canonicalized and hashed (SHA-256) into a `contentHash`, the leaf that everything downstream is built from.
2. The worker batches pending content hashes into a Merkle tree (RFC 6962-style domain-separated hashing) and anchors the resulting root on-chain. Anchoring is asynchronous and can fail; a version's state (`pending`, `anchored`, or `anchor_failed`) is always surfaced, never hidden behind an optimistic checkmark.
3. To verify a version, a reader (or anyone, with no SourceIt account) recomputes the leaf hash from the original content and checks it against the published Merkle proof and the on-chain root, the same procedure SourceIt's own API runs, documented as a frozen public spec (`docs/CANONICALIZATION.md`, `docs/ANCHORING.md`) so it can be reproduced entirely offline.
4. Reviews and disputes attach to specific versions and are themselves append-only: a dispute against a publisher is visible from the moment it's filed and cannot be hidden, delayed, or downranked by that publisher.

## Tech stack

- **Backend:** TypeScript, Node 22, Fastify, Drizzle ORM, Zod, PostgreSQL 16, OpenAPI 3.1
- **Frontend:** React, Vite, Tailwind, shadcn/ui
- **Auth:** Clerk (organizations map directly onto publishers with member accounts)
- **Blockchain:** a custom anchor smart contract; Merkle batching keeps per-version on-chain costs low
- **Storage:** S3-compatible object storage for evidence uploads, with an SSRF-guarded fetcher for source archiving
- **Testing:** Vitest, with Testcontainers-backed Postgres integration tests
- **Monorepo:** pnpm workspaces
- **Deploy target:** Railway (API + worker + managed Postgres)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Start a local Postgres
docker compose up -d

# 3. Configure environment
cp .env.example .env            # fill in CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY
cp apps/web/.env.local.example apps/web/.env.local

# 4. Run the API + worker
pnpm dev

# 5. Run the frontend (separate terminal)
pnpm --filter @sourceit/web dev
```

```bash
pnpm lint        # eslint across api/worker/shared/anchoring/anchoring-contract
pnpm typecheck    # tsc --noEmit across all packages
pnpm test         # Vitest, including Testcontainers-backed integration suites
```

## Documentation

Deeper specs live in [`docs/`](docs): `DOMAIN.md` (data model and invariants), `CANONICALIZATION.md` and `ANCHORING.md` (the frozen verification spec), `THREAT_MODEL.md`, and `RUNBOOK.md` (deploy and operations).
