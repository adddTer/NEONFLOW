import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: This ensures assets are loaded relatively (e.g., "./assets/index.js")
  // instead of from root ("/assets/index.js"), fixing the GitHub Pages 404 issue.
  base: './', 
  build: {
    outDir: 'dist',
  },
});