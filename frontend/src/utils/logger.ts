/**
 * Logger utility with PHI (Protected Health Information) redaction
 * Handles logging based on environment
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
  environment: string;
}

/**
 * Common PHI patterns that should be redacted
 */
const PHI_PATTERNS = [
  // Social Security Numbers (SSN)
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{9}\b/g,
  // Phone numbers
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  /\(\d{3}\)\s?\d{3}-\d{4}/g,
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Credit card numbers
  /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g,
  // Medical record numbers
  /\bMRN[-:]?\s?\d+\b/gi,
  // Date of birth patterns (MM/DD/YYYY, YYYY-MM-DD, etc.)
  /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,
  // Names (basic pattern - can be enhanced)
  /\b(?:patient|client|user)\s+name:?\s*[A-Z][a-z]+\s+[A-Z][a-z]+\b/gi,
];

/**
 * Additional custom PHI fields to redact
 */
const CUSTOM_PHI_FIELDS = [
  'ssn',
  'socialSecurityNumber',
  'dateOfBirth',
  'dob',
  'phone',
  'phoneNumber',
  'email',
  'emailAddress',
  'address',
  'medicalRecordNumber',
  'mrn',
  'insuranceId',
  'policyNumber',
  'accountNumber',
  'creditCard',
  'cardNumber',
  'name', // Patient/client name is PHI
  'patientName',
  'clientName',
  'firstName',
  'lastName',
  'fullName',
];

/**
 * Redact PHI from a string
 */
function redactPHI(text: string): string {
  let redacted = text;

  // Apply regex patterns
  PHI_PATTERNS.forEach((pattern) => {
    redacted = redacted.replace(pattern, '[REDACTED]');
  });

  return redacted;
}

/**
 * Redact PHI from an object recursively
 */
function redactPHIFromObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactPHI(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactPHIFromObject(item));
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if this field should be redacted
      if (CUSTOM_PHI_FIELDS.some((field) => lowerKey.includes(field))) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactPHIFromObject(value);
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Get current environment
 */
function getEnvironment(): string {
  return import.meta.env.MODE || 'development';
}

/**
 * Check if PHI redaction should be enabled
 * PHI should ALWAYS be redacted in logs for HIPAA compliance.
 * Environment variable can disable it only for debugging purposes (not recommended).
 */
function shouldRedactPHI(): boolean {
  // PHI should always be redacted by default for security
  // Only allow disabling it if explicitly set to false (for debugging only)
  const disableRedaction =
    import.meta.env.VITE_DISABLE_PHI_REDACTION === 'true';

  // Always redact unless explicitly disabled (not recommended)
  return !disableRedaction;
}

/**
 * Logger class
 */
class Logger {
  private environment: string;
  private enabled: boolean;

  constructor() {
    this.environment = getEnvironment();
    // Disable logging in test environment by default
    this.enabled = this.environment !== 'test';

    // Check if logging is explicitly disabled
    if (import.meta.env.VITE_DISABLE_LOGGING === 'true') {
      this.enabled = false;
    }
  }

  /**
   * Check if a log level should be logged based on environment
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) {
      return false;
    }

    // In production, only log warnings and errors
    if (this.environment === 'production') {
      return level === LogLevel.WARN || level === LogLevel.ERROR;
    }

    // In other environments, log everything
    return true;
  }

  /**
   * Format log entry
   */
  private formatLog(
    level: LogLevel,
    message: string,
    data?: unknown,
  ): LogEntry {
    return {
      level,
      message: shouldRedactPHI() ? redactPHI(message) : message,
      data: data
        ? shouldRedactPHI()
          ? redactPHIFromObject(data)
          : data
        : undefined,
      timestamp: new Date().toISOString(),
      environment: this.environment,
    };
  }

  /**
   * Output log based on environment
   */
  private outputLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const { level, message, data, timestamp } = entry;

    switch (level) {
      case LogLevel.DEBUG:
        if (this.environment !== 'production') {
          console.debug(`[${timestamp}] [DEBUG]`, message, data || '');
        }
        break;
      case LogLevel.INFO:
        console.info(`[${timestamp}] [INFO]`, message, data || '');
        break;
      case LogLevel.WARN:
        console.warn(`[${timestamp}] [WARN]`, message, data || '');
        break;
      case LogLevel.ERROR:
        console.error(`[${timestamp}] [ERROR]`, message, data || '');
        break;
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: unknown): void {
    const entry = this.formatLog(LogLevel.DEBUG, message, data);
    this.outputLog(entry);
  }

  /**
   * Log info message
   */
  info(message: string, data?: unknown): void {
    const entry = this.formatLog(LogLevel.INFO, message, data);
    this.outputLog(entry);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: unknown): void {
    const entry = this.formatLog(LogLevel.WARN, message, data);
    this.outputLog(entry);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, data?: unknown): void {
    const baseErrorData =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { error };

    const errorData =
      data && typeof data === 'object' && !Array.isArray(data)
        ? { ...baseErrorData, ...data }
        : data !== undefined
          ? { ...baseErrorData, data }
          : baseErrorData;

    const entry = this.formatLog(LogLevel.ERROR, message, errorData);
    this.outputLog(entry);
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get current environment
   */
  getEnvironment(): string {
    return this.environment;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export Logger class for custom instances if needed
export { Logger };
