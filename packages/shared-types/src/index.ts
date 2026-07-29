/**
 * @card-game/shared-types — the frozen contract.
 *
 * game-api and game-ui both import from here. If a DTO or a game constant is
 * needed on both sides, it belongs in this package and nowhere else; that is
 * the whole reason the monorepo has workspaces.
 *
 * Changing anything here is a contract change: update this package first, then
 * both consumers, in one commit.
 */

export * from './rarity.js';
export * from './card.js';
export * from './case.js';
export * from './thematic-set.js';
export * from './reel.js';
export * from './player.js';
export * from './milestones.js';
export * from './api.js';
export * from './archive.js';
