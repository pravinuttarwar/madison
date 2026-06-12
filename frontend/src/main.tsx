import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import './index.css';
import App from './App.tsx';
import { store, persistor } from './store';
import { initTheme } from './utils/theme';

// Apply saved (or default-dark) display preferences before first paint, so the
// login screen and every page open in the right theme — not a flash of light.
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
