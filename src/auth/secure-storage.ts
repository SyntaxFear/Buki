import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800;
const MANIFEST_VERSION = 1;

type StoredManifest =
  | { version: typeof MANIFEST_VERSION; state: "value"; generation: string; chunks: number }
  | { version: typeof MANIFEST_VERSION; state: "removed" };

function manifestKey(key: string): string {
  return `${key}.manifest`;
}

function legacyCountKey(key: string): string {
  return `${key}.chunks`;
}

function legacyChunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

function generationChunkKey(key: string, generation: string, index: number): string {
  return `${key}.${generation}.${index}`;
}

async function legacyChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(legacyCountKey(key));
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function parseManifest(raw: string): StoredManifest | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredManifest>;
    if (value.version !== MANIFEST_VERSION) return null;
    if (value.state === "removed") return { version: MANIFEST_VERSION, state: "removed" };
    if (
      value.state === "value" &&
      typeof value.generation === "string" &&
      value.generation.length > 0 &&
      Number.isInteger(value.chunks) &&
      (value.chunks ?? 0) > 0
    ) {
      return {
        version: MANIFEST_VERSION,
        state: "value",
        generation: value.generation,
        chunks: value.chunks as number,
      };
    }
  } catch {
    // A corrupt commit pointer must never fall back to stale token chunks.
  }
  return null;
}

async function readManifest(key: string): Promise<{ raw: string | null; value: StoredManifest | null }> {
  const raw = await SecureStore.getItemAsync(manifestKey(key));
  return { raw, value: raw ? parseManifest(raw) : null };
}

function newGeneration(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function cleanupCommittedStorage(
  key: string,
  previous: StoredManifest | null,
  previousLegacyCount: number,
): Promise<void> {
  const keys = [key, legacyCountKey(key)];
  if (previous?.state === "value") {
    keys.push(
      ...Array.from({ length: previous.chunks }, (_, index) =>
        generationChunkKey(key, previous.generation, index),
      ),
    );
  }
  keys.push(
    ...Array.from({ length: previousLegacyCount }, (_, index) => legacyChunkKey(key, index)),
  );
  const results = await Promise.allSettled(keys.map((storageKey) => SecureStore.deleteItemAsync(storageKey)));
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") {
    console.warn("Could not remove superseded secure-session chunks", failed.reason);
  }
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const manifest = await readManifest(key);
    if (manifest.raw !== null) {
      if (!manifest.value || manifest.value.state === "removed") return null;
      const committed = manifest.value;
      const chunks = await Promise.all(
        Array.from({ length: committed.chunks }, (_, index) =>
          SecureStore.getItemAsync(generationChunkKey(key, committed.generation, index)),
        ),
      );
      return chunks.some((chunk) => chunk === null) ? null : chunks.join("");
    }

    const count = await legacyChunkCount(key);
    if (count === 0) return SecureStore.getItemAsync(key);
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(legacyChunkKey(key, index)),
      ),
    );
    return chunks.some((chunk) => chunk === null) ? null : chunks.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    const [{ value: previous }, previousLegacyCount] = await Promise.all([
      readManifest(key),
      legacyChunkCount(key),
    ]);
    const generation = newGeneration();
    const chunkCount = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    const chunks = Array.from({ length: chunkCount }, (_, index) =>
      value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    );

    for (const [index, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(generationChunkKey(key, generation, index), chunk);
    }
    await SecureStore.setItemAsync(
      manifestKey(key),
      JSON.stringify({ version: MANIFEST_VERSION, state: "value", generation, chunks: chunkCount }),
    );
    await cleanupCommittedStorage(key, previous, previousLegacyCount);
  },

  async removeItem(key: string): Promise<void> {
    const [{ value: previous }, previousLegacyCount] = await Promise.all([
      readManifest(key),
      legacyChunkCount(key),
    ]);
    await SecureStore.setItemAsync(
      manifestKey(key),
      JSON.stringify({ version: MANIFEST_VERSION, state: "removed" }),
    );

    const keys = [key, legacyCountKey(key)];
    if (previous?.state === "value") {
      keys.push(
        ...Array.from({ length: previous.chunks }, (_, index) =>
          generationChunkKey(key, previous.generation, index),
        ),
      );
    }
    keys.push(
      ...Array.from({ length: previousLegacyCount }, (_, index) => legacyChunkKey(key, index)),
    );
    await Promise.all(keys.map((storageKey) => SecureStore.deleteItemAsync(storageKey)));
  },
};
