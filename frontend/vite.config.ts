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

  // Dev-server convenience: relative API calls (same-origin in prod) are proxied to the
  // local backend so `vite dev` works without setting VITE_API_URL. ALL of this lives under
  // `server`, which Vite applies ONLY to `vite dev` — `vite build` + the single-port deploy
  // (backend serves the built FE) ignore it entirely, so none of this reaches production.
  //
  // Port + proxy target come FROM ENV (with safe local defaults) so the dev port is
  // deterministic and matches the backend's post-OAuth FRONTEND_URL:
  //   VITE_DEV_PORT        — fixed dev port (default 5174); strictPort fails fast instead of
  //                          silently drifting to another port (which broke the OAuth redirect).
  //   VITE_DEV_API_TARGET  — where to proxy /api,/auth,/callback (default the local backend).
  const devTarget = env.VITE_DEV_API_TARGET || 'http://localhost:8788';

  return {
    base: env.VITE_BASE || './',
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: Number(env.VITE_DEV_PORT) || 5174,
      strictPort: true,
      proxy: {
        '/api': devTarget,
        '/auth': devTarget,
        '/callback': devTarget,
      },
    },
  };
});
