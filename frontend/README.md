# React 19 + TypeScript + Vite Boilerplate

A production-ready React 19 boilerplate with TypeScript, Vite, and HIPAA-compliant security features.

## Features

- ✅ **React 19** with TypeScript
- ✅ **Tailwind CSS** for styling
- ✅ **Redux Toolkit** with secure, encrypted persistence
- ✅ **Secure Storage** - Encrypted localStorage and sessionStorage
- ✅ **PHI-Aware Logging** - Automatic redaction of Protected Health Information
- ✅ **Environment-Based Logging** - Smart logging based on environment
- ✅ **HIPAA-Compliant** - All sensitive data is encrypted

## Security Features

### Secure Storage

All data stored in `localStorage` and `sessionStorage` is automatically encrypted using AES encryption.

```typescript
import {
  secureLocalStorage,
  secureSessionStorage,
} from './utils/secureStorage';

// Store encrypted data
secureLocalStorage.setItem('userToken', 'secret-token');
secureSessionStorage.setItemObject('sessionData', { userId: '123' });

// Retrieve and decrypt data
const token = secureLocalStorage.getItem('userToken');
const data = secureSessionStorage.getItemObject<SessionData>('sessionData');
```

### Secure Redux Store

Redux state is automatically encrypted and persisted to secure storage.

```typescript
import { useAppDispatch, useAppSelector } from './store/hooks';

function MyComponent() {
  const dispatch = useAppDispatch();
  const count = useAppSelector((state) => state.sample.count);

  // State is automatically encrypted and persisted
  dispatch({ type: 'increment' });
}
```

### PHI-Aware Logging

The logger automatically redacts Protected Health Information (PHI) based on environment.

**Redacted Information:**

- Social Security Numbers (SSN)
- Phone numbers
- Email addresses
- Medical Record Numbers (MRN)
- Dates of birth
- Credit card numbers
- And custom PHI fields

```typescript
import { logger } from './utils/logger';

// PHI will be automatically redacted in production
const patientData = {
  name: 'John Doe',
  ssn: '123-45-6789',
  email: 'john@example.com',
  phone: '555-1234',
};

logger.info('Patient data', patientData);
// In production: PHI fields are replaced with [REDACTED]
```

**Log Levels:**

- `logger.debug()` - Only in development
- `logger.info()` - All environments
- `logger.warn()` - All environments
- `logger.error()` - All environments

In production, only `warn` and `error` logs are shown.

## Environment Configuration

Create a `.env` file in the root directory (see `.env.example`):

```bash
# Encryption Key (REQUIRED in production)
VITE_ENCRYPTION_KEY=your-secure-encryption-key-here

# Disable logging
VITE_DISABLE_LOGGING=false

# Disable PHI redaction (NOT RECOMMENDED - PHI redaction is always enabled by default)
VITE_DISABLE_PHI_REDACTION=false
```

### Environment Variables

- `VITE_ENCRYPTION_KEY` - **REQUIRED**: Encryption key for secure storage. Generate a strong random string for production.
- `VITE_DISABLE_LOGGING` - Set to `true` to disable all logging
- `VITE_DISABLE_PHI_REDACTION` - Set to `true` to disable PHI redaction (NOT RECOMMENDED - for debugging only). PHI redaction is **ALWAYS enabled by default** for HIPAA compliance.

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview

```bash
npm run preview
```

## Project Structure

```
src/
├── config/
│   └── environment.ts      # Environment configuration
├── store/
│   ├── index.ts            # Redux store with secure persistence
│   └── hooks.ts            # Typed Redux hooks
├── utils/
│   ├── encryption.ts       # AES encryption service
│   ├── secureStorage.ts    # Encrypted localStorage/sessionStorage
│   └── logger.ts           # PHI-aware logger
├── examples/
│   └── usage-examples.ts   # Usage examples
└── App.tsx                 # Main app component
```

## Security Best Practices

1. **Encryption Key**: Always set a strong `VITE_ENCRYPTION_KEY` in production
2. **PHI Redaction**: PHI is automatically redacted in production logs
3. **Environment-Based Logging**: Debug logs are disabled in production
4. **Secure Storage**: All stored data is encrypted by default

## Tailwind CSS

Tailwind CSS is configured and ready to use. Utility classes work throughout the application.

```tsx
<div className="bg-blue-500 text-white p-4 rounded-lg">Hello, Tailwind!</div>
```

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x';
import reactDom from 'eslint-plugin-react-dom';

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
});
```
