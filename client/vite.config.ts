import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies the WebSocket collab server so the client can connect to
// a single origin during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
});
