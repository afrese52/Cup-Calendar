export type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/**
 * Moves existing Supabase values from general app storage into protected storage
 * on first access. Writes always go to protected storage before old copies are
 * removed, so a failed migration never destroys the only saved session.
 */
export function createMigratingSecureStorage(
  secureStorage: KeyValueStorage,
  legacyStorage: KeyValueStorage,
): KeyValueStorage {
  return {
    async getItem(key) {
      const protectedValue = await secureStorage.getItem(key);
      if (protectedValue !== null) {
        await legacyStorage.removeItem(key);
        return protectedValue;
      }

      const legacyValue = await legacyStorage.getItem(key);
      if (legacyValue === null) return null;

      await secureStorage.setItem(key, legacyValue);
      await legacyStorage.removeItem(key);
      return legacyValue;
    },

    async setItem(key, value) {
      await secureStorage.setItem(key, value);
      await legacyStorage.removeItem(key);
    },

    async removeItem(key) {
      // Remove the plaintext copy first so a failed protected-store deletion
      // cannot make an old AsyncStorage session reappear on the next launch.
      await legacyStorage.removeItem(key);
      await secureStorage.removeItem(key);
    },
  };
}
