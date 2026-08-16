export type PageFlipDirection = 1 | -1;

export interface PageFlipIntent {
  blocked: boolean;
  direction: PageFlipDirection | 0;
  target: number;
}

export type PageFlipSharedPhase = "prepare" | "retire" | "idle";

export interface PageFlipSharedState {
  progress: number;
  locked: number;
  mounted: number;
  direction: number;
  gestureProgress: number;
  gestureTarget: number;
  settling: number;
  crest: number;
  boundaryBlocked: number;
}

export const PAGE_FLIP_AUTO_DURATION = 760;
export const PAGE_FLIP_COMPLETION_THRESHOLD = 0.5;
export const PAGE_FLIP_FLING_VELOCITY = 680;
export const PAGE_FLIP_DRAG_EXTENT = 2;

type PageFlipLogValue = string | number | boolean | null | undefined;

const pageFlipTraceSession = Date.now().toString(36);
let pageFlipTraceSequence = 0;

export function pageFlipImageId(uri: string | null | undefined): string {
  if (!uri) return "none";
  const clean = uri.split(/[?#]/, 1)[0] ?? uri;
  return clean.slice(clean.lastIndexOf("/") + 1) || "local-image";
}

/** Sparse development-only lifecycle logs; safe to leave enabled in Expo Go. */
export function logPageFlip(
  event: string,
  details: Record<string, PageFlipLogValue> = {},
): void {
  if (!__DEV__) return;
  const sequence = ++pageFlipTraceSequence;
  console.info(`[page-flip] ${event}`, {
    session: pageFlipTraceSession,
    sequence,
    at: Math.round(globalThis.performance?.now?.() ?? Date.now()),
    wallAt: new Date().toISOString(),
    ...details,
  });
}

export function clampPageFlipProgress(value: number): number {
  "worklet";
  return Math.min(1, Math.max(0, value));
}

/** Maps logical 0-to-1 turn progress onto the canonical shader direction. */
export function pageFlipShaderProgress(
  progress: number,
  direction: number,
): number {
  "worklet";
  const normalized = clampPageFlipProgress(progress);
  return direction < 0 ? 1 - normalized : normalized;
}

/**
 * Shared-value lifecycle invariant for the native flip renderer.
 *
 * The retiring phase deliberately retains the terminal progress. Native Skia
 * removal can trail the React commit by a frame; resetting to zero during that
 * window redraws the outgoing page and causes a visible flash. Once the
 * two-paint retirement barrier has completed, no renderer remains mounted, so
 * idle and prepare both reset progress before the next renderer can appear.
 */
export function pageFlipSharedStateForPhase(
  progress: number,
  phase: PageFlipSharedPhase,
  direction = 0,
): PageFlipSharedState {
  "worklet";
  return {
    progress: phase === "retire" ? clampPageFlipProgress(progress) : 0,
    locked: phase === "idle" ? 0 : 1,
    mounted: 0,
    // Reverse turns map logical progress through `1 - progress`. Resetting the
    // direction while the native Skia node is still retiring remaps a completed
    // reverse turn from shader progress 0 back to 1 for one frame, exposing the
    // outgoing/next page. Keep the active direction until React has removed the
    // renderer; prepare and idle can safely return to the neutral direction.
    direction: phase === "retire" ? direction : 0,
    gestureProgress: 0,
    gestureTarget: 0,
    settling: 0,
    crest: 0,
    boundaryBlocked: 0,
  };
}

export function resolvePageFlipIntent(
  translation: number,
  currentUnit: number,
  maxUnit: number,
  alreadyBlocked: boolean,
  minimumDistance = 6,
): PageFlipIntent {
  "worklet";
  if (alreadyBlocked || Math.abs(translation) < minimumDistance) {
    return { blocked: alreadyBlocked, direction: 0, target: currentUnit };
  }

  const direction: PageFlipDirection = translation < 0 ? 1 : -1;
  const target = currentUnit + direction;
  if (target < 0 || target > maxUnit) {
    return { blocked: true, direction: 0, target: currentUnit };
  }
  return { blocked: false, direction, target };
}

/**
 * StPageFlip measures a complete turn from the free edge at +pageExtent to
 * the opposite side at -pageExtent, so one full gesture spans two pages.
 */
export function pageFlipProgress(
  translation: number,
  pageExtent: number,
  direction: PageFlipDirection,
): number {
  "worklet";
  const travel = direction > 0 ? -translation : translation;
  return clampPageFlipProgress(
    travel / Math.max(1, pageExtent * PAGE_FLIP_DRAG_EXTENT),
  );
}

export function shouldCompletePageFlip(
  progress: number,
  velocity: number,
  direction: PageFlipDirection,
): boolean {
  "worklet";
  const forwardVelocity = direction > 0 ? -velocity : velocity;
  return (
    progress >= PAGE_FLIP_COMPLETION_THRESHOLD ||
    forwardVelocity >= PAGE_FLIP_FLING_VELOCITY
  );
}

export function pageFlipSettleDuration(
  progress: number,
  complete: boolean,
): number {
  "worklet";
  const remaining = complete ? 1 - progress : progress;
  return Math.round(170 + 430 * clampPageFlipProgress(remaining));
}
