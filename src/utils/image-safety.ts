export const MAX_SAFE_IMAGE_BYTES = 24 * 1024 * 1024;
export const MAX_SAFE_IMAGE_EDGE = 12_000;
export const MAX_SAFE_IMAGE_PIXELS = 50_000_000;

export type SafeImageMime = "image/png" | "image/jpeg" | "image/webp";

export interface SafeImageMetadata {
  mimeType: SafeImageMime;
  width: number;
  height: number;
}

function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function uint16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function uint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function uint32le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngMetadata(bytes: Uint8Array): SafeImageMetadata | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 57 || !signature.every((value, index) => bytes[index] === value)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawIdat = false;
  let chunkIndex = 0;
  while (offset + 12 <= bytes.length) {
    const length = uint32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    const nextOffset = crcOffset + 4;
    if (length > MAX_SAFE_IMAGE_BYTES || nextOffset > bytes.length) return null;
    const type = String.fromCharCode(...bytes.subarray(typeOffset, typeOffset + 4));
    if (uint32(bytes, crcOffset) !== crc32(bytes, typeOffset, crcOffset)) return null;
    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) return null;
      width = uint32(bytes, dataOffset);
      height = uint32(bytes, dataOffset + 4);
    } else if (type === "IHDR") {
      return null;
    }
    if (type === "IDAT") sawIdat = true;
    if (type === "IEND") {
      if (length !== 0 || !sawIdat || nextOffset !== bytes.length) return null;
      return { mimeType: "image/png", width, height };
    }
    offset = nextOffset;
    chunkIndex += 1;
  }
  return null;
}

function jpegMetadata(bytes: Uint8Array): SafeImageMetadata | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let width = 0;
  let height = 0;
  let sawScan = false;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    if (marker === 0xd9) {
      return sawScan && width > 0 && height > 0 && offset + 1 === bytes.length
        ? { mimeType: "image/jpeg", width, height }
        : null;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1;
      continue;
    }
    if (offset + 2 >= bytes.length) return null;
    const length = uint16(bytes, offset + 1);
    if (length < 2 || offset + 1 + length > bytes.length) return null;
    if (startOfFrame.has(marker)) {
      if (length < 8) return null;
      height = uint16(bytes, offset + 4);
      width = uint16(bytes, offset + 6);
    }
    if (marker === 0xda) {
      sawScan = true;
      offset += length + 1;
      while (offset + 1 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const next = bytes[offset + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          offset += 2;
          continue;
        }
        break;
      }
      continue;
    }
    offset += length + 1;
  }
  return null;
}

function webpMetadata(bytes: Uint8Array): SafeImageMetadata | null {
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length < 20 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return null;
  if (uint32le(bytes, 4) !== bytes.length - 8) return null;
  let offset = 12;
  let metadata: SafeImageMetadata | null = null;
  let sawImagePayload = false;
  while (offset + 8 <= bytes.length) {
    const chunk = text(offset, 4);
    const length = uint32le(bytes, offset + 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + (length % 2);
    if (nextOffset > bytes.length) return null;
    if (chunk === "VP8X" && length >= 10) {
      metadata = {
        mimeType: "image/webp",
        width: 1 + bytes[dataOffset + 4] + (bytes[dataOffset + 5] << 8) + (bytes[dataOffset + 6] << 16),
        height: 1 + bytes[dataOffset + 7] + (bytes[dataOffset + 8] << 8) + (bytes[dataOffset + 9] << 16),
      };
    } else if (
      chunk === "VP8 " && length >= 10
      && bytes[dataOffset + 3] === 0x9d
      && bytes[dataOffset + 4] === 0x01
      && bytes[dataOffset + 5] === 0x2a
    ) {
      metadata ??= {
        mimeType: "image/webp",
        width: uint16le(bytes, dataOffset + 6) & 0x3fff,
        height: uint16le(bytes, dataOffset + 8) & 0x3fff,
      };
      sawImagePayload = true;
    } else if (chunk === "VP8L" && length >= 5 && bytes[dataOffset] === 0x2f) {
      const bits = uint32le(bytes, dataOffset + 1);
      metadata ??= {
        mimeType: "image/webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
      sawImagePayload = true;
    } else if (chunk === "ANMF" && length >= 16) {
      sawImagePayload = true;
    }
    offset = nextOffset;
  }
  return offset === bytes.length && metadata && sawImagePayload ? metadata : null;
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
