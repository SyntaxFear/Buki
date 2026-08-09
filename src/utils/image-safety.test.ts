import { assertSafeImageClaim, inspectSafeImage } from "./image-safety";

function png(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13,
    73, 72, 68, 82,
    (width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255,
    (height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255,
  ]);
}

describe("image safety inspection", () => {
  it("reads bounded PNG dimensions", () => {
    expect(inspectSafeImage(png(1200, 900))).toEqual({
      mimeType: "image/png",
      width: 1200,
      height: 900,
    });
  });

  it("rejects dimension bombs before native decoding", () => {
    expect(() => inspectSafeImage(png(16_000, 16_000))).toThrow("dimensions are too large");
  });

  it("rejects a claimed type that does not match the bytes", () => {
    expect(() => assertSafeImageClaim(png(10, 10), "image/jpeg")).toThrow(
      "does not match",
    );
  });
});
