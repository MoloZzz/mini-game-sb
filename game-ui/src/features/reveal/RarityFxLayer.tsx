import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RARITY_META, type Rarity } from '@card-game/shared-types';

import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { RARITY_FX } from '@/lib/rarityFx';

interface RarityFxLayerProps {
  rarity: Rarity;
  active: boolean;
}

interface Particle {
  id: number;
  dx: number;
  dy: number;
  size: number;
  delay: number;
}

/** Comfortably longer than the longest particle delay + travel time (0.95s), so
 * nothing gets cut off mid-flight, but short enough that nothing lingers between openings. */
const PARTICLE_LIFETIME_MS = 1100;
const RAY_COUNT = 12;
const CONFETTI_COUNT = 24;

/** Cheap deterministic pseudo-random in [0, 1) — same seed every render for a given
 * index, so React doesn't re-randomise the burst pattern on every re-render. */
function pseudoRandom(seed: number): number {
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

function buildParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + pseudoRandom(i) * 0.4;
    const distance = 70 + pseudoRandom(i + 100) * 90;
    particles.push({
      id: i,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size: 3 + pseudoRandom(i + 200) * 5,
      delay: pseudoRandom(i + 300) * 0.15,
    });
  }
  return particles;
}

/**
 * Renders the landing effect for one rarity. `transform`/`opacity` only on every
 * animated element — `left`/`top`/`width` force layout on every frame (see the
 * roulette spec's performance section), and this layer can render up to 140
 * particles at once on a mythic drop.
 *
 * Shake is deliberately NOT handled here: this component has no children to
 * wrap, so the caller (Reveal) drives the card's shake wrapper directly from
 * RARITY_FX. This layer only renders the ambient effects around it.
 */
export function RarityFxLayer({ rarity, active }: RarityFxLayerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const fx = RARITY_FX[rarity];
  const color = RARITY_META[rarity].color;
  const [particlesDone, setParticlesDone] = useState(false);

  useEffect(() => {
    if (!active || reducedMotion || fx.particleCount === 0) return undefined;
    setParticlesDone(false);
    const timer = setTimeout(() => setParticlesDone(true), PARTICLE_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [active, reducedMotion, fx.particleCount, rarity]);

  const particles = useMemo(() => buildParticles(fx.particleCount), [fx.particleCount]);

  if (!active) return null;

  // Accessibility requirement, not a nicety: a burst of particles, screen flash
  // and shake can trigger nausea or a migraine. Render the static end-state —
  // a plain rarity glow — and nothing that moves.
  if (reducedMotion) {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="h-2/3 w-2/3 rounded-full"
          style={{ boxShadow: `0 0 60px 20px ${color}33` }}
        />
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {fx.flash === 'screen' && (
        <motion.div
          className="fixed inset-0"
          style={{ background: `radial-gradient(circle, ${color}55 0%, transparent 70%)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1, times: [0, 0.25, 1], ease: 'easeOut' }}
        />
      )}

      {(fx.flash === 'glow' || fx.flash === 'pulse' || fx.flash === 'burst') && (
        <motion.div
          className="absolute rounded-full"
          style={{ width: '70%', height: '70%', background: `radial-gradient(circle, ${color}66 0%, transparent 75%)` }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], scale: fx.flash === 'burst' ? [0.6, 1.3, 1.3] : [0.6, 1, 1] }}
          transition={{ duration: fx.flash === 'burst' ? 0.6 : 0.8, ease: 'easeOut' }}
        />
      )}

      {fx.beam && (
        <motion.div
          className="absolute bottom-1/2 left-1/2 origin-bottom"
          style={{ width: 36, height: 260, marginLeft: -18, background: `linear-gradient(to top, ${color}aa, transparent)` }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: [0, 1, 0.5] }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}

      {fx.rays &&
        Array.from({ length: RAY_COUNT }, (_, i) => (
          <motion.div
            key={`ray-${i}`}
            className="absolute left-1/2 top-1/2 origin-left"
            style={{
              width: 220,
              height: 8,
              marginTop: -4,
              background: `linear-gradient(to right, ${color}77, transparent)`,
              rotate: `${(360 / RAY_COUNT) * i}deg`,
            }}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: [0, 0.8, 0], scaleX: 1 }}
            transition={{ duration: 1.2, delay: i * 0.02, ease: 'easeOut' }}
          />
        ))}

      {!particlesDone &&
        particles.map((p) => (
          <motion.div
            key={`particle-${p.id}`}
            className="absolute rounded-full"
            style={{ width: p.size, height: p.size, backgroundColor: color }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: p.dx, y: p.dy, opacity: 0 }}
            transition={{ duration: 0.8, delay: p.delay, ease: 'easeOut' }}
          />
        ))}

      {fx.confetti &&
        Array.from({ length: CONFETTI_COUNT }, (_, i) => {
          const jitter = pseudoRandom(i + 500);
          return (
            <motion.div
              key={`confetti-${i}`}
              className="absolute top-0"
              style={{
                width: 6,
                height: 10,
                left: `${(i / CONFETTI_COUNT) * 100}%`,
                backgroundColor: i % 2 === 0 ? color : '#FFFFFF',
              }}
              initial={{ y: -40, rotate: 0, opacity: 1 }}
              animate={{ y: 260, rotate: 360 + jitter * 180, opacity: [1, 1, 0] }}
              transition={{ duration: 1.4, delay: jitter * 0.3, ease: 'easeIn' }}
            />
          );
        })}
    </div>
  );
}
