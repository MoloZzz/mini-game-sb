# Part B — game-ui execution plan

**Owns:** `game-ui/` only.
**Stack:** React 18 + TS + Vite + Framer Motion + Tailwind (ADR-010).
**Spec:** vault docs 04, 05, 08 + ADR-005/010/011.

## The governing principle

> "Це найважливіший компонент проекту. Все інше — обгортка навколо цих 5 секунд."

The reel is built **first**, on mocks, before any screen around it. The roadmap
is explicit that the failure mode here is spending three evenings on scaffolding
and never seeing a frame of animation. Do not invert this order.

The reel decides nothing. The server already chose; the animation narrates a
decision that has been made. It is a pure function of the API response.

## Sequencing

### B1 · Scaffold + mock layer
- `npm create vite` React+TS into `game-ui/`, Framer Motion, Tailwind.
- Depend on `@card-game/shared-types`; import every constant and DTO from it.
  Do not redeclare `TILE_W`, rarity colours or error codes locally.
- A typed API client where each method returns a `shared-types` response type.
- **MSW handlers** returning contract-shaped fixtures for `/cases`,
  `/cases/:slug/open`, `/me`, `/me/inventory`, `/admin/cards`. Toggle with
  `VITE_USE_MOCKS`. The mock `open` handler must produce a **real** 60-tile reel
  with the winner at index 55 — a lazy mock hides every bug the reel can have.
- Placeholder art: generate ~12 solid-colour rarity-tinted SVG/WebP thumbs in
  `game-ui/public/mock/`. Real art arrives from Part C later; the reel must not
  wait for it.
- **Done:** `npm run dev` serves a blank app with mocks answering.

### B2 · `<Reel />` — vault 08, precisely
Constants come from `shared-types/reel`. The maths:

```ts
const winCenter = WINNING_INDEX * PITCH + TILE_W / 2;
const base = winCenter - containerW / 2;
const jitter = (Math.random() - 0.5) * TILE_W * JITTER_FRACTION * 2; // ±42px
return -(base + jitter);
```

Non-negotiables, each with a stated reason in the vault:

- **One `transform` on the strip container.** Not 60 animated tiles — that is 60
  composite layers and guaranteed jank.
- **Animate `transform` only.** `left`/`margin`/`width` force layout per frame.
- **Preload before starting.** `Promise.all` over `new Image()`, where
  `onerror` also resolves — one broken thumb must not hang the game. Spinner
  during preload, typically 100–300ms from local disk.
- **Thumbs in the reel, never full PNGs.** 60 × 1MB is 60MB per opening.
- Easing `cubic-bezier(0.12, 0.85, 0.20, 1.0)`, 5.5s. Not `ease-out` — it decays
  too early and the last two seconds go flat.
- **Jitter is mandatory.** Without it every stop is perfectly centred and the
  brain reads the animation as fake within three openings. Bound is
  `0.5 × TILE_W`; `JITTER_FRACTION` keeps it safely under.
- **300ms of silence after the stop**, before the reveal. This pause is where
  the "it landed" beat lives.
- `React.memo` on tiles, key `${index}-${cardId}`, `will-change: transform` on
  the strip, `contain: layout paint` on tiles.
- A tile is an image, a rarity-coloured border, and a name. Nothing heavier —
  all the expensive effects belong on the reveal screen, where one element
  animates instead of sixty.

Edge cases, all from vault 08's table:

| Case | Behaviour |
|---|---|
| resize mid-spin | ignore; freeze `containerW` at start — recomputing breaks the landing |
| tab backgrounded | `visibilitychange` → skip animation, show result |
| double click | button disabled for the whole cycle + `Idempotency-Key` |
| `prefers-reduced-motion` | skip the spin, fade straight to reveal |
| broken thumb | rarity-coloured placeholder tile, animation not blocked |
| API failure | toast, re-enable button, no funds lost (server rolled back) |

`prefers-reduced-motion` is not a formality — 5 seconds of fast horizontal
scroll can trigger nausea or migraine. It is three lines of code.

**Done:** you press spin twenty times in a row and enjoy watching it. If not,
stop and tune easing/timing/tile size before building anything else — the
roadmap says going further is pointless until this clicks.

### B3 · Reveal
- Winner tile scales out of the strip; full-resolution art loads here (only here).
- Rarity FX, escalating **unevenly** — common→uncommon is nearly nothing,
  epic→legendary is enormous. That asymmetry is what makes a rare drop feel
  like an event.
  - common: nothing, a quiet click
  - uncommon: soft green tile glow
  - rare: blue pulse + upward beam
  - epic: purple flash, ~20 particles, slight shake
  - legendary: gold burst, rays, ~60 particles, harder shake
  - mythic: screen fill, time-dilation, confetti, full UI stop for 1s
- `NEW` badge on first copy, `×N` on duplicates.
- **"Again" is the primary button** — largest, centred, autofocused. It is what
  the genre exists for. "To inventory" is secondary.
- Card frame is DOM/CSS (ADR-005): SD draws only the square art window; name,
  stats and flavour are text, and the frame colour comes from `RARITY_META`.

### B4 · Lobby
Case grid, balance in the header with an animated number transition, odds table
per case showing both `%` and **"1 in N"** (`oneInN` from shared-types — "1 in
500" is a feeling, "0.2%" is an abstraction), recent-drops strip from
`GET /me/drops`.

### B5 · Inventory
Grid grouped by card with copy counts, rarity/element filters, sorting,
collection progress ("28 / 110") broken down by rarity, detail view with a sell
button shown only when `copies > 1`.

### B6 · Admin review — build this before the full batch exists
A contact-sheet grid of draft cards: approve/reject, name, rarity, ATK/DEF,
flavour, and **the prompt and seed visible** so recipe quality can be judged.

This screen is not optional. Reviewing 283 cards is ~50 minutes of clicking and
the roadmap measures it as *longer than generation itself*. Without this screen
that work happens in `psql`. Keyboard shortcuts (approve / reject / next) are
worth real effort here — they are the difference between an hour and three.

### B7 · Integration
Flip `VITE_USE_MOCKS` off, point at the real API, handle 402/409 properly.
Keep the MSW handlers — they stay useful for tests and for working with the
backend down.

## Testing
- `targetOffset` sweep: for a range of container widths and jitter values the
  marker always lands inside the winner tile, never a neighbour.
- Preload resolves when an image errors.
- Reduced-motion path skips animation and still reveals the right card.
- Reel renders exactly `REEL_LENGTH` tiles with the winner at `WINNING_INDEX`.

## Performance
Test **on battery**, not plugged in. CPU throttling surfaces problems that are
invisible on mains power.
