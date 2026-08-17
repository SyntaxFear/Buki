export const HEADER_MASCOT_WIDTH = 62;
export const HEADER_MASCOT_HEIGHT = 71;
export const HEADER_MASCOT_RIGHT = 8;
export const HEADER_MASCOT_TOP = 5;

export interface HeaderMascotFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getHeaderMascotFrame(
  screenWidth: number,
  safeAreaTop = 0,
): HeaderMascotFrame {
  return {
    x: screenWidth - HEADER_MASCOT_WIDTH - HEADER_MASCOT_RIGHT,
    y: safeAreaTop + HEADER_MASCOT_TOP,
    width: HEADER_MASCOT_WIDTH,
    height: HEADER_MASCOT_HEIGHT,
  };
}
