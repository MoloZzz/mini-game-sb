# UI and test map

## UI architecture

`game-ui` is React 18 + Vite + Tailwind + Framer Motion. `game-ui/src/App.tsx` owns routing and auth gates:

| Route | Screen | Notes |
| --- | --- | --- |
| `/`, `/open/:slug`, `/inventory` | lobby, opening, inventory | authenticated |
| `/admin` | review queue | admin only |
| `/login`, `/register` | session entry | public |

`AppShell` contains the navigation; it is intentionally hidden on opening and auth routes. `AuthProvider` restores a stored JWT with `GET /auth/me`; a 401 clears local state and redirects through route protection.

## Shared UI layer

Screens compose from a kit under `game-ui/src/components/`; they never write their own card, panel, modal or chip markup.

| Layer | Owns |
| --- | --- |
| `ui/` | `Panel`, `Modal`, `Chip`, `Pagination`, `ErrorBanner`, `EmptyState`, `TileSkeleton`, `ImgWithFallback` |
| `card/` | `CardArt`, `CardPreview`, `CardTile`/`LockedCardTile`, `CardGrid`, `CardDetailModal` |
| `filters/` | `CardFilters` (rarity/element chips, optional sort) |
| `src/lib/rarityStyle.ts` | `rarityColor`, `rarityTint`, `rarityGlow`, `initials` |

Invariants:

- Card width comes from `CardPreview`'s `sm|md|lg|xl` scale; never hard-code one. Inventory and collection previews diverged exactly that way.
- Rarity colour resolves through `rarityStyle.ts` to `RARITY_META` — no literal hex, no `${color}33` at a call site, no `colors.rarity` in Tailwind.
- One `<img>` per card view (ADR-005). `CardArt` owns the broken-image fallback; nothing else keeps `broken` state.
- `Modal` owns backdrop, Escape, `role="dialog"` and focus trap; only its topmost instance answers Escape.
- Extend the kit rather than copying markup from a neighbouring feature.

## API and mocks

All browser calls go through `game-ui/src/lib/api.ts`; do not fetch from components. A call automatically adds the JWT and handles 401 logout. `VITE_USE_MOCKS=1` uses MSW in `game-ui/src/mocks/`. When a visible API contract changes, update the real client, mock handlers/db/fixtures, and tests together so mock mode cannot drift from the server.

`openCase` is called in one place only: `game-ui/src/features/open/OpenCaseScreen.tsx`. It supplies an idempotency key and passes the returned reel to animation. Preserve this one-owner model rather than allowing screens to open cases directly.

## Feature locations

| Task | Directory |
| --- | --- |
| Case lobby and previews | `game-ui/src/features/lobby/` |
| Reel/reveal animation | `game-ui/src/features/open/`, `game-ui/src/features/reel/`, `game-ui/src/features/reveal/` |
| Owned cards, filtering, selling | `game-ui/src/features/inventory/` |
| Collection dex | `game-ui/src/features/collection/` |
| Draft review | `game-ui/src/features/admin/` |
| Login/register and session | `game-ui/src/features/auth/`, `game-ui/src/lib/authContext.tsx` |

## Checks

Focused Vitest specs sit next to their feature. Run `npm run test --workspace game-ui` for UI behavior and `npm run build --workspace game-ui` for typecheck plus production build. Prefer a focused test when changing a component; use mock handlers in component tests rather than stubbing `fetch` globally.
