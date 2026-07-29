/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rarity: {
          common: '#9CA3AF',
          uncommon: '#22C55E',
          rare: '#3B82F6',
          epic: '#A855F7',
          legendary: '#F59E0B',
          mythic: '#EC4899',
        },
      },
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
  safelist: [
    'text-rarity-common',
    'text-rarity-uncommon',
    'text-rarity-rare',
    'text-rarity-epic',
    'text-rarity-legendary',
    'text-rarity-mythic',
    'bg-rarity-common',
    'bg-rarity-uncommon',
    'bg-rarity-rare',
    'bg-rarity-epic',
    'bg-rarity-legendary',
    'bg-rarity-mythic',
    'border-rarity-common',
    'border-rarity-uncommon',
    'border-rarity-rare',
    'border-rarity-epic',
    'border-rarity-legendary',
    'border-rarity-mythic',
  ],
  plugins: [],
};
