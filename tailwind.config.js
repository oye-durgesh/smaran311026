/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { paper: '#F5EFE6', ink: '#2E241B', sage: '#7B8B5A', deepsage: '#526D51', plum: '#6F526C', peach: '#F3D6C6', terra: '#C08560', error: '#B75B53' },
      fontFamily: { serif: ['"Source Serif 4"', 'Georgia', 'serif'], sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
