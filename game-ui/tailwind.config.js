/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  // No `colors.rarity` palette here on purpose: rarity colour has exactly one
  // source, `RARITY_META` in @card-game/shared-types, reached through
  // `src/lib/rarityStyle.ts`. A second copy in Tailwind would be a second
  // place to update when a rarity's colour changes — and the copy that used
  // to live here, plus its 18-class safelist, was never referenced once.
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      fontFamily: {
        display: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
