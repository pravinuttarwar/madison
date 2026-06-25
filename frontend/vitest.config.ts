import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Vitest config for the frontend render checks. jsdom gives the components a DOM to
// render into; the `@` alias mirrors the app/build config so tests import like the app.
// CSS is disabled (Tailwind utilities aren't needed to assert rendered behavior).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    css: false,
    // Pin tests to standalone mock mode regardless of the dev's local .env (which may
    // wire live sources). The render checks exercise composition over sample data — no
    // backend, deterministic — which is exactly the no-backend build the app must support.
    env: { VITE_LIVE_SOURCES: '', VITE_API_URL: '' },
    // Installs an offline fetch stub serving the synthetic fixtures for `/api/*`, so the
    // render tests pass against the live-only getters with no backend (MBI-35).
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
