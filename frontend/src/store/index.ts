import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import { secureLocalStorage } from '../utils/secureStorage';

/**
 * Secure storage adapter for redux-persist
 * All data is encrypted/decrypted automatically through secureLocalStorage
 */
const secureStorage = {
  getItem: (key: string): Promise<string | null> => {
    try {
      const value = secureLocalStorage.getItem(key);
      return Promise.resolve(value);
    } catch {
      return Promise.resolve(null);
    }
  },
  setItem: (key: string, value: string): Promise<void> => {
    try {
      secureLocalStorage.setItem(key, value);
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  },
  removeItem: (key: string): Promise<void> => {
    secureLocalStorage.removeItem(key);
    return Promise.resolve();
  },
};

/**
 * Redux-persist configuration with secure storage
 * The secureLocalStorage wrapper already handles encryption/decryption
 */
const persistConfig = {
  key: 'root',
  storage: secureStorage,
  // Only persist in non-test environments
  ...(import.meta.env.MODE !== 'test' ? {} : { blacklist: [] }),
};

// Create a sample reducer - replace with your actual reducers
const sampleReducer = (
  state = { count: 0 },
  action: { type: string; payload?: unknown },
) => {
  switch (action.type) {
    case 'increment':
      return { ...state, count: (state.count as number) + 1 };
    case 'decrement':
      return { ...state, count: (state.count as number) - 1 };
    default:
      return state;
  }
};

const rootReducer = combineReducers({
  // Add your reducers here
  sample: sampleReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
  devTools: import.meta.env.MODE !== 'production',
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
