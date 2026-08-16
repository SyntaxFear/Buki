import {
  HEADER_MASCOT_HEIGHT,
  HEADER_MASCOT_WIDTH,
  getHeaderMascotFrame,
} from "./header-mascot-layout";

describe("header mascot layout", () => {
  it("matches the home title mascot frame on a compact phone", () => {
    expect(getHeaderMascotFrame(375, 20)).toEqual({
      x: 305,
      y: 25,
      width: HEADER_MASCOT_WIDTH,
      height: HEADER_MASCOT_HEIGHT,
    });
  });

  it("keeps the same top and trailing offsets on larger phones", () => {
    expect(getHeaderMascotFrame(430, 59)).toEqual({
      x: 360,
      y: 64,
      width: HEADER_MASCOT_WIDTH,
      height: HEADER_MASCOT_HEIGHT,
    });
  });
});
