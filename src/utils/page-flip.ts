export type PageFlipDirection = 1 | -1;

export const PAGE_FLIP_AUTO_DURATION = 760;
export const PAGE_FLIP_COMPLETION_THRESHOLD = 0.5;
export const PAGE_FLIP_FLING_VELOCITY = 680;
export const PAGE_FLIP_DRAG_EXTENT = 2;

type PageFlipLogValue = string | number | boolean | null | undefined;

/** Sparse development-only lifecycle logs; safe to leave enabled in Expo Go. */
export function logPageFlip(
  event: string,
  details: Record<string, PageFlipLogValue> = {},
): void {
  if (!__DEV__) return;
  console.info(`[page-flip] ${event}`, {
    at: Math.round(globalThis.performance?.now?.() ?? Date.now()),
    ...details,
  });
}

export function clampPageFlipProgress(value: number): number {
  "worklet";
  return Math.min(1, Math.max(0, value));
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
  return clampPageFlipProgress(travel / Math.max(1, pageExtent * PAGE_FLIP_DRAG_EXTENT));
}

export function shouldCompletePageFlip(
  progress: number,
  velocity: number,
  direction: PageFlipDirection,
): boolean {
  "worklet";
  const forwardVelocity = direction > 0 ? -velocity : velocity;
  return progress >= PAGE_FLIP_COMPLETION_THRESHOLD || forwardVelocity >= PAGE_FLIP_FLING_VELOCITY;
}

export function pageFlipSettleDuration(progress: number, complete: boolean): number {
  "worklet";
  const remaining = complete ? 1 - progress : progress;
  return Math.round(170 + 430 * clampPageFlipProgress(remaining));
}
