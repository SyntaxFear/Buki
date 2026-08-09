import { Skia, type SkImage } from "@shopify/react-native-skia";
import { File } from "expo-file-system";
import { useEffect, useReducer, useRef } from "react";

const MAX_DECODED_IMAGES = 24;

/** A small shared LRU cache keeps nearby pages smooth without retaining an
 * unlimited number of native Skia images for large Pro libraries. */
const cache = new Map<string, SkImage>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
const activeRequests = new Map<symbol, ReadonlySet<string>>();

function activeUris(): Set<string> {
  const uris = new Set<string>();
  for (const requested of activeRequests.values()) {
    for (const uri of requested) uris.add(uri);
  }
  return uris;
}

function trimCache(): void {
  if (cache.size <= MAX_DECODED_IMAGES) return;
  const protectedUris = activeUris();
  for (const uri of cache.keys()) {
    if (protectedUris.has(uri)) continue;
    cache.delete(uri);
    if (cache.size <= MAX_DECODED_IMAGES) return;
  }
}

export function getCachedImage(uri: string | null | undefined): SkImage | null {
  if (!uri) return null;
  const image = cache.get(uri) ?? null;
  if (image) {
    cache.delete(uri);
    cache.set(uri, image);
  }
  return image;
}

async function load(uri: string): Promise<void> {
  if (cache.has(uri) || pending.has(uri)) return;
  pending.add(uri);
  try {
    // Yield first so a burst of loads never blocks the current frame,
    // then read + decode synchronously (drawings are small PNGs).
    await new Promise((resolve) => setTimeout(resolve, 0));
    const bytes = new File(uri).bytesSync();
    const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
    if (image) {
      cache.set(uri, image);
      trimCache();
    }
  } catch (e) {
    console.warn("Failed to decode drawing image", uri, e);
  } finally {
    pending.delete(uri);
    for (const notify of listeners) notify();
  }
}

/**
 * Ensures every uri is decoded into the cache and re-renders the caller as
 * images land. Returns a synchronous lookup.
 */
export function useImageCache(
  uris: readonly (string | undefined)[],
): (uri: string | null | undefined) => SkImage | null {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const requestId = useRef(Symbol("image-cache-request")).current;

  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  const key = uris.filter(Boolean).join("|");
  useEffect(() => {
    const requested = new Set(uris.filter((uri): uri is string => Boolean(uri)));
    activeRequests.set(requestId, requested);
    trimCache();
    for (const uri of requested) {
      if (uri && !cache.has(uri)) void load(uri);
    }
    return () => {
      activeRequests.delete(requestId);
      trimCache();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return getCachedImage;
}
