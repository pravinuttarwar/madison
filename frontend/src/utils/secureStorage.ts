import { encryptionService } from './encryption';

/**
 * Secure storage interface for localStorage and sessionStorage
 * All data is encrypted before storage
 */

interface SecureStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  getItemObject<T>(key: string): T | null;
  setItemObject<T>(key: string, value: T): void;
}

class SecureStorageImpl implements SecureStorage {
  private storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  /**
   * Get an encrypted item and decrypt it
   */
  getItem(key: string): string | null {
    try {
      const encrypted = this.storage.getItem(key);
      if (!encrypted) {
        return null;
      }
      return encryptionService.decrypt(encrypted);
    } catch (error) {
      console.error(`Error getting item ${key}:`, error);
      // If decryption fails, remove the corrupted item
      this.removeItem(key);
      return null;
    }
  }

  /**
   * Encrypt and store an item
   */
  setItem(key: string, value: string): void {
    try {
      const encrypted = encryptionService.encrypt(value);
      this.storage.setItem(key, encrypted);
    } catch (error) {
      console.error(`Error setting item ${key}:`, error);
      throw new Error(`Failed to store item: ${key}`);
    }
  }

  /**
   * Remove an item
   */
  removeItem(key: string): void {
    this.storage.removeItem(key);
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Get an encrypted object and decrypt it
   */
  getItemObject<T>(key: string): T | null {
    try {
      const encrypted = this.storage.getItem(key);
      if (!encrypted) {
        return null;
      }
      return encryptionService.decryptObject<T>(encrypted);
    } catch (error) {
      console.error(`Error getting object ${key}:`, error);
      // If decryption fails, remove the corrupted item
      this.removeItem(key);
      return null;
    }
  }

  /**
   * Encrypt and store an object
   */
  setItemObject<T>(key: string, value: T): void {
    try {
      const encrypted = encryptionService.encryptObject(value);
      this.storage.setItem(key, encrypted);
    } catch (error) {
      console.error(`Error setting object ${key}:`, error);
      throw new Error(`Failed to store object: ${key}`);
    }
  }
}

/**
 * Secure localStorage wrapper
 * All data stored here is encrypted
 */
export const secureLocalStorage: SecureStorage = new SecureStorageImpl(
  typeof window !== 'undefined' ? window.localStorage : ({} as Storage),
);

/**
 * Secure sessionStorage wrapper
 * All data stored here is encrypted
 */
export const secureSessionStorage: SecureStorage = new SecureStorageImpl(
  typeof window !== 'undefined' ? window.sessionStorage : ({} as Storage),
);
