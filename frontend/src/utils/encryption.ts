import CryptoJS from 'crypto-js';

/**
 * Encryption utility for secure storage
 * Uses AES encryption with a configurable key
 */
class EncryptionService {
  private encryptionKey: string;

  constructor(encryptionKey?: string) {
    // In production, this should come from environment variables or secure key management
    // For now, using a default key that should be overridden
    this.encryptionKey =
      encryptionKey ||
      import.meta.env.VITE_ENCRYPTION_KEY ||
      'default-encryption-key-change-in-production';
  }

  /**
   * Encrypt data using AES
   */
  encrypt(data: string): string {
    try {
      const encrypted = CryptoJS.AES.encrypt(
        data,
        this.encryptionKey,
      ).toString();
      return encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data using AES
   */
  decrypt(encryptedData: string): string {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);

      if (!decryptedString) {
        throw new Error('Decryption failed: Invalid key or corrupted data');
      }

      return decryptedString;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt an object by stringifying it first
   */
  encryptObject<T>(obj: T): string {
    try {
      const jsonString = JSON.stringify(obj);
      return this.encrypt(jsonString);
    } catch (error) {
      console.error('Object encryption error:', error);
      throw new Error('Failed to encrypt object');
    }
  }

  /**
   * Decrypt an object
   */
  decryptObject<T>(encryptedData: string): T {
    try {
      const decryptedString = this.decrypt(encryptedData);
      return JSON.parse(decryptedString) as T;
    } catch (error) {
      console.error('Object decryption error:', error);
      throw new Error('Failed to decrypt object');
    }
  }

  /**
   * Set a new encryption key
   */
  setEncryptionKey(key: string): void {
    this.encryptionKey = key;
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();

// Export class for custom instances if needed
export { EncryptionService };
