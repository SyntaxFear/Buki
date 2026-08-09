import { assertSafeImageClaim, inspectSafeImage } from "./image-safety";

const VALID_PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 0, 1, 5, 1, 1, 39, 24, 227, 102, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const VALID_JPEG = Uint8Array.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255, 219, 0, 67, 0, 3, 2, 2, 2, 2, 2, 3, 2, 2, 2, 3, 3, 3, 3, 4, 6, 4, 4, 4, 4, 4, 8, 6, 6, 5, 6, 9, 8, 10, 10, 9, 8, 9, 9, 10, 12, 15, 12, 10, 11, 14, 11, 9, 9, 13, 17, 13, 14, 15, 16, 16, 17, 16, 10, 12, 18, 19, 18, 16, 19, 15, 16, 16, 16, 255, 192, 0, 11, 8, 0, 3, 0, 2, 1, 1, 17, 0, 255, 196, 0, 20, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 255, 196, 0, 20, 16, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 84, 223, 255, 217]);
const VALID_WEBP = Uint8Array.from([82, 73, 70, 70, 36, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 24, 0, 0, 0, 48, 1, 0, 157, 1, 42, 4, 0, 5, 0, 2, 0, 52, 37, 164, 0, 3, 112, 0, 254, 251, 148, 0, 0]);

function pngWithClaimedDimensions(width: number, height: number): Uint8Array {
  const bytes = Uint8Array.from(VALID_PNG);
  bytes[16] = (width >>> 24) & 255;
  bytes[17] = (width >>> 16) & 255;
  bytes[18] = (width >>> 8) & 255;
  bytes[19] = width & 255;
  bytes[20] = (height >>> 24) & 255;
  bytes[21] = (height >>> 16) & 255;
  bytes[22] = (height >>> 8) & 255;
  bytes[23] = height & 255;
  return bytes;
}

describe("image safety inspection", () => {
  it("reads bounded PNG dimensions", () => {
    expect(inspectSafeImage(VALID_PNG)).toEqual({
      mimeType: "image/png",
      width: 1,
      height: 1,
    });
  });

  it("rejects truncated PNG headers that do not contain complete image data", () => {
    expect(() => inspectSafeImage(VALID_PNG.slice(0, 24))).toThrow(
      "unsupported or invalid",
    );
  });

  it("rejects corrupted PNG claims before native decoding", () => {
    expect(() => inspectSafeImage(pngWithClaimedDimensions(12_000, 12_000))).toThrow(
      "unsupported or invalid",
    );
  });

  it("rejects a claimed type that does not match the bytes", () => {
    expect(() => assertSafeImageClaim(VALID_PNG, "image/jpeg")).toThrow(
      "does not match",
    );
  });

  it("accepts complete JPEG and WebP files used by the app", () => {
    expect(inspectSafeImage(VALID_JPEG)).toMatchObject({
      mimeType: "image/jpeg",
      width: 2,
      height: 3,
    });
    expect(inspectSafeImage(VALID_WEBP)).toMatchObject({
      mimeType: "image/webp",
      width: 4,
      height: 5,
    });
  });

  it("rejects truncated JPEG and WebP files", () => {
    expect(() => inspectSafeImage(VALID_JPEG.slice(0, -2))).toThrow("unsupported or invalid");
    expect(() => inspectSafeImage(VALID_WEBP.slice(0, -2))).toThrow("unsupported or invalid");
  });
});
