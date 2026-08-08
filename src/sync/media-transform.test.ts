import { arrayBufferToHex, constrainedImageSize } from "./media-transform";

describe("media transforms", () => {
  it("converts digest bytes to lowercase hexadecimal", () => {
    expect(arrayBufferToHex(Uint8Array.from([0, 1, 15, 16, 255]).buffer)).toBe("00010f10ff");
  });

  it("keeps images that already fit inside the requested edge", () => {
    expect(constrainedImageSize(512, 320, 512)).toBeNull();
  });

  it("resizes landscape and portrait images without changing aspect ratio", () => {
    expect(constrainedImageSize(4000, 3000, 2048)).toEqual({ width: 2048 });
    expect(constrainedImageSize(1200, 2400, 512)).toEqual({ height: 512 });
  });

  it("rejects invalid dimensions", () => {
    expect(() => constrainedImageSize(0, 100, 512)).toThrow("Invalid image dimensions");
  });
});
