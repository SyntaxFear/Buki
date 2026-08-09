const MAX_IMAGE_EDGE = 16_384;
const MAX_IMAGE_PIXELS = 64_000_000;

function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function uint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function dimensions(bytes: Uint8Array): { mimeType: string; width: number; height: number } | null {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length >= 24 && png.every((value, index) => bytes[index] === value)) {
    return { mimeType: "image/png", width: uint32(bytes, 16), height: uint32(bytes, 20) };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
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
    if (frames.has(marker)) {
      return { mimeType: "image/jpeg", height: uint16(bytes, offset + 4), width: uint16(bytes, offset + 6) };
    }
    offset += length + 1;
  }
  return null;
}

export function assertSafeUploadedImage(bytes: Uint8Array, expectedMimeType: string): void {
  const image = dimensions(bytes);
  if (!image || image.mimeType !== expectedMimeType) throw new Error("uploaded_image_invalid");
  if (
    image.width <= 0
    || image.height <= 0
    || image.width > MAX_IMAGE_EDGE
    || image.height > MAX_IMAGE_EDGE
    || image.width * image.height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("uploaded_image_dimensions_invalid");
  }
}
