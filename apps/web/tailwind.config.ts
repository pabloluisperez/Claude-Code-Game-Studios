import type { Config } from 'tailwindcss';
import daisyui from 'daisyui';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  plugins: [daisyui],
  daisyui: {
    themes: ['light', 'dark', 'night'],
    darkTheme: 'night'
  }
} satisfies Config;
