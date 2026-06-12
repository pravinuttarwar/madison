/**
 * Environment configuration
 * Centralizes all environment variable access
 */

export const config = {
  // Encryption key for secure storage
  encryptionKey: import.meta.env.VITE_ENCRYPTION_KEY || undefined,

  // Environment mode
  mode: import.meta.env.MODE || 'development',

  // Development mode flag
  isDevelopment: import.meta.env.DEV,

  // Production mode flag
  isProduction: import.meta.env.PROD,

  // Disable logging flag
  disableLogging: import.meta.env.VITE_DISABLE_LOGGING === 'true',

  // PHI redaction (always enabled by default for HIPAA compliance)
  disablePHIRedaction: import.meta.env.VITE_DISABLE_PHI_REDACTION === 'true',

  // Base URL or other app-specific configs can be added here
  apiUrl: import.meta.env.VITE_API_URL || '',
} as const;
