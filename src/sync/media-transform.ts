import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import type { LocalMediaFile } from "@/database/media-repository";
import { sha256Digest } from "@/utils/crypto";

const PREVIEW_MAX_EDGE = 512;
const ORIGINAL_MAX_EDGE = 2048;

export interface PreparedMediaUpload {
  bytes: ArrayBuffer;
  checksum: string;
  byteSize: number;
  mimeType: "image/png" | "image/jpeg";
  cleanup: () => void;
}

export class MissingMediaSourceError extends Error {
  constructor(readonly mediaId: string) {
    super("The local artwork image is missing.");
    this.name = "MissingMediaSourceError";
  }
}

export function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function constrainedImageSize(
  width: number,
  height: number,
  maxEdge: number,
): { width?: number; height?: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new Error("Invalid image dimensions.");
  }
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

function existingFile(uri: string | null, mediaId: string): File {
  if (!uri) throw new MissingMediaSourceError(mediaId);
  try {
    const file = new File(uri);
    if (!file.exists) throw new MissingMediaSourceError(mediaId);
    return file;
  } catch (error) {
    if (error instanceof MissingMediaSourceError) throw error;
    throw new MissingMediaSourceError(mediaId);
  }
}

async function transformedFile(
  sourceUri: string,
  maxEdge: number,
  format: SaveFormat,
  compress: number,
): Promise<File> {
  const inspectionContext = ImageManipulator.manipulate(sourceUri);
  let sourceImage: Awaited<ReturnType<typeof inspectionContext.renderAsync>> | null = null;
  let size: { width?: number; height?: number } | null;
  try {
    sourceImage = await inspectionContext.renderAsync();
    size = constrainedImageSize(sourceImage.width, sourceImage.height, maxEdge);
  } finally {
    sourceImage?.release();
    inspectionContext.release();
  }

  const outputContext = ImageManipulator.manipulate(sourceUri);
  let outputImage: Awaited<ReturnType<typeof outputContext.renderAsync>> | null = null;
  try {
    if (size) outputContext.resize(size);
    outputImage = await outputContext.renderAsync();
    const result = await outputImage.saveAsync({ format, compress });
    return new File(result.uri);
  } finally {
    outputImage?.release();
    outputContext.release();
  }
}

export async function prepareMediaUpload(media: LocalMediaFile): Promise<PreparedMediaUpload> {
  const source = existingFile(media.localUri, media.id);
  let uploadFile = source;
  let temporary = false;
  let mimeType: PreparedMediaUpload["mimeType"] = "image/png";

  if (media.kind === "preview") {
    uploadFile = await transformedFile(source.uri, PREVIEW_MAX_EDGE, SaveFormat.PNG, 1);
    temporary = true;
  } else if (media.kind === "original") {
    uploadFile = await transformedFile(source.uri, ORIGINAL_MAX_EDGE, SaveFormat.JPEG, 0.82);
    temporary = true;
    mimeType = "image/jpeg";
  }

  try {
    const bytes = await uploadFile.arrayBuffer();
    const checksum = arrayBufferToHex(await sha256Digest(bytes));
    return {
      bytes,
      checksum,
      byteSize: bytes.byteLength,
      mimeType,
      cleanup: () => {
        if (!temporary) return;
        try {
          if (uploadFile.exists) uploadFile.delete();
        } catch {}
      },
    };
  } catch (error) {
    if (temporary) {
      try {
        if (uploadFile.exists) uploadFile.delete();
      } catch {}
    }
    throw error;
  }
}
