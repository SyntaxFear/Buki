import { Directory, File, Paths } from "expo-file-system";

import type { Box } from "@/utils/cutout";

export interface CutoutMedia {
  uri: string;
  width: number;
  height: number;
  inkBox: Box;
  paperBox: Box;
  sourceWidth: number;
  sourceHeight: number;
  photoUri?: string;
}

export interface ReviewCutout extends CutoutMedia {
  storage: "review";
}

export interface ProcessedCutout extends CutoutMedia {
  /** Older pending fixtures and migrated local records predate this marker. */
  storage?: "permanent";
}

function ensureDirectory(root: Directory, name: string): Directory {
  const directory = new Directory(root, name);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function reviewDirectory(): Directory {
  return ensureDirectory(Paths.cache, "buki-capture-review");
}

function drawingsDirectory(): Directory {
  return ensureDirectory(Paths.document, "drawings");
}

function photosDirectory(): Directory {
  return ensureDirectory(Paths.document, "photos");
}

function captureToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createReviewMediaFiles(): {
  token: string;
  cutout: File;
  photo: File;
} {
  const token = captureToken();
  const directory = reviewDirectory();
  return {
    token,
    cutout: new File(directory, `drawing-${token}.png`),
    photo: new File(directory, `photo-${token}.jpg`),
  };
}

function deleteFile(uri: string | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

export function discardReviewCutout(review: ReviewCutout | null): void {
  if (!review) return;
  deleteFile(review.uri);
  deleteFile(review.photoUri);
}

export function discardProcessedCutout(
  processed: ProcessedCutout | null,
): void {
  if (!processed) return;
  deleteFile(processed.uri);
  deleteFile(processed.photoUri);
}

export async function finalizeReviewCutout(
  review: ReviewCutout,
): Promise<ProcessedCutout> {
  const token = captureToken();
  const finalCutout = new File(drawingsDirectory(), `drawing-${token}.png`);
  const finalPhoto = review.photoUri
    ? new File(photosDirectory(), `photo-${token}.jpg`)
    : null;

  try {
    new File(review.uri).copy(finalCutout);
    if (review.photoUri && finalPhoto)
      new File(review.photoUri).copy(finalPhoto);
  } catch (error) {
    deleteFile(finalCutout.uri);
    deleteFile(finalPhoto?.uri);
    throw error;
  }

  const processed: ProcessedCutout = {
    ...review,
    storage: "permanent",
    uri: finalCutout.uri,
    photoUri: finalPhoto?.uri,
  };
  discardReviewCutout(review);
  return processed;
}
