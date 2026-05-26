import type { Config } from 'tailwindcss';
import daisyui from 'daisyui';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  plugins: [daisyui],
  daisyui: {
    // Pablo 2026-05-26: custom 'cream' theme — light without pure-white.
    // Tones inspired by the prototype's parchment/cream palette.
    themes: [
      'night',
      {
        cream: {
          'color-scheme': 'light',
          primary: '#1e3a8a',          // indigo-900 (kit blue)
          secondary: '#a16207',        // amber-700
          accent: '#15803d',           // green-700
          neutral: '#3a2f25',          // warm dark brown
          'base-100': '#f5edd6',       // cream paper
          'base-200': '#ede2c4',       // slightly darker cream
          'base-300': '#d8c8a0',       // beige border
          'base-content': '#2a2419',   // dark warm gray for text
          info: '#2563eb',
          success: '#16a34a',
          warning: '#d97706',
          error: '#dc2626'
        }
      }
    ],
    darkTheme: 'night'
  }
} satisfies Config;
