import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import './index.css';
import App from './App.tsx';
import { store, persistor } from './store';
import { initTheme } from './utils/theme';

// Apply the display preference (Color-Vision-Friendly is default-on) before first
// paint, so the login screen and every page open in the right palette. The app is
// dark-only — the canonical command-center palette lives in index.css (MBI-21).
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </StrictMode>,
);
