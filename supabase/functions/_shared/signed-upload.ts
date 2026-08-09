export const CREATE_ONLY_SIGNED_UPLOAD_OPTIONS = { upsert: false } as const;

export interface CopyableStorageBucket {
  copy(
    fromPath: string,
    toPath: string,
  ): Promise<{ error: unknown | null }>;
}

/**
 * Copying leaves the uploaded source object in place until its two-hour token
 * expires. A create-only signed token then cannot be replayed because the
 * source path remains occupied. Retention cleanup removes that source later.
 */
export async function copyUploadToFinalPath(
  bucket: CopyableStorageBucket,
  uploadPath: string,
  finalPath: string,
): Promise<void> {
  if (uploadPath === finalPath) return;
  const copied = await bucket.copy(uploadPath, finalPath);
  if (copied.error) throw new Error("uploaded_object_finalize_failed");
}
