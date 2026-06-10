# Divider — debt settlement

Import a group's ledger (`.xlsx`), and split the money so everyone pays **each other directly** with the **fewest transfers possible** — no middleman collecting and redistributing. Each settlement gets a shareable link where everyone can tick off transfers as "paid".

Built with Next.js 16, React 19, Tailwind v4, Turso (libSQL) + Drizzle. UI is in Vietnamese.

## How settlement works

The core problem: each player ends a session with a net result — they won money or lost money. We want them to settle up by transferring directly to one another, using as few transfers as possible.

### Input

A list of net balances, one per player:

- `net > 0` → the player **won**; others owe them.
- `net < 0` → the player **lost**; they owe others.

For a zero-sum game these sum to 0. A small non-zero **residual** (rounding, rake, or a missing player) is tolerated, not fatal.

### Algorithm — greedy two-pointer ("min cash flow")

1. Split players into **winners** (`net > 0`) and **losers** (`net < 0`, taken as a positive amount owed).
2. Sort both groups **largest-first**.
3. Repeatedly match the biggest remaining winner with the biggest remaining loser. The transfer amount is `min(winner_remaining, loser_remaining)`. Whichever side reaches zero advances to the next person; the other keeps its remainder.
4. Stop when either group is exhausted.

### Why this shape

- Every iteration zeroes out at least one player, so it emits **at most n−1 transfers** — far fewer than the up-to `n(n−1)/2` you'd get if everyone paid everyone. That's the whole point of "no middleman".
- It is a well-known **greedy heuristic**, not a provably optimal solver. Finding the strict minimum number of transactions is NP-hard (it's the subset-sum / partition problem in disguise), so we don't attempt it. For real friend-group data the greedy result is at or very near optimal, and it's the same approach already used in the sibling app.

### Floating point & residual

Sheets contain half-units (`239.5`, `-619.5`) and may not sum to exactly 0. Every value is rounded to 2 decimals and compared against a small epsilon instead of exact zero, so the pointer loop can't stall or emit phantom transfers under float drift. Any leftover residual is left **unsettled** (and surfaced to the user as a warning) rather than invented into a fake transfer.

Implementation: [`lib/settlement.ts`](lib/settlement.ts) — pure and deterministic, unit-tested in [`lib/settlement.test.ts`](lib/settlement.test.ts).

## Expected sheet format

The importer reads a horizontally-laid-out ledger:

- One header row of **player names**, one per column (column A of that row is blank).
- A row whose **column A is `Total`** holds each player's net, aligned under their name — **only this row is used**.
- Numbers may be real numeric cells or Vietnamese-locale text with a decimal comma (`239,5`, `-619,5`). Both are parsed.
- Players with `Total = 0` or blank are excluded. All other rows (per-session dates, `Ranking`, `Cash in`/`Cash out`, `Win rate`, `Status`) are ignored.

Parsing runs **in the browser** ([`lib/xlsx.ts`](lib/xlsx.ts), via SheetJS) — the raw file never leaves the uploader's device; only the reviewed balances are sent to the server to save.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

   (SheetJS is pinned from the official SheetJS CDN rather than the stale, unmaintained npm `xlsx` — see `package.json`.)

2. **Provision Turso**

   ```bash
   # install the CLI (macOS)
   brew install tursodatabase/tap/turso
   # or: curl -sSfL https://get.tur.so/install.sh | bash

   turso auth login
   turso db create divider
   turso db show --url divider      # -> TURSO_DATABASE_URL
   turso db tokens create divider   # -> TURSO_AUTH_TOKEN
   ```

3. **Create `.env.local`** (see `.env.example`):

   ```bash
   TURSO_DATABASE_URL="libsql://divider-<your-org>.turso.io"
   TURSO_AUTH_TOKEN="<token from the command above>"
   ```

4. **Create the tables**

   ```bash
   npm run db:push      # diff schema.ts against Turso and apply (simplest)
   # or: npm run db:migrate   # apply the committed SQL in ./drizzle
   ```

5. **Run it**

   ```bash
   npm run dev          # http://localhost:3000
   ```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run lint` | ESLint |
| `npm test` | Vitest (settlement + xlsx parsing) |
| `npm run db:push` | Apply `lib/schema.ts` to Turso directly |
| `npm run db:generate` | Generate SQL migration into `./drizzle` |
| `npm run db:migrate` | Apply migrations in `./drizzle` to Turso |
| `npm run db:studio` | Drizzle Studio (browse the DB) |

## Architecture

- **Pure core** (browser + server): `lib/settlement.ts` (the algorithm above), `lib/xlsx.ts` (SheetJS parsing). Both unit-tested.
- **Data**: Turso (libSQL) + Drizzle. `lib/schema.ts` — `sessions` (per-player net balances stored inline as JSON) + `transfers` (one row per "X pays Y", individually markable paid). `lib/db.ts` is a lazily-initialized singleton (safe to import at build time without env vars).
- **Server actions** (`app/actions.ts`): `createSession` re-derives the settlement server-side and writes session + transfers atomically; `toggleTransferPaid` flips one transfer and revalidates its page.
- **Routes**: `/` (history), `/upload` (import → editable preview → live settlement preview → save), `/s/[id]` (share page: tick transfers paid, copy a Vietnamese summary for the group chat).

Access control is link-based only: the `/s/<id>` id is an unguessable nanoid, and anyone with the link can view and tick. No login (trust-based, for a friend group).

## Deploy (Vercel)

1. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in **Project → Settings → Environment Variables** (Production + Preview). `.env*` is git-ignored, so Vercel needs them set explicitly.
2. Run `npm run db:push` once against your Turso database.
3. Deploy. DB access runs on the Node.js runtime (default).
