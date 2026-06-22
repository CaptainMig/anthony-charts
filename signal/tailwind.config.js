/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f0d0a', // Deep Ink — background
        teal: '#5aabb0', // Starpoint Teal — accent
        verdict: {
          verified: '#6fd49a',
          contextual: '#8bbef0',
          contested: '#c5a0f0',
          unverified: '#c8971f',
          misleading: '#f08080',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderWidth: {
        hair: '0.5px',
      },
    },
  },
  plugins: [],
};
