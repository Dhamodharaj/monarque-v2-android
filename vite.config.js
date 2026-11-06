import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static single-page build for Netlify: `npm run build` -> dist/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false, // do not publish readable source maps
    chunkSizeWarningLimit: 1500,
  },
});
