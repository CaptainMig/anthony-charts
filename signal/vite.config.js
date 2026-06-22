import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built assets resolve whether the app is served at the
// domain root or mounted under anthonycharts.com/signal.
export default defineConfig({
  base: './',
  plugins: [react()],
});
