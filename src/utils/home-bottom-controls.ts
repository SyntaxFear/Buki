export const HOME_CAPTURE_SIZE = 76;
export const HOME_PAGINATION_MIN_HEIGHT = 34;
export const HOME_PAGINATION_TOP_GAP = 10;
export const HOME_MIN_CONTROL_GAP = 12;

const COMPACT_HEIGHT = 720;
const REGULAR_CAPTURE_BOTTOM = 26;
const REGULAR_BOOK_BOTTOM_RESERVE = 108;
const COMPACT_CAPTURE_BOTTOM = 12;

export interface HomeBottomControls {
  bookBottomReserve: number;
  captureBottom: number;
}

export function getHomeBottomControls(
  screenHeight: number,
  safeAreaBottom: number,
): HomeBottomControls {
  if (screenHeight >= COMPACT_HEIGHT) {
    return {
      bookBottomReserve: safeAreaBottom + REGULAR_BOOK_BOTTOM_RESERVE,
      captureBottom: safeAreaBottom + REGULAR_CAPTURE_BOTTOM,
    };
  }

  const captureBottom = safeAreaBottom + COMPACT_CAPTURE_BOTTOM;
  return {
    captureBottom,
    bookBottomReserve:
      captureBottom +
      HOME_CAPTURE_SIZE +
      HOME_MIN_CONTROL_GAP +
      HOME_PAGINATION_TOP_GAP +
      HOME_PAGINATION_MIN_HEIGHT,
  };
}

export function compactControlGap(
  controls: HomeBottomControls,
): number {
  return (
    controls.bookBottomReserve -
    controls.captureBottom -
    HOME_CAPTURE_SIZE -
    HOME_PAGINATION_TOP_GAP -
    HOME_PAGINATION_MIN_HEIGHT
  );
}
