# Antelope Transfer History

Small web app to **load token `transfer` actions** for an Antelope account from a **Hyperion** history API, preview them, and **download a CSV** (taxes, bookkeeping, etc.).

## What it does

- Pick a **chain preset** (Vaulta (EOS), WAX, Telos) or enter a **custom Hyperion base URL**.
- Each preset server is queried for **`/v2/health`** (plain `fetch` + JSON parsing so Hyperion 3.x/4.x shapes work). The history dropdown shows **estimated data start**, **partial vs early-block coverage**, and a warning if the indexer is far behind chain head.
- Enter an **account** and a **period** (this/last month or year, or a custom range).
- **Load transfers** uses Wharfkit **`get_actions`** with `filter: "*:transfer"`. Long ranges are **split into ≤89-day windows** because many nodes cap `after`/`before` span when using `sort=asc`.
- CSV columns include **token symbol**, **contract**, **signed amount** (negative when the transfer leaves the queried account), memo, and transaction id.

Presets and URLs live in **`src/lib/chains.ts`** — public endpoints can change; adjust there as needed.

## Stack

- **Vite 8**, **React 19**, **TypeScript**
- **TanStack Query** (health checks + transfer fetch)
- **@wharfkit/antelope** + **@wharfkit/hyperion** (actions API)
- **shadcn-style UI** (Base UI), **Tailwind CSS 4**, **date-fns**, **react-day-picker**

## Scripts

```bash
pnpm dev       # http://localhost:5173
pnpm build
pnpm preview
pnpm lint
pnpm format
```

## CORS and local dev

The browser calls Hyperion **from your origin**. If a node does not send CORS headers, the request will fail.

For local development, **Vite proxies** (same-origin URLs) are defined in `vite.config.ts`:

- `/__antelope/hyperion/eos` → sample EOS Hyperion
- `/__antelope/hyperion/wax` → sample WAX Hyperion
- `/__antelope/hyperion/telos` → sample Telos Hyperion

Use one of those as the **custom** history server URL (e.g. `http://localhost:5173/__antelope/hyperion/wax`) so the browser only talks to your dev server.

## Adding shadcn components

This repo started from a shadcn-style setup. To add more UI pieces:

```bash
npx shadcn@latest add <component>
```
