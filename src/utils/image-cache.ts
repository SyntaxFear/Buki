import { Skia, type SkImage } from "@shopify/react-native-skia";
import { File } from "expo-file-system";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

const MAX_DECODED_IMAGES = 24;
let imageCacheLogSequence = 0;
let imageCacheRequestSequence = 0;

/** A small shared LRU cache keeps nearby pages smooth without retaining an
 * unlimited number of native Skia images for large Pro libraries. */
const cache = new Map<string, SkImage>();
const pending = new Map<string, Promise<SkImage | null>>();
interface ImageCacheListener {
  notify: () => void;
  watchedUris: ReadonlySet<string>;
}

const listeners = new Map<symbol, ImageCacheListener>();
const activeRequests = new Map<symbol, ReadonlySet<string>>();

function imageLogId(uri: string): string {
  const clean = uri.split(/[?#]/, 1)[0] ?? uri;
  return clean.slice(clean.lastIndexOf("/") + 1) || "local-image";
}

function logImageCache(
  event: string,
  details: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!__DEV__) return;
  const sequence = ++imageCacheLogSequence;
  console.info(`[image-cache] ${event}`, {
    sequence,
    at: Math.round(globalThis.performance?.now?.() ?? Date.now()),
    wallAt: new Date().toISOString(),
    ...details,
  });
}

function notifyImageReady(uri: string): void {
  let notified = 0;
  for (const listener of listeners.values()) {
    if (!listener.watchedUris.has(uri)) continue;
    notified += 1;
    listener.notify();
  }
  logImageCache("notify-ready", {
    image: imageLogId(uri),
    notified,
    listeners: listeners.size,
  });
}

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
    logImageCache("evict", {
      image: imageLogId(uri),
      cached: cache.size,
      protected: protectedUris.size,
    });
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

/**
 * Decodes a drawing exactly once and lets callers await the same in-flight
 * request. The capture animation uses this to keep its final frame mounted
 * until the settled sketchpad renderer can draw the cached image immediately.
 */
export function preloadCachedImage(uri: string): Promise<SkImage | null> {
  const cached = getCachedImage(uri);
  if (cached) return Promise.resolve(cached);

  const inFlight = pending.get(uri);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      logImageCache("decode-start", { image: imageLogId(uri) });
      // Yield first so a burst of loads never blocks the current frame,
      // then read + decode synchronously (drawings are small PNGs).
      await new Promise((resolve) => setTimeout(resolve, 0));
      const bytes = new File(uri).bytesSync();
      const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
      if (image) {
        cache.set(uri, image);
        trimCache();
      }
      logImageCache("decode-finish", {
        image: imageLogId(uri),
        ready: Boolean(image),
        cached: cache.size,
      });
      return image;
    } catch (e) {
      console.warn("Failed to decode drawing image", uri, e);
      return null;
    } finally {
      pending.delete(uri);
      notifyImageReady(uri);
    }
  })();

  pending.set(uri, request);
  return request;
}

/**
 * Keeps rendered images reactive while optionally warming additional nearby
 * pages. Only completion of a currently rendered URI bumps this hook; a
 * neighbor finishing in the background must not remount or redraw the visible
 * sketchpad.
 */
export function useImageCache(
  watchedUris: readonly (string | undefined)[],
  preloadUris: readonly (string | undefined)[] = watchedUris,
): {
  lookup: (uri: string | null | undefined) => SkImage | null;
  revision: number;
  readyCount: number;
  watchedCount: number;
} {
  const [revision, bump] = useReducer((x: number) => x + 1, 0);
  const [requestId] = useState(() => Symbol("image-cache-request"));
  const [debugRequestId] = useState(() => ++imageCacheRequestSequence);
  const listenerRef = useRef<ImageCacheListener>({
    notify: bump,
    watchedUris: new Set(),
  });
  const watchedKey = watchedUris.filter(Boolean).join("\u0000");
  const watched = useMemo(
    () => new Set(watchedUris.filter((uri): uri is string => Boolean(uri))),
    // URI identity, rather than the caller's array identity, controls the
    // subscription. Some lightweight callers create this array inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchedKey],
  );
  let renderedReadyCount = 0;
  for (const uri of watched) {
    if (cache.has(uri)) renderedReadyCount += 1;
  }

  // Subscribe during the layout phase, before queued decode promises can
  // continue. Reconcile the cache after subscribing as well: a decode may
  // have completed between render and this effect, in which case there was no
  // listener to receive its notification yet.
  useLayoutEffect(() => {
    listenerRef.current.watchedUris = watched;
    listeners.set(requestId, listenerRef.current);
    let ready = 0;
    for (const uri of watched) {
      if (cache.has(uri)) ready += 1;
    }
    logImageCache("watch-set", {
      request: debugRequestId,
      watched: Array.from(watched, imageLogId).join("|") || "empty",
      ready,
    });
    logImageCache("listener-mount", {
      request: debugRequestId,
      listeners: listeners.size,
    });
    if (ready !== renderedReadyCount) bump();
    return () => {
      listeners.delete(requestId);
      logImageCache("listener-unmount", {
        request: debugRequestId,
        listeners: listeners.size,
      });
    };
  }, [debugRequestId, renderedReadyCount, requestId, watched]);

  const key = preloadUris.filter(Boolean).join("|");
  useEffect(() => {
    const requested = new Set(
      preloadUris.filter((uri): uri is string => Boolean(uri)),
    );
    activeRequests.set(requestId, requested);
    logImageCache("request-set", {
      request: debugRequestId,
      images: Array.from(requested, imageLogId).join("|") || "empty",
      count: requested.size,
    });
    trimCache();
    for (const uri of requested) {
      if (uri && !cache.has(uri)) void preloadCachedImage(uri);
    }
    return () => {
      activeRequests.delete(requestId);
      logImageCache("request-clear", {
        request: debugRequestId,
        count: requested.size,
      });
      trimCache();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugRequestId, key, requestId]);

  return {
    lookup: getCachedImage,
    revision,
    readyCount: renderedReadyCount,
    watchedCount: watched.size,
  };
}
