import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          'data': ['./src/data/lunar-data.ts']
        }
      }
    }
  },
  server: {
    port: 3000
  }
});
