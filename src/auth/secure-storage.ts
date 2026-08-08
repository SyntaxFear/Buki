import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800;

function countKey(key: string): string {
  return `${key}.chunks`;
}

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

async function storedChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await storedChunkCount(key);
    if (count === 0) return SecureStore.getItemAsync(key);
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
    );
    return chunks.some((chunk) => chunk === null) ? null : chunks.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    const previousCount = await storedChunkCount(key);
    const chunks = Array.from({ length: Math.ceil(value.length / CHUNK_SIZE) }, (_, index) =>
      value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    );
    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)),
    );
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
    await SecureStore.deleteItemAsync(key);
    await Promise.all(
      Array.from({ length: Math.max(0, previousCount - chunks.length) }, (_, offset) =>
        SecureStore.deleteItemAsync(chunkKey(key, chunks.length + offset)),
      ),
    );
  },

  async removeItem(key: string): Promise<void> {
    const count = await storedChunkCount(key);
    await Promise.all([
      SecureStore.deleteItemAsync(key),
      SecureStore.deleteItemAsync(countKey(key)),
      ...Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))),
    ]);
  },
};
