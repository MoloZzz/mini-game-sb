#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Rarity colors from RARITY_META in @card-game/shared-types
const rarities = [
  { key: 'common', color: '#9CA3AF', letter: 'C' },
  { key: 'uncommon', color: '#22C55E', letter: 'U' },
  { key: 'rare', color: '#3B82F6', letter: 'R' },
  { key: 'epic', color: '#A855F7', letter: 'E' },
  { key: 'legendary', color: '#F59E0B', letter: 'L' },
  { key: 'mythic', color: '#EC4899', letter: 'M' },
];

// Muted color for text (used across all placeholders)
const textColor = '#6B7280';

function generateCardSvg(width, height, rarity, variant) {
  const rarityData = rarities.find((r) => r.key === rarity);
  if (!rarityData) throw new Error(`Unknown rarity: ${rarity}`);

  const { color, letter } = rarityData;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 3;

  // Create gradient
  const gradientId = `grad-${rarity}-${variant}`;

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="${gradientId}">
      <stop offset="0%" style="stop-color:${color};stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:${color};stop-opacity:0.05" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#0a0a0a"/>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#${gradientId})"/>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="4"/>
  <text x="${cx}" y="${cy}" font-family="sans-serif" font-size="${Math.max(48, width / 4)}" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="${textColor}">${letter}${variant}</text>
</svg>`;
}

function generateCaseSvg(name, width = 400, height = 300) {
  const cx = width / 2;
  const cy = height / 2;

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#0a0a0a"/>
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="none" stroke="#4B5563" stroke-width="2" rx="8"/>
  <text x="${cx}" y="${cy}" font-family="sans-serif" font-size="32" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="${textColor}">${name}</text>
</svg>`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Generate card thumbnails
const thumbsDir = path.join(projectRoot, 'public', 'mock', 'thumbs');
ensureDir(thumbsDir);
rarities.forEach((rarity) => {
  for (let n = 1; n <= 3; n++) {
    const filename = path.join(thumbsDir, `${rarity.key}-${n}.svg`);
    const svg = generateCardSvg(256, 256, rarity.key, n);
    fs.writeFileSync(filename, svg, 'utf-8');
    console.log(`✓ Generated ${filename}`);
  }
});

// Generate card art
const artDir = path.join(projectRoot, 'public', 'mock', 'art');
ensureDir(artDir);
rarities.forEach((rarity) => {
  for (let n = 1; n <= 3; n++) {
    const filename = path.join(artDir, `${rarity.key}-${n}.svg`);
    const svg = generateCardSvg(512, 512, rarity.key, n);
    fs.writeFileSync(filename, svg, 'utf-8');
    console.log(`✓ Generated ${filename}`);
  }
});

// Generate case placeholders
const casesDir = path.join(projectRoot, 'public', 'mock', 'cases');
ensureDir(casesDir);
const caseNames = ['starter-chest', 'ember-vault', 'arcane-reliquary'];
caseNames.forEach((name) => {
  const filename = path.join(casesDir, `${name}.svg`);
  const displayName = name.replace(/-/g, ' ').toUpperCase();
  const svg = generateCaseSvg(displayName, 400, 300);
  fs.writeFileSync(filename, svg, 'utf-8');
  console.log(`✓ Generated ${filename}`);
});

console.log('\nAll placeholder SVGs generated successfully!');
