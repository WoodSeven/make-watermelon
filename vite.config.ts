import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [],
  build: {
    cssTarget: 'chrome61',
    rollupOptions: {
      input: ['index.html', 'dxg/index.html'],
    },
  },
});
