import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// RELATIVE base by default so assets resolve wherever index.html is served (preview
// path, published /<slug>/, or local single-port root). Pair with HashRouter so routing
// works at any mount point with no basename / no refresh-404. For a sub-path deploy
// behind Apache (e.g. studio.mindbowser.com/madison/) set VITE_BASE=/madison/ in .env
// so asset URLs are absolute under that prefix regardless of trailing slash.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // '' = load all keys, incl. VITE_BASE
  return {
    base: env.VITE_BASE || './',
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // Dev-server convenience: relative API calls (same-origin in prod) are proxied to the
    // local backend so `vite dev` on :5173 works without setting VITE_API_URL. The single-
    // port flow (backend serves the built FE) needs none of this.
    server: {
      proxy: {
        '/api': 'http://localhost:8788',
        '/auth': 'http://localhost:8788',
        '/callback': 'http://localhost:8788',
      },
    },
  };
});
