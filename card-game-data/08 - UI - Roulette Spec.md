---
tags: [ui, animation]
---

# Roulette Spec

Back to [[00 - Card Game MOC]] · Contract → [[03 - Architecture - API Contracts]]

This is the most important component of the project. Everything else is a wrapper around these 5 seconds.

## Principle

The result is already known before the animation starts. The roulette decides nothing;
it tells the story of a decision the server has already made.

```
     ┌───────────────── viewport ─────────────────┐
     │                     ▼ marker               │
     │  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐       │
     │  │ 53│ │ 54│ │ 55│ │ 56│ │ 57│ │ 58│  ...  │
     │  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘       │
     │                   winner                   │
     └────────────────────────────────────────────┘
        ◄──────── translateX(-X) on the entire reel
```

One `transform` on the reel container. Do not animate each tile separately;
that is 60 composited layers and guaranteed lag.

## Constants

```ts
const TILE_W   = 140;   // px
const TILE_GAP = 12;
const PITCH    = TILE_W + TILE_GAP;  // 152
const REEL_LEN = 60;
const WIN_IDX  = 55;
const DURATION = 5500;  // ms
```

`WIN_IDX = 55` out of 60: far enough to build speed and slow down,
with 4 tiles remaining on the right so the marker does not hit the end of the reel.

## Stopping Math

```ts
function targetOffset(containerW: number): number {
  // center of the winning tile relative to the start of the reel
  const winCenter = WIN_IDX * PITCH + TILE_W / 2;
  // offset so this center lands under the marker
  const base = winCenter - containerW / 2;
  // jitter: so it does not stop exactly in the center every time
  const jitter = (Math.random() - 0.5) * TILE_W * 0.6;  // ±42px
  return -(base + jitter);
}
```

**Jitter is mandatory.** Without it, every stop is perfectly centered,
and the brain reads it as “fake animation” after three openings. `±0.3 × TILE_W`
is enough to look physical and too little for the marker to point to a neighbor
(threshold: `0.5 × TILE_W`).

## Easing

```css
cubic-bezier(0.12, 0.85, 0.20, 1.0)
```

Profile: sharp start (~0.5s), long deceleration phase (~4s), almost
imperceptible crawl over the last 0.5s.

**Why not `ease-out`.** The default ease-out slows down too early;
the roulette “seems to stop” halfway through, and the last two seconds are boring.
This needs a curve with a long tail: tension should rise, not fall.

Framer Motion:
```tsx
<motion.div
  animate={{ x: targetOffset(containerW) }}
  transition={{ duration: 5.5, ease: [0.12, 0.85, 0.20, 1.0] }}
  onAnimationComplete={onLanded}
  style={{ display: 'flex', gap: TILE_GAP, willChange: 'transform' }}
/>
```

## Preload — the Most Important Technical Point

If the animation starts immediately after the API response, half the tiles will be
empty and images will appear one by one during the spin. This is the worst
possible appearance and the most common mistake in this component.

```ts
async function preloadReel(urls: string[]) {
  await Promise.all(urls.map(u => new Promise<void>(res => {
    const img = new Image();
    img.onload = img.onerror = () => res();   // errors also resolve
    img.src = u;
  })));
}
```

Sequence:
```
click → POST /open → response → preloadReel(thumbs) → START animation
                                       ↑
                          spinner here, usually 100–300ms from local disk
```

`onerror` also resolves the promise; otherwise one broken image hangs the entire game.

**Use thumbs (256px WebP) in the reel, not full PNGs.** 60 tiles at
1MB means 60MB per opening. Full art loads only for the reveal.

## Timeline

| Time | Event |
|---|---|
| 0ms | click, button disabled, POST |
| ~80ms | API response |
| ~80–300ms | preload, spinner |
| 300ms | reel starts, acceleration sound |
| 300–3000ms | fast phase, ticks blend into a hum |
| 3000–5500ms | deceleration, ticks become distinct |
| 5800ms | stop + 300ms pause (silence is the most important 300ms) |
| 6100ms | winning tile scales up, rarity flash |
| 6400ms | card reveals at large size |
| 6900ms | “Again” / “To Inventory” buttons appear |

**Do not forget the 300ms pause after stopping.** Without it, the reveal overlaps
the stop and the “oh, it stopped” moment is lost.

## Effects by Rarity

| Rarity | On stop |
|---|---|
| Common | nothing, quiet click |
| Uncommon | soft green tile glow |
| Rare | blue pulse + beam upward |
| Epic | purple flash, ~20 particles, light shake |
| Legendary | gold explosion, beams, ~60 particles, heavy shake, fanfare |
| Mythic | screen fill, slow time dilation, confetti, full UI freeze for 1s |

Escalation should be **nonlinear**. The difference from common→uncommon is nearly zero,
while epic→legendary is huge. This makes a rare drop feel like an event.

Colors come from the table in [[05 - Game Design - Rarity & Drop Rates]].

## Performance

- Animate **only `transform`**. `left`, `margin`, and `width` trigger layout
  on every frame — guaranteed drops.
- `will-change: transform` on the reel, `contain: layout paint` on tiles
- Tiles use `React.memo`, keyed by `${index}-${cardId}`
- Do not render 60 DOM nodes with heavy shadows and filters. A tile is an image,
  a rarity-colored frame, and a name. All beautiful effects belong on the reveal screen,
  where one element is animated.
- Test on the laptop **on battery**, not plugged in. CPU throttling exposes
  problems that are invisible while charging.

## Sound

Optional, but gives ~40% of the feeling for ~2% of the effort.

- `tick.wav` — whenever a tile crosses the marker. Calculate it from the current
  offset, not a timer. Use the Web Audio API with a buffer pool;
  `new Audio()` on every tick will choke at high speed.
- `reveal_common.wav` … `reveal_mythic.wav` — by rarity
- Mute button in the header, state in localStorage. **Default is off:**
  unexpected browser sound is annoying, and browsers block
  autoplay without interaction anyway.

## Edge Cases

| Case | Behavior |
|---|---|
| API failed | toast “failed to open,” button active again, money not debited (transaction rolled back) |
| Resize during animation | ignore it; recalculation breaks the landing. Freeze width at start |
| Tab went into background | `visibilitychange` → skip animation and show the result immediately |
| Double-click | button disabled for the entire cycle + `Idempotency-Key` on the server |
| `prefers-reduced-motion` | skip the spin and reveal immediately with fade |
| Broken thumb | placeholder tile with rarity color; animation is not blocked |

`prefers-reduced-motion` is not a formality. A five-second fast horizontal
spin can cause nausea or trigger a migraine. It takes three lines of code.
