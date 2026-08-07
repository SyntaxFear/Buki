import { Skia, type SkImage } from "@shopify/react-native-skia";
import { File } from "expo-file-system";
import { useEffect, useReducer } from "react";

/**
 * Persistent decoded-image cache. Drawings are small cutout PNGs; once a
 * page has been seen its image never unloads, so page flips and spread
 * changes always render synchronously — no async pop-in ("blinking") when
 * the preload window used to shift.
 */
const cache = new Map<string, SkImage>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

export function getCachedImage(uri: string | null | undefined): SkImage | null {
  return uri ? (cache.get(uri) ?? null) : null;
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
    if (image) cache.set(uri, image);
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
  uris: ReadonlyArray<string | undefined>,
): (uri: string | null | undefined) => SkImage | null {
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  const key = uris.filter(Boolean).join("|");
  useEffect(() => {
    for (const uri of uris) {
      if (uri && !cache.has(uri)) void load(uri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return getCachedImage;
}
