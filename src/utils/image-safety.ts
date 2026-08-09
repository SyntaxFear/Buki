export const MAX_SAFE_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_SAFE_IMAGE_EDGE = 16_384;
export const MAX_SAFE_IMAGE_PIXELS = 64_000_000;

export type SafeImageMime = "image/png" | "image/jpeg" | "image/webp";

export interface SafeImageMetadata {
  mimeType: SafeImageMime;
  width: number;
  height: number;
}

function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function uint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function pngMetadata(bytes: Uint8Array): SafeImageMetadata | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  return { mimeType: "image/png", width: uint32(bytes, 16), height: uint32(bytes, 20) };
}

function jpegMetadata(bytes: Uint8Array): SafeImageMetadata | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1;
      continue;
    }
    const length = uint16(bytes, offset + 1);
    if (length < 2 || offset + 1 + length > bytes.length) return null;
    if (startOfFrame.has(marker)) {
      return {
        mimeType: "image/jpeg",
        height: uint16(bytes, offset + 4),
        width: uint16(bytes, offset + 6),
      };
    }
    offset += length + 1;
  }
  return null;
}

function webpMetadata(bytes: Uint8Array): SafeImageMetadata | null {
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length < 30 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return null;
  const chunk = text(12, 4);
  if (chunk === "VP8X") {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { mimeType: "image/webp", width, height };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { mimeType: "image/webp", width: uint16(bytes, 26) & 0x3fff, height: uint16(bytes, 28) & 0x3fff };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { mimeType: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function inspectSafeImage(bytes: Uint8Array): SafeImageMetadata {
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_SAFE_IMAGE_BYTES) {
    throw new Error("The image file is too large.");
  }
  const metadata = pngMetadata(bytes) ?? jpegMetadata(bytes) ?? webpMetadata(bytes);
  if (!metadata) throw new Error("The image format is unsupported or invalid.");
  if (
    metadata.width <= 0
    || metadata.height <= 0
    || metadata.width > MAX_SAFE_IMAGE_EDGE
    || metadata.height > MAX_SAFE_IMAGE_EDGE
    || metadata.width * metadata.height > MAX_SAFE_IMAGE_PIXELS
  ) {
    throw new Error("The image dimensions are too large.");
  }
  return metadata;
}

export function assertSafeImageClaim(bytes: Uint8Array, mimeType: string): SafeImageMetadata {
  const metadata = inspectSafeImage(bytes);
  if (metadata.mimeType !== mimeType) throw new Error("The image type does not match its contents.");
  return metadata;
}
