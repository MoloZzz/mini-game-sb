import { Lobby } from './Lobby';

/**
 * Named export only — not routed anywhere yet. Lets a human eyeball the
 * lobby before the reel-flow routing exists to wire onOpenCase for real.
 */
export function LobbySandbox() {
  return (
    <Lobby
      onOpenCase={(slug) => {
        // eslint-disable-next-line no-console
        console.log('onOpenCase', slug);
      }}
    />
  );
}
