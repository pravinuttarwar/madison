import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initTheme } from './utils/theme';

// Apply the display preference (Color-Vision-Friendly is default-on) before first
// paint, so the login screen and every page open in the right palette. The app is
// dark-only — the canonical command-center palette lives in index.css (MBI-21).
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
